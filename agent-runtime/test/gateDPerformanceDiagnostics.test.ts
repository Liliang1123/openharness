import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  assertGateDPerformanceDiagnosticReport,
  createGateDPerformanceDiagnosticReport,
  leastSquaresSlope,
  percentile95,
  profileGateDOfflineDatabase,
  createGateDPerformanceDiagnosticRealDependenciesForTest,
  runGateDPerformanceDiagnostic,
  writeGateDPerformanceDiagnosticNoOverwrite,
  type GateDPerformanceDiagnosticAggregateSnapshot,
  type GateDPerformanceDiagnosticDependencies,
  type GateDPerformanceDiagnosticRealBoundary,
  type GateDPerformanceDiagnosticReport,
  type GateDPerformanceDiagnosticSample
} from "../src/baseline/gateDPerformanceDiagnostics";
import {
  runGateDPerformanceDiagnosticCli,
  type GateDPerformanceDiagnosticCliDependencies,
  type GateDPerformanceDiagnosisDecision
} from "../src/baseline/gateDPerformanceDiagnosticCli";
import type {
  GateDDatabaseObservationCursor,
  GateDManagedChild,
  GateDOperationTransport,
  GateDReadOnlyDatabaseProbe,
  GateDRuntimeChildSpawnSpec,
  GateDWorkloadMetrics
} from "../src/baseline/formalSoakExecution";
import {
  buildDeterministicBaselineWorkload,
  type DeterministicRuntimeBaselineWorkload
} from "../src/baseline/localBaseline";

type WriteSyncHook = (fileDescriptor: number, buffer: Uint8Array, offset: number, length: number) => number;
type FsyncSyncDelegate = (fileDescriptor: number) => void;
type FsyncSyncHook = (fileDescriptor: number, delegate: FsyncSyncDelegate) => void;
type OpenSyncDelegate = (path: string, flags: string | number, mode?: number) => number;
type OpenSyncHook = (
  path: string,
  flags: string | number,
  mode: number | undefined,
  delegate: OpenSyncDelegate
) => number;
type LstatSyncDelegate = (path: string, options?: unknown) => unknown;
type LstatSyncHook = (path: string, options: unknown, delegate: LstatSyncDelegate) => unknown;

const fileSystemMock = vi.hoisted(() => ({
  fsyncSync: undefined as FsyncSyncHook | undefined,
  lstatSync: undefined as LstatSyncHook | undefined,
  openSync: undefined as OpenSyncHook | undefined,
  writeSync: undefined as WriteSyncHook | undefined
}));

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const openSyncDelegate = actual.openSync as OpenSyncDelegate;
  const lstatSyncDelegate = actual.lstatSync as unknown as LstatSyncDelegate;
  return {
    ...actual,
    fsyncSync(fileDescriptor: number): void {
      return fileSystemMock.fsyncSync
        ? fileSystemMock.fsyncSync(fileDescriptor, actual.fsyncSync)
        : actual.fsyncSync(fileDescriptor);
    },
    lstatSync(path: string, options?: unknown): unknown {
      return fileSystemMock.lstatSync
        ? fileSystemMock.lstatSync(path, options, lstatSyncDelegate)
        : lstatSyncDelegate(path, options);
    },
    openSync(path: string, flags: string | number, mode?: number): number {
      return fileSystemMock.openSync
        ? fileSystemMock.openSync(path, flags, mode, openSyncDelegate)
        : openSyncDelegate(path, flags, mode);
    },
    writeSync(fileDescriptor: number, buffer: Uint8Array, offset: number, length: number): number {
      return fileSystemMock.writeSync
        ? fileSystemMock.writeSync(fileDescriptor, buffer, offset, length)
        : actual.writeSync(fileDescriptor, buffer, offset, length);
    }
  };
});

const temporaryDirectories: string[] = [];
const CLI_REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));

afterEach(() => {
  fileSystemMock.fsyncSync = undefined;
  fileSystemMock.lstatSync = undefined;
  fileSystemMock.openSync = undefined;
  fileSystemMock.writeSync = undefined;
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function temporaryPath(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "openharness-gate-d-diagnostics-"));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

function validSample(overrides: Partial<GateDPerformanceDiagnosticSample> = {}): GateDPerformanceDiagnosticSample {
  return {
    sampleIndex: 0,
    sampledAt: "2026-07-16T00:00:30.000Z",
    admissionP95Ms: 12,
    durableReplayP95Ms: 8,
    oracleDurationMs: 3,
    probeTimings: [{ probe: "incremental-events", durationMs: 3, rowCount: 0 }],
    databaseBytes: 4096,
    conversations: 10_000,
    messages: 12_000,
    executions: 10_000,
    approvals: 500,
    runtimeEvents: 20_000,
    pendingEvents: 2,
    hardFailures: [],
    ...overrides
  };
}

function validReport(): GateDPerformanceDiagnosticReport {
  return createGateDPerformanceDiagnosticReport({
    runId: "diagnostic-run-1",
    variant: "full-oracle",
    generatedAt: "2026-07-16T00:30:00.000Z",
    databasePath: "/private/tmp/runtime.sqlite",
    samples: [validSample()],
    hardFailures: []
  });
}

function cliFixture(): {
  root: string;
  workspace: string;
  inputSqlite: string;
  mcpConfig: string;
  output(name: string): string;
} {
  const root = CLI_REPOSITORY_ROOT;
  const workspace = mkdtempSync(join(root, ".openharness-gate-d-cli-test-"));
  temporaryDirectories.push(workspace);
  const inputs = join(workspace, "inputs");
  const outputs = join(workspace, "outputs");
  mkdirSync(inputs);
  mkdirSync(outputs);
  const inputSqlite = join(inputs, "source.sqlite");
  seedOfflineDatabase(inputSqlite);
  const mcpConfig = join(inputs, "mcp.json");
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { qualification: { command: "node" } } }), {
    mode: 0o600
  });
  return { root, workspace, inputSqlite, mcpConfig, output: name => join(outputs, name) };
}

function packetRootCliFixture(): ReturnType<typeof cliFixture> {
  const holder = mkdtempSync(join(CLI_REPOSITORY_ROOT, ".openharness-gate-d-packet-root-test-"));
  temporaryDirectories.push(holder);
  const root = join(holder, "packet");
  const workspace = root;
  const inputs = join(workspace, "inputs");
  const outputs = join(workspace, "outputs");
  mkdirSync(inputs, { recursive: true });
  mkdirSync(outputs);
  const inputSqlite = join(inputs, "source.sqlite");
  seedOfflineDatabase(inputSqlite);
  const mcpConfig = join(inputs, "mcp.json");
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { qualification: { command: "node" } } }), {
    mode: 0o600
  });
  return { root, workspace, inputSqlite, mcpConfig, output: name => join(outputs, name) };
}

function cliArgs(
  fixture: ReturnType<typeof cliFixture>,
  command: "profile" | "run" | "analyze",
  overrides: Record<string, string> = {}
): string[] {
  const values: Record<string, string> = command === "profile"
    ? {
        "--project-root": fixture.root,
        "--input-sqlite": fixture.inputSqlite,
        "--output": fixture.output("profile.json")
      }
    : command === "run"
      ? {
          "--project-root": fixture.root,
          "--run-id": "diagnostic-full-run",
          "--variant": "full-oracle",
          "--java-url": "http://127.0.0.1:8080",
          "--mcp-config": fixture.mcpConfig,
          "--sqlite-path": fixture.output("fresh.sqlite"),
          "--output": fixture.output("diagnostic.json")
        }
      : {
          "--project-root": fixture.root,
          "--full-report": fixture.output("full.json"),
          "--incremental-report": fixture.output("incremental.json"),
          "--workload-report": fixture.output("workload.json"),
          "--output": fixture.output("decision.json")
        };
  Object.assign(values, overrides);
  return [command, ...Object.entries(values).flat()];
}

function analysisReport(
  variant: GateDPerformanceDiagnosticReport["variant"],
  runId: string,
  databaseBasename: string,
  input: {
    admissionStart: number;
    admissionStep?: number;
    replayStart: number;
    replayStep?: number;
    pendingStart?: number;
    pendingStep?: number;
  }
): GateDPerformanceDiagnosticReport {
  const probeTimings = variantProbeTimings(variant);
  return createGateDPerformanceDiagnosticReport({
    runId,
    variant,
    generatedAt: "2026-07-17T01:00:00.000Z",
    databasePath: `/private/tmp/${databaseBasename}`,
    samples: Array.from({ length: 60 }, (_, sampleIndex) => validSample({
      sampleIndex,
      sampledAt: new Date(Date.parse("2026-07-17T00:00:00.000Z") + (sampleIndex + 1) * 30_000).toISOString(),
      runtimeEvents: 10_000 + sampleIndex * 100,
      admissionP95Ms: input.admissionStart + sampleIndex * (input.admissionStep ?? 0),
      durableReplayP95Ms: input.replayStart + sampleIndex * (input.replayStep ?? 0),
      pendingEvents: (input.pendingStart ?? 0) + sampleIndex * (input.pendingStep ?? 0),
      probeTimings: probeTimings.map(timing => ({ ...timing })),
      oracleDurationMs: probeTimings.reduce((sum, timing) => sum + timing.durationMs, 0)
    }))
  });
}

function variantProbeTimings(
  variant: GateDPerformanceDiagnosticReport["variant"]
): GateDPerformanceDiagnosticSample["probeTimings"] {
  const names = variant === "full-oracle"
    ? [
        "incremental-events",
        "dead-letter",
        "orphaned-approval",
        "duplicate-event",
        "sqlite-busy",
        "event-secret-canary",
        "message-secret-canary"
      ] as const
    : variant === "incremental-oracle" ? ["incremental-events"] as const : [];
  return names.map(probe => ({ probe, durationMs: 1, rowCount: 0 }));
}

function sampleWithProbeTimings(
  sample: GateDPerformanceDiagnosticSample,
  probeTimings: GateDPerformanceDiagnosticSample["probeTimings"]
): GateDPerformanceDiagnosticSample {
  return {
    ...sample,
    probeTimings,
    oracleDurationMs: probeTimings.reduce((sum, timing) => sum + timing.durationMs, 0)
  };
}

function writeAnalysisReports(
  fixture: ReturnType<typeof cliFixture>,
  reports: readonly GateDPerformanceDiagnosticReport[]
): void {
  const paths = [fixture.output("full.json"), fixture.output("incremental.json"), fixture.output("workload.json")];
  reports.forEach((report, index) => writeFileSync(paths[index]!, `${JSON.stringify(report)}\n`, { mode: 0o600 }));
}

async function expectAnalyzeBlocked(
  fixture: ReturnType<typeof cliFixture>,
  reports: readonly GateDPerformanceDiagnosticReport[]
): Promise<void> {
  writeAnalysisReports(fixture, reports);
  expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), captureCliDependencies())).toBe(2);
  expect(() => statSync(fixture.output("decision.json"))).toThrow();
}

function structurallyValidAnalysisReports(): [
  GateDPerformanceDiagnosticReport,
  GateDPerformanceDiagnosticReport,
  GateDPerformanceDiagnosticReport
] {
  return [
    analysisReport("full-oracle", "full-run", "full.sqlite", {
      admissionStart: 154.5,
      replayStart: 20
    }),
    analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
      admissionStart: 123.6,
      replayStart: 20
    }),
    analysisReport("workload-only", "workload-run", "workload.sqlite", {
      admissionStart: 123.6,
      replayStart: 20
    })
  ];
}

function captureCliDependencies(
  overrides: GateDPerformanceDiagnosticCliDependencies = {}
): GateDPerformanceDiagnosticCliDependencies & { output: string[]; errors: string[] } {
  const output: string[] = [];
  const errors: string[] = [];
  return {
    env: {},
    now: () => new Date("2026-07-17T02:00:00.000Z"),
    probeJava: async () => undefined,
    probeMcp: async () => undefined,
    writeOutput: value => { output.push(value); },
    writeError: value => { errors.push(value); },
    ...overrides,
    output,
    errors
  };
}

describe("Gate D performance diagnostic reports", () => {
  it("creates the exact local-only discriminants and fixed workload", () => {
    const report = validReport();

    expect(report).toMatchObject({
      schemaVersion: 1,
      track: "local",
      evidenceKind: "gate-d-performance-diagnostic",
      durationMs: 1_800_000,
      sampleIntervalMs: 30_000,
      workload: {
        seededConversations: 10_000,
        concurrency: 20,
        mix: { noTool: 0.6, javaSandbox: 0.2, mcp: 0.15, approvalInterruption: 0.05 }
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        databaseBasename: "runtime.sqlite"
      }
    });
    expect(report.samples).toHaveLength(1);
    expect(() => assertGateDPerformanceDiagnosticReport(report)).not.toThrow();
  });

  it("rejects production-track evidence", () => {
    expect(() => assertGateDPerformanceDiagnosticReport({ ...validReport(), track: "production" }))
      .toThrow(/track/i);
  });

  it("rejects unknown and missing fields", () => {
    const withUnknown = { ...validReport(), unexpected: true };
    const { generatedAt: _generatedAt, ...missingGeneratedAt } = validReport();
    const withNestedUnknown = {
      ...validReport(),
      samples: [{ ...validSample(), payload: "not allowed" }]
    };

    expect(() => assertGateDPerformanceDiagnosticReport(withUnknown)).toThrow(/unknown/i);
    expect(() => assertGateDPerformanceDiagnosticReport(missingGeneratedAt)).toThrow(/generatedAt/);
    expect(() => assertGateDPerformanceDiagnosticReport(withNestedUnknown)).toThrow(/unknown/i);
  });

  it.each([
    "Bearer secret-token",
    "SK-live-token",
    "openharness_secret_canary",
    "provider_api_key",
    "oauth_access_token",
    "database_password"
  ])("rejects sensitive string %s anywhere in the object", sensitive => {
    expect(() => assertGateDPerformanceDiagnosticReport({ ...validReport(), runId: sensitive }))
      .toThrow(/sensitive/i);
  });

  it("rejects zero samples and negative or non-finite metrics", () => {
    expect(() => assertGateDPerformanceDiagnosticReport({ ...validReport(), samples: [] })).toThrow(/samples/i);
    expect(() => assertGateDPerformanceDiagnosticReport({
      ...validReport(), samples: [validSample({ admissionP95Ms: -1 })]
    })).toThrow(/admissionP95Ms/);
    expect(() => assertGateDPerformanceDiagnosticReport({
      ...validReport(), samples: [validSample({ oracleDurationMs: Number.NaN })]
    })).toThrow(/oracleDurationMs/);
  });

  it("accepts only the authoritative probe timing field names", () => {
    const legacyTimingReport = {
      ...validReport(),
      samples: [{
        ...validSample(),
        probeTimings: [{ name: "incremental-runtime-events", elapsedMs: 1 }]
      }]
    };

    expect(() => assertGateDPerformanceDiagnosticReport(legacyTimingReport)).toThrow("probe is required");
    expect(() => assertGateDPerformanceDiagnosticReport(validReport())).not.toThrow();
  });

  it("requires oracleDurationMs to equal the sum of authoritative probe durations", () => {
    expect(() => assertGateDPerformanceDiagnosticReport({
      ...validReport(),
      samples: [validSample({ oracleDurationMs: 2 })]
    })).toThrow(/oracleDurationMs|probeTimings/i);
    expect(() => assertGateDPerformanceDiagnosticReport({
      ...validReport(),
      samples: [validSample({
        probeTimings: [{ probe: "incremental-events", durationMs: 3, rowCount: -1 }]
      })]
    })).toThrow(/rowCount/i);
  });

  it("rejects whitespace-only evidence strings", () => {
    expect(() => assertGateDPerformanceDiagnosticReport({ ...validReport(), runId: "   " }))
      .toThrow(/runId/);
    expect(() => assertGateDPerformanceDiagnosticReport({ ...validReport(), hardFailures: ["\t"] }))
      .toThrow(/hardFailures/);
    expect(() => assertGateDPerformanceDiagnosticReport({
      ...validReport(), generatedAt: "2026-07-16T00:30:00Z"
    })).toThrow(/generatedAt/);
  });

  it.each([
    ["samples", (report: GateDPerformanceDiagnosticReport) => {
      report.samples = new Array<GateDPerformanceDiagnosticSample>(1);
    }],
    ["probeTimings", (report: GateDPerformanceDiagnosticReport) => {
      report.samples[0]!.probeTimings = new Array(1);
    }],
    ["hardFailures", (report: GateDPerformanceDiagnosticReport) => {
      report.samples[0]!.hardFailures = new Array<string>(1);
    }]
  ] as const)("rejects sparse %s arrays before evidence serialization", (_name, mutate) => {
    const report = validReport();
    const target = temporaryPath(`sparse-${_name}.json`);
    mutate(report);

    expect(() => assertGateDPerformanceDiagnosticReport(report)).toThrow(/sparse/i);
    expect(() => writeGateDPerformanceDiagnosticNoOverwrite(report, target)).toThrow(/sparse/i);
    expect(() => statSync(target)).toThrow();
  });

  it("rejects state-changing accessors without invoking them", () => {
    const report = validReport();
    const target = temporaryPath("accessor.json");
    let accesses = 0;
    Object.defineProperty(report, "runId", {
      enumerable: true,
      get() {
        accesses += 1;
        return accesses < 3 ? "safe-run" : "Bearer secret-token";
      }
    });

    expect(() => assertGateDPerformanceDiagnosticReport(report)).toThrow(/accessor/i);
    expect(() => writeGateDPerformanceDiagnosticNoOverwrite(report, target)).toThrow(/accessor/i);
    expect(accesses).toBe(0);
    expect(() => statSync(target)).toThrow();
  });

  it("rejects a non-enumerable toJSON hook before it can replace evidence", () => {
    const report = validReport();
    const target = temporaryPath("to-json.json");
    Object.defineProperty(report, "toJSON", {
      enumerable: false,
      value: () => ({ ...validReport(), runId: "Bearer secret-token" })
    });

    expect(() => assertGateDPerformanceDiagnosticReport(report)).toThrow(/toJSON|enumerable/i);
    expect(() => writeGateDPerformanceDiagnosticNoOverwrite(report, target)).toThrow(/toJSON|enumerable/i);
    expect(() => statSync(target)).toThrow();
  });
});

describe("deterministic math helpers", () => {
  it("uses nearest-rank p95 for empty, singleton, and unsorted samples", () => {
    expect(percentile95([])).toBe(0);
    expect(percentile95([7])).toBe(7);
    expect(percentile95([10, 1, 8, 2, 7, 3, 6, 4, 5, 9])).toBe(10);
  });

  it("returns deterministic flat, positive, and negative least-squares slopes", () => {
    expect(leastSquaresSlope([{ x: 1, y: 4 }])).toBe(0);
    expect(leastSquaresSlope([{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }])).toBe(0);
    expect(leastSquaresSlope([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }])).toBe(2);
    expect(leastSquaresSlope([{ x: 1, y: 6 }, { x: 2, y: 4 }, { x: 3, y: 2 }])).toBe(-2);
  });
});

describe("Gate D diagnostic evidence writer", () => {
  it("exposes only the report and output path parameters", () => {
    expectTypeOf(writeGateDPerformanceDiagnosticNoOverwrite)
      .toEqualTypeOf<(report: unknown, outputPath: string) => void>();
    expect(writeGateDPerformanceDiagnosticNoOverwrite).toHaveLength(2);
  });

  it("writes once with exact 0600 permissions and preserves the original on collision", () => {
    const target = temporaryPath("diagnostic.json");
    const report = validReport();

    writeGateDPerformanceDiagnosticNoOverwrite(report, target);

    const original = readFileSync(target, "utf8");
    expect(JSON.parse(original)).toEqual(report);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(() => writeGateDPerformanceDiagnosticNoOverwrite({
      ...report,
      runId: "diagnostic-run-2"
    }, target)).toThrow(/exist/i);
    expect(readFileSync(target, "utf8")).toBe(original);
  });

  it("does not leave a file behind when validation fails", () => {
    const target = temporaryPath("invalid.json");

    expect(() => writeGateDPerformanceDiagnosticNoOverwrite({
      ...validReport(),
      samples: [validSample({ databaseBytes: -1 })]
    }, target)).toThrow(/databaseBytes/);
    expect(() => statSync(target)).toThrow();
  });

  it("fails fast when a write makes no progress and removes its incomplete file", () => {
    const target = temporaryPath("zero-write.json");
    fileSystemMock.writeSync = () => 0;

    expect(() => writeGateDPerformanceDiagnosticNoOverwrite(validReport(), target)).toThrow(/no progress/i);
    expect(() => statSync(target)).toThrow();
  });

  it("does not delete a concurrent replacement after a write failure", () => {
    const target = temporaryPath("replacement.json");
    const displaced = `${target}.displaced`;
    fileSystemMock.writeSync = () => {
      renameSync(target, displaced);
      writeFileSync(target, "replacement", { mode: 0o600 });
      throw new Error("injected write failure");
    };

    expect(() => writeGateDPerformanceDiagnosticNoOverwrite(validReport(), target))
      .toThrow(/injected write failure/);
    expect(readFileSync(target, "utf8")).toBe("replacement");
  });
});

const PROFILER_ERROR = "Gate D offline profiler failed";
const OFFLINE_PROBES = [
  "incremental-events", "dead-letter", "orphaned-approval", "duplicate-event", "sqlite-busy",
  "event-secret-canary", "message-secret-canary", "session-messages-p50", "session-messages-p95",
  "session-messages-max", "session-events-p50", "session-events-p95", "session-events-max",
  "active-execution", "pending-approval"
] as const;

interface ProfilerChildResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error & { code?: string };
}

function privateTemporaryDirectory(name: string): string {
  const directory = mkdtempSync(`/private/tmp/openharness-gate-d-profiler-${name}-`);
  temporaryDirectories.push(directory);
  return directory;
}

function privateTemporaryPath(name: string): string {
  return join(privateTemporaryDirectory("fixture"), name);
}

function insertRuntimeEvent(database: Database.Database, eventId: string, cursor: number): void {
  database.prepare(`
    INSERT INTO runtime_events(
      tenant_id,user_id,conversation_id,event_id,execution_id,cursor,kind,payload_json,created_at,
      delivery_status,delivery_attempts,next_attempt_at,dead_letter_at
    ) VALUES ('wal-tenant','wal-user','wal-conversation',?, 'wal-execution',?, 'stream_end','{}',1,
              'delivered',1,NULL,NULL)
  `).run(eventId, cursor);
}

function snapshotDatabaseFamily(databasePath: string): Record<string, unknown> {
  return Object.fromEntries([databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map(path => {
    if (!existsSync(path)) return [basename(path), { exists: false }];
    const stat = lstatSync(path, { bigint: true });
    const bytes = readFileSync(path);
    return [basename(path), {
      exists: true,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeNs: stat.mtimeNs,
      ctimeNs: stat.ctimeNs
    }];
  }));
}

function validProfilerStdout(databasePath: string): string {
  const lines = [
    JSON.stringify([{ marker: "__GATE_D_CAPABILITY__", version: "3.51.0", dbstat: 1, json: 1, queryOnly: 1, main: databasePath }]),
    JSON.stringify([{ marker: "__GATE_D_AGGREGATE__", conversations: 2, messages: 3, executions: 1, approvals: 1, runtime_events: 3 }]),
    JSON.stringify([{ status: "delivered", count: 2 }, { status: "pending", count: 1 }]),
    JSON.stringify([{ name: "messages", bytes: 4096 }, { name: "runtime_events", bytes: 8192 }]),
    JSON.stringify([{
      marker: "__GATE_D_CARDINALITY__",
      messagesP50: 1, messagesP95: 2, messagesMax: 2,
      executionsP50: 0, executionsP95: 1, executionsMax: 1,
      runtimeEventsP50: 1, runtimeEventsP95: 2, runtimeEventsMax: 2
    }])
  ];
  OFFLINE_PROBES.forEach((probe, index) => {
    lines.push(JSON.stringify([{ marker: "__GATE_D_PROBE__", probe }]));
    lines.push(JSON.stringify([{ id: 2, parent: 0, notused: 0, detail: `SCAN fixed_table_${index}` }]));
    lines.push(`Run Time: real ${(index / 1000).toFixed(3)} user 0.000000 sys 0.000000`);
  });
  lines.push(JSON.stringify([{ marker: "__GATE_D_COMPLETE__" }]));
  return `${lines.join("\n")}\n`;
}

function validProfilerChildResult(databasePath: string): ProfilerChildResult {
  return { status: 0, signal: null, stdout: validProfilerStdout(databasePath), stderr: "" };
}

function replaceProfilerLine(
  result: ProfilerChildResult,
  predicate: (line: string) => boolean,
  replacement: string | ((line: string) => string)
): ProfilerChildResult {
  const lines = result.stdout.trimEnd().split("\n");
  const index = lines.findIndex(predicate);
  if (index < 0) throw new Error("test protocol line is missing");
  lines[index] = typeof replacement === "function" ? replacement(lines[index]!) : replacement;
  return { ...result, stdout: `${lines.join("\n")}\n` };
}

function profilerProtocolFailures(): Array<{
  name: string;
  mutate: (result: ProfilerChildResult, databasePath: string) => ProfilerChildResult;
}> {
  const rawLeak = "OPENHARNESS_SECRET_CANARY Bearer secret sk-secret temporary-tenant SELECT file:/protocol-failure";
  return [
    { name: "spawn error", mutate: result => ({ ...result, error: Object.assign(new Error(rawLeak), { code: "ENOENT" }) }) },
    { name: "timeout", mutate: result => ({ ...result, error: Object.assign(new Error(rawLeak), { code: "ETIMEDOUT" }) }) },
    { name: "signal", mutate: result => ({ ...result, status: null, signal: "SIGTERM" }) },
    { name: "nonzero", mutate: result => ({ ...result, status: 1, stderr: rawLeak }) },
    { name: "maxBuffer", mutate: result => ({ ...result, error: Object.assign(new Error(rawLeak), { code: "ENOBUFS" }) }) },
    { name: "unparseable version", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_CAPABILITY__"), line => line.replace("3.51.0", "not-a-version")) },
    { name: "unsupported version", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_CAPABILITY__"), line => line.replace("3.51.0", "3.32.0")) },
    { name: "dbstat disabled", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_CAPABILITY__"), line => line.replace('"dbstat":1', '"dbstat":0')) },
    { name: "json unavailable", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_CAPABILITY__"), line => line.replace('"json":1', '"json":0')) },
    { name: "query only disabled", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_CAPABILITY__"), line => line.replace('"queryOnly":1', '"queryOnly":0')) },
    { name: "main missing", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_CAPABILITY__"), line => line.replace(/,"main":"[^"]+"/, "")) },
    { name: "main mismatch", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_CAPABILITY__"), line => line.replace(/"main":"[^"]+"/, '"main":"/private/tmp/other.sqlite"')) },
    { name: "invalid aggregate", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_AGGREGATE__"), line => line.replace('"messages":3', '"messages":-1')) },
    { name: "malformed json", mutate: result => replaceProfilerLine(result, line => line.includes("__GATE_D_AGGREGATE__"), `[{${rawLeak}`) },
    { name: "malformed plan", mutate: result => replaceProfilerLine(result, line => line.includes("fixed_table_0"), '[{"id":2,"detail":7}]') },
    { name: "negative timer", mutate: result => replaceProfilerLine(result, line => line.startsWith("Run Time:"), "Run Time: real -0.001 user 0.000000 sys 0.000000") },
    { name: "nonfinite timer", mutate: result => replaceProfilerLine(result, line => line.startsWith("Run Time:"), "Run Time: real NaN user 0.000000 sys 0.000000") },
    { name: "timer missing", mutate: result => ({ ...result, stdout: result.stdout.replace(/^Run Time:.*\n/m, "") }) },
    { name: "timer extra", mutate: result => ({ ...result, stdout: result.stdout.replace(/(Run Time:.*\n)/, "$1$1") }) },
    { name: "marker duplicate", mutate: result => ({ ...result, stdout: result.stdout.replace(/(\[\{"marker":"__GATE_D_PROBE__".*\n)/, "$1$1") }) },
    { name: "marker missing", mutate: result => ({ ...result, stdout: result.stdout.replace(/^\[\{"marker":"__GATE_D_PROBE__".*\n/m, "") }) },
    { name: "marker out of order", mutate: result => replaceProfilerLine(result, line => line.includes('"probe":"dead-letter"'), line => line.replace("dead-letter", "incremental-events")) },
    { name: "marker unknown", mutate: result => replaceProfilerLine(result, line => line.includes('"probe":"dead-letter"'), line => line.replace("dead-letter", "unknown-probe")) },
    { name: "trailing stdout", mutate: result => ({ ...result, stdout: `${result.stdout}${rawLeak}\n` }) },
    { name: "stderr", mutate: result => ({ ...result, stderr: rawLeak }) }
  ];
}

describe("Gate D immutable offline database profiler", () => {
  it("uses one fixed sqlite3 child and leaves a live WAL snapshot byte-for-byte unchanged", () => {
    const databasePath = privateTemporaryPath("live wal #?%.sqlite");
    seedOfflineDatabase(databasePath, false);
    const writer = new Database(databasePath);
    writer.pragma("journal_mode = WAL");
    insertRuntimeEvent(writer, "checkpointed", 1);
    writer.pragma("wal_checkpoint(TRUNCATE)");
    insertRuntimeEvent(writer, "wal-only", 2);
    const ordinary = new Database(databasePath, { readonly: true, fileMustExist: true });
    expect((ordinary.prepare("SELECT COUNT(*) AS count FROM runtime_events").get() as { count: number }).count).toBe(2);
    ordinary.close();
    const before = snapshotDatabaseFamily(databasePath);
    const calls: Array<{ command: string; args: readonly string[]; options: Record<string, unknown> }> = [];

    const profile = profileGateDOfflineDatabase(databasePath, {
      generatedAt: "2026-07-16T01:00:00.000Z",
      spawnSync(command, args, options) {
        calls.push({ command, args, options: options as unknown as Record<string, unknown> });
        return spawnSync(command, args, options);
      }
    });

    expect(profile.tableRows.runtime_events).toBe(1);
    expect(snapshotDatabaseFamily(databasePath)).toEqual(before);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("/usr/bin/sqlite3");
    expect(calls[0]?.args).toEqual([
      "-batch",
      "-bail",
      `${pathToFileURL(databasePath).href}?mode=ro&immutable=1`
    ]);
    expect(calls[0]?.options).toMatchObject({
      encoding: "utf8",
      timeout: 900_000,
      maxBuffer: 8_388_608,
      env: { LC_ALL: "C", LANG: "C" }
    });
    expect(calls[0]?.options).not.toHaveProperty("shell");
    writer.close();
  });

  it("proves the immutable URI rejects writes without changing main, WAL, or SHM", () => {
    const databasePath = privateTemporaryPath("write-rejection.sqlite");
    seedOfflineDatabase(databasePath);
    const before = snapshotDatabaseFamily(databasePath);
    const result = spawnSync(
      "/usr/bin/sqlite3",
      ["-batch", "-bail", `${pathToFileURL(databasePath).href}?mode=ro&immutable=1`],
      { input: "CREATE TABLE forbidden(value TEXT);\n", encoding: "utf8", env: { LC_ALL: "C", LANG: "C" } }
    );

    expect(result.status).not.toBe(0);
    expect(snapshotDatabaseFamily(databasePath)).toEqual(before);
  });

  it("rejects missing and symlink inputs or sidecars before spawning and creates nothing", () => {
    const root = privateTemporaryDirectory("preflight");
    const spawn = vi.fn(() => validProfilerChildResult(join(root, "unused.sqlite")));
    const missing = join(root, "missing.sqlite");
    expect(() => profileGateDOfflineDatabase(missing, { spawnSync: spawn })).toThrow(PROFILER_ERROR);
    expect(existsSync(missing)).toBe(false);
    expect(existsSync(`${missing}-wal`)).toBe(false);
    expect(existsSync(`${missing}-shm`)).toBe(false);

    const real = join(root, "real.sqlite");
    seedOfflineDatabase(real);
    const inputLink = join(root, "input-link.sqlite");
    symlinkSync(real, inputLink);
    expect(() => profileGateDOfflineDatabase(inputLink, { spawnSync: spawn })).toThrow(PROFILER_ERROR);

    const sidecarDatabase = join(root, "sidecar.sqlite");
    seedOfflineDatabase(sidecarDatabase);
    const sidecarTarget = join(root, "sidecar-target");
    writeFileSync(sidecarTarget, "not-a-sidecar", { mode: 0o600 });
    symlinkSync(sidecarTarget, `${sidecarDatabase}-wal`);
    expect(() => profileGateDOfflineDatabase(sidecarDatabase, { spawnSync: spawn })).toThrow(PROFILER_ERROR);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("fails closed when the claimed database is replaced during the only child call", () => {
    const databasePath = privateTemporaryPath("replacement.sqlite");
    const displaced = `${databasePath}.displaced`;
    seedOfflineDatabase(databasePath);

    expect(() => profileGateDOfflineDatabase(databasePath, {
      spawnSync() {
        renameSync(databasePath, displaced);
        seedOfflineDatabase(databasePath, false);
        return validProfilerChildResult(databasePath);
      }
    })).toThrow(PROFILER_ERROR);
  });

  it.each(["main", "wal"] as const)(
    "still performs the post-spawn %s identity read when the injected child seam throws",
    familyMember => {
      const databasePath = privateTemporaryPath(`throw-after-${familyMember}.sqlite`);
      const displaced = `${databasePath}.${familyMember}.displaced`;
      seedOfflineDatabase(databasePath);
      const writer = familyMember === "wal" ? new Database(databasePath) : undefined;
      if (writer) {
        writer.pragma("journal_mode = WAL");
        insertRuntimeEvent(writer, "wal-before-throw", 1);
      }
      const observedPath = familyMember === "main" ? databasePath : `${databasePath}-wal`;
      let identityReads = 0;
      fileSystemMock.lstatSync = (path, options, delegate) => {
        if (path === observedPath) identityReads += 1;
        return delegate(path, options);
      };
      let observed: Error | undefined;
      try {
        profileGateDOfflineDatabase(databasePath, {
          spawnSync() {
            renameSync(observedPath, displaced);
            if (familyMember === "main") seedOfflineDatabase(databasePath, false);
            else writeFileSync(observedPath, "replacement-sidecar", { mode: 0o600 });
            throw new Error(`raw child failure ${databasePath} temporary-tenant`);
          }
        });
      } catch (error) {
        observed = error as Error;
      } finally {
        writer?.close();
      }

      expect(identityReads).toBeGreaterThanOrEqual(2);
      expect(observed?.message).toBe(PROFILER_ERROR);
      expect(observed?.message).not.toContain(databasePath);
      expect(observed?.message).not.toContain("temporary-tenant");
    }
  );

  it.each(["runtime space.sqlite", "runtime#.sqlite", "runtime?.sqlite", "runtime%.sqlite"])(
    "percent-encodes URL-sensitive filename %s once in one argv item",
    fileName => {
      const databasePath = privateTemporaryPath(fileName);
      seedOfflineDatabase(databasePath);
      const spawn = vi.fn((_command: string, _args: string[], _options: unknown) => validProfilerChildResult(databasePath));

      profileGateDOfflineDatabase(databasePath, { spawnSync: spawn });

      expect(spawn).toHaveBeenCalledTimes(1);
      const [command, args, options] = spawn.mock.calls[0]!;
      const spawnOptions = options as { input?: unknown; env?: unknown };
      expect(command).toBe("/usr/bin/sqlite3");
      expect(args).toEqual(["-batch", "-bail", `${pathToFileURL(databasePath).href}?mode=ro&immutable=1`]);
      expect(args).toHaveLength(3);
      expect(String(spawnOptions.input)).not.toContain(databasePath);
      expect(JSON.stringify(spawnOptions.env)).not.toMatch(/tenant|user|conversation|Bearer|sk-/i);
    }
  );

  it("parses one strict aggregate-only multiplex stream with fifteen ordered plans and timers", () => {
    const databasePath = privateTemporaryPath("protocol.sqlite");
    seedOfflineDatabase(databasePath);
    const spawn = vi.fn((_command: string, _args: string[], _options: unknown) => validProfilerChildResult(databasePath));

    const profile = profileGateDOfflineDatabase(databasePath, {
      generatedAt: "2026-07-16T01:00:00.000Z",
      spawnSync: spawn
    });

    expect(profile).toEqual({
      schemaVersion: 1,
      track: "local",
      evidenceKind: "gate-d-offline-database-profile",
      generatedAt: "2026-07-16T01:00:00.000Z",
      databaseBytes: statSync(databasePath).size,
      tableRows: { conversations: 2, messages: 3, executions: 1, approvals: 1, runtime_events: 3 },
      eventDeliveryStatus: { delivered: 2, pending: 1 },
      objectBytes: [{ name: "messages", bytes: 4096 }, { name: "runtime_events", bytes: 8192 }],
      sessionCardinality: {
        messages: { p50: 1, p95: 2, max: 2 },
        executions: { p50: 0, p95: 1, max: 1 },
        runtimeEvents: { p50: 1, p95: 2, max: 2 }
      },
      queryPlans: OFFLINE_PROBES.map((probe, index) => ({
        probe,
        plan: [`SCAN fixed_table_${index}`],
        durationMs: index
      }))
    });
    const script = String((spawn.mock.calls[0]?.[2] as { input?: unknown }).input);
    expect(script).toContain(".explain off");
    expect(script.match(/__GATE_D_PROBE__/g)).toHaveLength(15);
    expect(script.match(/\.timer on/g)).toHaveLength(15);
    expect(script.match(/\.mode off/g)).toHaveLength(15);
    expect(script).not.toMatch(/temporary-tenant|temporary-user|session-alpha|session-beta/);
    expect(JSON.stringify(profile)).not.toMatch(
      /temporary-tenant|temporary-user|session-alpha|session-beta|OPENHARNESS_SECRET_CANARY|sensitive message|approval-secret/
    );
    expect(profile).not.toHaveProperty("path");
    expect(profile).not.toHaveProperty("stdout");
    expect(profile).not.toHaveProperty("stderr");
  });

  it.each(profilerProtocolFailures())("rejects sanitized child/protocol failure: $name", ({ mutate }) => {
    const databasePath = privateTemporaryPath("protocol-failure.sqlite");
    seedOfflineDatabase(databasePath);
    const raw = validProfilerChildResult(databasePath);
    const injected = mutate(raw, databasePath);
    let observed: Error | undefined;
    try {
      profileGateDOfflineDatabase(databasePath, { spawnSync: () => injected });
    } catch (error) {
      observed = error as Error;
    }

    expect(observed?.message).toBe(PROFILER_ERROR);
    expect(observed?.message).not.toMatch(
      /protocol-failure|file:|SELECT|OPENHARNESS_SECRET_CANARY|temporary-tenant|temporary-user|session-alpha|Bearer|sk-/i
    );
  });
});

describe("Gate D three-variant local diagnostic runner", () => {
  it("runs the fixed full-oracle experiment for 60 samples and cleans up in order", async () => {
    const paths = diagnosticPaths("full-happy");
    const events: string[] = [];
    const delays: number[] = [];
    let openedProbes = 0;
    let closedProbes = 0;
    let monotonicMs = 0;
    let seededWorkload: DeterministicRuntimeBaselineWorkload | undefined;
    const dependencies = diagnosticDependencies({
      monotonicClock: () => monotonicMs,
      delay: async milliseconds => {
        delays.push(milliseconds);
        monotonicMs += milliseconds;
      },
      startRuntime: async () => { events.push("start"); },
      stopRuntime: async () => { events.push("stop"); },
      seed: async workload => {
        events.push("seed");
        seededWorkload = workload;
      },
      startWorkload: async () => { events.push("workload-start"); },
      stopWorkload: async () => { events.push("workload-stop"); },
      openProbe: sqlitePath => {
        events.push("probe-open");
        openedProbes += 1;
        return emptyDatabaseProbe(sqlitePath);
      },
      closeProbe: probe => {
        events.push("probe-close");
        closedProbes += 1;
        probe.close();
      }
    });

    const report = await runGateDPerformanceDiagnostic(paths.input("full-oracle"), dependencies);

    expect(report).toMatchObject({
      track: "local",
      evidenceKind: "gate-d-performance-diagnostic",
      variant: "full-oracle",
      durationMs: 1_800_000,
      sampleIntervalMs: 30_000
    });
    expect(report.samples).toHaveLength(60);
    expect(delays).toEqual(Array.from({ length: 60 }, () => 30_000));
    expect(events).toEqual([
      "start", "seed", "probe-open", "workload-start", "workload-stop", "stop", "probe-close"
    ]);
    expect(openedProbes).toBe(1);
    expect(closedProbes).toBe(1);
    expect(report.samples.every(sample => sample.probeTimings.length === 7)).toBe(true);
    expect(report.samples[0]?.probeTimings.map(timing => timing.probe)).toEqual([
      "incremental-events",
      "dead-letter",
      "orphaned-approval",
      "duplicate-event",
      "sqlite-busy",
      "event-secret-canary",
      "message-secret-canary"
    ]);
    expect(seededWorkload).toMatchObject({
      seededConversations: 10_000,
      concurrency: 20,
      mix: { noTool: 0.6, javaSandbox: 0.2, mcp: 0.15, approvalInterruption: 0.05 }
    });
    expect(seededWorkload?.operations).toHaveLength(10_000);
    expect(JSON.parse(readFileSync(paths.outputPath, "utf8"))).toEqual(report);
    expect(statSync(paths.outputPath).mode & 0o777).toBe(0o600);
  });

  it("stops only resources that started successfully and closes the probe last", async () => {
    const runtimeFailurePaths = diagnosticPaths("runtime-start-failure-state");
    const runtimeEvents: string[] = [];
    const runtimeFailureReport = await runGateDPerformanceDiagnostic(
      runtimeFailurePaths.input("full-oracle"),
      diagnosticDependencies({
        startRuntime: async () => {
          runtimeEvents.push("runtime-start-attempt");
          throw new Error("runtime did not start");
        },
        stopRuntime: async () => { runtimeEvents.push("runtime-stop"); },
        openProbe: sqlitePath => {
          runtimeEvents.push("probe-open");
          return emptyDatabaseProbe(sqlitePath);
        },
        closeProbe: () => { runtimeEvents.push("probe-close"); }
      })
    );

    expect(runtimeEvents).toEqual(["runtime-start-attempt"]);
    expect(runtimeFailureReport.hardFailures).toEqual(["RUNTIME_START_FAILURE"]);

    const workloadFailurePaths = diagnosticPaths("workload-start-failure-state");
    const workloadEvents: string[] = [];
    const workloadFailureReport = await runGateDPerformanceDiagnostic(
      workloadFailurePaths.input("full-oracle"),
      diagnosticDependencies({
        startRuntime: async () => { workloadEvents.push("runtime-start"); },
        seed: async () => { workloadEvents.push("seed"); },
        openProbe: sqlitePath => {
          workloadEvents.push("probe-open");
          return emptyDatabaseProbe(sqlitePath);
        },
        startWorkload: async () => {
          workloadEvents.push("workload-start-attempt");
          throw new Error("workload did not start");
        },
        stopWorkload: async () => { workloadEvents.push("workload-stop"); },
        stopRuntime: async () => { workloadEvents.push("runtime-stop"); },
        closeProbe: probe => {
          workloadEvents.push("probe-close");
          probe.close();
        }
      })
    );

    expect(workloadEvents).toEqual([
      "runtime-start", "seed", "probe-open", "workload-start-attempt", "runtime-stop", "probe-close"
    ]);
    expect(workloadFailureReport.hardFailures).toEqual(["WORKLOAD_START_FAILURE"]);
  });

  it("atomically claims both targets before start and rejects a concurrent second run", async () => {
    const paths = diagnosticPaths("concurrent-claim");
    let releaseFirstStart!: () => void;
    let markFirstStarted!: () => void;
    const firstStartEntered = new Promise<void>(resolve => { markFirstStarted = resolve; });
    const firstStartGate = new Promise<void>(resolve => { releaseFirstStart = resolve; });
    const firstStart = vi.fn(async () => {
      markFirstStarted();
      await firstStartGate;
    });
    const secondStart = vi.fn(async () => undefined);

    const firstRun = runGateDPerformanceDiagnostic(
      paths.input("workload-only"),
      diagnosticDependencies({ startRuntime: firstStart })
    );
    await firstStartEntered;
    let concurrentRejected = false;
    try {
      await runGateDPerformanceDiagnostic(
        paths.input("workload-only"),
        diagnosticDependencies({ startRuntime: secondStart })
      );
    } catch (error) {
      concurrentRejected = true;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/claim|exist|reserved/i);
    } finally {
      releaseFirstStart();
    }
    let report: GateDPerformanceDiagnosticReport | undefined;
    let firstError: unknown;
    try {
      report = await firstRun;
    } catch (error) {
      firstError = error;
    }
    expect(concurrentRejected).toBe(true);
    expect(firstStart).toHaveBeenCalledTimes(1);
    expect(secondStart).not.toHaveBeenCalled();
    expect(firstError).toBeUndefined();
    expect(report?.samples).toHaveLength(60);
    expect(JSON.parse(readFileSync(paths.outputPath, "utf8"))).toEqual(report);
  });

  it("reserves a zero-byte SQLite inode that better-sqlite3 can initialize", async () => {
    const paths = diagnosticPaths("zero-sqlite-claim");
    const observedSizes: number[] = [];
    let expectedIdentity: { dev: number; ino: number } | undefined;
    const report = await runGateDPerformanceDiagnostic(
      paths.input("workload-only"),
      diagnosticDependencies({
        startRuntime: async input => {
          const claimed = statSync(input.sqlitePath);
          expectedIdentity = { dev: claimed.dev, ino: claimed.ino };
          observedSizes.push(claimed.size);
          expect(input.expectedDatabaseIdentity).toEqual(expectedIdentity);
          const database = new Database(input.sqlitePath);
          database.exec("CREATE TABLE runtime_claim_smoke(value TEXT)");
          database.close();
        }
      })
    );

    expect(observedSizes).toEqual([0]);
    expect(statSync(paths.sqlitePath).size).toBeGreaterThan(0);
    expect(report.hardFailures).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(String(expectedIdentity!.dev));
    expect(JSON.stringify(report)).not.toContain(String(expectedIdentity!.ino));
  });

  it("detects post-validation inode replacement, fails closed and never writes sentinels", async () => {
    const paths = diagnosticPaths("claim-swap");
    const claimedSqlitePath = `${paths.sqlitePath}.claimed`;
    const claimedOutputPath = `${paths.outputPath}.claimed`;
    const sqliteSentinel = `${paths.sqlitePath}.sentinel`;
    const outputSentinel = `${paths.outputPath}.sentinel`;
    writeFileSync(sqliteSentinel, "sqlite-sentinel", { mode: 0o600 });
    writeFileSync(outputSentinel, "output-sentinel", { mode: 0o600 });
    const events: string[] = [];

    await expect(runGateDPerformanceDiagnostic(
      paths.input("full-oracle"),
      diagnosticDependencies({
        startRuntime: async () => {
          events.push("runtime-start");
          renameSync(paths.sqlitePath, claimedSqlitePath);
          symlinkSync(sqliteSentinel, paths.sqlitePath);
          renameSync(paths.outputPath, claimedOutputPath);
          symlinkSync(outputSentinel, paths.outputPath);
        },
        seed: async () => { events.push("seed"); },
        startWorkload: async () => { events.push("workload-start"); },
        stopRuntime: async () => { events.push("runtime-stop"); }
      })
    )).rejects.toThrow(/output claim identity changed after write/i);
    const report = JSON.parse(readFileSync(claimedOutputPath, "utf8")) as GateDPerformanceDiagnosticReport;

    expect(events).toEqual(["runtime-start", "runtime-stop"]);
    expect(report.hardFailures).toEqual([
      "SQLITE_CLAIM_IDENTITY_CHANGED",
      "OUTPUT_CLAIM_IDENTITY_CHANGED"
    ]);
    expect(readFileSync(sqliteSentinel, "utf8")).toBe("sqlite-sentinel");
    expect(readFileSync(outputSentinel, "utf8")).toBe("output-sentinel");
  });

  it("fails closed when the named output is replaced after report fsync", async () => {
    const paths = diagnosticPaths("late-output-swap");
    const displacedOutputPath = `${paths.outputPath}.displaced`;
    let swapped = false;
    fileSystemMock.fsyncSync = (fileDescriptor, delegate) => {
      delegate(fileDescriptor);
      if (swapped) return;
      swapped = true;
      renameSync(paths.outputPath, displacedOutputPath);
      writeFileSync(paths.outputPath, "replacement", { mode: 0o600 });
    };

    await expect(runGateDPerformanceDiagnostic(
      paths.input("workload-only"),
      diagnosticDependencies()
    )).rejects.toThrow(/output claim identity changed after write/i);

    expect(readFileSync(paths.outputPath, "utf8")).toBe("replacement");
    expect(JSON.parse(readFileSync(displacedOutputPath, "utf8"))).toMatchObject({
      runId: paths.input("workload-only").runId
    });
  });

  it("uses Task 1 formal-full and diagnostic-incremental cursor modes", async () => {
    const fullPaths = diagnosticPaths("mode-full");
    const incrementalPaths = diagnosticPaths("mode-incremental");
    const fullDependencies = diagnosticDependencies();
    const incrementalDependencies = diagnosticDependencies();

    const fullReport = await runGateDPerformanceDiagnostic(fullPaths.input("full-oracle"), fullDependencies);
    const incrementalReport = await runGateDPerformanceDiagnostic(
      incrementalPaths.input("incremental-oracle"),
      incrementalDependencies
    );

    expect(fullReport.samples.every(sample => sample.probeTimings.length === 7)).toBe(true);
    expect(incrementalReport.samples.every(sample => sample.probeTimings.length === 1)).toBe(true);
    expect(incrementalReport.samples[0]?.probeTimings[0]?.probe).toBe("incremental-events");
  });

  it("keeps workload-only free of oracle calls while timing aggregate snapshots after metrics drain", async () => {
    const paths = diagnosticPaths("workload-only");
    const order: string[] = [];
    let oracleCalls = 0;
    const dependencies = diagnosticDependencies({
      clock: () => {
        order.push("clock");
        return new Date("2026-07-16T00:00:30.000Z");
      },
      drainMetrics: () => {
        order.push("drain");
        return validMetrics();
      },
      readOracle: () => {
        oracleCalls += 1;
        throw new Error("workload-only must not invoke the database oracle");
      },
      readAggregateSnapshot: () => {
        order.push("aggregate");
        return validAggregateSnapshot();
      },
      readDatabaseBytes: () => {
        order.push("file-size");
        return 4_096;
      }
    });

    const report = await runGateDPerformanceDiagnostic(paths.input("workload-only"), dependencies);

    expect(oracleCalls).toBe(0);
    expect(order).toEqual([
      ...Array.from(
        { length: 60 },
        () => ["clock", "drain", "clock", "aggregate", "clock", "file-size"]
      ).flat(),
      "clock"
    ]);
    expect(report.samples).toHaveLength(60);
    expect(report.samples.every(sample =>
      sample.probeTimings.length === 0
      && sample.oracleDurationMs === 0
      && sample.conversations === 10_000
      && sample.pendingEvents === 2
    )).toBe(true);
  });

  it("uses monotonic absolute deadlines so oracle cost shortens later delays", async () => {
    const paths = diagnosticPaths("deadline-scheduling");
    let monotonicMs = 0;
    const delays: number[] = [];
    const sampleStarts: number[] = [];
    const dependencies = diagnosticDependencies({
      monotonicClock: () => monotonicMs,
      delay: async milliseconds => {
        delays.push(milliseconds);
        monotonicMs += milliseconds;
      },
      drainMetrics: () => {
        sampleStarts.push(monotonicMs);
        return validMetrics();
      },
      readOracle: cursor => cursor.read(timingDatabaseProbe({
        onAll: () => { monotonicMs += 5_000; }
      }))
    });

    const report = await runGateDPerformanceDiagnostic(paths.input("full-oracle"), dependencies);

    expect(delays).toEqual([30_000, ...Array.from({ length: 59 }, () => 25_000)]);
    expect(sampleStarts).toEqual(Array.from({ length: 60 }, (_, index) => (index + 1) * 30_000));
    expect(sampleStarts.at(-1)).toBe(1_800_000);
    expect(report.samples).toHaveLength(60);
  });

  it("uses Task 2 p95 and sums only oracle timings without a formal verdict", async () => {
    const paths = diagnosticPaths("sample-math");
    let monotonicMs = 0;
    const dependencies = diagnosticDependencies({
      monotonicClock: () => monotonicMs,
      delay: async milliseconds => { monotonicMs += milliseconds; },
      drainMetrics: () => ({
        admissionLatenciesMs: [1, 101, 3, 2],
        durableReplayLatenciesMs: [20, 251, 10],
        hardFailures: [],
        eventObservations: []
      }),
      readOracle: cursor => cursor.read(timingDatabaseProbe({
        onAll: () => { monotonicMs += 2; },
        onGet: sql => {
          if (sql.includes("delivery_status = 'dead_letter'")) monotonicMs += 3;
        }
      }))
    });

    const report = await runGateDPerformanceDiagnostic(paths.input("full-oracle"), dependencies);

    expect(report.samples[0]).toMatchObject({
      admissionP95Ms: 101,
      durableReplayP95Ms: 251,
      oracleDurationMs: 5
    });
    expect(report.samples[0]?.probeTimings[0]).toEqual({
      probe: "incremental-events", durationMs: 2, rowCount: 0
    });
    expect(report.samples[0]?.probeTimings[1]).toEqual({
      probe: "dead-letter", durationMs: 3, rowCount: 0
    });
    expect(report).not.toHaveProperty("result");
    expect(report).not.toHaveProperty("thresholds");
  });

  it.each([
    ["track", "production"],
    ["workload", { seededConversations: 1 }],
    ["thresholds", { admissionP95Ms: 999 }],
    ["restartScheduleMs", [1]],
    ["formalApproval", { approved: true }],
    ["durationMs", 1],
    ["sampleIntervalMs", 1],
    ["concurrency", 1],
    ["evidenceKind", "formal-24-hour-soak"]
  ])("rejects runtime input override %s fail-closed", async (field, value) => {
    const paths = diagnosticPaths(`strict-${field}`);
    const startRuntime = vi.fn(async () => undefined);

    await expect(runGateDPerformanceDiagnostic({
      ...paths.input("full-oracle"),
      [field]: value
    } as never, diagnosticDependencies({ startRuntime }))).rejects.toThrow(/unknown.*field/i);
    expect(startRuntime).not.toHaveBeenCalled();
    expect(() => statSync(paths.outputPath)).toThrow();
  });

  it("requires absolute fresh distinct database and output targets", async () => {
    const relative = diagnosticPaths("relative");
    await expect(runGateDPerformanceDiagnostic({
      ...relative.input("full-oracle"), sqlitePath: "runtime.sqlite"
    }, diagnosticDependencies())).rejects.toThrow(/absolute/i);
    await expect(runGateDPerformanceDiagnostic({
      ...relative.input("full-oracle"), outputPath: "report.json"
    }, diagnosticDependencies())).rejects.toThrow(/absolute/i);

    const existingDatabase = diagnosticPaths("existing-db");
    writeFileSync(existingDatabase.sqlitePath, "not a database", { mode: 0o600 });
    await expect(runGateDPerformanceDiagnostic(
      existingDatabase.input("full-oracle"), diagnosticDependencies()
    )).rejects.toThrow(/fresh|exist/i);

    const existingOutput = diagnosticPaths("existing-output");
    writeFileSync(existingOutput.outputPath, "preserve", { mode: 0o600 });
    await expect(runGateDPerformanceDiagnostic(
      existingOutput.input("full-oracle"), diagnosticDependencies()
    )).rejects.toThrow(/fresh|exist/i);
    expect(readFileSync(existingOutput.outputPath, "utf8")).toBe("preserve");

    const sameTarget = diagnosticPaths("same-target");
    await expect(runGateDPerformanceDiagnostic({
      ...sameTarget.input("full-oracle"), outputPath: sameTarget.sqlitePath
    }, diagnosticDependencies())).rejects.toThrow(/distinct/i);
  });

  it("rejects canonical SQLite and output containment in attempt packets without rejecting safe targets", async () => {
    const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
    const attempt001 = join(
      projectRoot,
      "docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/runtime.sqlite"
    );
    const attempt002Packet = join(
      projectRoot,
      "docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002"
    );
    const startRuntime = vi.fn(async () => undefined);
    const packetDependencies = () => diagnosticDependencies({ startRuntime });
    const output = diagnosticPaths("attempt-output").outputPath;

    await expect(runGateDPerformanceDiagnostic({
      ...diagnosticPaths("attempt-001").input("full-oracle"),
      sqlitePath: attempt001,
      outputPath: output
    }, packetDependencies())).rejects.toThrow(/attempt|packet/i);
    await expect(runGateDPerformanceDiagnostic({
      ...diagnosticPaths("attempt-descendant").input("full-oracle"),
      sqlitePath: join(attempt002Packet, "nested", "..", "diagnostic.sqlite")
    }, packetDependencies())).rejects.toThrow(/attempt|packet/i);

    const outputDirect = diagnosticPaths("attempt-output-direct");
    const outputDirectTarget = join(attempt002Packet, "runtime.sqlite");
    await expect(runGateDPerformanceDiagnostic({
      ...outputDirect.input("full-oracle"),
      outputPath: outputDirectTarget
    }, packetDependencies())).rejects.toThrow(/attempt|packet/i);
    const outputAttempt001 = diagnosticPaths("attempt-output-001");
    const outputAttempt001Target = attempt001;
    await expect(runGateDPerformanceDiagnostic({
      ...outputAttempt001.input("full-oracle"),
      outputPath: outputAttempt001Target
    }, packetDependencies())).rejects.toThrow(/attempt|packet/i);
    const outputDotSegment = diagnosticPaths("attempt-output-dot");
    const outputDotTarget = `${attempt002Packet}/nested/../runtime.sqlite`;
    await expect(runGateDPerformanceDiagnostic({
      ...outputDotSegment.input("full-oracle"),
      outputPath: outputDotTarget
    }, packetDependencies())).rejects.toThrow(/attempt|packet/i);

    const aliasRoot = temporaryPath("attempt-alias-root");
    mkdirSync(aliasRoot);
    const alias = join(aliasRoot, "packet-link");
    symlinkSync(attempt002Packet, alias, "dir");
    await expect(runGateDPerformanceDiagnostic({
      ...diagnosticPaths("attempt-alias").input("full-oracle"),
      sqlitePath: join(alias, "diagnostic.sqlite")
    }, packetDependencies())).rejects.toThrow(/attempt|packet/i);
    const outputAlias = diagnosticPaths("attempt-output-alias");
    await expect(runGateDPerformanceDiagnostic({
      ...outputAlias.input("full-oracle"),
      outputPath: join(alias, "runtime.sqlite")
    }, packetDependencies())).rejects.toThrow(/attempt|packet/i);
    expect(startRuntime).not.toHaveBeenCalled();

    const safe = diagnosticPaths("safe-packet-boundary");
    const safeReport = await runGateDPerformanceDiagnostic(safe.input("workload-only"), diagnosticDependencies());
    expect(safeReport.samples).toHaveLength(60);
    expect(JSON.parse(readFileSync(safe.outputPath, "utf8"))).toEqual(safeReport);
  });

  it.each([
    ["runtime", { startRuntime: async () => { throw new Error("runtime secret detail"); } }],
    ["seed", { seed: async () => { throw new Error("seed secret detail"); } }],
    ["workload-start", { startWorkload: async () => { throw new Error("start secret detail"); } }],
    ["metrics", { drainMetrics: () => { throw new Error("metrics secret detail"); } }],
    ["probe-open", { openProbe: () => { throw new Error("probe secret detail"); } }],
    ["oracle", { readOracle: () => { throw new Error("oracle secret detail"); } }],
    ["aggregate", { readAggregateSnapshot: () => { throw new Error("aggregate secret detail"); } }],
    ["file-size", { readDatabaseBytes: () => { throw new Error("file secret detail"); } }]
  ] as const)("writes one valid stable failure report for %s failure", async (failurePoint, overrides) => {
    const paths = diagnosticPaths(`failure-${failurePoint}`);
    const events: string[] = [];
    let probeOpens = 0;
    let probeCloses = 0;
    const dependencies = diagnosticDependencies({
      startRuntime: async () => { events.push("start"); },
      stopRuntime: async () => { events.push("stop"); },
      seed: async () => { events.push("seed"); },
      startWorkload: async () => { events.push("workload-start"); },
      stopWorkload: async () => { events.push("workload-stop"); },
      openProbe: sqlitePath => {
        probeOpens += 1;
        return emptyDatabaseProbe(sqlitePath);
      },
      closeProbe: probe => {
        probeCloses += 1;
        probe.close();
      },
      ...overrides
    });

    const report = await runGateDPerformanceDiagnostic(paths.input("full-oracle"), dependencies);
    const diskReport = JSON.parse(readFileSync(paths.outputPath, "utf8"));

    expect(() => assertGateDPerformanceDiagnosticReport(report)).not.toThrow();
    expect(diskReport).toEqual(report);
    expect(report.samples.length).toBeGreaterThanOrEqual(1);
    expect(report.hardFailures).toHaveLength(1);
    expect(report.hardFailures[0]).toMatch(/^[A-Z][A-Z0-9_]+$/);
    expect(JSON.stringify(report)).not.toContain("secret detail");
    if (failurePoint === "runtime") expect(events).toEqual([]);
    else expect(events.at(-1)).toBe("stop");
    const workloadStopIndex = events.indexOf("workload-stop");
    if (workloadStopIndex >= 0) expect(workloadStopIndex).toBeLessThan(events.indexOf("stop"));
    expect(probeCloses).toBe(probeOpens);
  });

  it("records probe-close and cleanup failures while preserving cleanup order", async () => {
    const paths = diagnosticPaths("cleanup-failures");
    const events: string[] = [];
    const dependencies = diagnosticDependencies({
      closeProbe: () => {
        events.push("probe-close");
        throw new Error("close detail");
      },
      stopWorkload: async () => {
        events.push("workload-stop");
        throw new Error("workload stop detail");
      },
      stopRuntime: async () => {
        events.push("runtime-stop");
        throw new Error("runtime stop detail");
      }
    });

    const report = await runGateDPerformanceDiagnostic(paths.input("full-oracle"), dependencies);

    expect(events).toEqual(["workload-stop", "runtime-stop", "probe-close"]);
    expect(report.hardFailures).toEqual([
      "WORKLOAD_STOP_FAILURE",
      "RUNTIME_STOP_FAILURE",
      "DATABASE_PROBE_CLOSE_FAILURE"
    ]);
    expect(report.samples).toHaveLength(60);
    expect(() => assertGateDPerformanceDiagnosticReport(report)).not.toThrow();
    expect(JSON.parse(readFileSync(paths.outputPath, "utf8"))).toEqual(report);
  });

  it("converts malformed metrics into a stable failure report", async () => {
    const paths = diagnosticPaths("invalid-metrics");
    const report = await runGateDPerformanceDiagnostic(
      paths.input("full-oracle"),
      diagnosticDependencies({
        drainMetrics: () => ({
          ...validMetrics(),
          admissionLatenciesMs: [Number.NaN]
        })
      })
    );

    expect(report.hardFailures).toEqual(["WORKLOAD_METRICS_FAILURE"]);
    expect(report.samples).toHaveLength(1);
    expect(() => assertGateDPerformanceDiagnosticReport(report)).not.toThrow();
  });

  it("rejects runId and database basenames that contain the exact service token before start", async () => {
    const token = "TOKENVALUE123";
    const runIdPaths = diagnosticPaths("token-run-id");
    const runIdStart = vi.fn(async () => undefined);
    await expect(runGateDPerformanceDiagnostic({
      ...runIdPaths.input("full-oracle"),
      runId: token,
      serviceToken: token
    }, diagnosticDependencies({ startRuntime: runIdStart }))).rejects.toThrow(/token|sensitive/i);
    expect(runIdStart).not.toHaveBeenCalled();
    expect(() => statSync(runIdPaths.outputPath)).toThrow();

    const databasePaths = diagnosticPaths("token-database-basename");
    const databaseStart = vi.fn(async () => undefined);
    await expect(runGateDPerformanceDiagnostic({
      ...databasePaths.input("full-oracle"),
      sqlitePath: join(dirname(databasePaths.sqlitePath), `runtime-${token}.sqlite`),
      serviceToken: token
    }, diagnosticDependencies({ startRuntime: databaseStart }))).rejects.toThrow(/token|sensitive/i);
    expect(databaseStart).not.toHaveBeenCalled();
    expect(() => statSync(databasePaths.outputPath)).toThrow();

    const variantPaths = diagnosticPaths("token-variant");
    const variantStart = vi.fn(async () => undefined);
    await expect(runGateDPerformanceDiagnostic({
      ...variantPaths.input("full-oracle"),
      serviceToken: "full-oracle"
    }, diagnosticDependencies({ startRuntime: variantStart }))).rejects.toThrow(/token|sensitive/i);
    expect(variantStart).not.toHaveBeenCalled();
    expect(() => statSync(variantPaths.outputPath)).toThrow();
  });

  it.each(["javaUrl", "mcpConfigPath", "sqlitePath", "outputPath"] as const)(
    "rejects exact service token in %s before filesystem or Runtime work",
    async field => {
      const token = "TOKENVALUE123";
      const paths = diagnosticPaths(`token-preflight-${field}`);
      const startRuntime = vi.fn(async () => undefined);
      const value = field === "javaUrl"
        ? `http://127.0.0.1/${token}`
        : join(dirname(paths.sqlitePath), `${field}-${token}`);
      let observedError: Error | undefined;
      try {
        await runGateDPerformanceDiagnostic({
          ...paths.input("full-oracle"),
          [field]: value,
          serviceToken: token
        }, diagnosticDependencies({ startRuntime }));
      } catch (error) {
        observedError = error as Error;
      }

      expect(observedError).toBeInstanceOf(Error);
      expect(observedError?.message).not.toContain(token);
      expect(startRuntime).not.toHaveBeenCalled();
      expect(() => statSync(paths.outputPath)).toThrow();
    }
  );

  it("keeps missing-parent and late output-collision errors free of the service token", async () => {
    const token = "TOKENVALUE123";
    const missingParentPaths = diagnosticPaths("missing-parent-error");
    const missingStart = vi.fn(async () => undefined);
    let missingParentError: Error | undefined;
    try {
      await runGateDPerformanceDiagnostic({
        ...missingParentPaths.input("full-oracle"),
        sqlitePath: join(dirname(missingParentPaths.sqlitePath), "missing", "runtime.sqlite"),
        serviceToken: token
      }, diagnosticDependencies({ startRuntime: missingStart }));
    } catch (error) {
      missingParentError = error as Error;
    }
    expect(missingParentError).toBeInstanceOf(Error);
    expect(missingParentError?.message).not.toContain(token);
    expect(missingStart).not.toHaveBeenCalled();

    const collisionPaths = diagnosticPaths("late-output-collision");
    const collisionStart = vi.fn(async () => undefined);
    fileSystemMock.openSync = (path, flags, mode, delegate) => {
      const descriptor = delegate(path, flags, mode);
      if (basename(path) === basename(collisionPaths.sqlitePath)) {
        writeFileSync(collisionPaths.outputPath, "late-collision", { mode: 0o600 });
      }
      return descriptor;
    };
    let collisionError: Error | undefined;
    try {
      await runGateDPerformanceDiagnostic({
        ...collisionPaths.input("full-oracle"),
        serviceToken: token
      }, diagnosticDependencies({ startRuntime: collisionStart }));
    } catch (error) {
      collisionError = error as Error;
    }
    expect(collisionError).toBeInstanceOf(Error);
    expect(collisionError?.message).not.toContain(token);
    expect(collisionStart).not.toHaveBeenCalled();
    expect(readFileSync(collisionPaths.outputPath, "utf8")).toBe("late-collision");
  });

  it("redacts exact service-token dependency failures into one stable code before serialization", async () => {
    const paths = diagnosticPaths("token-dependency-failure");
    const token = "TOKENVALUE123";
    const report = await runGateDPerformanceDiagnostic({
      ...paths.input("full-oracle"),
      serviceToken: token
    }, diagnosticDependencies({
      drainMetrics: () => ({
        ...validMetrics(),
        hardFailures: [`DEPENDENCY_${token}_FAILURE`]
      })
    }));
    const serialized = readFileSync(paths.outputPath, "utf8");

    expect(report.hardFailures).toEqual(["DEPENDENCY_REPORTED_FAILURE"]);
    expect(report.samples[0]?.hardFailures).toEqual(["DEPENDENCY_REPORTED_FAILURE"]);
    expect(serialized).not.toContain(token);
    expect(JSON.parse(serialized)).toEqual(report);
  });

  it("does not serialize the service token or MCP secret content", async () => {
    const paths = diagnosticPaths("secret-boundary");
    const serviceToken = "runner-only-test-token";
    writeFileSync(paths.mcpConfigPath, JSON.stringify({ env: { SECRET: "mcp-config-secret" } }), { mode: 0o600 });

    const report = await runGateDPerformanceDiagnostic({
      ...paths.input("incremental-oracle"), serviceToken
    }, diagnosticDependencies());
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain(serviceToken);
    expect(serialized).not.toContain("mcp-config-secret");
  });

  it("wires the real dependency factory through one port, child, HTTP transport, workload and probe", async () => {
    const paths = diagnosticPaths("real-dependency-wiring");
    const events: string[] = [];
    let selectedPorts = 0;
    let spawnSpec: GateDRuntimeChildSpawnSpec | undefined;
    let seedExecutions = 0;
    let runExecutions = 0;
    let probeSequence = 0;
    let resolveExit!: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void;
    const child: GateDManagedChild = {
      pid: 43_123,
      exited: new Promise(resolve => { resolveExit = resolve; }),
      stop() {
        events.push("runtime-child-stop");
        resolveExit({ code: 0, signal: null });
      }
    };
    const transport: GateDOperationTransport = {
      async execute(input) {
        if (input.phase === "seed") seedExecutions += 1;
        else runExecutions += 1;
        return { admissionLatencyMs: 1, durableReplayLatencyMs: 2, hardFailures: [] };
      },
      stop() { events.push("transport-stop"); }
    };
    const boundary: GateDPerformanceDiagnosticRealBoundary = {
      async selectRuntimePort() {
        selectedPorts += 1;
        events.push("port-select");
        return 43_123;
      },
      async spawnRuntime(spec) {
        events.push("runtime-spawn");
        spawnSpec = spec;
        return child;
      },
      async waitUntilRuntimeReady(_child, input) {
        events.push(`runtime-ready:${input.runtimeUrl}`);
      },
      createTransport(input) {
        events.push(`transport:${input.runtimeUrl}`);
        return transport;
      },
      openProbe(path) {
        probeSequence += 1;
        const probeNumber = probeSequence;
        events.push(`probe-open:${probeNumber}`);
        return {
          ...emptyDatabaseProbe(path),
          close() { events.push(`probe-close:${probeNumber}`); }
        };
      },
      assertSeededConversationCount() {
        events.push("seed-assert-10000");
      }
    };
    const dependencies = createGateDPerformanceDiagnosticRealDependenciesForTest(boundary);
    const workload = buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 });
    writeFileSync(paths.sqlitePath, "", { mode: 0o600 });
    const claimed = statSync(paths.sqlitePath);

    await dependencies.startRuntime({
      javaUrl: "http://127.0.0.1:8080",
      mcpConfigPath: paths.mcpConfigPath,
      sqlitePath: paths.sqlitePath,
      serviceToken: "test-service-token",
      expectedDatabaseIdentity: { dev: claimed.dev, ino: claimed.ino }
    });
    await dependencies.seed(workload);
    const sampleProbe = dependencies.openProbe(paths.sqlitePath);
    await dependencies.startWorkload(workload);
    await dependencies.stopWorkload();
    await dependencies.stopRuntime();
    dependencies.closeProbe(sampleProbe);

    expect(selectedPorts).toBe(1);
    expect(spawnSpec?.options.env).toMatchObject({
      PORT: "43123",
      AGENT_RUNTIME_SQLITE_PATH: paths.sqlitePath,
      GATE_D_MCP_CONFIG_PATH: paths.mcpConfigPath,
      JAVA_BACKEND_URL: "http://127.0.0.1:8080",
      OPENHARNESS_SERVICE_TOKEN: "test-service-token"
    });
    expect(spawnSpec?.options.env).toMatchObject({
      GATE_D_EXPECTED_DATABASE_DEV: String(claimed.dev),
      GATE_D_EXPECTED_DATABASE_INO: String(claimed.ino)
    });
    expect(seedExecutions).toBe(10_000);
    expect(runExecutions).toBeGreaterThan(0);
    expect(events).toEqual([
      "port-select",
      "runtime-spawn",
      "runtime-ready:http://127.0.0.1:43123",
      "transport:http://127.0.0.1:43123",
      "probe-open:1",
      "seed-assert-10000",
      "probe-close:1",
      "probe-open:2",
      "transport-stop",
      "runtime-child-stop",
      "probe-close:2"
    ]);
  });

  it("stops a ready child when real transport initialization fails", async () => {
    const paths = diagnosticPaths("real-transport-init-failure");
    const events: string[] = [];
    let resolveExit!: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void;
    const child: GateDManagedChild = {
      pid: 43_124,
      exited: new Promise(resolve => { resolveExit = resolve; }),
      stop() {
        events.push("runtime-child-stop");
        resolveExit({ code: 0, signal: null });
      }
    };
    const boundary: GateDPerformanceDiagnosticRealBoundary = {
      async selectRuntimePort() { return 43_124; },
      async spawnRuntime() {
        events.push("runtime-spawn");
        return child;
      },
      async waitUntilRuntimeReady() { events.push("runtime-ready"); },
      createTransport() {
        events.push("transport-create");
        throw new Error("injected transport initialization failure");
      },
      openProbe: emptyDatabaseProbe,
      assertSeededConversationCount: () => undefined
    };

    const report = await runGateDPerformanceDiagnostic(
      paths.input("workload-only"),
      createGateDPerformanceDiagnosticRealDependenciesForTest(boundary)
    );

    expect(report.hardFailures).toContain("RUNTIME_START_FAILURE");
    expect(events).toEqual([
      "runtime-spawn",
      "runtime-ready",
      "transport-create",
      "runtime-child-stop"
    ]);
  });

  it("aborts partially seeded real work before stopping the child or completing the report", async () => {
    const paths = diagnosticPaths("real-seed-partial-failure");
    const events: string[] = [];
    const pending: Array<() => void> = [];
    let activeExecutions = 0;
    let executionSequence = 0;
    let resolveExit!: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void;
    const child: GateDManagedChild = {
      pid: 43_125,
      exited: new Promise(resolve => { resolveExit = resolve; }),
      stop() {
        events.push("runtime-child-stop");
        resolveExit({ code: 0, signal: null });
      }
    };
    const transport: GateDOperationTransport = {
      async execute() {
        executionSequence += 1;
        if (executionSequence === 1) {
          events.push("seed-execute-reject");
          throw new Error("injected seed worker failure");
        }
        activeExecutions += 1;
        return await new Promise(resolve => {
          pending.push(() => {
            activeExecutions -= 1;
            resolve({ admissionLatencyMs: 1, durableReplayLatencyMs: 1, hardFailures: [] });
          });
        });
      },
      stop() {
        events.push("transport-stop");
        pending.splice(0).forEach(resolve => resolve());
      }
    };
    const boundary: GateDPerformanceDiagnosticRealBoundary = {
      async selectRuntimePort() { return 43_125; },
      async spawnRuntime() { return child; },
      async waitUntilRuntimeReady() { events.push("runtime-ready"); },
      createTransport() { return transport; },
      openProbe: emptyDatabaseProbe,
      assertSeededConversationCount: () => undefined
    };

    const report = await runGateDPerformanceDiagnostic(
      paths.input("workload-only"),
      createGateDPerformanceDiagnosticRealDependenciesForTest(boundary)
    );

    expect(report.hardFailures).toContain("SEED_FAILURE");
    expect(activeExecutions).toBe(0);
    expect(events).toEqual([
      "runtime-ready",
      "seed-execute-reject",
      "transport-stop",
      "runtime-child-stop"
    ]);
  });

  it("exposes only the fixed input plus a test dependency seam", () => {
    expectTypeOf(runGateDPerformanceDiagnostic).parameter(0).toEqualTypeOf<{
      runId: string;
      variant: "full-oracle" | "incremental-oracle" | "workload-only";
      javaUrl: string;
      mcpConfigPath: string;
      sqlitePath: string;
      outputPath: string;
      serviceToken: string;
    }>();
    expect(runGateDPerformanceDiagnostic).toHaveLength(1);
  });
});

interface DiagnosticPaths {
  sqlitePath: string;
  outputPath: string;
  mcpConfigPath: string;
  input(variant: "full-oracle" | "incremental-oracle" | "workload-only"): {
    runId: string;
    variant: "full-oracle" | "incremental-oracle" | "workload-only";
    javaUrl: string;
    mcpConfigPath: string;
    sqlitePath: string;
    outputPath: string;
    serviceToken: string;
  };
}

function diagnosticPaths(name: string): DiagnosticPaths {
  const directory = mkdtempSync(join(tmpdir(), `openharness-gate-d-runner-${name}-`));
  temporaryDirectories.push(directory);
  const sqlitePath = join(directory, "runtime.sqlite");
  const outputPath = join(directory, "diagnostic.json");
  const mcpConfigPath = join(directory, "mcp.json");
  return {
    sqlitePath,
    outputPath,
    mcpConfigPath,
    input(variant) {
      return {
        runId: `gate-r1-${name}`,
        variant,
        javaUrl: "http://127.0.0.1:8080",
        mcpConfigPath,
        sqlitePath,
        outputPath,
        serviceToken: "test-service-token"
      };
    }
  };
}

function diagnosticDependencies(
  overrides: Partial<GateDPerformanceDiagnosticDependencies> = {}
): GateDPerformanceDiagnosticDependencies {
  let monotonicMs = 0;
  return {
    delay: async milliseconds => { monotonicMs += milliseconds; },
    monotonicClock: () => monotonicMs,
    clock: () => new Date("2026-07-16T00:00:30.000Z"),
    startRuntime: async () => undefined,
    stopRuntime: async () => undefined,
    seed: async () => undefined,
    startWorkload: async () => undefined,
    stopWorkload: async () => undefined,
    drainMetrics: validMetrics,
    openProbe: emptyDatabaseProbe,
    closeProbe: probe => probe.close(),
    readOracle: (cursor: GateDDatabaseObservationCursor, probe: GateDReadOnlyDatabaseProbe) => cursor.read(probe),
    readAggregateSnapshot: validAggregateSnapshot,
    readDatabaseBytes: () => 4_096,
    ...overrides
  };
}

function validMetrics(): GateDWorkloadMetrics {
  return {
    admissionLatenciesMs: [4, 2, 3],
    durableReplayLatenciesMs: [8, 6, 7],
    hardFailures: [],
    eventObservations: []
  };
}

function validAggregateSnapshot(): GateDPerformanceDiagnosticAggregateSnapshot {
  return {
    conversations: 10_000,
    messages: 12_000,
    executions: 10_001,
    approvals: 500,
    runtimeEvents: 20_000,
    pendingEvents: 2
  };
}

function emptyDatabaseProbe(path: string): GateDReadOnlyDatabaseProbe {
  return {
    path,
    run: () => ({ changes: 0 }),
    get: () => ({ count: 0 }) as never,
    all: () => [],
    close: () => undefined
  };
}

function timingDatabaseProbe(options: {
  onAll?: (sql: string) => void;
  onGet?: (sql: string) => void;
}): GateDReadOnlyDatabaseProbe {
  return {
    path: "/tmp/timing-runtime.sqlite",
    run: () => ({ changes: 0 }),
    get<T>(sql: string) {
      options.onGet?.(sql);
      return { count: 0 } as T;
    },
    all<T>(sql: string) {
      options.onAll?.(sql);
      return [] as T[];
    },
    close: () => undefined
  };
}

function incrementingClock(): () => number {
  let value = 0;
  return () => value++;
}

function seedOfflineDatabase(databasePath: string, withRows = true): void {
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE conversations(
      tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      PRIMARY KEY(tenant_id,user_id,conversation_id)
    );
    CREATE TABLE messages(
      tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
      seq INTEGER NOT NULL,role TEXT NOT NULL,content_json TEXT NOT NULL,created_at INTEGER NOT NULL
    );
    CREATE TABLE executions(
      execution_id TEXT NOT NULL,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
      status TEXT NOT NULL,stop_reason TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    );
    CREATE TABLE approvals(
      approval_id TEXT NOT NULL,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
      execution_id TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    );
    CREATE TABLE runtime_events(
      tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
      event_id TEXT NOT NULL,execution_id TEXT NOT NULL,cursor INTEGER NOT NULL,kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,created_at INTEGER NOT NULL,delivery_status TEXT NOT NULL,
      delivery_attempts INTEGER NOT NULL,next_attempt_at INTEGER,dead_letter_at INTEGER
    );
  `);
  if (withRows) database.exec(`
    INSERT INTO conversations VALUES
      ('temporary-tenant','temporary-user','session-alpha',1,1),
      ('temporary-tenant','temporary-user','session-beta',1,1);
    INSERT INTO messages VALUES
      ('temporary-tenant','temporary-user','session-alpha',1,'user','{"content":"sensitive message"}',1),
      ('temporary-tenant','temporary-user','session-alpha',2,'assistant','{"content":"OPENHARNESS_SECRET_CANARY"}',2),
      ('temporary-tenant','temporary-user','session-beta',1,'user','{"content":"ordinary"}',1);
    INSERT INTO executions VALUES
      ('execution-alpha','temporary-tenant','temporary-user','session-alpha','running',NULL,1,2);
    INSERT INTO approvals VALUES
      ('approval-alpha','temporary-tenant','temporary-user','session-alpha','execution-alpha','pending',
       '{"argumentsRaw":"approval-secret"}',1,1);
    INSERT INTO runtime_events VALUES
      ('temporary-tenant','temporary-user','session-alpha','event-alpha-1','execution-alpha',1,'stream_delta',
       '{"delta":"OPENHARNESS_SECRET_CANARY"}',1,'delivered',1,NULL,NULL),
      ('temporary-tenant','temporary-user','session-alpha','event-alpha-2','execution-alpha',2,'stream_end',
       '{}',2,'delivered',1,NULL,NULL),
      ('temporary-tenant','temporary-user','session-beta','event-beta-1','execution-beta',1,'stream_end',
       '{}',1,'pending',0,3,NULL);
  `);
  database.close();
}

describe("Gate D fail-closed local diagnostic CLI", () => {
  it("profiles an existing in-root SQLite file to a stable 0600 no-overwrite JSON artifact", async () => {
    const fixture = cliFixture();
    const dependencies = captureCliDependencies();
    const args = cliArgs(fixture, "profile");

    expect(await runGateDPerformanceDiagnosticCli(args, dependencies)).toBe(0);

    const outputPath = fixture.output("profile.json");
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      track: "local",
      evidenceKind: "gate-d-offline-database-profile"
    });
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    const original = readFileSync(outputPath, "utf8");
    expect(await runGateDPerformanceDiagnosticCli(args, dependencies)).toBe(2);
    expect(readFileSync(outputPath, "utf8")).toBe(original);
  });

  it.each([
    ["unknown", ["--unknown", "value"]],
    ["credential", ["--service-token", "not-a-real-secret"]],
    ["duration", ["--duration-ms", "1"]],
    ["sample", ["--sample-interval-ms", "1"]],
    ["workload", ["--concurrency", "1"]],
    ["threshold", ["--admission-threshold-ms", "1"]],
    ["track", ["--track", "production"]],
    ["restart", ["--restart-schedule-ms", "1"]],
    ["overwrite", ["--overwrite", "true"]]
  ])("rejects %s flags without reflecting their values", async (_name, extra) => {
    const fixture = cliFixture();
    const dependencies = captureCliDependencies();
    const args = [...cliArgs(fixture, "profile"), ...extra];

    expect(await runGateDPerformanceDiagnosticCli(args, dependencies)).toBe(2);
    expect(dependencies.output).toEqual([]);
    expect(dependencies.errors.join(" ")).not.toContain(String(extra[1]));
  });

  it("rejects duplicate and missing flags and unsupported commands", async () => {
    const fixture = cliFixture();
    const dependencies = captureCliDependencies();
    const profile = cliArgs(fixture, "profile");

    expect(await runGateDPerformanceDiagnosticCli([
      ...profile,
      "--output",
      fixture.output("other.json")
    ], dependencies)).toBe(2);
    expect(await runGateDPerformanceDiagnosticCli(profile.slice(0, -2), dependencies)).toBe(2);
    expect(await runGateDPerformanceDiagnosticCli(["publish", "--project-root", fixture.root], dependencies)).toBe(2);
  });

  it("rejects relative, escaping, symlink-escaping and existing paths", async () => {
    const fixture = cliFixture();
    const dependencies = captureCliDependencies();
    const outside = mkdtempSync(join(tmpdir(), "openharness-gate-d-outside-"));
    temporaryDirectories.push(outside);
    const outsideInput = join(outside, "outside.sqlite");
    writeFileSync(outsideInput, "outside", { mode: 0o600 });
    const inputLink = join(fixture.workspace, "inputs", "outside-link.sqlite");
    symlinkSync(outsideInput, inputLink);
    const outputLink = join(fixture.workspace, "escaped-output");
    symlinkSync(outside, outputLink);

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--project-root": "relative-root"
    }), dependencies)).toBe(2);
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--input-sqlite": "relative.sqlite"
    }), dependencies)).toBe(2);
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--input-sqlite": outsideInput
    }), dependencies)).toBe(2);
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--input-sqlite": inputLink
    }), dependencies)).toBe(2);
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--output": join(outputLink, "profile.json")
    }), dependencies)).toBe(2);
    const existing = fixture.output("existing.json");
    writeFileSync(existing, "original", { mode: 0o600 });
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--output": existing
    }), dependencies)).toBe(2);
    expect(readFileSync(existing, "utf8")).toBe("original");
  });

  it("canonicalizes a symlinked project root while retaining containment", async () => {
    const fixture = cliFixture();
    const rootLink = temporaryPath("canonical-root-link");
    symlinkSync(fixture.root, rootLink);
    const dependencies = captureCliDependencies();

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--project-root": rootLink
    }), dependencies)).toBe(0);
  });

  it("rejects a nested artifact packet as project root", async () => {
    const fixture = packetRootCliFixture();

    expect(await runGateDPerformanceDiagnosticCli(
      cliArgs(fixture, "profile"),
      captureCliDependencies()
    )).toBe(2);
  });

  it("rejects a symlink whose canonical target is a nested artifact packet root", async () => {
    const fixture = packetRootCliFixture();
    const rootLink = temporaryPath("packet-root-link");
    symlinkSync(fixture.root, rootLink);

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile", {
      "--project-root": rootLink
    }), captureCliDependencies())).toBe(2);
  });

  it("validates every run argument, path and MCP config before reading the token", async () => {
    const fixture = cliFixture();
    writeFileSync(fixture.mcpConfig, "not-json", { mode: 0o600 });
    let reads = 0;
    const env = {} as NodeJS.ProcessEnv;
    Object.defineProperty(env, "OPENHARNESS_SERVICE_TOKEN", {
      enumerable: true,
      get() {
        reads += 1;
        return "service-secret";
      }
    });
    const dependencies = captureCliDependencies({
      env,
      runDiagnostic: vi.fn(async () => validReport())
    });

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run"), dependencies)).toBe(2);
    expect(reads).toBe(0);
    expect(dependencies.runDiagnostic).not.toHaveBeenCalled();

    writeFileSync(fixture.mcpConfig, JSON.stringify({ mcpServers: {} }), { mode: 0o600 });
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run", {
      "--java-url": "https://example.com"
    }), dependencies)).toBe(2);
    expect(reads).toBe(0);
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run", {
      "--variant": "production"
    }), dependencies)).toBe(2);
    expect(reads).toBe(0);
  });

  it("uses the run seam without a long run and never emits the service token", async () => {
    const fixture = cliFixture();
    const token = "service-secret-that-must-not-leak";
    const runDiagnostic = vi.fn(async (
      input: Parameters<NonNullable<GateDPerformanceDiagnosticCliDependencies["runDiagnostic"]>>[0]
    ) => analysisReport(input.variant, input.runId, basename(input.sqlitePath), {
      admissionStart: 20,
      replayStart: 20
    }));
    const dependencies = captureCliDependencies({
      env: { OPENHARNESS_SERVICE_TOKEN: token },
      runDiagnostic
    });

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run"), dependencies)).toBe(0);
    expect(runDiagnostic).toHaveBeenCalledTimes(1);
    expect(runDiagnostic.mock.calls[0]?.[0]).toMatchObject({
      runId: "diagnostic-full-run",
      variant: "full-oracle",
      javaUrl: "http://127.0.0.1:8080",
      serviceToken: token
    });
    expect(JSON.stringify({ output: dependencies.output, errors: dependencies.errors })).not.toContain(token);
  });

  it("runs Java and MCP qualification probes in order before the fixed runner", async () => {
    const fixture = cliFixture();
    const order: string[] = [];
    const probeJava = vi.fn(async (input: { javaUrl: string; serviceToken: string }) => {
      order.push("java");
      expect(input).toEqual({ javaUrl: "http://127.0.0.1:8080", serviceToken: "service-secret" });
    });
    const probeMcp = vi.fn(async (path: string) => {
      order.push("mcp");
      expect(path).toBe(fixture.mcpConfig);
    });
    const runDiagnostic = vi.fn(async (
      input: Parameters<NonNullable<GateDPerformanceDiagnosticCliDependencies["runDiagnostic"]>>[0]
    ) => {
      order.push("runner");
      return analysisReport(input.variant, input.runId, basename(input.sqlitePath), {
        admissionStart: 20,
        replayStart: 20
      });
    });

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run"), captureCliDependencies({
      env: { OPENHARNESS_SERVICE_TOKEN: "service-secret" },
      probeJava,
      probeMcp,
      runDiagnostic
    }))).toBe(0);
    expect(order).toEqual(["java", "mcp", "runner"]);
  });

  it.each(["java", "mcp"] as const)("blocks the runner when the %s qualification probe fails", async failing => {
    const fixture = cliFixture();
    const order: string[] = [];
    const runDiagnostic = vi.fn(async () => validReport());
    const dependencies = captureCliDependencies({
      env: { OPENHARNESS_SERVICE_TOKEN: "service-secret" },
      probeJava: async () => {
        order.push("java");
        if (failing === "java") throw new Error("injected Java probe failure");
      },
      probeMcp: async () => {
        order.push("mcp");
        if (failing === "mcp") throw new Error("injected MCP probe failure");
      },
      runDiagnostic
    });

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run"), dependencies)).toBe(2);
    expect(order).toEqual(failing === "java" ? ["java"] : ["java", "mcp"]);
    expect(runDiagnostic).not.toHaveBeenCalled();
  });

  it("requires test probe seams to be supplied as a complete pair before reading the token", async () => {
    const fixture = cliFixture();
    let reads = 0;
    const env = {} as NodeJS.ProcessEnv;
    Object.defineProperty(env, "OPENHARNESS_SERVICE_TOKEN", {
      get() {
        reads += 1;
        return "service-secret";
      }
    });
    const dependencies = captureCliDependencies({
      env,
      runDiagnostic: async () => validReport()
    });
    delete dependencies.probeMcp;

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run"), dependencies)).toBe(2);
    expect(reads).toBe(0);
  });

  it.each([
    ["runId", { "--run-id": "service-token-run" }],
    ["SQLite basename", { "--sqlite-path": "service-token.sqlite" }],
    ["output basename", { "--output": "api-key-report.json" }]
  ])("rejects a sensitive %s before token, probes or runner", async (_name, overrides) => {
    const fixture = cliFixture();
    let reads = 0;
    const env = {} as NodeJS.ProcessEnv;
    Object.defineProperty(env, "OPENHARNESS_SERVICE_TOKEN", {
      get() {
        reads += 1;
        return "service-secret";
      }
    });
    const probeJava = vi.fn(async () => undefined);
    const probeMcp = vi.fn(async () => undefined);
    const runDiagnostic = vi.fn(async () => validReport());
    const absoluteOverrides = Object.fromEntries(Object.entries(overrides).map(([key, value]) => [
      key,
      key === "--run-id" ? value : fixture.output(value)
    ]));

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run", absoluteOverrides),
      captureCliDependencies({ env, probeJava, probeMcp, runDiagnostic }))).toBe(2);
    expect(reads).toBe(0);
    expect(probeJava).not.toHaveBeenCalled();
    expect(probeMcp).not.toHaveBeenCalled();
    expect(runDiagnostic).not.toHaveBeenCalled();
  });

  it("binds the real qualification probe defaults and validates sensitive bindings before env access", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/baseline/gateDPerformanceDiagnosticCli.ts"),
      "utf8"
    );
    expect(source).toMatch(/import[\s\S]*probeGateDJavaFixtures[\s\S]*probeGateDMcpFixture[\s\S]*from "\.\/formalSoakCli"/);
    expect(source).toMatch(/dependencies\.probeJava \?\? probeGateDJavaFixtures/);
    expect(source).toMatch(/dependencies\.probeMcp \?\? probeGateDMcpFixture/);
    expect(source.indexOf("SENSITIVE_STRING.test(runId)"))
      .toBeLessThan(source.indexOf("OPENHARNESS_SERVICE_TOKEN"));
  });

  it("fails closed when the run seam returns an unbound or incomplete report", async () => {
    const fixture = cliFixture();
    const dependencies = captureCliDependencies({
      env: { OPENHARNESS_SERVICE_TOKEN: "service-secret" },
      runDiagnostic: async () => validReport()
    });

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run"), dependencies)).toBe(2);
  });

  it("rejects profile accessors without invoking them", async () => {
    const fixture = cliFixture();
    const profile = profileGateDOfflineDatabase(fixture.inputSqlite, {
      generatedAt: "2026-07-17T02:00:00.000Z"
    });
    let reads = 0;
    Object.defineProperty(profile, "databaseBytes", {
      enumerable: true,
      get() {
        reads += 1;
        return 1;
      }
    });
    const dependencies = captureCliDependencies({
      profileDatabase: () => profile
    });

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile"), dependencies)).toBe(2);
    expect(reads).toBe(0);
    expect(() => statSync(fixture.output("profile.json"))).toThrow();
  });

  it("rejects existing run databases and immutable attempt 001/002 packet targets", async () => {
    const fixture = cliFixture();
    const runDiagnostic = vi.fn(async (
      input: Parameters<NonNullable<GateDPerformanceDiagnosticCliDependencies["runDiagnostic"]>>[0]
    ) => analysisReport(input.variant, input.runId, basename(input.sqlitePath), {
      admissionStart: 20,
      replayStart: 20
    }));
    const dependencies = captureCliDependencies({
      env: { OPENHARNESS_SERVICE_TOKEN: "service-secret" },
      runDiagnostic
    });
    const existing = fixture.output("existing.sqlite");
    writeFileSync(existing, "existing", { mode: 0o600 });
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run", {
      "--sqlite-path": existing
    }), dependencies)).toBe(2);

    for (const attempt of ["gate-d-20260716-001", "gate-d-20260716-002"]) {
      const directory = join(fixture.workspace, attempt);
      mkdirSync(directory);
      expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "run", {
        "--sqlite-path": join(directory, "runtime.sqlite"),
        "--output": join(directory, "report.json")
      }), dependencies)).toBe(2);
    }
    expect(runDiagnostic).not.toHaveBeenCalled();
  });

  it("does not read the service token for profile or analyze", async () => {
    const fixture = cliFixture();
    let reads = 0;
    const env = {} as NodeJS.ProcessEnv;
    Object.defineProperty(env, "OPENHARNESS_SERVICE_TOKEN", {
      get() {
        reads += 1;
        return "unused-secret";
      }
    });
    const dependencies = captureCliDependencies({ env });
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "profile"), dependencies)).toBe(0);

    writeAnalysisReports(fixture, [
      analysisReport("full-oracle", "full-run", "full.sqlite", {
        admissionStart: 20, replayStart: 20
      }),
      analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
        admissionStart: 20, replayStart: 20
      }),
      analysisReport("workload-only", "workload-run", "workload.sqlite", {
        admissionStart: 20, replayStart: 20
      })
    ]);
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze", {
      "--output": fixture.output("inconclusive.json")
    }), dependencies)).toBe(0);
    expect(reads).toBe(0);
  });
});

describe("Gate D local performance analyzer", () => {
  it.each([
    ["duplicate", (report: GateDPerformanceDiagnosticReport) => {
      report.samples[1] = { ...report.samples[1]!, sampleIndex: 0 };
    }],
    ["skipped", (report: GateDPerformanceDiagnosticReport) => {
      report.samples[1] = { ...report.samples[1]!, sampleIndex: 5 };
    }],
    ["mispositioned", (report: GateDPerformanceDiagnosticReport) => {
      report.samples[0] = { ...report.samples[0]!, sampleIndex: 1 };
      report.samples[1] = { ...report.samples[1]!, sampleIndex: 0 };
    }]
  ])("rejects %s sampleIndex evidence", async (_name, mutate) => {
    const fixture = cliFixture();
    const reports = structurallyValidAnalysisReports();
    mutate(reports[0]);

    await expectAnalyzeBlocked(fixture, reports);
  });

  it.each([
    ["descending", (report: GateDPerformanceDiagnosticReport) => {
      report.samples[1] = {
        ...report.samples[1]!,
        sampledAt: new Date(Date.parse(report.samples[0]!.sampledAt) - 1).toISOString()
      };
    }],
    ["equal", (report: GateDPerformanceDiagnosticReport) => {
      report.samples[1] = { ...report.samples[1]!, sampledAt: report.samples[0]!.sampledAt };
    }]
  ])("rejects %s sampledAt evidence", async (_name, mutate) => {
    const fixture = cliFixture();
    const reports = structurallyValidAnalysisReports();
    mutate(reports[0]);

    await expectAnalyzeBlocked(fixture, reports);
  });

  it("rejects generatedAt earlier than the final sample", async () => {
    const fixture = cliFixture();
    const reports = structurallyValidAnalysisReports();
    reports[0] = { ...reports[0], generatedAt: "2026-07-17T00:29:59.999Z" };

    await expectAnalyzeBlocked(fixture, reports);
  });

  it.each([
    ["missing probe", (timings: GateDPerformanceDiagnosticSample["probeTimings"]) => timings.slice(0, -1)],
    ["misordered probes", (timings: GateDPerformanceDiagnosticSample["probeTimings"]) => [
      timings[1]!, timings[0]!, ...timings.slice(2)
    ]],
    ["wrong probe", (timings: GateDPerformanceDiagnosticSample["probeTimings"]) => [
      { ...timings[0]!, probe: "dead-letter" as const }, ...timings.slice(1)
    ]]
  ])("rejects a full-oracle signature with %s", async (_name, mutate) => {
    const fixture = cliFixture();
    const reports = structurallyValidAnalysisReports();
    reports[0] = {
      ...reports[0],
      samples: reports[0].samples.map(sample => sampleWithProbeTimings(sample, mutate(sample.probeTimings)))
    };

    await expectAnalyzeBlocked(fixture, reports);
  });

  it.each([
    ["no probe", (_timings: GateDPerformanceDiagnosticSample["probeTimings"]) => []],
    ["an extra probe", (timings: GateDPerformanceDiagnosticSample["probeTimings"]) => [
      ...timings, { probe: "dead-letter" as const, durationMs: 1, rowCount: 0 }
    ]],
    ["the wrong probe", (_timings: GateDPerformanceDiagnosticSample["probeTimings"]) => [
      { probe: "dead-letter" as const, durationMs: 1, rowCount: 0 }
    ]]
  ])("rejects incremental-oracle with %s", async (_name, mutate) => {
    const fixture = cliFixture();
    const reports = structurallyValidAnalysisReports();
    reports[1] = {
      ...reports[1],
      samples: reports[1].samples.map(sample => sampleWithProbeTimings(sample, mutate(sample.probeTimings)))
    };

    await expectAnalyzeBlocked(fixture, reports);
  });

  it("rejects non-empty workload-only probe timings", async () => {
    const fixture = cliFixture();
    const reports = structurallyValidAnalysisReports();
    reports[2] = {
      ...reports[2],
      samples: reports[2].samples.map(sample => sampleWithProbeTimings(sample, [{
        probe: "incremental-events",
        durationMs: 1,
        rowCount: 0
      }]))
    };

    await expectAnalyzeBlocked(fixture, reports);
  });

  it("blocks the combined synthetic QA evidence instead of creating a confirmed decision", async () => {
    const fixture = cliFixture();
    const reports = structurallyValidAnalysisReports().map(report => ({
      ...report,
      samples: report.samples.map((sample, position) => sampleWithProbeTimings({
        ...sample,
        sampleIndex: 0,
        sampledAt: new Date(Date.parse("2026-07-17T00:59:59.000Z") - position * 1_000).toISOString()
      }, []))
    })) as [
      GateDPerformanceDiagnosticReport,
      GateDPerformanceDiagnosticReport,
      GateDPerformanceDiagnosticReport
    ];

    await expectAnalyzeBlocked(fixture, reports);
  });

  it("confirms oracle contention at the inclusive 20% material-reduction boundary", async () => {
    const fixture = cliFixture();
    const full = analysisReport("full-oracle", "full-run", "full.sqlite", {
      admissionStart: 154.5,
      replayStart: 20
    });
    const fullLastMedian = 154.5;
    writeAnalysisReports(fixture, [
      full,
      analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
        admissionStart: fullLastMedian * 0.8,
        replayStart: 20
      }),
      analysisReport("workload-only", "workload-run", "workload.sqlite", {
        admissionStart: fullLastMedian * 0.8,
        replayStart: 20
      })
    ]);
    const dependencies = captureCliDependencies();

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), dependencies)).toBe(0);
    const decision = JSON.parse(readFileSync(fixture.output("decision.json"), "utf8")) as GateDPerformanceDiagnosisDecision;
    expect(decision).toMatchObject({
      schemaVersion: 1,
      track: "local",
      evidenceKind: "gate-d-performance-diagnosis",
      generatedAt: "2026-07-17T02:00:00.000Z",
      result: "confirmed",
      primaryCause: "database-oracle-contention",
      nextOpenSpecDecision: "existing-change"
    });
    expect(decision.findings.find(finding => finding.hypothesis === "database-oracle-contention"))
      .toMatchObject({ status: "confirmed" });
    expect(JSON.stringify(decision)).toMatch(/20%|0\.8/);
    expect(statSync(fixture.output("decision.json")).mode & 0o777).toBe(0o600);
  });

  it("treats a value immediately above the 20% boundary as inconclusive", async () => {
    const fixture = cliFixture();
    const fullLastMedian = 154.5;
    writeAnalysisReports(fixture, [
      analysisReport("full-oracle", "full-run", "full.sqlite", {
        admissionStart: fullLastMedian, replayStart: 20
      }),
      analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
        admissionStart: fullLastMedian * 0.8 + 0.000_001, replayStart: 20
      }),
      analysisReport("workload-only", "workload-run", "workload.sqlite", {
        admissionStart: fullLastMedian * 0.8, replayStart: 20
      })
    ]);

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), captureCliDependencies())).toBe(0);
    const decision = JSON.parse(readFileSync(fixture.output("decision.json"), "utf8")) as GateDPerformanceDiagnosisDecision;
    expect(decision.result).toBe("inconclusive");
    expect(decision.primaryCause).not.toBe("database-oracle-contention");
    expect(decision.nextOpenSpecDecision).toBe("human-decision-required");
  });

  it("fails closed for replay growth and outbox backlog without profile or static-wiring proof", async () => {
    const fixture = cliFixture();
    writeAnalysisReports(fixture, [
      analysisReport("full-oracle", "full-run", "full.sqlite", {
        admissionStart: 20, replayStart: 20
      }),
      analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
        admissionStart: 20, replayStart: 20
      }),
      analysisReport("workload-only", "workload-run", "workload.sqlite", {
        admissionStart: 20, replayStart: 50, replayStep: 1, pendingStart: 5, pendingStep: 1
      })
    ]);

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), captureCliDependencies())).toBe(0);
    const decision = JSON.parse(readFileSync(fixture.output("decision.json"), "utf8")) as GateDPerformanceDiagnosisDecision;
    expect(decision.result).toBe("inconclusive");
    expect(decision.primaryCause).toBe("combined");
    const replay = decision.findings.find(finding => finding.hypothesis === "session-replay-growth")!;
    const outbox = decision.findings.find(finding => finding.hypothesis === "outbox-backlog")!;
    expect(replay.status).toBe("contributing");
    expect(outbox.status).toBe("contributing");
    expect(replay.evidence.join(" ")).toMatch(/immutable-profile/i);
    expect(outbox.evidence.join(" ")).toMatch(/static-wiring/i);
  });

  it.each([
    ["insufficient samples", (reports: GateDPerformanceDiagnosticReport[]) => {
      reports[0] = { ...reports[0]!, samples: reports[0]!.samples.slice(0, 59) };
    }],
    ["excess samples", (reports: GateDPerformanceDiagnosticReport[]) => {
      const last = reports[0]!.samples.at(-1)!;
      reports[0] = {
        ...reports[0]!,
        samples: [...reports[0]!.samples, {
          ...last,
          sampleIndex: 60,
          sampledAt: "2026-07-17T00:30:30.000Z"
        }]
      };
    }],
    ["fingerprint mismatch", (reports: GateDPerformanceDiagnosticReport[]) => {
      reports[1] = { ...reports[1]!, environment: { ...reports[1]!.environment, nodeVersion: "v0.0.0" } };
    }],
    ["variant mismatch", (reports: GateDPerformanceDiagnosticReport[]) => {
      reports[1] = { ...reports[1]!, variant: "full-oracle" };
    }],
    ["duplicate runId", (reports: GateDPerformanceDiagnosticReport[]) => {
      reports[1] = { ...reports[1]!, runId: reports[0]!.runId };
    }],
    ["duplicate database basename", (reports: GateDPerformanceDiagnosticReport[]) => {
      reports[1] = {
        ...reports[1]!,
        environment: { ...reports[1]!.environment, databaseBasename: reports[0]!.environment.databaseBasename }
      };
    }]
  ])("rejects %s", async (_name, mutate) => {
    const fixture = cliFixture();
    const reports = [
      analysisReport("full-oracle", "full-run", "full.sqlite", { admissionStart: 20, replayStart: 20 }),
      analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
        admissionStart: 20, replayStart: 20
      }),
      analysisReport("workload-only", "workload-run", "workload.sqlite", {
        admissionStart: 20, replayStart: 20
      })
    ];
    mutate(reports);
    writeAnalysisReports(fixture, reports);

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), captureCliDependencies())).toBe(2);
    expect(() => statSync(fixture.output("decision.json"))).toThrow();
  });

  it("preserves existing outputs and concurrent late replacements", async () => {
    const fixture = cliFixture();
    writeAnalysisReports(fixture, [
      analysisReport("full-oracle", "full-run", "full.sqlite", { admissionStart: 20, replayStart: 20 }),
      analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
        admissionStart: 20, replayStart: 20
      }),
      analysisReport("workload-only", "workload-run", "workload.sqlite", {
        admissionStart: 20, replayStart: 20
      })
    ]);
    const output = fixture.output("decision.json");
    writeFileSync(output, "original", { mode: 0o600 });
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), captureCliDependencies())).toBe(2);
    expect(readFileSync(output, "utf8")).toBe("original");

    rmSync(output);
    const displaced = `${output}.displaced`;
    let swapped = false;
    fileSystemMock.fsyncSync = (descriptor, delegate) => {
      delegate(descriptor);
      if (swapped) return;
      swapped = true;
      renameSync(output, displaced);
      writeFileSync(output, "replacement", { mode: 0o600 });
    };
    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), captureCliDependencies())).toBe(2);
    expect(readFileSync(output, "utf8")).toBe("replacement");
    expect(JSON.parse(readFileSync(displaced, "utf8"))).toMatchObject({
      evidenceKind: "gate-d-performance-diagnosis"
    });
  });

  it("blocks secret-canary input without echoing it or creating output", async () => {
    const fixture = cliFixture();
    const reports = [
      analysisReport("full-oracle", "full-run", "full.sqlite", { admissionStart: 20, replayStart: 20 }),
      analysisReport("incremental-oracle", "incremental-run", "incremental.sqlite", {
        admissionStart: 20, replayStart: 20
      }),
      analysisReport("workload-only", "workload-run", "workload.sqlite", {
        admissionStart: 20, replayStart: 20
      })
    ];
    reports[0] = { ...reports[0]!, runId: "OPENHARNESS_SECRET_CANARY" };
    writeAnalysisReports(fixture, reports);
    const dependencies = captureCliDependencies();

    expect(await runGateDPerformanceDiagnosticCli(cliArgs(fixture, "analyze"), dependencies)).toBe(2);
    expect(JSON.stringify({ output: dependencies.output, errors: dependencies.errors }))
      .not.toContain("OPENHARNESS_SECRET_CANARY");
    expect(() => statSync(fixture.output("decision.json"))).toThrow();
  });
});

describe("Gate D diagnostic package script", () => {
  it("adds only the local diagnostic script without changing formal Gate D scripts", () => {
    const packageJson = JSON.parse(readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../package.json"),
      "utf8"
    )) as { scripts: Record<string, string> };

    expect(packageJson.scripts["diagnostic:gate-d-performance"])
      .toBe("tsx src/baseline/gateDPerformanceDiagnosticCli.ts");
    expect(packageJson.scripts["qualification:gate-d-preflight"])
      .toBe("tsx src/baseline/formalSoakCli.ts preflight");
    expect(packageJson.scripts["qualification:gate-d-run"])
      .toBe("tsx src/baseline/formalSoakCli.ts run");
  });
});
