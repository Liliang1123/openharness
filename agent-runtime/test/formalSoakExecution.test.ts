import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { resolveGateDRuntimeChildConfig } from "../src/baseline/formalSoakRuntimeChild";
import { buildDeterministicBaselineWorkload, createRuntimeBaselineReport } from "../src/baseline/localBaseline";
import {
  createGateDEvidenceJournal,
  buildGateDRuntimeChildSpawnSpec,
  assertGateDSeededConversationCount,
  GateDDatabaseObservationCursor,
  GateDContinuousWorkload,
  GateDRuntimeHttpTransport,
  GateDRestartCoordinator,
  GateDWorkloadDriver,
  GateDRuntimeSupervisor,
  countGateDOperationKinds,
  gateDFixtureForKind,
  openGateDReadOnlyDatabaseProbe,
  readGateDChildProcessSnapshot,
  runWithFixedConcurrency,
  spawnGateDRuntimeManagedChild,
  waitUntilGateDRuntimeReady,
  writeGateDReportNoOverwrite,
  type GateDManagedChild
} from "../src/baseline/formalSoakExecution";

describe("Gate D production Runtime child", () => {
  it("requires production profile, absolute SQLite/MCP paths, service token, and loopback port", () => {
    expect(() => resolveGateDRuntimeChildConfig({})).toThrow(/profile/i);
    expect(() => resolveGateDRuntimeChildConfig({
      ...validEnvironment(),
      AGENT_RUNTIME_SQLITE_PATH: "relative/runtime.sqlite"
    })).toThrow(/SQLite.*absolute/i);
    expect(() => resolveGateDRuntimeChildConfig({
      ...validEnvironment(),
      GATE_D_MCP_CONFIG_PATH: "relative/mcp.json"
    })).toThrow(/MCP.*absolute/i);
    expect(() => resolveGateDRuntimeChildConfig({
      ...validEnvironment(),
      OPENHARNESS_SERVICE_TOKEN: ""
    })).toThrow(/service token/i);
    expect(() => resolveGateDRuntimeChildConfig({
      ...validEnvironment(),
      PORT: "0"
    })).toThrow(/port/i);
  });

  it("returns the bounded child configuration without exposing the service token", () => {
    const config = resolveGateDRuntimeChildConfig(validEnvironment());

    expect(config).toEqual({
      databasePath: "/tmp/openharness-gate-d/runtime.sqlite",
      mcpConfigPath: "/tmp/openharness-gate-d/mcp.json",
      javaBaseUrl: "http://127.0.0.1:8080",
      serviceToken: "gate-d-service-token",
      host: "127.0.0.1",
      port: 3101
    });
  });
});

describe("Gate D production executor primitives", () => {
  it("preserves the fixed 60/20/15/5 operation distribution and fixture mapping", () => {
    const workload = buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 });

    expect(countGateDOperationKinds(workload.operations)).toEqual({
      no_tool: 6_000,
      java_sandbox: 2_000,
      mcp: 1_500,
      approval_interruption: 500
    });
    expect(gateDFixtureForKind("no_tool")).toBe("gate-d-no-tool");
    expect(gateDFixtureForKind("java_sandbox")).toBe("tool-time");
    expect(gateDFixtureForKind("mcp")).toBe("mcp-qualification-echo");
    expect(gateDFixtureForKind("approval_interruption")).toBe("mcp-qualification-echo");
  });

  it("runs at exactly the fixed concurrency ceiling", async () => {
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    let reached!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    const atCeiling = new Promise<void>(resolve => { reached = resolve; });
    const running = runWithFixedConcurrency(Array.from({ length: 40 }, (_, index) => index), 20, async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      if (active === 20) reached();
      await released;
      active -= 1;
    });

    await atCeiling;
    expect(maximum).toBe(20);
    release();
    await running;
    expect(active).toBe(0);
  });

  it("restarts only the managed Runtime child and proves a new PID at each fixed offset", async () => {
    const events: string[] = [];
    let nextPid = 100;
    const supervisor = new GateDRuntimeSupervisor({
      spawnChild: async () => managedChild(++nextPid, events),
      waitUntilReady: async child => { events.push(`ready:${child.pid}`); }
    });

    await supervisor.start();
    await supervisor.restart(2 * 60 * 60 * 1000);
    await supervisor.restart(12 * 60 * 60 * 1000);
    await supervisor.restart(22 * 60 * 60 * 1000);

    expect(supervisor.observedRestartScheduleMs).toEqual([
      2 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      22 * 60 * 60 * 1000
    ]);
    expect(events).toEqual([
      "spawn:101", "ready:101", "stop:101",
      "spawn:102", "ready:102", "stop:102",
      "spawn:103", "ready:103", "stop:103",
      "spawn:104", "ready:104"
    ]);
    expect(supervisor.currentPid).toBe(104);
    expect(supervisor.hardFailures).toEqual([]);
    await supervisor.stop();
  });

  it("records an unexpected child exit and stops an unready replacement", async () => {
    const unexpectedEvents: string[] = [];
    const unexpected = managedChild(201, unexpectedEvents);
    const unexpectedSupervisor = new GateDRuntimeSupervisor({
      spawnChild: async () => unexpected,
      waitUntilReady: async () => undefined
    });
    await unexpectedSupervisor.start();
    unexpected.stop();
    await unexpected.exited;
    await Promise.resolve();
    expect(unexpectedSupervisor.hardFailures).toEqual(["UNEXPECTED_RUNTIME_PROCESS_EXIT"]);

    const readinessEvents: string[] = [];
    const readinessSupervisor = new GateDRuntimeSupervisor({
      spawnChild: async () => managedChild(301, readinessEvents),
      waitUntilReady: async () => { throw new Error("not ready"); }
    });
    await expect(readinessSupervisor.start()).rejects.toThrow(/not ready/);
    expect(readinessEvents).toEqual(["spawn:301", "stop:301"]);
    expect(readinessSupervisor.currentPid).toBeUndefined();
  });

  it("builds a shell-free child argv with credentials confined to environment", () => {
    const spec = buildGateDRuntimeChildSpawnSpec({
      childEntrypoint: "/workspace/agent-runtime/src/baseline/formalSoakRuntimeChild.ts",
      databasePath: "/workspace/evidence/runtime.sqlite",
      mcpConfigPath: "/workspace/evidence/mcp.json",
      javaBaseUrl: "http://127.0.0.1:8080",
      runtimePort: 3101,
      serviceToken: "raw-gate-d-secret",
      baseEnvironment: {
        PATH: "/usr/bin",
        ZHIPU_API_KEY: "zhipu-secret",
        OPENAI_API_KEY: "openai-secret",
        ANTHROPIC_AUTH_TOKEN: "anthropic-secret",
        CODEX_OAUTH_TOKEN: "codex-secret",
        AWS_ACCESS_KEY_ID: "aws-access-key",
        AWS_SECRET_ACCESS_KEY: "aws-secret-key",
        GOOGLE_APPLICATION_CREDENTIALS: "/tmp/google-credential.json"
      }
    });

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual([
      "--import",
      "tsx",
      "/workspace/agent-runtime/src/baseline/formalSoakRuntimeChild.ts"
    ]);
    expect(spec.options.shell).toBe(false);
    expect(JSON.stringify(spec.args)).not.toContain("raw-gate-d-secret");
    expect(spec.options.env.PATH).toBe("/usr/bin");
    expect(spec.options.env).not.toHaveProperty("ZHIPU_API_KEY");
    expect(spec.options.env).not.toHaveProperty("OPENAI_API_KEY");
    expect(spec.options.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(spec.options.env).not.toHaveProperty("CODEX_OAUTH_TOKEN");
    expect(spec.options.env).not.toHaveProperty("AWS_ACCESS_KEY_ID");
    expect(spec.options.env).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    expect(spec.options.env).not.toHaveProperty("GOOGLE_APPLICATION_CREDENTIALS");
    expect(spec.options.env).toMatchObject({
      AGENT_RUNTIME_PROFILE: "production",
      AGENT_RUNTIME_SQLITE_PATH: "/workspace/evidence/runtime.sqlite",
      GATE_D_MCP_CONFIG_PATH: "/workspace/evidence/mcp.json",
      JAVA_BACKEND_URL: "http://127.0.0.1:8080",
      OPENHARNESS_SERVICE_TOKEN: "raw-gate-d-secret",
      MCP_REQUIRE_APPROVAL: "true",
      HOST: "127.0.0.1",
      PORT: "3101"
    });
  });

  it("targets Runtime child PID for RSS, FD, and MCP child probes", () => {
    const invocations: { command: string; args: string[] }[] = [];
    const snapshot = readGateDChildProcessSnapshot(4242, (command, args) => {
      invocations.push({ command, args });
      if (command === "ps") return " 2048\n";
      if (command === "lsof") return "p4242\nf0\nn/dev/null\nf1\nn/tmp/runtime.sqlite\n";
      if (command === "pgrep") return "5001\n5002\n";
      throw new Error("unexpected process probe");
    });

    expect(snapshot).toEqual({ rssBytes: 2 * 1024 * 1024, openFileDescriptors: 2, mcpChildCount: 2 });
    expect(invocations.every(invocation => invocation.args.includes("4242"))).toBe(true);
  });

  it("opens SQLite evidence read-only and never checkpoints or mutates it", () => {
    const dir = mkdtempSync(join(tmpdir(), "openharness-gate-d-readonly-"));
    try {
      const databasePath = join(dir, "runtime.sqlite");
      const writer = new Database(databasePath);
      writer.exec("CREATE TABLE evidence(value TEXT); INSERT INTO evidence(value) VALUES ('retained')");
      writer.close();

      const probe = openGateDReadOnlyDatabaseProbe(databasePath);
      expect(probe.get<{ count: number }>("SELECT COUNT(*) AS count FROM evidence")?.count).toBe(1);
      expect(probe.run("PRAGMA wal_checkpoint(PASSIVE)")).toEqual({ changes: 0 });
      expect(() => probe.run("DELETE FROM evidence")).toThrow(/read-only/i);
      probe.close();

      const verifier = new Database(databasePath, { readonly: true });
      expect(verifier.prepare("SELECT value FROM evidence").get()).toEqual({ value: "retained" });
      verifier.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("turns durable database anomalies into stable Gate D hard failures", () => {
    const dir = mkdtempSync(join(tmpdir(), "openharness-gate-d-db-oracle-"));
    try {
      const databasePath = join(dir, "runtime.sqlite");
      const writer = new Database(databasePath);
      writer.exec(`
        CREATE TABLE conversations(tenant_id TEXT,user_id TEXT,conversation_id TEXT);
        CREATE TABLE executions(execution_id TEXT,tenant_id TEXT,user_id TEXT,conversation_id TEXT,status TEXT);
        CREATE TABLE approvals(approval_id TEXT,tenant_id TEXT,user_id TEXT,conversation_id TEXT,execution_id TEXT,status TEXT);
        CREATE TABLE messages(content_json TEXT);
        CREATE TABLE runtime_events(
          tenant_id TEXT,user_id TEXT,conversation_id TEXT,event_id TEXT,execution_id TEXT,cursor INTEGER,
          kind TEXT,payload_json TEXT,delivery_status TEXT,dead_letter_at INTEGER
        );
        INSERT INTO conversations VALUES ('tenant-a','user-a','conv-a');
        INSERT INTO executions VALUES ('exec-a','tenant-a','user-a','conv-a','aborted');
        INSERT INTO approvals VALUES ('approval-a','tenant-a','user-a','conv-a','exec-a','pending');
        INSERT INTO messages VALUES ('OPENHARNESS_SECRET_CANARY');
        INSERT INTO runtime_events VALUES (
          'tenant-a','user-a','conv-a','event-a','exec-a',1,'stream_error',
          '{"errorClass":"SQLITE_BUSY"}','dead_letter',1
        );
      `);
      writer.close();

      const probe = openGateDReadOnlyDatabaseProbe(databasePath);
      expect(() => assertGateDSeededConversationCount(probe)).toThrow(/10,000/);
      const cursor = new GateDDatabaseObservationCursor();
      const observations = cursor.read(probe);
      expect(observations.eventObservations).toEqual([{
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-a",
        cursor: 1,
        eventId: "event-a"
      }]);
      expect(observations.hardFailures).toEqual([
        "DEAD_LETTER_OUTBOX",
        "ORPHANED_APPROVAL",
        "SQLITE_BUSY_RETRY_EXHAUSTED",
        "SECRET_CANARY_LEAK"
      ]);
      expect(cursor.read(probe).eventObservations).toHaveLength(0);
      probe.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("proves the exact 10,000 Gate D scopes while ignoring unrelated conversations", () => {
    const workload = buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 });
    const expectedRows = workload.operations.map(operation => ({
      tenantId: operation.tenantId,
      userId: operation.userId,
      conversationId: operation.conversationId
    }));
    const rows = [
      ...expectedRows,
      { tenantId: "unrelated-tenant", userId: "unrelated-user", conversationId: "unrelated-conversation" }
    ];
    const database = {
      all<T>() { return rows as T[]; },
      get<T>() { return undefined as T | undefined; },
      run: () => ({ changes: 0 }),
      close() {},
      path: "/tmp/read-only.sqlite"
    };

    expect(() => assertGateDSeededConversationCount(database)).not.toThrow();
    rows[0] = { ...rows[0]!, tenantId: "wrong-tenant" };
    expect(() => assertGateDSeededConversationCount(database)).toThrow(/10,000 scoped/);
  });

  it("detects event cursor regression across separate sampler windows", () => {
    let batch = 0;
    const database = {
      all<T>() {
        batch += 1;
        return [{
          rowId: batch,
          tenantId: "tenant-a",
          userId: "user-a",
          conversationId: "conv-a",
          cursor: batch === 1 ? 2 : 1,
          eventId: `event-${batch}`
        }] as T[];
      },
      get<T>() { return { count: 0 } as T; },
      run: () => ({ changes: 0 }),
      close() {},
      path: "/tmp/read-only.sqlite"
    };
    const cursor = new GateDDatabaseObservationCursor();

    expect(cursor.read(database).hardFailures).toEqual([]);
    expect(cursor.read(database).hardFailures).toContain("EVENT_ORDERING_FAILURE");
  });

  it("wraps the child process, redacts captured output, and probes authenticated readiness", async () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const processEvents = new EventEmitter();
    const journalRows: Record<string, unknown>[] = [];
    const signals: NodeJS.Signals[] = [];
    const child = {
      pid: 5151,
      stdout,
      stderr,
      once: processEvents.once.bind(processEvents),
      kill(signal: NodeJS.Signals) { signals.push(signal); return true; }
    };
    const managed = await spawnGateDRuntimeManagedChild({
      spec: buildGateDRuntimeChildSpawnSpec({
        childEntrypoint: "/workspace/agent-runtime/src/baseline/formalSoakRuntimeChild.ts",
        databasePath: "/workspace/evidence/runtime.sqlite",
        mcpConfigPath: "/workspace/evidence/mcp.json",
        javaBaseUrl: "http://127.0.0.1:8080",
        runtimePort: 3101,
        serviceToken: "raw-gate-d-secret"
      }),
      journal: { append: row => journalRows.push(row), close() {} },
      spawn: (() => child) as never
    });
    stdout.emit("data", Buffer.from("ready Bearer raw-gate-d-secret"));
    stdout.emit("data", Buffer.from("raw-gate-d-secret"));
    stderr.emit("data", Buffer.from("OPENHARNESS_SECRET_CANARY"));

    expect(managed.pid).toBe(5151);
    expect(JSON.stringify(journalRows)).not.toContain("raw-gate-d-secret");
    expect(JSON.stringify(journalRows)).not.toContain("OPENHARNESS_SECRET_CANARY");

    const readinessHeaders: Headers[] = [];
    await waitUntilGateDRuntimeReady(managed, {
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "raw-gate-d-secret",
      delay: async () => undefined,
      fetch: (async (_input, init) => {
        readinessHeaders.push(new Headers(init?.headers));
        return response(200, []);
      }) as typeof fetch
    });
    expect(readinessHeaders[0]?.get("Authorization")).toBe("Bearer raw-gate-d-secret");
    managed.stop();
    expect(signals).toEqual(["SIGTERM"]);
    let processClosed = false;
    void managed.exited.then(() => { processClosed = true; });
    processEvents.emit("exit", 0, "SIGTERM");
    await Promise.resolve();
    expect(processClosed).toBe(false);
    stdout.emit("data", Buffer.from("late output after exit"));
    processEvents.emit("close", 0, "SIGTERM");
    await expect(managed.exited).resolves.toEqual({ code: 0, signal: "SIGTERM" });
    expect(journalRows.at(-1)).toMatchObject({ text: "late output after exit" });
  });

  it("persists a mode-0600 append-only journal and no-overwrite report", () => {
    const dir = mkdtempSync(join(tmpdir(), "openharness-gate-d-evidence-"));
    try {
      const journalPath = join(dir, "gate-d.jsonl");
      const reportPath = join(dir, "gate-d.json");
      const journal = createGateDEvidenceJournal(journalPath);
      journal.append({ kind: "runtime_started", pid: 101 });
      journal.append({ kind: "sample", sampleIndex: 0, result: "pass" });
      expect(() => journal.append({ kind: "bad", serviceToken: "raw-secret" })).toThrow(/sensitive/i);
      journal.close();

      expect(statSync(journalPath).mode & 0o777).toBe(0o600);
      expect(readFileSync(journalPath, "utf8").trim().split("\n")).toHaveLength(2);
      expect(() => createGateDEvidenceJournal(journalPath)).toThrow(/exists/i);

      const report = createRuntimeBaselineReport({
        track: "production",
        generatedAt: "2026-07-15T00:00:00.000Z",
        workload: { seededConversations: 10_000, concurrency: 20, mix: {
          noTool: 0.6, javaSandbox: 0.2, mcp: 0.15, approvalInterruption: 0.05
        } },
        environment: { evidenceKind: "formal-24-hour-soak" },
        samples: []
      });
      writeGateDReportNoOverwrite(report, reportPath);
      expect(statSync(reportPath).mode & 0o777).toBe(0o600);
      expect(() => writeGateDReportNoOverwrite(report, reportPath)).toThrow(/exists/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("seeds all 10,000 scopes then executes the fixed mix with deterministic approval decisions", async () => {
    const workload = buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 });
    const calls: { phase: string; fixture: string; decision?: string }[] = [];
    const driver = new GateDWorkloadDriver({
      async execute(input) {
        calls.push({ phase: input.phase, fixture: input.fixture, decision: input.decision });
        return {
          admissionLatencyMs: 10,
          durableReplayLatencyMs: 20,
          hardFailures: []
        };
      }
    });

    await driver.seed(workload.operations);
    await driver.runCycle(workload.operations);

    expect(calls.filter(call => call.phase === "seed")).toHaveLength(10_000);
    expect(calls.filter(call => call.phase === "seed").every(call => call.fixture === "gate-d-no-tool")).toBe(true);
    const runCalls = calls.filter(call => call.phase === "run");
    expect(runCalls.filter(call => call.fixture === "gate-d-no-tool")).toHaveLength(6_000);
    expect(runCalls.filter(call => call.fixture === "tool-time")).toHaveLength(2_000);
    expect(runCalls.filter(call => call.fixture === "mcp-qualification-echo" && call.decision === "approve")).toHaveLength(1_750);
    expect(runCalls.filter(call => call.decision === "abort")).toHaveLength(250);
    expect(driver.drainMetrics()).toMatchObject({
      admissionLatenciesMs: { length: 20_000 },
      durableReplayLatenciesMs: { length: 20_000 },
      hardFailures: []
    });
    expect(driver.drainMetrics().admissionLatenciesMs).toEqual([]);
  });

  it("keeps 20 workers cycling until stopped without admitting the remaining queue", async () => {
    const operations = buildDeterministicBaselineWorkload({ seededConversations: 40, concurrency: 20 }).operations;
    let executions = 0;
    let release!: () => void;
    let reached!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    const atCeiling = new Promise<void>(resolve => { reached = resolve; });
    const driver = new GateDWorkloadDriver({
      async execute() {
        executions += 1;
        if (executions === 20) reached();
        await released;
        return { admissionLatencyMs: 1, durableReplayLatencyMs: 1, hardFailures: [] };
      }
    });
    const workload = new GateDContinuousWorkload(driver, operations);

    workload.start();
    await atCeiling;
    const stopping = workload.stop();
    release();
    await stopping;

    expect(executions).toBe(20);
    expect(workload.hardFailures).toEqual([]);
  });

  it("aborts active Runtime HTTP work when the workload stops", async () => {
    let admitted!: () => void;
    const admissionStarted = new Promise<void>(resolve => { admitted = resolve; });
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      fetch: (async (_input, init) => {
        admitted();
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }) as typeof fetch
    });
    const executing = transport.execute({
      phase: "run",
      operation: {
        operationId: "op-stop",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-stop",
        kind: "no_tool"
      },
      fixture: "gate-d-no-tool"
    });

    await admissionStarted;
    transport.stop();

    await expect(executing).resolves.toMatchObject({ hardFailures: ["WORKLOAD_STOPPED"] });
  });

  it("drives the public Runtime HTTP lifecycle and approves only the exact qualification tool", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let approved = false;
    let now = 0;
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      now: () => now += 5,
      delay: async () => undefined,
      fetch: (async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith("/api/v1/agent/chat/stream")) return response(200, "");
        if (url.endsWith("/api/v1/sessions/conv-000001")) {
          return approved
            ? response(200, {
                messages: [{ role: "assistant", content: "done" }],
                activeExecution: null,
                pendingApprovals: [],
                runtimeProgress: { requestId: "run-op-000001-00000000", status: "completed" }
              })
            : response(200, {
                messages: [{ role: "user", content: "gate d" }],
                activeExecution: { executionId: "exec-1", status: "waiting_approval" },
                pendingApprovals: [{
                  executionId: "exec-1",
                  toolCallId: "call-1",
                  toolName: "mcp_call",
                  argumentsRaw: JSON.stringify({
                    server: "qualification",
                    tool: "qualification_echo",
                    arguments: { value: "gate-d" }
                  })
                }]
              });
        }
        if (url.endsWith("/api/v1/sessions/conv-000001/executions/exec-1/approvals/call-1")) {
          approved = true;
          return response(200, { status: "approved" });
        }
        throw new Error(`unexpected URL: ${url}`);
      }) as typeof fetch
    });

    const observation = await transport.execute({
      phase: "run",
      operation: {
        operationId: "op-000001",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-000001",
        kind: "mcp"
      },
      fixture: "mcp-qualification-echo",
      decision: "approve"
    });

    expect(observation.hardFailures).toEqual([]);
    expect(calls.map(call => `${call.init?.method ?? "GET"} ${new URL(call.url).pathname}`)).toEqual([
      "POST /api/v1/agent/chat/stream",
      "GET /api/v1/sessions/conv-000001",
      "POST /api/v1/sessions/conv-000001/executions/exec-1/approvals/call-1",
      "GET /api/v1/sessions/conv-000001"
    ]);
    expect(new Headers(calls[0]!.init?.headers).get("Authorization")).toBe("Bearer gate-d-service-token");
    expect(new Headers(calls[0]!.init?.headers).get("X-Mock-Fixture")).toBe("mcp-qualification-echo");
  });

  it.each([
    ["wrong server", JSON.stringify({ server: "other", tool: "qualification_echo", arguments: {} })],
    ["wrong tool", JSON.stringify({ server: "qualification", tool: "other", arguments: {} })],
    ["invalid JSON", "{not-json"]
  ])("fails closed before approval for a qualification target with %s", async (_case, argumentsRaw) => {
    const calledUrls: string[] = [];
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      delay: async () => undefined,
      fetch: (async (input, init) => {
        const url = String(input);
        calledUrls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
        if (url.endsWith("/api/v1/agent/chat/stream")) return response(200, "");
        if (url.endsWith("/api/v1/sessions/conv-target-binding")) {
          return response(200, {
            messages: [],
            activeExecution: { executionId: "exec-target", status: "waiting_approval" },
            pendingApprovals: [{
              executionId: "exec-target",
              toolCallId: "call-target",
              toolName: "mcp_call",
              argumentsRaw
            }]
          });
        }
        throw new Error(`approval oracle must not call ${url}`);
      }) as typeof fetch
    });

    const observation = await transport.execute({
      phase: "run",
      operation: {
        operationId: "op-target-binding",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-target-binding",
        kind: "mcp"
      },
      fixture: "mcp-qualification-echo",
      decision: "approve"
    });

    expect(observation.hardFailures).toEqual(["APPROVAL_ORACLE_FAILURE"]);
    expect(calledUrls).toEqual([
      "POST /api/v1/agent/chat/stream",
      "GET /api/v1/sessions/conv-target-binding"
    ]);
  });

  it("uses the execution abort endpoint and fails closed on ambiguous approvals", async () => {
    const calledUrls: string[] = [];
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      delay: async () => undefined,
      fetch: (async (input, init) => {
        const url = String(input);
        calledUrls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
        if (url.endsWith("/api/v1/agent/chat/stream")) return response(200, "");
        if (url.endsWith("/api/v1/sessions/conv-000002")) {
          return response(200, {
            messages: [],
            activeExecution: { executionId: "exec-2", status: "waiting_approval" },
            pendingApprovals: [{
              executionId: "exec-2",
              toolCallId: "call-2",
              toolName: "mcp_call",
              argumentsRaw: JSON.stringify({ server: "qualification", tool: "qualification_echo", arguments: {} })
            }]
          });
        }
        if (url.endsWith("/api/v1/sessions/conv-000002/executions/exec-2/abort")) {
          return response(200, { status: "aborted" });
        }
        throw new Error(`unexpected URL: ${url}`);
      }) as typeof fetch
    });

    const observation = await transport.execute({
      phase: "run",
      operation: {
        operationId: "op-000002",
        tenantId: "tenant-b",
        userId: "user-b",
        conversationId: "conv-000002",
        kind: "approval_interruption"
      },
      fixture: "mcp-qualification-echo",
      decision: "abort"
    });

    expect(observation.hardFailures).toEqual([]);
    expect(calledUrls).toContain("POST /api/v1/sessions/conv-000002/executions/exec-2/abort");
  });

  it("does not treat stale session messages as success for an errored current execution", async () => {
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      delay: async () => undefined,
      fetch: (async (input) => {
        const url = String(input);
        if (url.endsWith("/api/v1/agent/chat/stream")) return response(200, "");
        return response(200, {
          messages: [{ role: "assistant", content: "stale prior answer" }],
          activeExecution: null,
          pendingApprovals: [],
          runtimeProgress: {
            requestId: "run-op-current-00000003",
            status: "errored",
            detail: { terminalClass: "TOOL_EXECUTION_FAILED" }
          }
        });
      }) as typeof fetch
    });

    await expect(transport.execute({
      phase: "run",
      operation: {
        operationId: "op-current",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-current",
        kind: "java_sandbox"
      },
      fixture: "tool-time",
      invocationSequence: 3
    })).resolves.toMatchObject({ hardFailures: ["TERMINAL_STATUS_MISMATCH"] });
  });

  it("keeps a worker alive across a scheduled Runtime restart and retries only without admission evidence", async () => {
    const coordinator = new GateDRestartCoordinator();
    let streamAttempts = 0;
    let sessionAttempts = 0;
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      restartCoordinator: coordinator,
      delay: async () => undefined,
      fetch: (async (input) => {
        const url = String(input);
        if (url.endsWith("/api/v1/agent/chat/stream")) {
          streamAttempts += 1;
          if (streamAttempts === 1) {
            coordinator.begin();
            setTimeout(() => coordinator.complete(), 0);
            throw new Error("scheduled child restart");
          }
          return response(200, "");
        }
        if (url.endsWith("/api/v1/sessions/conv-restart")) {
          sessionAttempts += 1;
          if (sessionAttempts === 1) return response(404, { error: "not admitted" });
          return response(200, {
            messages: [{ role: "assistant", content: "done" }],
            activeExecution: null,
            pendingApprovals: [],
            runtimeProgress: { requestId: "run-op-restart-00000042", status: "completed" }
          });
        }
        throw new Error(`unexpected URL: ${url}`);
      }) as typeof fetch
    });

    const observation = await transport.execute({
      phase: "run",
      operation: {
        operationId: "op-restart",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-restart",
        kind: "no_tool"
      },
      fixture: "gate-d-no-tool",
      invocationSequence: 42
    });

    expect(observation.hardFailures).toEqual([]);
    expect(streamAttempts).toBe(2);
    expect(sessionAttempts).toBe(2);
  });

  it("does not replay an admitted request after restart reconciliation marks it interrupted", async () => {
    const coordinator = new GateDRestartCoordinator();
    let streamAttempts = 0;
    let sessionAttempts = 0;
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      restartCoordinator: coordinator,
      delay: async () => undefined,
      fetch: (async (input) => {
        const url = String(input);
        if (url.endsWith("/api/v1/agent/chat/stream")) {
          streamAttempts += 1;
          return response(200, "");
        }
        if (url.endsWith("/api/v1/sessions/conv-interrupted")) {
          sessionAttempts += 1;
          if (sessionAttempts === 1) {
            coordinator.begin();
            setTimeout(() => coordinator.complete(), 0);
            throw new Error("scheduled child restart");
          }
          return response(200, {
            messages: [{ role: "user", content: "gate d" }],
            activeExecution: null,
            pendingApprovals: [],
            runtimeProgress: {
              requestId: "run-op-interrupted-00000007",
              status: "errored",
              detail: { terminalClass: "EXECUTION_INTERRUPTED" }
            }
          });
        }
        throw new Error(`unexpected URL: ${url}`);
      }) as typeof fetch
    });

    const observation = await transport.execute({
      phase: "run",
      operation: {
        operationId: "op-interrupted",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-interrupted",
        kind: "mcp"
      },
      fixture: "mcp-qualification-echo",
      decision: "approve",
      invocationSequence: 7
    });

    expect(observation.hardFailures).toEqual([]);
    expect(streamAttempts).toBe(1);
    expect(sessionAttempts).toBe(2);
  });

  it("requires both cross-user and cross-tenant session probes to hide existence", async () => {
    const identities: string[] = [];
    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl: "http://127.0.0.1:3101",
      serviceToken: "gate-d-service-token",
      fetch: (async (_input, init) => {
        const headers = new Headers(init?.headers);
        identities.push(`${headers.get("X-Tenant-Id")}:${headers.get("X-User-Id")}`);
        return response(404, { error: "not found" });
      }) as typeof fetch
    });

    await expect(transport.probeScopeIsolation({
      operationId: "op-scope",
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conv-shared",
      kind: "no_tool"
    })).resolves.toEqual([]);
    expect(identities).toEqual([
      "tenant-a:gate-d-forbidden-user",
      "gate-d-forbidden-tenant:user-a"
    ]);
  });
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    AGENT_RUNTIME_PROFILE: "production",
    AGENT_RUNTIME_SQLITE_PATH: "/tmp/openharness-gate-d/runtime.sqlite",
    GATE_D_MCP_CONFIG_PATH: "/tmp/openharness-gate-d/mcp.json",
    JAVA_BACKEND_URL: "http://127.0.0.1:8080",
    OPENHARNESS_SERVICE_TOKEN: "gate-d-service-token",
    HOST: "127.0.0.1",
    PORT: "3101"
  };
}

function managedChild(pid: number, events: string[]): GateDManagedChild {
  let resolveExit!: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void;
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    resolveExit = resolve;
  });
  events.push(`spawn:${pid}`);
  return {
    pid,
    exited,
    stop() {
      events.push(`stop:${pid}`);
      resolveExit({ code: 0, signal: "SIGTERM" });
    }
  };
}

function response(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
