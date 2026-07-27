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
import {
  createSqliteRuntimeRepositories,
  type SqliteRuntimeRepositories
} from "../../../../../../agent-runtime/src/storage/sqliteRuntimeRepositories.ts";
import type { SessionEvent } from "../../../../../../agent-runtime/src/types.ts";

const MATURE_BATCH_COUNT = 200;
const PROBE_BATCH_COUNT = 4;
const EVENTS_PER_BATCH = 100;
const CANDIDATE_CHUNK_SIZE = 20;
const CANDIDATE_CHUNKS_PER_BATCH = EVENTS_PER_BATCH / CANDIDATE_CHUNK_SIZE;
const MAXIMUM_WAL_BYTES = 64 * 1_048_576;
const MINIMUM_MATURE_DATABASE_BYTES = 3_500_000_000;
const HASH = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ERROR_CODE = /^[a-z0-9_]+$/;
const CLONE_PARENT = /^\/private\/tmp\/openharness-gate-r9\.[A-Za-z0-9]+$/;
const SOURCE_FILES = [
  "agent-runtime/src/storage/runtimeStorage.ts",
  "agent-runtime/src/storage/lifecycleCommands.ts",
  "agent-runtime/src/storage/traceOutbox.ts",
  "agent-runtime/src/storage/traceOutboxDispatcher.ts",
  "agent-runtime/src/storage/sqliteRuntimeEventStore.ts",
  "agent-runtime/src/storage/sqliteExecutionStore.ts",
  "agent-runtime/src/storage/sqliteHistoryStore.ts"
] as const;
const EXPECTED_ADMISSION_EVENT_KINDS = [
  "agent_start",
  "final_answer",
  "agent_end",
  "stream_done"
] as const;

type Variant = "control" | "candidate";
type Mode = "probe" | "mature";

interface CliInput {
  projectRoot: string;
  runId: string;
  variant: Variant;
  mode: Mode;
  sqlitePath: string;
  expectedDatabaseSha256: string;
  planPath: string;
}

interface DatabaseCounters {
  messages: number;
  executions: number;
  runtimeEvents: number;
  pendingTraceEvents: number;
  retryTraceEvents: number;
  deliveredTraceEvents: number;
  deadLetterTraceEvents: number;
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

interface AdmissionResult {
  latencyMs: number;
  startTransactionMs: number;
  completionTransactionMs: number;
  executionId: string;
}

interface TransitionMetrics {
  transitionTransactionDurationMs: number[];
  transitionBatchDurationMs: number[];
  admissionLatencyMs: number[];
  admissionStartTransactionMs: number[];
  admissionCompletionTransactionMs: number[];
  transitionTransactions: number;
  yields: number;
  maximumWalBytes: number;
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
    "--mode",
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
  const mode = flags.get("--mode");
  if (mode !== "probe" && mode !== "mature") throw new Error("invalid_mode");
  const sqlitePath = canonicalClone(flags.get("--sqlite-path")!);
  const expectedDatabaseSha256 = flags.get("--expected-database-sha256")!;
  if (!HASH.test(expectedDatabaseSha256)) throw new Error("invalid_expected_database_hash");
  const planPath = canonicalProjectFile(projectRoot, flags.get("--plan")!);
  return {
    projectRoot,
    runId,
    variant,
    mode,
    sqlitePath,
    expectedDatabaseSha256,
    planPath
  };
}

async function run(input: CliInput): Promise<Record<string, unknown>> {
  const databaseStartBytes = statSync(input.sqlitePath).size;
  if (input.mode === "mature" && databaseStartBytes < MINIMUM_MATURE_DATABASE_BYTES) {
    throw new Error("database_not_mature");
  }
  const databaseStartSha256 = hashLargeFile(input.sqlitePath);
  if (databaseStartSha256 !== input.expectedDatabaseSha256) {
    throw new Error("database_clone_hash_mismatch");
  }
  const runnerSha256 = hashFile(realpathSync(fileURLToPath(import.meta.url)));
  const planSha256 = hashFile(input.planPath);
  const sourceStateSha256 = hashSourceState(input.projectRoot);
  const batchCount = input.mode === "mature" ? MATURE_BATCH_COUNT : PROBE_BATCH_COUNT;
  const seededTraceEvents = batchCount * EVENTS_PER_BATCH;
  let database: RuntimeDatabase | undefined;
  try {
    database = openRuntimeDatabase(input.sqlitePath);
    migrateRuntimeDatabase(database);
    const pragmasBefore = readPragmas(database);
    assertPragmas(pragmasBefore, readPragmas(database));
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(database, repositories);
    const operations = buildDeterministicBaselineWorkload({
      seededConversations: 10_000,
      concurrency: 20
    }).operations;
    const initialCounters = readCounters(database);
    if (
      initialCounters.pendingTraceEvents !== 0
      || initialCounters.retryTraceEvents !== 0
      || initialCounters.deadLetterTraceEvents !== 0
    ) {
      throw new Error("source_outbox_not_clean");
    }

    seedPendingTraceEvents(
      database,
      repositories,
      operations,
      input.runId,
      batchCount
    );
    const seededCounters = readCounters(database);
    assertSeedCounters(initialCounters, seededCounters, batchCount);
    const seedCheckpoint = checkpoint(database, "TRUNCATE");
    if (
      seedCheckpoint.busy !== 0
      || seedCheckpoint.log !== 0
      || seedCheckpoint.checkpointed !== 0
      || statSyncIfPresent(`${input.sqlitePath}-wal`) !== 0
    ) {
      throw new Error("seed_checkpoint_failure");
    }
    const seedIntegrity = pragmaValue(database, "integrity_check");
    if (seedIntegrity !== "ok") throw new Error("seed_integrity_failure");

    const metrics: TransitionMetrics = {
      transitionTransactionDurationMs: [],
      transitionBatchDurationMs: [],
      admissionLatencyMs: [],
      admissionStartTransactionMs: [],
      admissionCompletionTransactionMs: [],
      transitionTransactions: 0,
      yields: 0,
      maximumWalBytes: 0
    };
    const rssStartBytes = process.memoryUsage().rss;
    let rssMaxBytes = rssStartBytes;
    const performanceStartedAt = performance.now();

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      const candidates = repositories.runtimeEvent.claimOutbox(
        database,
        Number.MAX_SAFE_INTEGER,
        EVENTS_PER_BATCH
      );
      assertClaimBatch(candidates, batchIndex);
      const admission = scheduleAdmission(
        lifecycle,
        operations,
        input.runId,
        batchIndex
      );
      const batchStartedAt = performance.now();
      if (input.variant === "control") {
        transitionChunk(database, repositories, candidates, metrics);
      } else {
        for (let offset = 0; offset < candidates.length; offset += CANDIDATE_CHUNK_SIZE) {
          transitionChunk(
            database,
            repositories,
            candidates.slice(offset, offset + CANDIDATE_CHUNK_SIZE),
            metrics
          );
          if (offset + CANDIDATE_CHUNK_SIZE < candidates.length) {
            metrics.yields += 1;
            await yieldToEventLoop();
          }
        }
      }
      const admissionResult = await admission;
      metrics.transitionBatchDurationMs.push(performance.now() - batchStartedAt);
      metrics.admissionLatencyMs.push(admissionResult.latencyMs);
      metrics.admissionStartTransactionMs.push(admissionResult.startTransactionMs);
      metrics.admissionCompletionTransactionMs.push(admissionResult.completionTransactionMs);
      metrics.maximumWalBytes = Math.max(
        metrics.maximumWalBytes,
        statSyncIfPresent(`${input.sqlitePath}-wal`)
      );
      if (metrics.maximumWalBytes > MAXIMUM_WAL_BYTES) {
        throw new Error("wal_size_limit_exceeded");
      }
      rssMaxBytes = Math.max(rssMaxBytes, process.memoryUsage().rss);
    }

    const performanceDurationMs = performance.now() - performanceStartedAt;
    assertTransitionShape(input.variant, metrics, batchCount);
    const finalCounters = readCounters(database);
    assertFinalCounters(initialCounters, finalCounters, batchCount);
    const admissionOrderSamples = assertAdmissionEventOrder(
      database,
      operations,
      input.runId,
      [0, Math.floor(batchCount / 2), batchCount - 1]
    );
    const integrity = pragmaValue(database, "integrity_check");
    if (integrity !== "ok") throw new Error("sqlite_integrity_failure");
    const pragmasObserved = readPragmas(database);
    assertPragmas(pragmasBefore, pragmasObserved);
    const shutdownCheckpointStartedAt = performance.now();
    const shutdownCheckpoint = checkpoint(database, "TRUNCATE");
    const shutdownCheckpointDurationMs = performance.now() - shutdownCheckpointStartedAt;
    const finalWalBytes = statSyncIfPresent(`${input.sqlitePath}-wal`);
    if (
      shutdownCheckpoint.busy !== 0
      || shutdownCheckpoint.log !== 0
      || shutdownCheckpoint.checkpointed !== 0
      || finalWalBytes !== 0
    ) {
      throw new Error("shutdown_checkpoint_failure");
    }
    const rssEndBytes = process.memoryUsage().rss;
    rssMaxBytes = Math.max(rssMaxBytes, rssEndBytes);
    const databaseEndBytes = statSync(input.sqlitePath).size;

    return {
      runId: input.runId,
      variant: input.variant,
      mode: input.mode,
      result: "pass",
      generatedAt: new Date().toISOString(),
      databaseBasename: basename(input.sqlitePath),
      databaseStartSha256,
      databaseStartBytes,
      databaseEndBytes,
      databaseGrowthBytes: databaseEndBytes - databaseStartBytes,
      runnerSha256,
      planSha256,
      sourceStateSha256,
      batchCount,
      eventsPerBatch: EVENTS_PER_BATCH,
      seededTraceEvents,
      candidateChunkSize: CANDIDATE_CHUNK_SIZE,
      performanceDurationMs,
      drainThroughputPerSecond: seededTraceEvents / (performanceDurationMs / 1_000),
      transitionTransactions: metrics.transitionTransactions,
      yields: metrics.yields,
      latencyMs: {
        admission: summarize(metrics.admissionLatencyMs),
        admissionTail: tailStats(metrics.admissionLatencyMs),
        admissionStartTransaction: summarize(metrics.admissionStartTransactionMs),
        admissionCompletionTransaction: summarize(metrics.admissionCompletionTransactionMs),
        transitionTransaction: summarize(metrics.transitionTransactionDurationMs),
        transitionBatch: summarize(metrics.transitionBatchDurationMs)
      },
      rawDistributions: {
        admissionLatencyMs: metrics.admissionLatencyMs,
        admissionStartTransactionMs: metrics.admissionStartTransactionMs,
        transitionTransactionDurationMs: metrics.transitionTransactionDurationMs,
        transitionBatchDurationMs: metrics.transitionBatchDurationMs
      },
      distributionSha256: hashDistributions(metrics),
      maximumWalBytes: metrics.maximumWalBytes,
      finalWalBytes,
      seedCheckpoint,
      shutdownCheckpoint: {
        ...shutdownCheckpoint,
        durationMs: shutdownCheckpointDurationMs
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
      admissionOrderSamples,
      counters: {
        initial: initialCounters,
        seeded: seededCounters,
        final: finalCounters,
        delta: counterDelta(initialCounters, finalCounters)
      },
      integrity
    };
  } finally {
    database?.close();
  }
}

function seedPendingTraceEvents(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  operations: ReturnType<typeof buildDeterministicBaselineWorkload>["operations"],
  runId: string,
  batchCount: number
): void {
  const createdAtBase = Date.now();
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const operation = operations[batchIndex]!;
    const executionId = `${runId}-seed-execution-${String(batchIndex + 1).padStart(4, "0")}`;
    database.transaction(tx => {
      repositories.history.ensureConversation(tx, operation);
      repositories.execution.create(tx, {
        tenantId: operation.tenantId,
        userId: operation.userId,
        conversationId: operation.conversationId,
        executionId,
        status: "completed"
      });
      const firstCursor = (
        repositories.runtimeEvent.latestCursor(
          tx,
          operation.tenantId,
          operation.userId,
          operation.conversationId
        ) ?? 0
      ) + 1;
      for (let eventIndex = 0; eventIndex < EVENTS_PER_BATCH; eventIndex += 1) {
        const cursor = firstCursor + eventIndex;
        repositories.runtimeEvent.append(tx, {
          durability: "durable",
          eventId: `${runId}-seed-event-${String(batchIndex + 1).padStart(4, "0")}-${String(eventIndex + 1).padStart(3, "0")}`,
          executionId,
          tenantId: operation.tenantId,
          userId: operation.userId,
          conversationId: operation.conversationId,
          traceId: `${runId}-seed-trace-${batchIndex + 1}-${eventIndex + 1}`,
          requestId: `${runId}-seed-request-${batchIndex + 1}`,
          createdAt: createdAtBase + batchIndex * EVENTS_PER_BATCH + eventIndex,
          kind: "trace",
          data: {
            eventType: "DIAGNOSTIC_TRACE",
            name: "trace transition diagnostic",
            status: "ok",
            startTime: createdAtBase + batchIndex * EVENTS_PER_BATCH + eventIndex
          },
          cursor
        });
      }
    });
  }
}

function scheduleAdmission(
  lifecycle: RuntimeLifecycleCommands,
  operations: ReturnType<typeof buildDeterministicBaselineWorkload>["operations"],
  runId: string,
  batchIndex: number
): Promise<AdmissionResult> {
  const operation = operations[5_000 + batchIndex]!;
  const executionId = `${runId}-admission-execution-${String(batchIndex + 1).padStart(4, "0")}`;
  const scope = {
    tenantId: operation.tenantId,
    userId: operation.userId,
    conversationId: operation.conversationId,
    executionId,
    traceId: `${runId}-admission-trace-${batchIndex + 1}`,
    requestId: `${runId}-admission-request-${batchIndex + 1}`
  };
  const scheduledAt = performance.now();
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        const startTransactionStartedAt = performance.now();
        lifecycle.startExecution({
          ...scope,
          message: `Gate R9 admission ${batchIndex + 1}`
        });
        const admittedAt = performance.now();
        const completionStartedAt = performance.now();
        lifecycle.completeExecution({
          ...scope,
          assistantMessage: {
            role: "assistant",
            content: `Gate R9 admission answer ${batchIndex + 1}`
          },
          stopReason: "FINAL_ANSWER"
        });
        resolve({
          latencyMs: admittedAt - scheduledAt,
          startTransactionMs: admittedAt - startTransactionStartedAt,
          completionTransactionMs: performance.now() - completionStartedAt,
          executionId
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function transitionChunk(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  events: SessionEvent[],
  metrics: TransitionMetrics
): void {
  const startedAt = performance.now();
  database.transaction(tx => {
    for (const event of events) {
      if (!repositories.runtimeEvent.markAcknowledged(
        tx,
        event.tenantId,
        event.userId,
        event.conversationId,
        event.eventId
      )) {
        throw new Error("trace_transition_compare_and_set_failed");
      }
    }
  });
  metrics.transitionTransactionDurationMs.push(performance.now() - startedAt);
  metrics.transitionTransactions += 1;
}

function assertClaimBatch(events: SessionEvent[], batchIndex: number): void {
  if (events.length !== EVENTS_PER_BATCH) throw new Error("claim_batch_size_mismatch");
  const eventIds = new Set(events.map(event => event.eventId));
  const expectedBatch = `-seed-event-${String(batchIndex + 1).padStart(4, "0")}-`;
  if (
    eventIds.size !== EVENTS_PER_BATCH
    || events.some(event => event.kind !== "trace")
    || events.some(event => !event.eventId.includes(expectedBatch))
  ) {
    throw new Error("claim_batch_identity_mismatch");
  }
}

function assertTransitionShape(
  variant: Variant,
  metrics: TransitionMetrics,
  batchCount: number
): void {
  const expectedTransactions = batchCount * (
    variant === "control" ? 1 : CANDIDATE_CHUNKS_PER_BATCH
  );
  const expectedYields = variant === "control"
    ? 0
    : batchCount * (CANDIDATE_CHUNKS_PER_BATCH - 1);
  if (
    metrics.transitionTransactions !== expectedTransactions
    || metrics.transitionTransactionDurationMs.length !== expectedTransactions
    || metrics.transitionBatchDurationMs.length !== batchCount
    || metrics.admissionLatencyMs.length !== batchCount
    || metrics.yields !== expectedYields
  ) {
    throw new Error("transition_shape_mismatch");
  }
}

function assertSeedCounters(
  initial: DatabaseCounters,
  seeded: DatabaseCounters,
  batchCount: number
): void {
  const delta = counterDelta(initial, seeded);
  if (
    delta.executions !== batchCount
    || delta.runtimeEvents !== batchCount * EVENTS_PER_BATCH
    || delta.pendingTraceEvents !== batchCount * EVENTS_PER_BATCH
    || delta.deliveredTraceEvents !== 0
    || delta.messages !== 0
  ) {
    throw new Error("seed_counter_mismatch");
  }
}

function assertFinalCounters(
  initial: DatabaseCounters,
  final: DatabaseCounters,
  batchCount: number
): void {
  const delta = counterDelta(initial, final);
  if (
    delta.messages !== batchCount * 2
    || delta.executions !== batchCount * 2
    || delta.runtimeEvents !== batchCount * (EVENTS_PER_BATCH + 4)
    || final.pendingTraceEvents !== 0
    || final.retryTraceEvents !== 0
    || delta.deliveredTraceEvents !== batchCount * EVENTS_PER_BATCH
    || delta.deadLetterTraceEvents !== 0
  ) {
    throw new Error("final_counter_mismatch");
  }
}

function assertAdmissionEventOrder(
  database: RuntimeDatabase,
  operations: ReturnType<typeof buildDeterministicBaselineWorkload>["operations"],
  runId: string,
  batchIndexes: number[]
): Array<{ executionId: string; kinds: string[]; cursors: number[] }> {
  return batchIndexes.map(batchIndex => {
    const operation = operations[5_000 + batchIndex]!;
    const executionId = `${runId}-admission-execution-${String(batchIndex + 1).padStart(4, "0")}`;
    const rows = database.all<{ cursor: number; kind: string }>(
      `SELECT cursor, kind
       FROM runtime_events
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND execution_id = ?
       ORDER BY cursor ASC`,
      [operation.tenantId, operation.userId, operation.conversationId, executionId]
    );
    if (
      rows.length !== EXPECTED_ADMISSION_EVENT_KINDS.length
      || rows.some((row, index) => row.kind !== EXPECTED_ADMISSION_EVENT_KINDS[index])
      || rows.some((row, index) => row.cursor !== rows[0]!.cursor + index)
    ) {
      throw new Error("admission_event_order_mismatch");
    }
    return {
      executionId,
      kinds: rows.map(row => row.kind),
      cursors: rows.map(row => row.cursor)
    };
  });
}

function readCounters(database: RuntimeDatabase): DatabaseCounters {
  const row = database.get<DatabaseCounters>(`
    SELECT
      (SELECT COUNT(*) FROM messages) AS messages,
      (SELECT COUNT(*) FROM executions) AS executions,
      (SELECT COUNT(*) FROM runtime_events) AS runtimeEvents,
      (SELECT COUNT(*) FROM runtime_events
        WHERE kind = 'trace' AND delivery_status = 'pending') AS pendingTraceEvents,
      (SELECT COUNT(*) FROM runtime_events
        WHERE kind = 'trace' AND delivery_status = 'retry') AS retryTraceEvents,
      (SELECT COUNT(*) FROM runtime_events
        WHERE kind = 'trace' AND delivery_status = 'delivered') AS deliveredTraceEvents,
      (SELECT COUNT(*) FROM runtime_events
        WHERE kind = 'trace' AND delivery_status = 'dead_letter') AS deadLetterTraceEvents
  `);
  if (!row) throw new Error("database_counter_missing");
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, nonNegativeInteger(value)])
  ) as unknown as DatabaseCounters;
}

function counterDelta(initial: DatabaseCounters, final: DatabaseCounters): DatabaseCounters {
  return {
    messages: final.messages - initial.messages,
    executions: final.executions - initial.executions,
    runtimeEvents: final.runtimeEvents - initial.runtimeEvents,
    pendingTraceEvents: final.pendingTraceEvents - initial.pendingTraceEvents,
    retryTraceEvents: final.retryTraceEvents - initial.retryTraceEvents,
    deliveredTraceEvents: final.deliveredTraceEvents - initial.deliveredTraceEvents,
    deadLetterTraceEvents: final.deadLetterTraceEvents - initial.deadLetterTraceEvents
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

function assertPragmas(before: PragmaSnapshot, observed: PragmaSnapshot): void {
  if (
    observed.journalMode.toLowerCase() !== "wal"
    || observed.foreignKeys !== 1
    || observed.walAutocheckpoint !== 1_000
    || observed.synchronous !== before.synchronous
    || observed.cacheSize !== before.cacheSize
    || observed.mmapSize !== before.mmapSize
    || observed.pageSize !== before.pageSize
  ) {
    throw new Error("pragma_drift");
  }
}

function checkpoint(
  database: RuntimeDatabase,
  mode: "TRUNCATE"
): { busy: number; log: number; checkpointed: number } {
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
  return row;
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

function hashDistributions(metrics: TransitionMetrics): string {
  return createHash("sha256").update(JSON.stringify({
    admissionLatencyMs: metrics.admissionLatencyMs,
    admissionStartTransactionMs: metrics.admissionStartTransactionMs,
    transitionTransactionDurationMs: metrics.transitionTransactionDurationMs,
    transitionBatchDurationMs: metrics.transitionBatchDurationMs
  })).digest("hex");
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
  if (!CLONE_PARENT.test(dirname(canonical))) throw new Error("sqlite_path_not_gate_r9_clone");
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

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
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
