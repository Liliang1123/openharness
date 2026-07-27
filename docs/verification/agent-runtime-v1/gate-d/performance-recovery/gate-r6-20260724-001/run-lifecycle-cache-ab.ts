import { createHash } from "node:crypto";
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDeterministicBaselineWorkload } from "../../../../../../agent-runtime/src/baseline/localBaseline.ts";
import { RuntimeLifecycleCommands } from "../../../../../../agent-runtime/src/storage/lifecycleCommands.ts";
import {
  migrateRuntimeDatabase,
  openRuntimeDatabase,
  type RuntimeDatabase
} from "../../../../../../agent-runtime/src/storage/runtimeStorage.ts";
import { createSqliteRuntimeRepositories } from "../../../../../../agent-runtime/src/storage/sqliteRuntimeRepositories.ts";

const SCOPE_COUNT = 4_000;
const ROUNDS = 2;
const ITERATIONS = SCOPE_COUNT * ROUNDS;
const ACK_INTERVAL = 100;
const CANDIDATE_CACHE_KIB = 65_536;
const CANDIDATE_MMAP_BYTES = 268_435_456;
const MINIMUM_DATABASE_BYTES = 3_500_000_000;
const HASH = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLONE_PARENT = /^\/private\/tmp\/openharness-gate-r6\.[A-Za-z0-9]+$/;
const SOURCE_FILES = [
  "agent-runtime/src/storage/runtimeStorage.ts",
  "agent-runtime/src/storage/lifecycleCommands.ts",
  "agent-runtime/src/storage/sqliteRuntimeRepositories.ts",
  "agent-runtime/src/storage/sqliteHistoryStore.ts",
  "agent-runtime/src/storage/sqliteRuntimeEventStore.ts",
  "agent-runtime/src/storage/sqliteExecutionStore.ts"
] as const;
const EVENT_KINDS = [
  "trace",
  "trace",
  "model_call_start",
  "trace",
  "trace",
  "model_call_end",
  "trace",
  "trace"
] as const;

type Variant = "control" | "candidate";

interface CliInput {
  projectRoot: string;
  runId: string;
  variant: Variant;
  sqlitePath: string;
  expectedDatabaseSha256: string;
  planPath: string;
}

interface DatabaseCounters {
  messages: number;
  executions: number;
  runtimeEvents: number;
  pendingTraceEvents: number;
  deliveredTraceEvents: number;
}

interface PragmaSnapshot {
  journalMode: string;
  foreignKeys: number;
  walAutocheckpoint: number;
  synchronous: number;
  cacheSize: number;
  mmapSize: number;
  pageSize: number;
}

function parseCli(argv: string[]): CliInput {
  if (argv.length % 2 !== 0) throw new Error("invalid_argument_shape");
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]!;
    const value = argv[index + 1]!;
    if (!name.startsWith("--") || flags.has(name) || !value) throw new Error("invalid_argument");
    flags.set(name, value);
  }
  const required = [
    "--project-root",
    "--run-id",
    "--variant",
    "--sqlite-path",
    "--expected-database-sha256",
    "--plan"
  ] as const;
  if (flags.size !== required.length || required.some(flag => !flags.has(flag))) {
    throw new Error("invalid_argument_set");
  }
  const projectRoot = realpathSync(flags.get("--project-root")!);
  const runId = flags.get("--run-id")!;
  if (!RUN_ID.test(runId)) throw new Error("invalid_run_id");
  const variant = flags.get("--variant");
  if (variant !== "control" && variant !== "candidate") throw new Error("invalid_variant");
  const sqlitePath = canonicalClone(flags.get("--sqlite-path")!);
  const expectedDatabaseSha256 = flags.get("--expected-database-sha256")!;
  if (!HASH.test(expectedDatabaseSha256)) throw new Error("invalid_expected_database_hash");
  const planPath = canonicalProjectFile(projectRoot, flags.get("--plan")!);
  return {
    projectRoot,
    runId,
    variant,
    sqlitePath,
    expectedDatabaseSha256,
    planPath
  };
}

function run(input: CliInput): Record<string, unknown> {
  const databaseStartBytes = statSync(input.sqlitePath).size;
  if (databaseStartBytes < MINIMUM_DATABASE_BYTES) throw new Error("database_not_mature");
  const databaseStartSha256 = hashLargeFile(input.sqlitePath);
  if (databaseStartSha256 !== input.expectedDatabaseSha256) {
    throw new Error("database_clone_hash_mismatch");
  }

  const runnerSha256 = hashFile(realpathSync(fileURLToPath(import.meta.url)));
  const planSha256 = hashFile(input.planPath);
  const sourceStateSha256 = hashSourceState(input.projectRoot);
  let database: RuntimeDatabase | undefined;
  try {
    database = openRuntimeDatabase(input.sqlitePath);
    migrateRuntimeDatabase(database);
    const controlPragmas = readPragmas(database);
    if (input.variant === "candidate") {
      database.run(`PRAGMA cache_size = -${CANDIDATE_CACHE_KIB}`);
      database.run(`PRAGMA mmap_size = ${CANDIDATE_MMAP_BYTES}`);
    }
    const observedPragmas = readPragmas(database);
    assertPragmas(input.variant, controlPragmas, observedPragmas);

    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(database, repositories);
    const operations = buildDeterministicBaselineWorkload({
      seededConversations: 10_000,
      concurrency: 20
    }).operations.slice(0, SCOPE_COUNT);
    const initialCounters = readCounters(database);
    const latenciesMs: number[] = [];
    const blocks: Array<Record<string, number>> = [];
    const rssStartBytes = process.memoryUsage().rss;
    let rssMaxBytes = rssStartBytes;
    const startedAt = performance.now();

    for (let index = 0; index < ITERATIONS; index += 1) {
      const operation = operations[index % SCOPE_COUNT]!;
      const executionId = `${input.runId}-execution-${String(index + 1).padStart(5, "0")}`;
      const scope = {
        tenantId: operation.tenantId,
        userId: operation.userId,
        conversationId: operation.conversationId,
        executionId,
        traceId: `${input.runId}-trace-${index + 1}`,
        requestId: `${input.runId}-request-${index + 1}`
      };
      const operationStartedAt = performance.now();
      lifecycle.startExecution({
        ...scope,
        message: `Gate R6 cache diagnostic ${index + 1}`
      });
      EVENT_KINDS.forEach((kind, eventIndex) => {
        lifecycle.recordEvent({
          ...scope,
          kind,
          data: { diagnostic: true, eventIndex }
        });
      });
      lifecycle.completeExecution({
        ...scope,
        assistantMessage: {
          role: "assistant",
          content: `Gate R6 cache diagnostic answer ${index + 1}`
        },
        stopReason: "FINAL_ANSWER"
      });
      if ((index + 1) % ACK_INTERVAL === 0) acknowledgePendingTraceEvents(database);
      latenciesMs.push(performance.now() - operationStartedAt);
      if ((index + 1) % 100 === 0) {
        rssMaxBytes = Math.max(rssMaxBytes, process.memoryUsage().rss);
      }
      if ((index + 1) % 1_000 === 0) {
        const block = latenciesMs.slice(index - 999, index + 1);
        blocks.push({
          startIteration: index - 998,
          endIteration: index + 1,
          p50Ms: percentile(block, 0.50),
          p95Ms: percentile(block, 0.95)
        });
      }
    }
    acknowledgePendingTraceEvents(database);
    const durationMs = performance.now() - startedAt;
    const integrity = pragmaValue(database, "integrity_check");
    if (integrity !== "ok") throw new Error("sqlite_integrity_failure");
    const finalCounters = readCounters(database);
    assertCounterDelta(initialCounters, finalCounters);
    const rssEndBytes = process.memoryUsage().rss;
    rssMaxBytes = Math.max(rssMaxBytes, rssEndBytes);
    const databaseEndBytes = statSync(input.sqlitePath).size;
    const walBytes = statSyncIfPresent(`${input.sqlitePath}-wal`);
    const firstHalf = latenciesMs.slice(0, ITERATIONS / 2);
    const lastHalf = latenciesMs.slice(ITERATIONS / 2);
    const quartile = ITERATIONS / 4;

    return {
      runId: input.runId,
      variant: input.variant,
      result: "pass",
      generatedAt: new Date().toISOString(),
      databaseBasename: basename(input.sqlitePath),
      databaseStartSha256,
      databaseStartBytes,
      databaseEndBytes,
      databaseGrowthBytes: databaseEndBytes - databaseStartBytes,
      walBytes,
      runnerSha256,
      planSha256,
      sourceStateSha256,
      scopeCount: SCOPE_COUNT,
      rounds: ROUNDS,
      iterations: ITERATIONS,
      eventsPerExecution: 12,
      messagesPerExecution: 2,
      traceAckIntervalExecutions: ACK_INTERVAL,
      durationMs,
      throughputPerSecond: ITERATIONS / (durationMs / 1_000),
      latencyMs: {
        overall: summarize(latenciesMs),
        firstHalf: summarize(firstHalf),
        lastHalf: summarize(lastHalf),
        firstQuartile: summarize(latenciesMs.slice(0, quartile)),
        lastQuartile: summarize(latenciesMs.slice(-quartile)),
        blocks
      },
      rssBytes: {
        start: rssStartBytes,
        max: rssMaxBytes,
        end: rssEndBytes
      },
      pragmas: {
        beforeCandidate: controlPragmas,
        observed: observedPragmas
      },
      counters: {
        initial: initialCounters,
        final: finalCounters,
        delta: counterDelta(initialCounters, finalCounters)
      },
      integrity
    };
  } finally {
    database?.close();
  }
}

function acknowledgePendingTraceEvents(database: RuntimeDatabase): void {
  database.transaction(tx => {
    tx.run(
      `UPDATE runtime_events
       SET delivery_status = 'delivered',
           delivered_at = ?,
           next_attempt_at = NULL
       WHERE kind = 'trace' AND delivery_status = 'pending'`,
      [Date.now()]
    );
  });
}

function readCounters(database: RuntimeDatabase): DatabaseCounters {
  const row = database.get<DatabaseCounters>(`
    SELECT
      (SELECT COUNT(*) FROM messages) AS messages,
      (SELECT COUNT(*) FROM executions) AS executions,
      (SELECT COUNT(*) FROM runtime_events) AS runtimeEvents,
      (SELECT COUNT(*) FROM runtime_events INDEXED BY runtime_event_trace_outbox
        WHERE kind = 'trace' AND delivery_status IN ('pending','retry')
          AND delivery_status = 'pending') AS pendingTraceEvents,
      (SELECT COUNT(*) FROM runtime_events
        WHERE kind = 'trace' AND delivery_status = 'delivered') AS deliveredTraceEvents
  `);
  if (!row) throw new Error("database_counter_missing");
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, nonNegativeInteger(value)])
  ) as unknown as DatabaseCounters;
}

function assertCounterDelta(initial: DatabaseCounters, final: DatabaseCounters): void {
  const delta = counterDelta(initial, final);
  if (
    delta.messages !== ITERATIONS * 2
    || delta.executions !== ITERATIONS
    || delta.runtimeEvents !== ITERATIONS * 12
    || final.pendingTraceEvents !== 0
  ) {
    throw new Error("database_counter_delta_mismatch");
  }
}

function counterDelta(
  initial: DatabaseCounters,
  final: DatabaseCounters
): DatabaseCounters {
  return {
    messages: final.messages - initial.messages,
    executions: final.executions - initial.executions,
    runtimeEvents: final.runtimeEvents - initial.runtimeEvents,
    pendingTraceEvents: final.pendingTraceEvents - initial.pendingTraceEvents,
    deliveredTraceEvents: final.deliveredTraceEvents - initial.deliveredTraceEvents
  };
}

function readPragmas(database: RuntimeDatabase): PragmaSnapshot {
  return {
    journalMode: String(pragmaValue(database, "journal_mode")),
    foreignKeys: Number(pragmaValue(database, "foreign_keys")),
    walAutocheckpoint: Number(pragmaValue(database, "wal_autocheckpoint")),
    synchronous: Number(pragmaValue(database, "synchronous")),
    cacheSize: Number(pragmaValue(database, "cache_size")),
    mmapSize: Number(pragmaValue(database, "mmap_size")),
    pageSize: Number(pragmaValue(database, "page_size"))
  };
}

function assertPragmas(
  variant: Variant,
  before: PragmaSnapshot,
  observed: PragmaSnapshot
): void {
  if (
    observed.journalMode.toLowerCase() !== "wal"
    || observed.foreignKeys !== 1
    || observed.walAutocheckpoint !== 1_000
    || observed.synchronous !== before.synchronous
    || observed.pageSize !== before.pageSize
  ) {
    throw new Error("durability_pragma_drift");
  }
  if (variant === "control") {
    if (observed.cacheSize !== before.cacheSize || observed.mmapSize !== before.mmapSize) {
      throw new Error("control_pragma_drift");
    }
    return;
  }
  if (
    observed.cacheSize !== -CANDIDATE_CACHE_KIB
    || observed.mmapSize !== CANDIDATE_MMAP_BYTES
  ) {
    throw new Error("candidate_pragma_mismatch");
  }
}

function pragmaValue(database: RuntimeDatabase, name: string): unknown {
  if (!/^[a-z_]+$/.test(name)) throw new Error("invalid_pragma_name");
  const row = database.get<Record<string, unknown>>(`PRAGMA ${name}`);
  return row ? Object.values(row)[0] : undefined;
}

function summarize(values: number[]): {
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
} {
  return {
    p50Ms: percentile(values, 0.50),
    p95Ms: percentile(values, 0.95),
    minMs: Math.min(...values),
    maxMs: Math.max(...values)
  };
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(sorted.length * quantile) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
}

function hashSourceState(projectRoot: string): string {
  const hash = createHash("sha256");
  for (const relativePath of SOURCE_FILES) {
    const absolutePath = join(projectRoot, relativePath);
    if (!lstatSync(absolutePath).isFile()) throw new Error("source_binding_not_file");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashLargeFile(path: string): string {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(8 * 1_048_576);
  const hash = createHash("sha256");
  try {
    while (true) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } finally {
    closeSync(descriptor);
  }
}

function canonicalClone(value: string): string {
  if (!isAbsolute(value)) throw new Error("sqlite_path_not_absolute");
  const canonical = realpathSync(value);
  if (!statSync(canonical).isFile()) throw new Error("sqlite_path_not_file");
  if (!CLONE_PARENT.test(dirname(canonical))) throw new Error("sqlite_path_not_gate_r6_clone");
  return canonical;
}

function canonicalProjectFile(projectRoot: string, value: string): string {
  if (!isAbsolute(value)) throw new Error("project_file_not_absolute");
  const canonical = realpathSync(value);
  const relativePath = relative(projectRoot, canonical);
  if (
    relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
    || !statSync(canonical).isFile()
  ) {
    throw new Error("project_file_outside_root");
  }
  return canonical;
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("invalid_database_counter");
  return number;
}

function statSyncIfPresent(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function main(): void {
  const input = parseCli(process.argv.slice(2));
  const report = run(input);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      result: "blocked",
      errorClass: error instanceof Error ? error.name : "UnknownError"
    })}\n`);
    process.exitCode = 2;
  }
}
