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
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { buildDeterministicBaselineWorkload } from "../../../../../../agent-runtime/src/baseline/localBaseline.ts";
import { RuntimeLifecycleCommands } from "../../../../../../agent-runtime/src/storage/lifecycleCommands.ts";
import {
  migrateRuntimeDatabase,
  openRuntimeDatabase,
  type RuntimeDatabase,
  type RuntimeTransaction
} from "../../../../../../agent-runtime/src/storage/runtimeStorage.ts";
import { createSqliteRuntimeRepositories } from "../../../../../../agent-runtime/src/storage/sqliteRuntimeRepositories.ts";
import type { RuntimeEventKind } from "../../../../../../agent-runtime/src/types.ts";

const SCOPE_COUNT = 4_000;
const ROUNDS = 2;
const ITERATIONS = SCOPE_COUNT * ROUNDS;
const ACK_INTERVAL = 100;
const TRANSACTIONS_PER_EXECUTION = 10;
const CHECKPOINT_POLL_INTERVAL_MS = 25;
const CHECKPOINT_THRESHOLD_FRAMES = 1_000;
const MAXIMUM_WAL_BYTES = 64 * 1_048_576;
const MINIMUM_DATABASE_BYTES = 3_500_000_000;
const HASH = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ERROR_CODE = /^[a-z0-9_]+$/;
const CLONE_PARENT = /^\/private\/tmp\/openharness-gate-r8\.[A-Za-z0-9]+$/;
const SOURCE_FILES = [
  "agent-runtime/src/storage/runtimeStorage.ts",
  "agent-runtime/src/storage/lifecycleCommands.ts",
  "agent-runtime/src/storage/sqliteRuntimeRepositories.ts",
  "agent-runtime/src/storage/sqliteHistoryStore.ts",
  "agent-runtime/src/storage/sqliteRuntimeEventStore.ts",
  "agent-runtime/src/storage/sqliteExecutionStore.ts",
  "agent-runtime/src/agentExecutionRunner.ts"
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
] as const satisfies readonly RuntimeEventKind[];
const EXPECTED_EVENT_KINDS = [
  "agent_start",
  ...EVENT_KINDS,
  "final_answer",
  "agent_end",
  "stream_done"
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

interface TransactionMetrics {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

interface CheckpointRow {
  busy: number;
  logFrames: number;
  checkpointedFrames: number;
  backlogFrames: number;
}

interface CheckpointWorkerReady {
  kind: "ready";
  journalMode: string;
  synchronous: number;
  walAutocheckpoint: number;
  pollIntervalMs: number;
  thresholdFrames: number;
  maximumWalBytes: number;
}

interface CheckpointWorkerSummary {
  kind: "summary";
  result: "pass";
  runtime: {
    noopPolls: number;
    passiveAttempts: number;
    passiveBusy: number;
    passiveTotalDurationMs: number;
    passiveMaxDurationMs: number;
    maximumLogFrames: number;
    maximumCheckpointedFrames: number;
    maximumBacklogFrames: number;
    maximumWalBytes: number;
    finalRuntimeCheckpoint: CheckpointRow & { durationMs: number; walBytes: number };
  };
  shutdown: CheckpointRow & {
    durationMs: number;
    finalWalBytes: number;
  };
}

interface CheckpointWorkerFailure {
  kind: "failure";
  result: "blocked";
  errorClass: string;
  errorCode: string;
}

interface CheckpointWorkerHandle {
  worker: Worker;
  stop: Int32Array;
  ready: CheckpointWorkerReady;
  completion: Promise<CheckpointWorkerSummary>;
  exit: Promise<number>;
  stopRequested: boolean;
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

async function run(input: CliInput): Promise<Record<string, unknown>> {
  const databaseStartBytes = statSync(input.sqlitePath).size;
  if (databaseStartBytes < MINIMUM_DATABASE_BYTES) throw new Error("database_not_mature");
  const databaseStartSha256 = hashLargeFile(input.sqlitePath);
  if (databaseStartSha256 !== input.expectedDatabaseSha256) {
    throw new Error("database_clone_hash_mismatch");
  }

  const runnerPath = realpathSync(fileURLToPath(import.meta.url));
  const workerPath = realpathSync(new URL("./passive-checkpoint-worker.mjs", import.meta.url));
  const runnerSha256 = hashFile(runnerPath);
  const workerSha256 = hashFile(workerPath);
  const planSha256 = hashFile(input.planPath);
  const sourceStateSha256 = hashSourceState(input.projectRoot);
  let database: RuntimeDatabase | undefined;
  let checkpointWorker: CheckpointWorkerHandle | undefined;
  try {
    database = openRuntimeDatabase(input.sqlitePath);
    migrateRuntimeDatabase(database);
    const pragmasBefore = readPragmas(database);
    if (input.variant === "candidate") {
      database.run("PRAGMA wal_autocheckpoint = 0");
      checkpointWorker = await startCheckpointWorker(input, workerPath);
    }
    const pragmasObserved = readPragmas(database);
    assertPragmas(input.variant, pragmasBefore, pragmasObserved);

    const repositories = createSqliteRuntimeRepositories();
    const counted = countedDatabase(database);
    const lifecycle = new RuntimeLifecycleCommands(counted.database, repositories);
    const operations = buildDeterministicBaselineWorkload({
      seededConversations: 10_000,
      concurrency: 20
    }).operations.slice(0, SCOPE_COUNT);
    const initialCounters = readCounters(database);
    const latenciesMs: number[] = [];
    const blocks: Array<Record<string, number>> = [];
    const rssStartBytes = process.memoryUsage().rss;
    let rssMaxBytes = rssStartBytes;
    let maximumWalBytes = statSyncIfPresent(`${input.sqlitePath}-wal`);
    const startedAt = performance.now();

    for (let index = 0; index < ITERATIONS; index += 1) {
      const operation = operations[index % SCOPE_COUNT]!;
      const executionId = executionIdFor(input.runId, index);
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
        message: `Gate R8 checkpoint diagnostic ${index + 1}`
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
          content: `Gate R8 checkpoint diagnostic answer ${index + 1}`
        },
        stopReason: "FINAL_ANSWER"
      });
      if ((index + 1) % ACK_INTERVAL === 0) {
        acknowledgePendingTraceEvents(database);
        maximumWalBytes = Math.max(
          maximumWalBytes,
          statSyncIfPresent(`${input.sqlitePath}-wal`)
        );
        rssMaxBytes = Math.max(rssMaxBytes, process.memoryUsage().rss);
      }
      latenciesMs.push(performance.now() - operationStartedAt);
      if ((index + 1) % 1_000 === 0) {
        const block = latenciesMs.slice(index - 999, index + 1);
        blocks.push({
          startIteration: index - 998,
          endIteration: index + 1,
          p50Ms: percentile(block, 0.50),
          p95Ms: percentile(block, 0.95),
          maxMs: Math.max(...block),
          over100Ms: block.filter(value => value > 100).length
        });
      }
    }
    acknowledgePendingTraceEvents(database);
    maximumWalBytes = Math.max(maximumWalBytes, statSyncIfPresent(`${input.sqlitePath}-wal`));
    const durationMs = performance.now() - startedAt;
    const transactionMetrics = counted.metrics();
    assertTransactionCount(transactionMetrics.count);
    const checkpoint = input.variant === "candidate"
      ? await stopCheckpointWorker(checkpointWorker!)
      : runControlShutdownCheckpoint(database, maximumWalBytes);
    checkpointWorker = undefined;
    assertCheckpointResult(input.variant, checkpoint);

    const eventOrderSamples = assertEventOrder(
      database,
      operations,
      input.runId,
      [0, Math.floor(ITERATIONS / 2) - 1, ITERATIONS - 1]
    );
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
      maximumWalBytes: input.variant === "candidate"
        ? Math.max(maximumWalBytes, checkpoint.runtime.maximumWalBytes)
        : maximumWalBytes,
      runnerSha256,
      workerSha256,
      planSha256,
      sourceStateSha256,
      scopeCount: SCOPE_COUNT,
      rounds: ROUNDS,
      iterations: ITERATIONS,
      eventsPerExecution: 12,
      messagesPerExecution: 2,
      traceAckIntervalExecutions: ACK_INTERVAL,
      transactionMetrics: {
        ...transactionMetrics,
        perExecution: transactionMetrics.count / ITERATIONS,
        expectedPerExecution: TRANSACTIONS_PER_EXECUTION
      },
      checkpoint,
      durationMs,
      throughputPerSecond: ITERATIONS / (durationMs / 1_000),
      latencyMs: {
        overall: summarize(latenciesMs),
        firstHalf: summarize(firstHalf),
        lastHalf: summarize(lastHalf),
        firstQuartile: summarize(latenciesMs.slice(0, quartile)),
        lastQuartile: summarize(latenciesMs.slice(-quartile)),
        tail: tailStats(latenciesMs),
        blocks
      },
      rssBytes: {
        start: rssStartBytes,
        max: rssMaxBytes,
        end: rssEndBytes
      },
      pragmas: {
        before: pragmasBefore,
        observed: pragmasObserved
      },
      eventOrderSamples,
      counters: {
        initial: initialCounters,
        final: finalCounters,
        delta: counterDelta(initialCounters, finalCounters)
      },
      integrity
    };
  } finally {
    if (checkpointWorker) {
      await stopCheckpointWorker(checkpointWorker).catch(() => undefined);
    }
    database?.close();
  }
}

async function startCheckpointWorker(
  input: CliInput,
  workerPath: string
): Promise<CheckpointWorkerHandle> {
  const require = createRequire(join(input.projectRoot, "agent-runtime/package.json"));
  const betterSqlite3Path = realpathSync(require.resolve("better-sqlite3"));
  const stopBuffer = new SharedArrayBuffer(8);
  const stop = new Int32Array(stopBuffer);
  const worker = new Worker(pathToFileURL(workerPath), {
    execArgv: [],
    workerData: {
      databasePath: input.sqlitePath,
      betterSqlite3Path,
      stopBuffer,
      pollIntervalMs: CHECKPOINT_POLL_INTERVAL_MS,
      thresholdFrames: CHECKPOINT_THRESHOLD_FRAMES,
      maximumWalBytes: MAXIMUM_WAL_BYTES
    }
  });

  let resolveReady!: (value: CheckpointWorkerReady) => void;
  let rejectReady!: (error: Error) => void;
  let resolveCompletion!: (value: CheckpointWorkerSummary) => void;
  let rejectCompletion!: (error: Error) => void;
  let readySettled = false;
  let completionSettled = false;
  const ready = new Promise<CheckpointWorkerReady>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const completion = new Promise<CheckpointWorkerSummary>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  const exit = new Promise<number>(resolve => worker.once("exit", resolve));

  const rejectBoth = (error: Error): void => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
    if (!completionSettled) {
      completionSettled = true;
      rejectCompletion(error);
    }
  };
  worker.on("message", (message: unknown) => {
    if (!isRecord(message) || typeof message.kind !== "string") {
      rejectBoth(new Error("invalid_worker_message"));
      return;
    }
    if (message.kind === "ready") {
      if (readySettled || !isWorkerReady(message)) {
        rejectBoth(new Error("invalid_worker_ready"));
        return;
      }
      readySettled = true;
      resolveReady(message as unknown as CheckpointWorkerReady);
      return;
    }
    if (message.kind === "summary") {
      if (completionSettled || !isWorkerSummary(message)) {
        rejectBoth(new Error("invalid_worker_summary"));
        return;
      }
      completionSettled = true;
      resolveCompletion(message as unknown as CheckpointWorkerSummary);
      return;
    }
    if (message.kind === "failure") {
      const failure = message as unknown as CheckpointWorkerFailure;
      rejectBoth(new Error(
        SAFE_ERROR_CODE.test(failure.errorCode) ? failure.errorCode : "checkpoint_worker_failure"
      ));
      return;
    }
    rejectBoth(new Error("unknown_worker_message"));
  });
  worker.on("error", error => rejectBoth(error));
  worker.on("exit", code => {
    if (code !== 0 || !completionSettled) {
      rejectBoth(new Error(code === 0 ? "checkpoint_worker_early_exit" : "checkpoint_worker_nonzero_exit"));
    }
  });

  const readyMessage = await ready;
  assertWorkerReady(readyMessage);
  return {
    worker,
    stop,
    ready: readyMessage,
    completion,
    exit,
    stopRequested: false
  };
}

async function stopCheckpointWorker(
  handle: CheckpointWorkerHandle
): Promise<CheckpointWorkerSummary> {
  if (!handle.stopRequested) {
    handle.stopRequested = true;
    Atomics.store(handle.stop, 0, 1);
    Atomics.notify(handle.stop, 0);
  }
  const summary = await handle.completion;
  const exitCode = await handle.exit;
  if (exitCode !== 0) throw new Error("checkpoint_worker_nonzero_exit");
  return summary;
}

function assertWorkerReady(ready: CheckpointWorkerReady): void {
  if (
    ready.journalMode !== "wal"
    || ready.synchronous !== 1
    || ready.walAutocheckpoint !== 0
    || ready.pollIntervalMs !== CHECKPOINT_POLL_INTERVAL_MS
    || ready.thresholdFrames !== CHECKPOINT_THRESHOLD_FRAMES
    || ready.maximumWalBytes !== MAXIMUM_WAL_BYTES
  ) {
    throw new Error("checkpoint_worker_ready_mismatch");
  }
}

function runControlShutdownCheckpoint(
  database: RuntimeDatabase,
  maximumWalBytes: number
): CheckpointWorkerSummary {
  const startedAt = performance.now();
  const shutdown = checkpointRow(database, "TRUNCATE");
  const durationMs = performance.now() - startedAt;
  const finalWalBytes = statSyncIfPresent(`${database.path}-wal`);
  return {
    kind: "summary",
    result: "pass",
    runtime: {
      noopPolls: 0,
      passiveAttempts: 0,
      passiveBusy: 0,
      passiveTotalDurationMs: 0,
      passiveMaxDurationMs: 0,
      maximumLogFrames: 0,
      maximumCheckpointedFrames: 0,
      maximumBacklogFrames: 0,
      maximumWalBytes,
      finalRuntimeCheckpoint: {
        busy: 0,
        logFrames: 0,
        checkpointedFrames: 0,
        backlogFrames: 0,
        durationMs: 0,
        walBytes: maximumWalBytes
      }
    },
    shutdown: {
      ...shutdown,
      durationMs,
      finalWalBytes
    }
  };
}

function assertCheckpointResult(
  variant: Variant,
  checkpoint: CheckpointWorkerSummary
): void {
  if (
    checkpoint.result !== "pass"
    || checkpoint.shutdown.busy !== 0
    || checkpoint.shutdown.logFrames !== 0
    || checkpoint.shutdown.checkpointedFrames !== 0
    || checkpoint.shutdown.finalWalBytes !== 0
    || checkpoint.runtime.maximumWalBytes > MAXIMUM_WAL_BYTES
  ) {
    throw new Error("checkpoint_safety_failure");
  }
  if (
    variant === "candidate"
    && (
      checkpoint.runtime.noopPolls <= 0
      || checkpoint.runtime.passiveAttempts <= 1
      || checkpoint.runtime.passiveBusy !== 0
    )
  ) {
    throw new Error("candidate_checkpoint_not_exercised");
  }
}

function checkpointRow(database: RuntimeDatabase, mode: "TRUNCATE"): CheckpointRow {
  const row = database.get<{ busy: number; log: number; checkpointed: number }>(
    `PRAGMA wal_checkpoint(${mode})`
  );
  if (
    !row
    || !Number.isInteger(row.busy)
    || !Number.isInteger(row.log)
    || !Number.isInteger(row.checkpointed)
  ) {
    throw new Error("invalid_checkpoint_result");
  }
  return {
    busy: row.busy,
    logFrames: row.log,
    checkpointedFrames: row.checkpointed,
    backlogFrames: Math.max(0, row.log - row.checkpointed)
  };
}

function isWorkerReady(message: Record<string, unknown>): boolean {
  return message.kind === "ready"
    && message.journalMode === "wal"
    && Number.isInteger(message.synchronous)
    && Number.isInteger(message.walAutocheckpoint)
    && Number.isInteger(message.pollIntervalMs)
    && Number.isInteger(message.thresholdFrames)
    && Number.isInteger(message.maximumWalBytes);
}

function isWorkerSummary(message: Record<string, unknown>): boolean {
  return message.kind === "summary"
    && message.result === "pass"
    && isRecord(message.runtime)
    && integerFields(message.runtime, [
      "noopPolls",
      "passiveAttempts",
      "passiveBusy",
      "maximumLogFrames",
      "maximumCheckpointedFrames",
      "maximumBacklogFrames",
      "maximumWalBytes"
    ])
    && finiteNumberFields(message.runtime, [
      "passiveTotalDurationMs",
      "passiveMaxDurationMs"
    ])
    && isRecord(message.runtime.finalRuntimeCheckpoint)
    && isCheckpointMessage(message.runtime.finalRuntimeCheckpoint, true)
    && isRecord(message.shutdown)
    && isCheckpointMessage(message.shutdown, false)
    && Number.isFinite(message.shutdown.durationMs)
    && Number.isInteger(message.shutdown.finalWalBytes);
}

function isCheckpointMessage(
  message: Record<string, unknown>,
  includeWalBytes: boolean
): boolean {
  return integerFields(message, [
    "busy",
    "logFrames",
    "checkpointedFrames",
    "backlogFrames",
    ...(includeWalBytes ? ["walBytes"] : [])
  ])
    && Number.isFinite(message.durationMs);
}

function integerFields(message: Record<string, unknown>, fields: string[]): boolean {
  return fields.every(field => Number.isInteger(message[field]));
}

function finiteNumberFields(message: Record<string, unknown>, fields: string[]): boolean {
  return fields.every(field => Number.isFinite(message[field]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function countedDatabase(database: RuntimeDatabase): {
  database: RuntimeDatabase;
  metrics(): TransactionMetrics;
} {
  const metrics: TransactionMetrics = {
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0
  };
  return {
    database: {
      path: database.path,
      run: database.run,
      get: database.get,
      all: database.all,
      transaction<T>(work: (tx: RuntimeTransaction) => T): T {
        const startedAt = performance.now();
        try {
          return database.transaction(work);
        } finally {
          const durationMs = performance.now() - startedAt;
          metrics.count += 1;
          metrics.totalDurationMs += durationMs;
          metrics.maxDurationMs = Math.max(metrics.maxDurationMs, durationMs);
        }
      },
      close: database.close
    },
    metrics: () => ({ ...metrics })
  };
}

function assertTransactionCount(actual: number): void {
  if (actual !== ITERATIONS * TRANSACTIONS_PER_EXECUTION) {
    throw new Error("transaction_count_mismatch");
  }
}

function assertEventOrder(
  database: RuntimeDatabase,
  operations: ReturnType<typeof buildDeterministicBaselineWorkload>["operations"],
  runId: string,
  iterationIndexes: number[]
): Array<{ executionId: string; firstCursor: number; lastCursor: number; kinds: string[] }> {
  return iterationIndexes.map((iterationIndex) => {
    const operation = operations[iterationIndex % SCOPE_COUNT]!;
    const executionId = executionIdFor(runId, iterationIndex);
    const rows = database.all<{ cursor: number; kind: string }>(
      `SELECT cursor, kind
       FROM runtime_events
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND execution_id = ?
       ORDER BY cursor ASC`,
      [operation.tenantId, operation.userId, operation.conversationId, executionId]
    );
    if (
      rows.length !== EXPECTED_EVENT_KINDS.length
      || rows.some((row, index) => row.kind !== EXPECTED_EVENT_KINDS[index])
      || rows.some((row, index) => row.cursor !== rows[0]!.cursor + index)
    ) {
      throw new Error("event_order_or_cursor_mismatch");
    }
    return {
      executionId,
      firstCursor: rows[0]!.cursor,
      lastCursor: rows.at(-1)!.cursor,
      kinds: rows.map(row => row.kind)
    };
  });
}

function executionIdFor(runId: string, zeroBasedIndex: number): string {
  return `${runId}-execution-${String(zeroBasedIndex + 1).padStart(5, "0")}`;
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
    || delta.deliveredTraceEvents !== ITERATIONS * 6
    || final.pendingTraceEvents !== 0
  ) {
    throw new Error("database_counter_delta_mismatch");
  }
}

function counterDelta(initial: DatabaseCounters, final: DatabaseCounters): DatabaseCounters {
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
    || observed.synchronous !== before.synchronous
    || observed.cacheSize !== before.cacheSize
    || observed.mmapSize !== before.mmapSize
    || observed.pageSize !== before.pageSize
    || observed.walAutocheckpoint !== (variant === "control" ? 1_000 : 0)
  ) {
    throw new Error("pragma_drift");
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

function tailStats(values: number[]): {
  over100Ms: number;
  longestConsecutiveOver100Ms: number;
} {
  let over100Ms = 0;
  let current = 0;
  let longest = 0;
  for (const value of values) {
    if (value > 100) {
      over100Ms += 1;
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return { over100Ms, longestConsecutiveOver100Ms: longest };
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
  if (!CLONE_PARENT.test(dirname(canonical))) throw new Error("sqlite_path_not_gate_r8_clone");
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

async function main(): Promise<void> {
  const input = parseCli(process.argv.slice(2));
  const report = await run(input);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : "";
    process.stderr.write(`${JSON.stringify({
      result: "blocked",
      errorClass: error instanceof Error ? error.name : "UnknownError",
      errorCode: SAFE_ERROR_CODE.test(message) ? message : "unexpected_error"
    })}\n`);
    process.exitCode = 2;
  });
}
