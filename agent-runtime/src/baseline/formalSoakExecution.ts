import {
  RuntimeBaselineReportSchema,
  type RuntimeBaselineOperation,
  type RuntimeBaselineOperationKind,
  type RuntimeBaselineReport
} from "@openharness/shared-schema";
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import { dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  buildDeterministicBaselineWorkload,
  collectRuntimeBaselineSample,
  createRuntimeBaselineReport,
  type RuntimeBaselineDatabaseProbe,
  type RuntimeBaselineEventObservation
} from "./localBaseline";
import {
  createFixedTwentyFourHourSoakConfig,
  evaluateFixedTwentyFourHourSoakPreflight,
  runFixedTwentyFourHourSoak
} from "./formalSoakRunner";

const FIXED_CONCURRENCY = 20;

export interface BuildGateDRuntimeChildSpawnSpecInput {
  childEntrypoint: string;
  databasePath: string;
  mcpConfigPath: string;
  javaBaseUrl: string;
  runtimePort: number;
  serviceToken: string;
  baseEnvironment?: NodeJS.ProcessEnv;
}

export interface GateDRuntimeChildSpawnSpec {
  command: string;
  args: string[];
  options: {
    shell: false;
    env: NodeJS.ProcessEnv;
    stdio: ["ignore", "pipe", "pipe"];
  };
}

interface GateDSpawnedProcess {
  pid?: number;
  stdout?: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  stderr?: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  once(event: string, listener: (...args: any[]) => void): unknown;
  kill(signal: NodeJS.Signals): boolean;
}

export type GateDSpawn = (
  command: string,
  args: string[],
  options: GateDRuntimeChildSpawnSpec["options"]
) => GateDSpawnedProcess;

export interface SpawnGateDRuntimeManagedChildInput {
  spec: GateDRuntimeChildSpawnSpec;
  journal: GateDEvidenceJournal;
  spawn?: GateDSpawn;
}

export async function spawnGateDRuntimeManagedChild(
  input: SpawnGateDRuntimeManagedChildInput
): Promise<GateDManagedChild> {
  const spawnProcess: GateDSpawn = input.spawn ?? ((command, args, options) =>
    nodeSpawn(command, args, options) as unknown as GateDSpawnedProcess);
  const child = spawnProcess(input.spec.command, input.spec.args, input.spec.options);
  if (!Number.isInteger(child.pid) || child.pid === undefined || child.pid <= 0) {
    child.kill("SIGTERM");
    throw new Error("Gate D Runtime child did not expose a valid PID");
  }
  const pid = child.pid;
  const capture = (stream: "stdout" | "stderr", chunk: Buffer | string) => {
    input.journal.append({
      kind: "runtime_child_output",
      pid,
      stream,
      text: redactChildOutput(String(chunk), [input.spec.options.env.OPENHARNESS_SERVICE_TOKEN])
    });
  };
  child.stdout?.on("data", chunk => capture("stdout", chunk));
  child.stderr?.on("data", chunk => capture("stderr", chunk));

  let stopped = false;
  let resolved = false;
  const exited = new Promise<GateDManagedChildExit>(resolve => {
    const finish = (exit: GateDManagedChildExit) => {
      if (resolved) return;
      resolved = true;
      resolve(exit);
    };
    // `close` is emitted only after stdio has drained. Waiting for it prevents
    // late child output from racing the journal close in the parent CLI.
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => finish({ code, signal }));
    child.once("error", () => finish({ code: null, signal: null }));
  });
  return {
    pid,
    exited,
    stop() {
      if (stopped) return;
      stopped = true;
      child.kill("SIGTERM");
    }
  };
}

export interface WaitUntilGateDRuntimeReadyOptions {
  runtimeUrl: string;
  serviceToken: string;
  fetch?: typeof fetch;
  delay?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maximumPolls?: number;
}

export async function waitUntilGateDRuntimeReady(
  child: GateDManagedChild,
  options: WaitUntilGateDRuntimeReadyOptions
): Promise<void> {
  const runtimeUrl = loopbackOrigin(options.runtimeUrl, "Runtime");
  const serviceToken = options.serviceToken.trim();
  if (!serviceToken) throw new Error("Gate D Runtime service token is required");
  const fetchFn = options.fetch ?? fetch;
  const delay = options.delay ?? sleepMs;
  const maximumPolls = positiveInteger(options.maximumPolls ?? 120, "readiness maximum polls");
  const pollIntervalMs = positiveInteger(options.pollIntervalMs ?? 250, "readiness poll interval");
  const readiness = (async () => {
    for (let poll = 0; poll < maximumPolls; poll += 1) {
      try {
        const response = await fetchFn(`${runtimeUrl}/api/v1/sessions`, {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
            "X-Tenant-Id": "gate-d-readiness",
            "X-User-Id": "gate-d-readiness",
            "X-Trace-Id": "gate-d-readiness",
            "X-Request-Id": "gate-d-readiness"
          }
        });
        if (response.ok) return;
        if (response.status === 401 || response.status === 403) {
          throw new Error("Gate D Runtime readiness authentication failed");
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("authentication")) throw error;
      }
      await delay(pollIntervalMs);
    }
    throw new Error("Gate D Runtime readiness probe timed out");
  })();
  await Promise.race([
    readiness,
    child.exited.then(() => { throw new Error("Gate D Runtime child exited before readiness"); })
  ]);
}

function redactChildOutput(value: string, sensitiveValues: (string | undefined)[]): string {
  let redacted = value;
  for (const sensitive of sensitiveValues) {
    if (sensitive) redacted = redacted.split(sensitive).join("[REDACTED]");
  }
  return redacted
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/OPENHARNESS_SECRET_CANARY/g, "[REDACTED]")
    .slice(0, 4_096);
}

export function buildGateDRuntimeChildSpawnSpec(
  input: BuildGateDRuntimeChildSpawnSpecInput
): GateDRuntimeChildSpawnSpec {
  if (!isAbsolute(input.childEntrypoint)) throw new Error("Gate D Runtime child entrypoint must be absolute");
  if (!isAbsolute(input.databasePath)) throw new Error("Gate D Runtime SQLite path must be absolute");
  if (!isAbsolute(input.mcpConfigPath)) throw new Error("Gate D Runtime MCP config path must be absolute");
  const serviceToken = input.serviceToken.trim();
  if (!serviceToken) throw new Error("Gate D Runtime service token is required");
  const javaBaseUrl = loopbackOrigin(input.javaBaseUrl, "Java Backend");
  if (!Number.isInteger(input.runtimePort) || input.runtimePort < 1 || input.runtimePort > 65_535) {
    throw new Error("Gate D Runtime port must be an integer from 1 to 65535");
  }
  return {
    command: process.execPath,
    args: ["--import", "tsx", input.childEntrypoint],
    options: {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...sanitizeGateDChildEnvironment(input.baseEnvironment ?? process.env),
        AGENT_RUNTIME_PROFILE: "production",
        AGENT_RUNTIME_SQLITE_PATH: input.databasePath,
        GATE_D_MCP_CONFIG_PATH: input.mcpConfigPath,
        JAVA_BACKEND_URL: javaBaseUrl,
        OPENHARNESS_SERVICE_TOKEN: serviceToken,
        MCP_REQUIRE_APPROVAL: "true",
        HOST: "127.0.0.1",
        PORT: String(input.runtimePort)
      }
    }
  };
}

function sanitizeGateDChildEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    !/(?:^|_)(?:API_KEY|API_TOKEN|AUTH_TOKEN|ACCESS_TOKEN|OAUTH_TOKEN|SESSION_TOKEN|PASSWORD|CLIENT_SECRET|SECRET_KEY|SECRET_ACCESS_KEY|CREDENTIAL|CREDENTIALS)$/i.test(name)
    && !/^(?:AWS_ACCESS_KEY_ID|GOOGLE_APPLICATION_CREDENTIALS)$/i.test(name)
  ));
}

export interface GateDChildProcessSnapshot {
  rssBytes: number;
  openFileDescriptors: number;
  mcpChildCount: number;
}

export type GateDExecFile = (command: string, args: string[]) => string | Buffer;

export function readGateDChildProcessSnapshot(
  pid: number,
  execute: GateDExecFile = defaultExecFile
): GateDChildProcessSnapshot {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("Gate D Runtime child PID must be a positive integer");
  const pidText = String(pid);
  const rssKilobytes = Number(String(execute("ps", ["-o", "rss=", "-p", pidText])).trim());
  if (!Number.isFinite(rssKilobytes) || rssKilobytes < 0) {
    throw new Error("Gate D Runtime child RSS probe failed");
  }
  const fileOutput = String(execute("lsof", ["-a", "-p", pidText, "-Fn"]));
  const openFileDescriptors = fileOutput.split(/\r?\n/).filter(line => /^f\d/.test(line)).length;
  let childOutput = "";
  try {
    childOutput = String(execute("pgrep", ["-P", pidText]));
  } catch (error) {
    if (!isNoProcessMatch(error)) throw error;
  }
  const mcpChildCount = childOutput.split(/\r?\n/).filter(line => /^\d+$/.test(line.trim())).length;
  return {
    rssBytes: Math.floor(rssKilobytes * 1024),
    openFileDescriptors,
    mcpChildCount
  };
}

export interface GateDReadOnlyDatabaseProbe extends RuntimeBaselineDatabaseProbe {
  all<T>(sql: string): T[];
  close(): void;
}

export function openGateDReadOnlyDatabaseProbe(path: string): GateDReadOnlyDatabaseProbe {
  if (!isAbsolute(path)) throw new Error("Gate D Runtime SQLite path must be absolute");
  const sqlite = new Database(path, { readonly: true, fileMustExist: true });
  return {
    path,
    run(sql: string) {
      if (sql.trim().toUpperCase() !== "PRAGMA WAL_CHECKPOINT(PASSIVE)") {
        throw new Error("Gate D SQLite evidence probe is read-only");
      }
      // collectRuntimeBaselineSample requests a passive checkpoint before statting
      // the WAL. Gate D deliberately performs no supervisor-side database write.
      return { changes: 0 };
    },
    get<T>(sql: string): T | undefined {
      return sqlite.prepare(sql).get() as T | undefined;
    },
    all<T>(sql: string): T[] {
      return sqlite.prepare(sql).all() as T[];
    },
    close() {
      sqlite.close();
    }
  };
}

export function assertGateDSeededConversationCount(database: GateDReadOnlyDatabaseProbe): void {
  const workload = buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 });
  const expectedScopes = new Set(workload.operations.map(operation => scopeKey(operation)));
  const gateConversationIds = new Set(workload.operations.map(operation => operation.conversationId));
  const rows = database.all<{ tenantId: string; userId: string; conversationId: string }>(`
    SELECT tenant_id AS tenantId, user_id AS userId, conversation_id AS conversationId
    FROM conversations
  `);
  const candidates = rows.filter(row => gateConversationIds.has(row.conversationId));
  const observedScopes = new Set(candidates.map(row => scopeKey(row)));
  const exactMatch = candidates.length === expectedScopes.size &&
    observedScopes.size === expectedScopes.size &&
    [...observedScopes].every(scope => expectedScopes.has(scope));
  if (!exactMatch) {
    throw new Error(
      `Gate D seed must persist exactly 10,000 scoped conversations; observed ${observedScopes.size}`
    );
  }
}

function scopeKey(value: { tenantId: string; userId: string; conversationId: string }): string {
  return JSON.stringify([value.tenantId, value.userId, value.conversationId]);
}

interface GateDDatabaseEventRow extends RuntimeBaselineEventObservation {
  rowId: number;
}

export interface GateDDatabaseObservations {
  eventObservations: RuntimeBaselineEventObservation[];
  hardFailures: string[];
}

export class GateDDatabaseObservationCursor {
  private lastRowId = 0;
  private readonly lastCursorByScope = new Map<string, number>();

  read(database: GateDReadOnlyDatabaseProbe): GateDDatabaseObservations {
    const rows = database.all<GateDDatabaseEventRow>(`
      SELECT rowid AS rowId, tenant_id AS tenantId, user_id AS userId,
             conversation_id AS conversationId, cursor, event_id AS eventId
      FROM runtime_events
      WHERE rowid > ${this.lastRowId}
      ORDER BY rowid ASC
    `);
    if (rows.length > 0) this.lastRowId = rows[rows.length - 1]!.rowId;
    const hardFailures: string[] = [];
    for (const row of rows) {
      const key = scopeKey(row);
      const previous = this.lastCursorByScope.get(key);
      if (previous !== undefined && row.cursor <= previous) {
        hardFailures.push("EVENT_ORDERING_FAILURE");
      }
      this.lastCursorByScope.set(key, row.cursor);
    }
    if (countQuery(database, "SELECT COUNT(*) AS count FROM runtime_events WHERE delivery_status = 'dead_letter' OR dead_letter_at IS NOT NULL") > 0) {
      hardFailures.push("DEAD_LETTER_OUTBOX");
    }
    if (countQuery(database, `
      SELECT COUNT(*) AS count
      FROM approvals a
      LEFT JOIN executions e
        ON e.execution_id = a.execution_id AND e.tenant_id = a.tenant_id
       AND e.user_id = a.user_id AND e.conversation_id = a.conversation_id
      WHERE a.status = 'pending' AND (e.execution_id IS NULL OR e.status NOT IN ('running','waiting_approval'))
    `) > 0) {
      hardFailures.push("ORPHANED_APPROVAL");
    }
    if (countQuery(database, `
      SELECT COUNT(*) AS count FROM (
        SELECT tenant_id,user_id,conversation_id,event_id
        FROM runtime_events GROUP BY tenant_id,user_id,conversation_id,event_id HAVING COUNT(*) > 1
        UNION ALL
        SELECT tenant_id,user_id,conversation_id,CAST(cursor AS TEXT)
        FROM runtime_events GROUP BY tenant_id,user_id,conversation_id,cursor HAVING COUNT(*) > 1
      )
    `) > 0) {
      hardFailures.push("DUPLICATE_DURABLE_EVENT");
    }
    if (countQuery(database, "SELECT COUNT(*) AS count FROM runtime_events WHERE payload_json LIKE '%SQLITE_BUSY%'") > 0) {
      hardFailures.push("SQLITE_BUSY_RETRY_EXHAUSTED");
    }
    if (
      countQuery(database, "SELECT COUNT(*) AS count FROM runtime_events WHERE payload_json LIKE '%OPENHARNESS_SECRET_CANARY%'") > 0 ||
      countQuery(database, "SELECT COUNT(*) AS count FROM messages WHERE content_json LIKE '%OPENHARNESS_SECRET_CANARY%'") > 0
    ) {
      hardFailures.push("SECRET_CANARY_LEAK");
    }
    return {
      eventObservations: rows.map(({ rowId: _rowId, ...observation }) => observation),
      hardFailures
    };
  }
}

function countQuery(database: GateDReadOnlyDatabaseProbe, sql: string): number {
  return Math.max(0, Number(database.get<{ count: number }>(sql)?.count ?? 0));
}

function defaultExecFile(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" });
}

function isNoProcessMatch(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 1;
}

export interface GateDManagedChildExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface GateDManagedChild {
  readonly pid: number;
  readonly exited: Promise<GateDManagedChildExit>;
  stop(): void;
}

export interface GateDRuntimeSupervisorDependencies {
  spawnChild(): Promise<GateDManagedChild>;
  waitUntilReady(child: GateDManagedChild): Promise<void>;
}

export class GateDRuntimeSupervisor {
  readonly observedRestartScheduleMs: number[] = [];
  readonly hardFailures: string[] = [];
  private child?: GateDManagedChild;
  private readonly scheduledStops = new Set<GateDManagedChild>();

  constructor(private readonly dependencies: GateDRuntimeSupervisorDependencies) {}

  get currentPid(): number | undefined {
    return this.child?.pid;
  }

  async start(): Promise<void> {
    if (this.child) throw new Error("Gate D Runtime child is already started");
    this.child = await this.spawnAndAwaitReady();
  }

  async restart(elapsedMs: number): Promise<void> {
    const previous = this.requireChild();
    this.scheduledStops.add(previous);
    previous.stop();
    await previous.exited;
    this.scheduledStops.delete(previous);
    if (this.child === previous) this.child = undefined;

    const replacement = await this.spawnAndAwaitReady();
    if (replacement.pid === previous.pid) {
      this.hardFailures.push("RUNTIME_RESTART_PID_UNCHANGED");
      replacement.stop();
      await replacement.exited;
      throw new Error("Gate D Runtime restart did not produce a new child PID");
    }
    this.child = replacement;
    this.observedRestartScheduleMs.push(elapsedMs);
  }

  async stop(): Promise<void> {
    const current = this.child;
    if (!current) return;
    this.scheduledStops.add(current);
    current.stop();
    await current.exited;
    this.scheduledStops.delete(current);
    if (this.child === current) this.child = undefined;
  }

  private async spawnAndAwaitReady(): Promise<GateDManagedChild> {
    const child = await this.dependencies.spawnChild();
    if (!Number.isInteger(child.pid) || child.pid <= 0) {
      throw new Error("Gate D Runtime child PID must be a positive integer");
    }
    void child.exited.then(() => {
      if (this.child === child && !this.scheduledStops.has(child)) {
        this.hardFailures.push("UNEXPECTED_RUNTIME_PROCESS_EXIT");
        this.child = undefined;
      }
    });
    try {
      await this.dependencies.waitUntilReady(child);
    } catch (error) {
      this.scheduledStops.add(child);
      child.stop();
      await child.exited;
      this.scheduledStops.delete(child);
      throw error;
    }
    return child;
  }

  private requireChild(): GateDManagedChild {
    if (!this.child) throw new Error("Gate D Runtime child is not started");
    return this.child;
  }
}

export function countGateDOperationKinds(
  operations: RuntimeBaselineOperation[]
): Record<RuntimeBaselineOperationKind, number> {
  const counts: Record<RuntimeBaselineOperationKind, number> = {
    no_tool: 0,
    java_sandbox: 0,
    mcp: 0,
    approval_interruption: 0
  };
  for (const operation of operations) counts[operation.kind] += 1;
  return counts;
}

export function gateDFixtureForKind(kind: RuntimeBaselineOperationKind): string {
  switch (kind) {
    case "no_tool": return "gate-d-no-tool";
    case "java_sandbox": return "tool-time";
    case "mcp":
    case "approval_interruption":
      return "mcp-qualification-echo";
  }
}

export async function runWithFixedConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  work: (value: T, index: number) => Promise<void>
): Promise<void> {
  if (concurrency !== FIXED_CONCURRENCY) {
    throw new Error(`Gate D concurrency must remain ${FIXED_CONCURRENCY}`);
  }
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex;
      if (index >= values.length) return;
      nextIndex += 1;
      await work(values[index]!, index);
    }
  });
  await Promise.all(workers);
}

export type GateDOperationPhase = "seed" | "run";
export type GateDApprovalDecision = "approve" | "abort";

export interface GateDOperationExecutionInput {
  phase: GateDOperationPhase;
  operation: RuntimeBaselineOperation;
  fixture: string;
  decision?: GateDApprovalDecision;
  invocationSequence?: number;
}

export interface GateDOperationObservation {
  admissionLatencyMs: number;
  durableReplayLatencyMs: number;
  hardFailures: string[];
  eventObservations?: RuntimeBaselineEventObservation[];
}

export interface GateDOperationTransport {
  execute(input: GateDOperationExecutionInput): Promise<GateDOperationObservation>;
  stop?(): void;
}

export class GateDRestartCoordinator {
  private active = false;
  private readyPromise: Promise<void> = Promise.resolve();
  private resolveReady?: () => void;
  private rejectReady?: (error: Error) => void;

  get isActive(): boolean {
    return this.active;
  }

  begin(): void {
    if (this.active) throw new Error("Gate D scheduled restart is already active");
    this.active = true;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  complete(): void {
    if (!this.active) throw new Error("Gate D scheduled restart is not active");
    this.active = false;
    this.resolveReady?.();
    this.clear();
  }

  fail(error: Error): void {
    if (!this.active) return;
    this.active = false;
    this.rejectReady?.(error);
    this.clear();
  }

  async waitUntilReady(): Promise<void> {
    await this.readyPromise;
  }

  private clear(): void {
    this.resolveReady = undefined;
    this.rejectReady = undefined;
  }
}

export interface GateDRuntimeHttpTransportOptions {
  runtimeUrl: string;
  serviceToken: string;
  fetch?: typeof fetch;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maximumPolls?: number;
  restartCoordinator?: GateDRestartCoordinator;
}

interface GateDRuntimePendingApproval {
  executionId: string;
  toolCallId: string;
  toolName: string;
  argumentsRaw?: string;
}

interface GateDRuntimeSessionDetail {
  messages?: unknown[];
  activeExecution?: { executionId?: string; status?: string } | null;
  pendingApprovals?: GateDRuntimePendingApproval[];
  runtimeProgress?: {
    requestId?: string;
    status?: string;
    detail?: { terminalClass?: string };
  };
}

export class GateDRuntimeHttpTransport implements GateDOperationTransport {
  private readonly runtimeUrl: string;
  private readonly serviceToken: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly maximumPolls: number;
  private readonly restartCoordinator?: GateDRestartCoordinator;
  private readonly activeControllers = new Set<AbortController>();
  private stopped = false;

  constructor(options: GateDRuntimeHttpTransportOptions) {
    this.runtimeUrl = loopbackOrigin(options.runtimeUrl, "Runtime");
    this.serviceToken = options.serviceToken.trim();
    if (!this.serviceToken) throw new Error("Gate D Runtime service token is required");
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? (() => performance.now());
    this.delay = options.delay ?? sleepMs;
    this.pollIntervalMs = positiveInteger(options.pollIntervalMs ?? 50, "poll interval");
    this.maximumPolls = positiveInteger(options.maximumPolls ?? 1_200, "maximum polls");
    this.restartCoordinator = options.restartCoordinator;
  }

  async execute(input: GateDOperationExecutionInput): Promise<GateDOperationObservation> {
    if (this.stopped) return failedObservation("WORKLOAD_STOPPED", 0);
    if (this.restartCoordinator?.isActive) await this.restartCoordinator.waitUntilReady();
    if (this.stopped) return failedObservation("WORKLOAD_STOPPED", 0);
    const controller = new AbortController();
    this.activeControllers.add(controller);
    const admissionStartedAt = this.now();
    try {
      const headers = this.headers(input.operation, input.phase, input.fixture, input.invocationSequence);
      const stream = await this.fetchFn(`${this.runtimeUrl}/api/v1/agent/chat/stream`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: input.operation.conversationId,
          message: `Gate D deterministic operation ${input.operation.operationId}`,
          stepBudget: 4
        }),
        signal: controller.signal
      });
      const admissionLatencyMs = Math.max(0, this.now() - admissionStartedAt);
      if (!stream.ok) return failedObservation("RUNTIME_ADMISSION_FAILURE", admissionLatencyMs);
      void stream.body?.cancel().catch(() => undefined);

      for (let poll = 0; poll < this.maximumPolls; poll += 1) {
        const replayStartedAt = this.now();
        const detailResponse = await this.fetchFn(
          `${this.runtimeUrl}/api/v1/sessions/${encodeURIComponent(input.operation.conversationId)}`,
          {
            headers: this.headers(input.operation, input.phase, undefined, input.invocationSequence),
            signal: controller.signal
          }
        );
        const durableReplayLatencyMs = Math.max(0, this.now() - replayStartedAt);
        if (detailResponse.status === 404) {
          await this.delay(this.pollIntervalMs);
          continue;
        }
        if (!detailResponse.ok) return failedObservation("DURABLE_REPLAY_FAILURE", admissionLatencyMs);
        const detail = await readSessionDetail(detailResponse);
        const pending = detail.pendingApprovals ?? [];
        if (pending.length > 0) {
          const approvalFailure = validatePendingQualificationApproval(pending, input.decision);
          if (approvalFailure) return failedObservation(approvalFailure, admissionLatencyMs);
          const approval = pending[0]!;
          const decisionResponse = input.decision === "abort"
            ? await this.fetchFn(
                `${this.runtimeUrl}/api/v1/sessions/${encodeURIComponent(input.operation.conversationId)}` +
                  `/executions/${encodeURIComponent(approval.executionId)}/abort`,
                {
                  method: "POST",
                  headers: this.headers(input.operation, input.phase, undefined, input.invocationSequence),
                  signal: controller.signal
                }
              )
            : await this.fetchFn(
                `${this.runtimeUrl}/api/v1/sessions/${encodeURIComponent(input.operation.conversationId)}` +
                  `/executions/${encodeURIComponent(approval.executionId)}` +
                  `/approvals/${encodeURIComponent(approval.toolCallId)}`,
                {
                  method: "POST",
                  headers: {
                    ...this.headers(input.operation, input.phase, undefined, input.invocationSequence),
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ action: "approve" }),
                  signal: controller.signal
                }
              );
          if (!decisionResponse.ok) return failedObservation("APPROVAL_DECISION_FAILURE", admissionLatencyMs);
          if (input.decision === "abort") {
            return successfulObservation(admissionLatencyMs, durableReplayLatencyMs);
          }
          await this.delay(this.pollIntervalMs);
          continue;
        }

        const activeStatus = detail.activeExecution?.status;
        if (activeStatus === "errored" || activeStatus === "aborted") {
          return failedObservation("TERMINAL_STATUS_MISMATCH", admissionLatencyMs);
        }
        if (detail.activeExecution === null) {
          const progress = detail.runtimeProgress;
          if (progress?.requestId !== this.requestId(input)) {
            return failedObservation("CURRENT_EXECUTION_EVIDENCE_MISSING", admissionLatencyMs);
          }
          if (progress.status === "errored" || progress.status === "aborted") {
            return failedObservation("TERMINAL_STATUS_MISMATCH", admissionLatencyMs);
          }
          if (progress.status === "completed" && Array.isArray(detail.messages) && detail.messages.length > 0) {
            return successfulObservation(admissionLatencyMs, durableReplayLatencyMs);
          }
        }
        await this.delay(this.pollIntervalMs);
      }
      return failedObservation("RUNTIME_TERMINAL_TIMEOUT", admissionLatencyMs);
    } catch {
      if (this.stopped) {
        return failedObservation("WORKLOAD_STOPPED", Math.max(0, this.now() - admissionStartedAt));
      }
      if (this.restartCoordinator?.isActive) {
        try {
          await this.restartCoordinator.waitUntilReady();
          return await this.recoverAfterScheduledRestart(
            input,
            Math.max(0, this.now() - admissionStartedAt),
            controller.signal
          );
        } catch {
          return failedObservation("SCHEDULED_RESTART_RECOVERY_FAILURE", Math.max(0, this.now() - admissionStartedAt));
        }
      }
      return failedObservation("RUNTIME_HTTP_FAILURE", Math.max(0, this.now() - admissionStartedAt));
    } finally {
      this.activeControllers.delete(controller);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const controller of this.activeControllers) controller.abort();
    this.activeControllers.clear();
  }

  async probeScopeIsolation(operation: RuntimeBaselineOperation): Promise<string[]> {
    if (this.restartCoordinator?.isActive) await this.restartCoordinator.waitUntilReady();
    const forbiddenScopes = [
      { ...operation, userId: "gate-d-forbidden-user" },
      { ...operation, tenantId: "gate-d-forbidden-tenant" }
    ];
    try {
      for (const scope of forbiddenScopes) {
        const response = await this.fetchFn(
          `${this.runtimeUrl}/api/v1/sessions/${encodeURIComponent(operation.conversationId)}`,
          { headers: this.headers(scope, "run") }
        );
        if (response.status !== 404) return ["CROSS_SCOPE_LEAKAGE"];
      }
      return [];
    } catch {
      return ["SCOPE_ISOLATION_PROBE_FAILURE"];
    }
  }

  private async recoverAfterScheduledRestart(
    input: GateDOperationExecutionInput,
    admissionLatencyMs: number,
    signal: AbortSignal
  ): Promise<GateDOperationObservation> {
    const expectedRequestId = this.requestId(input);
    for (let poll = 0; poll < this.maximumPolls; poll += 1) {
      const response = await this.fetchFn(
        `${this.runtimeUrl}/api/v1/sessions/${encodeURIComponent(input.operation.conversationId)}`,
        {
          headers: this.headers(input.operation, input.phase, undefined, input.invocationSequence),
          signal
        }
      );
      if (response.status === 404) return this.execute(input);
      if (!response.ok) {
        await this.delay(this.pollIntervalMs);
        continue;
      }
      const detail = await readSessionDetail(response);
      if (detail.runtimeProgress?.requestId !== expectedRequestId) return this.execute(input);
      if ((detail.pendingApprovals?.length ?? 0) > 0 || detail.activeExecution !== null) {
        await this.delay(this.pollIntervalMs);
        continue;
      }
      const status = detail.runtimeProgress?.status;
      const terminalClass = detail.runtimeProgress?.detail?.terminalClass;
      if (status === "completed" || terminalClass === "EXECUTION_INTERRUPTED") {
        return successfulObservation(admissionLatencyMs, 0);
      }
      return failedObservation("RESTART_TERMINAL_MISMATCH", admissionLatencyMs);
    }
    return failedObservation("SCHEDULED_RESTART_RECOVERY_TIMEOUT", admissionLatencyMs);
  }

  private headers(
    operation: RuntimeBaselineOperation,
    phase: GateDOperationPhase,
    fixture?: string,
    invocationSequence?: number
  ): Record<string, string> {
    const requestId = this.requestId({ phase, operation, invocationSequence });
    return {
      Authorization: `Bearer ${this.serviceToken}`,
      "X-Tenant-Id": operation.tenantId,
      "X-User-Id": operation.userId,
      "X-Trace-Id": requestId,
      "X-Request-Id": requestId,
      ...(fixture ? { "X-Mock-Fixture": fixture } : {})
    };
  }

  private requestId(input: Pick<GateDOperationExecutionInput, "phase" | "operation" | "invocationSequence">): string {
    const suffix = String(input.invocationSequence ?? 0).padStart(8, "0");
    return `${input.phase}-${input.operation.operationId}-${suffix}`;
  }
}

export interface GateDWorkloadMetrics {
  admissionLatenciesMs: number[];
  durableReplayLatenciesMs: number[];
  hardFailures: string[];
  eventObservations: RuntimeBaselineEventObservation[];
}

export class GateDWorkloadDriver {
  private admissionLatenciesMs: number[] = [];
  private durableReplayLatenciesMs: number[] = [];
  private hardFailures: string[] = [];
  private eventObservations: RuntimeBaselineEventObservation[] = [];
  private nextInvocationSequence = 0;
  private stopped = false;

  constructor(private readonly transport: GateDOperationTransport) {}

  async seed(operations: readonly RuntimeBaselineOperation[]): Promise<void> {
    await this.executeAll(operations, "seed");
  }

  async runCycle(operations: readonly RuntimeBaselineOperation[]): Promise<void> {
    await this.executeAll(operations, "run");
  }

  drainMetrics(): GateDWorkloadMetrics {
    const metrics = {
      admissionLatenciesMs: this.admissionLatenciesMs,
      durableReplayLatenciesMs: this.durableReplayLatenciesMs,
      hardFailures: this.hardFailures,
      eventObservations: this.eventObservations
    };
    this.admissionLatenciesMs = [];
    this.durableReplayLatenciesMs = [];
    this.hardFailures = [];
    this.eventObservations = [];
    return metrics;
  }

  private async executeAll(
    operations: readonly RuntimeBaselineOperation[],
    phase: GateDOperationPhase
  ): Promise<void> {
    await runWithFixedConcurrency(operations, FIXED_CONCURRENCY, async (operation, index) => {
      if (this.stopped) return;
      this.nextInvocationSequence += 1;
      const observation = await this.transport.execute({
        phase,
        operation,
        fixture: phase === "seed" ? "gate-d-no-tool" : gateDFixtureForKind(operation.kind),
        decision: phase === "run" ? approvalDecision(operation.kind, index) : undefined,
        invocationSequence: this.nextInvocationSequence
      });
      this.admissionLatenciesMs.push(observation.admissionLatencyMs);
      this.durableReplayLatenciesMs.push(observation.durableReplayLatencyMs);
      this.hardFailures.push(...observation.hardFailures);
      this.eventObservations.push(...(observation.eventObservations ?? []));
    });
  }

  stop(): void {
    this.stopped = true;
    this.transport.stop?.();
  }
}

export class GateDContinuousWorkload {
  readonly hardFailures: string[] = [];
  private stopRequested = false;
  private loopPromise?: Promise<void>;

  constructor(
    private readonly driver: GateDWorkloadDriver,
    private readonly operations: readonly RuntimeBaselineOperation[]
  ) {}

  start(): void {
    if (this.loopPromise) throw new Error("Gate D continuous workload is already started");
    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.driver.stop();
    await this.loopPromise;
  }

  private async run(): Promise<void> {
    try {
      while (!this.stopRequested) await this.driver.runCycle(this.operations);
    } catch {
      this.hardFailures.push("WORKLOAD_DRIVER_FAILURE");
      this.stopRequested = true;
    }
  }
}

export interface ExecuteGateDProductionSoakInput {
  runId: string;
  javaUrl: string;
  mcpConfigPath: string;
  sqlitePath: string;
  reportPath: string;
  serviceToken: string;
  approval: {
    approved: true;
    approvedBy: string;
    approvedAt: string;
    reason: string;
  };
  preflightArtifact: Record<string, unknown>;
  journal: GateDEvidenceJournal;
}

const GATE_D_RUNTIME_PORT = 3_101;
const GATE_D_RESTART_SCHEDULE_MS = [2, 12, 22].map(hours => hours * 60 * 60 * 1_000);

export async function executeGateDProductionSoak(
  input: ExecuteGateDProductionSoakInput
): Promise<RuntimeBaselineReport> {
  const runtimeUrl = `http://127.0.0.1:${GATE_D_RUNTIME_PORT}`;
  const childEntrypoint = fileURLToPath(new URL("./formalSoakRuntimeChild.ts", import.meta.url));
  const restartCoordinator = new GateDRestartCoordinator();
  const supervisor = new GateDRuntimeSupervisor({
    spawnChild: async () => spawnGateDRuntimeManagedChild({
      spec: buildGateDRuntimeChildSpawnSpec({
        childEntrypoint,
        databasePath: input.sqlitePath,
        mcpConfigPath: input.mcpConfigPath,
        javaBaseUrl: input.javaUrl,
        runtimePort: GATE_D_RUNTIME_PORT,
        serviceToken: input.serviceToken,
        baseEnvironment: { ...process.env, COMPRESSION_AUTO: "false" }
      }),
      journal: input.journal
    }),
    waitUntilReady: child => waitUntilGateDRuntimeReady(child, {
      runtimeUrl,
      serviceToken: input.serviceToken
    })
  });
  const transport = new GateDRuntimeHttpTransport({
    runtimeUrl,
    serviceToken: input.serviceToken,
    restartCoordinator
  });
  const driver = new GateDWorkloadDriver(transport);
  const workload = buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 });
  const databaseCursor = new GateDDatabaseObservationCursor();
  let continuousWorkload: GateDContinuousWorkload | undefined;
  let operatorInterrupted = false;
  const interrupt = () => { operatorInterrupted = true; };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  try {
    await supervisor.start();
    input.journal.append({ kind: "runtime_started", pid: supervisor.currentPid, runId: input.runId });

    await driver.seed(workload.operations);
    const seedMetrics = driver.drainMetrics();
    if (seedMetrics.hardFailures.length > 0) {
      return gateDImmediateFailureReport("GATE_D_SEED_FAILURE", seedMetrics.hardFailures, supervisor);
    }
    const seedProbe = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
    try {
      assertGateDSeededConversationCount(seedProbe);
    } catch {
      return gateDImmediateFailureReport("GATE_D_SEED_COUNT_MISMATCH", [], supervisor);
    } finally {
      seedProbe.close();
    }
    input.journal.append({ kind: "seed_completed", scopedConversations: 10_000 });

    const generatedAt = new Date().toISOString();
    const preflight = evaluateFixedTwentyFourHourSoakPreflight({
      javaGatewayRunning: true,
      deterministicFixturesReady: true,
      diskHeadroomBytes: numericArtifactField(input.preflightArtifact, "diskHeadroomBytes"),
      minimumDiskHeadroomBytes: numericArtifactField(input.preflightArtifact, "minimumDiskHeadroomBytes"),
      reportPath: input.reportPath,
      monitoringReady: true,
      interruptionProcedureDocumented: true
    });
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt,
      environment: {
        runId: input.runId,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        runtimePort: GATE_D_RUNTIME_PORT,
        planSha256: input.preflightArtifact.planSha256,
        preflightApprovalSha256: input.preflightArtifact.approvalSha256
      },
      gateDApproval: input.approval,
      preflight
    });

    continuousWorkload = new GateDContinuousWorkload(driver, workload.operations);
    continuousWorkload.start();
    return await runFixedTwentyFourHourSoak({
      ...config,
      onRestart: async ({ elapsedMs }) => {
        const previousPid = supervisor.currentPid;
        restartCoordinator.begin();
        input.journal.append({ kind: "runtime_restart_started", elapsedMs, previousPid });
        try {
          await supervisor.restart(elapsedMs);
          restartCoordinator.complete();
          input.journal.append({
            kind: "runtime_restart_completed",
            elapsedMs,
            previousPid,
            replacementPid: supervisor.currentPid
          });
        } catch (error) {
          restartCoordinator.fail(error instanceof Error ? error : new Error("Gate D Runtime restart failed"));
          throw error;
        }
      },
      sample: async ({ sampleIndex, sampledAt, workload: fixedWorkload }) => {
        const metrics = driver.drainMetrics();
        const hardFailures = new Set([
          ...metrics.hardFailures,
          ...supervisor.hardFailures,
          ...(continuousWorkload?.hardFailures ?? [])
        ]);
        if (operatorInterrupted) hardFailures.add("OPERATOR_INTERRUPTION");
        if (metrics.admissionLatenciesMs.length === 0 || metrics.durableReplayLatenciesMs.length === 0) {
          hardFailures.add("WORKLOAD_OBSERVATION_MISSING");
        }

        const pid = supervisor.currentPid;
        let processSnapshot: GateDChildProcessSnapshot = {
          rssBytes: 0,
          openFileDescriptors: 0,
          mcpChildCount: 0
        };
        if (pid === undefined) {
          hardFailures.add("RUNTIME_CHILD_NOT_RUNNING");
        } else {
          try {
            processSnapshot = readGateDChildProcessSnapshot(pid);
          } catch {
            hardFailures.add("PROCESS_METRIC_PROBE_FAILURE");
          }
        }

        const scopeOperation = fixedWorkload.operations[sampleIndex % fixedWorkload.operations.length]!;
        for (const failure of await transport.probeScopeIsolation(scopeOperation)) hardFailures.add(failure);

        let database: GateDReadOnlyDatabaseProbe | undefined;
        let databaseEvents: RuntimeBaselineEventObservation[] = [];
        try {
          database = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
          const observations = databaseCursor.read(database);
          databaseEvents = observations.eventObservations;
          observations.hardFailures.forEach(failure => hardFailures.add(failure));
        } catch {
          database?.close();
          database = undefined;
          hardFailures.add("DATABASE_EVIDENCE_PROBE_FAILURE");
        }
        try {
          return collectRuntimeBaselineSample({
            sampledAt,
            admissionLatenciesMs: metrics.admissionLatenciesMs,
            durableReplayLatenciesMs: metrics.durableReplayLatenciesMs,
            database,
            walPath: `${input.sqlitePath}-wal`,
            readRssBytes: () => processSnapshot.rssBytes,
            readOpenFileDescriptors: () => processSnapshot.openFileDescriptors,
            mcpChildCount: processSnapshot.mcpChildCount,
            hardFailures: [...hardFailures],
            operations: fixedWorkload.operations,
            eventObservations: [...metrics.eventObservations, ...databaseEvents]
          });
        } finally {
          database?.close();
        }
      },
      onCheckpoint: report => {
        const sample = report.samples.at(-1);
        input.journal.append({
          kind: "sample_checkpoint",
          sampleIndex: report.samples.length - 1,
          sampledAt: sample?.sampledAt,
          result: report.result,
          hardFailures: sample?.hardFailures ?? [],
          reportHash: report.reportHash
        });
      }
    });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    if (restartCoordinator.isActive) restartCoordinator.fail(new Error("Gate D execution stopped during restart"));
    if (continuousWorkload) await continuousWorkload.stop();
    else driver.stop();
    await supervisor.stop();
  }
}

function gateDImmediateFailureReport(
  primaryFailure: string,
  additionalFailures: string[],
  supervisor: GateDRuntimeSupervisor
): RuntimeBaselineReport {
  const generatedAt = new Date().toISOString();
  return createRuntimeBaselineReport({
    track: "production",
    generatedAt,
    workload: buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 }),
    environment: {
      baselineKind: "fixed-24-hour-soak",
      evidenceKind: "formal-24-hour-soak",
      runComplete: false,
      restartScheduleMs: GATE_D_RESTART_SCHEDULE_MS,
      observedRestartScheduleMs: supervisor.observedRestartScheduleMs
    },
    samples: [{
      sampledAt: generatedAt,
      admissionP95Ms: 0,
      durableReplayP95Ms: 0,
      rssBytes: 0,
      openFileDescriptors: 0,
      walBytes: 0,
      mcpChildCount: 0,
      hardFailures: [...new Set([primaryFailure, ...additionalFailures, ...supervisor.hardFailures])]
    }]
  });
}

function numericArtifactField(artifact: Record<string, unknown>, field: string): number {
  const value = artifact[field];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Gate D preflight artifact ${field} is invalid`);
  }
  return Number(value);
}

function approvalDecision(
  kind: RuntimeBaselineOperationKind,
  operationIndex: number
): GateDApprovalDecision | undefined {
  if (kind === "mcp") return "approve";
  if (kind === "approval_interruption") return operationIndex % 2 === 0 ? "approve" : "abort";
  return undefined;
}

function validatePendingQualificationApproval(
  pending: GateDRuntimePendingApproval[],
  decision: GateDApprovalDecision | undefined
): string | null {
  if (decision === undefined) return "ORPHANED_APPROVAL";
  if (pending.length !== 1 || pending[0]?.toolName !== "mcp_call") {
    return "APPROVAL_ORACLE_FAILURE";
  }
  const approval = pending[0];
  if (!approval.executionId || !approval.toolCallId || typeof approval.argumentsRaw !== "string") {
    return "APPROVAL_ORACLE_FAILURE";
  }
  let argumentsValue: unknown;
  try {
    argumentsValue = JSON.parse(approval.argumentsRaw);
  } catch {
    return "APPROVAL_ORACLE_FAILURE";
  }
  if (
    !isPlainRecord(argumentsValue)
    || argumentsValue.server !== "qualification"
    || argumentsValue.tool !== "qualification_echo"
    || !isPlainRecord(argumentsValue.arguments)
  ) {
    return "APPROVAL_ORACLE_FAILURE";
  }
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function successfulObservation(
  admissionLatencyMs: number,
  durableReplayLatencyMs: number
): GateDOperationObservation {
  return { admissionLatencyMs, durableReplayLatencyMs, hardFailures: [] };
}

function failedObservation(code: string, admissionLatencyMs: number): GateDOperationObservation {
  return { admissionLatencyMs, durableReplayLatencyMs: 0, hardFailures: [code] };
}

async function readSessionDetail(response: Response): Promise<GateDRuntimeSessionDetail> {
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Gate D Runtime session detail is invalid");
  }
  return value as GateDRuntimeSessionDetail;
}

function loopbackOrigin(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Gate D ${label} URL must be an absolute loopback HTTP URL`);
  }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Gate D ${label} URL must be an absolute loopback HTTP URL`);
  }
  return parsed.origin;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Gate D ${label} must be a positive integer`);
  return value;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface GateDEvidenceJournal {
  append(entry: Record<string, unknown>): void;
  close(): void;
}

export function createGateDEvidenceJournal(path: string): GateDEvidenceJournal {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openNoOverwrite(path, "journal");
  let closed = false;
  return {
    append(entry) {
      if (closed) throw new Error("Gate D evidence journal is closed");
      assertNoSensitiveEvidence(entry);
      writeSync(descriptor, `${JSON.stringify(entry)}\n`, undefined, "utf8");
      fsyncSync(descriptor);
    },
    close() {
      if (closed) return;
      closed = true;
      fsyncSync(descriptor);
      closeSync(descriptor);
    }
  };
}

export function writeGateDReportNoOverwrite(report: RuntimeBaselineReport, path: string): void {
  const parsed = RuntimeBaselineReportSchema.parse(report);
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openNoOverwrite(path, "report");
  try {
    writeFileSync(descriptor, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function openNoOverwrite(path: string, artifactKind: string): number {
  try {
    const descriptor = openSync(path, "wx", 0o600);
    fchmodSync(descriptor, 0o600);
    return descriptor;
  } catch (error) {
    const code = isNodeError(error) ? error.code : undefined;
    if (code === "EEXIST") throw new Error(`Gate D evidence ${artifactKind} already exists`);
    throw error;
  }
}

function assertNoSensitiveEvidence(value: unknown, key = ""): void {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (["authorization", "servicetoken", "apikey", "accesstoken", "refreshtoken", "approvaltoken"].includes(normalizedKey)) {
    throw new Error("Gate D evidence contains a sensitive field");
  }
  if (typeof value === "string" && (/\bBearer\s+\S+/i.test(value) || /\bsk-[A-Za-z0-9_-]+/.test(value) || value.includes("OPENHARNESS_SECRET_CANARY"))) {
    throw new Error("Gate D evidence contains a sensitive value");
  }
  if (Array.isArray(value)) {
    value.forEach(item => assertNoSensitiveEvidence(item));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [entryKey, entryValue] of Object.entries(value)) {
      assertNoSensitiveEvidence(entryValue, entryKey);
    }
  }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
