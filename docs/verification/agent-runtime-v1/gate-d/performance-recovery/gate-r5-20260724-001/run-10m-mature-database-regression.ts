import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statfsSync,
  statSync
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GateDContinuousWorkload,
  GateDRuntimeHttpTransport,
  GateDRuntimeSupervisor,
  GateDWorkloadDriver,
  assertGateDSeededConversationCount,
  buildGateDRuntimeChildSpawnSpec,
  createGateDEvidenceJournal,
  openGateDReadOnlyDatabaseProbe,
  readGateDChildProcessSnapshot,
  spawnGateDRuntimeManagedChild,
  waitUntilGateDRuntimeReady,
  writeGateDReportNoOverwrite,
  type GateDDatabaseProbeName,
  type GateDDatabaseProbeTiming,
  type GateDEvidenceJournal,
  type GateDReadOnlyDatabaseProbe
} from "../../../../../../agent-runtime/src/baseline/formalSoakExecution.ts";
import {
  DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
  buildDeterministicBaselineWorkload,
  collectRuntimeBaselineSample,
  createRuntimeBaselineReport,
  type RuntimeBaselineEventObservation,
  type RuntimeBaselineSampleInput
} from "../../../../../../agent-runtime/src/baseline/localBaseline.ts";
import {
  probeGateDJavaFixtures,
  probeGateDMcpFixture
} from "../../../../../../agent-runtime/src/baseline/formalSoakCli.ts";

const DURATION_MS = 600_000;
const SAMPLE_INTERVAL_MS = 30_000;
const REQUIRED_SAMPLES = DURATION_MS / SAMPLE_INTERVAL_MS;
const RUNTIME_PORT = 3_102;
const BACKLOG_LIMIT = 1_000;
const SUSTAINED_SAMPLES = 10;
const ATTEMPT_004_LAST_QUARTILE_ADMISSION_MEDIAN_MS = 182.760;
const MINIMUM_IMPROVEMENT_RATIO = 0.30;
const MINIMUM_DATABASE_BYTES = 3_500_000_000;
const MINIMUM_FREE_BYTES = 2_000_000_000;
const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const MATURE_CLONE_PARENT = /^\/private\/tmp\/openharness-gate-r5\.[A-Za-z0-9]+$/;
const SOURCE_TARGETS = [
  "agent-runtime/src",
  "agent-runtime/package.json",
  "agent-runtime/fixtures/mcp/qualification-server.ts",
  "packages/shared-schema/src",
  "packages/shared-schema/package.json",
  "backend/src",
  "backend/pom.xml",
  "package.json",
  "pnpm-lock.yaml"
] as const;

interface CliInput {
  projectRoot: string;
  runId: string;
  javaUrl: string;
  mcpConfigPath: string;
  sqlitePath: string;
  sourceDatabaseSha256: string;
  reportPath: string;
  journalPath: string;
  javaLogPath: string;
  planPath: string;
  validateOnly: boolean;
  serviceToken: string;
}

interface BoundState {
  sourceStateSha256: string;
  runnerSha256: string;
  planSha256: string;
  mcpConfigSha256: string;
  databaseCloneStartSha256: string;
}

interface DatabaseIdentity {
  dev: number;
  ino: number;
}

interface OutboxSnapshot {
  messageHighWatermark: number;
  executionHighWatermark: number;
  approvalHighWatermark: number;
  runtimeEventHighWatermark: number;
  pendingTraceEvents: number;
  retryTraceEvents: number;
  deadLetterTraceEvents: number;
}

interface MatureEventRow extends RuntimeBaselineEventObservation {
  rowId: number;
}

interface OracleObservation {
  eventObservations: RuntimeBaselineEventObservation[];
  hardFailures: string[];
  timings: GateDDatabaseProbeTiming[];
}

interface ShortQualification {
  admissionMedianMs: number | null;
  admissionLongestConsecutiveAboveThreshold: number;
  replayMedianMs: number | null;
  replayLongestConsecutiveAboveThreshold: number;
  improvementRatioFromAttempt004LastQuartile: number | null;
  qualified: boolean;
}

class MatureDatabaseIncrementalOracle {
  private readonly lastCursorByScope = new Map<string, number>();

  constructor(
    private lastRowId: number,
    private lastMessageRowId: number
  ) {}

  read(database: GateDReadOnlyDatabaseProbe): OracleObservation {
    const timings: GateDDatabaseProbeTiming[] = [];
    const hardFailures: string[] = [];
    const previousRowId = this.lastRowId;
    const eventSql = `
      SELECT rowid AS rowId, tenant_id AS tenantId, user_id AS userId,
             conversation_id AS conversationId, cursor, event_id AS eventId
      FROM runtime_events
      WHERE rowid > ${previousRowId}
      ORDER BY rowid ASC
    `;
    const rows = timed(
      timings,
      "incremental-events",
      () => database.all<MatureEventRow>(eventSql),
      value => value.length
    );
    const nextRowId = rows.at(-1)?.rowId ?? previousRowId;
    const stagedCursors = new Map<string, number>();
    const batchEventIds = new Set<string>();
    const batchCursors = new Set<string>();

    for (const row of rows) {
      const scope = scopeKey(row);
      const previousCursor = stagedCursors.get(scope) ?? this.lastCursorByScope.get(scope);
      if (previousCursor !== undefined && row.cursor <= previousCursor) {
        hardFailures.push("EVENT_ORDERING_FAILURE");
      }
      stagedCursors.set(scope, row.cursor);
      const eventIdentity = `${scope}\u0000${row.eventId}`;
      const cursorIdentity = `${scope}\u0000${row.cursor}`;
      if (batchEventIds.has(eventIdentity) || batchCursors.has(cursorIdentity)) {
        hardFailures.push("DUPLICATE_DURABLE_EVENT");
      }
      batchEventIds.add(eventIdentity);
      batchCursors.add(cursorIdentity);
    }

    const deadLetterSql = `
      SELECT EXISTS(
        SELECT 1 FROM runtime_events
        WHERE kind = 'trace' AND delivery_status = 'dead_letter'
        LIMIT 1
      ) AS count
    `;
    if (timed(
      timings,
      "dead-letter",
      () => countQuery(database, deadLetterSql),
      value => value
    ) > 0) {
      hardFailures.push("DEAD_LETTER_OUTBOX");
    }

    const orphanedApprovalSql = `
      SELECT COUNT(*) AS count
      FROM approvals a
      LEFT JOIN executions e
        ON e.execution_id = a.execution_id AND e.tenant_id = a.tenant_id
       AND e.user_id = a.user_id AND e.conversation_id = a.conversation_id
      WHERE a.status = 'pending'
        AND (e.execution_id IS NULL OR e.status NOT IN ('running','waiting_approval'))
    `;
    if (timed(
      timings,
      "orphaned-approval",
      () => countQuery(database, orphanedApprovalSql),
      value => value
    ) > 0) {
      hardFailures.push("ORPHANED_APPROVAL");
    }

    const duplicateStartedAt = performance.now();
    const duplicateCount = new Set(hardFailures).has("DUPLICATE_DURABLE_EVENT") ? 1 : 0;
    timings.push({
      probe: "duplicate-event",
      durationMs: Math.max(0, performance.now() - duplicateStartedAt),
      rowCount: duplicateCount
    });

    const sqliteBusySql = `
      SELECT COUNT(*) AS count
      FROM runtime_events
      WHERE rowid > ${previousRowId}
        AND rowid <= ${nextRowId}
        AND payload_json LIKE '%SQLITE_BUSY%'
    `;
    if (timed(
      timings,
      "sqlite-busy",
      () => countQuery(database, sqliteBusySql),
      value => value
    ) > 0) {
      hardFailures.push("SQLITE_BUSY_RETRY_EXHAUSTED");
    }

    const eventCanarySql = `
      SELECT COUNT(*) AS count
      FROM runtime_events
      WHERE rowid > ${previousRowId}
        AND rowid <= ${nextRowId}
        AND payload_json LIKE '%OPENHARNESS_SECRET_CANARY%'
    `;
    const eventCanaryCount = timed(
      timings,
      "event-secret-canary",
      () => countQuery(database, eventCanarySql),
      value => value
    );
    const messageCanarySql = `
      SELECT COALESCE(MAX(rowid), ${this.lastMessageRowId}) AS maxRowId,
             COALESCE(SUM(
               CASE WHEN content_json LIKE '%OPENHARNESS_SECRET_CANARY%' THEN 1 ELSE 0 END
             ), 0) AS count
      FROM messages
      WHERE rowid > ${this.lastMessageRowId}
    `;
    const messageObservation = timed(
      timings,
      "message-secret-canary",
      () => database.get<{ count: number; maxRowId: number }>(messageCanarySql)
        ?? { count: 0, maxRowId: this.lastMessageRowId },
      value => Math.max(0, Number(value.count ?? 0))
    );
    if (eventCanaryCount > 0 || Number(messageObservation.count) > 0) {
      hardFailures.push("SECRET_CANARY_LEAK");
    }

    const observedMessageRowId = Number(messageObservation.maxRowId);
    if (
      Number.isSafeInteger(observedMessageRowId)
      && observedMessageRowId >= this.lastMessageRowId
    ) {
      this.lastMessageRowId = observedMessageRowId;
    }
    this.lastRowId = nextRowId;
    for (const [scope, cursor] of stagedCursors) this.lastCursorByScope.set(scope, cursor);

    return {
      eventObservations: rows.map(({ rowId: _rowId, ...observation }) => observation),
      hardFailures: [...new Set(hardFailures)],
      timings
    };
  }
}

function parseCli(argv: string[]): CliInput {
  const values = [...argv];
  const validateOnlyIndex = values.indexOf("--validate-only");
  const validateOnly = validateOnlyIndex >= 0;
  if (validateOnly) values.splice(validateOnlyIndex, 1);
  if (values.length % 2 !== 0) throw new Error("invalid_argument_shape");
  const flags = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index]!;
    const value = values[index + 1]!;
    if (!name.startsWith("--") || flags.has(name) || !value) throw new Error("invalid_argument");
    flags.set(name, value);
  }
  const required = [
    "--project-root",
    "--run-id",
    "--java-url",
    "--mcp-config",
    "--sqlite-path",
    "--source-database-sha256",
    "--report",
    "--journal",
    "--java-log",
    "--plan"
  ] as const;
  if (flags.size !== required.length || required.some(flag => !flags.has(flag))) {
    throw new Error("invalid_argument_set");
  }

  const projectRoot = realpathSync(flags.get("--project-root")!);
  const runId = flags.get("--run-id")!;
  if (!RUN_ID.test(runId)) throw new Error("invalid_run_id");
  const javaUrl = loopbackOrigin(flags.get("--java-url")!);
  const mcpConfigPath = canonicalInput(projectRoot, flags.get("--mcp-config")!);
  const javaLogPath = canonicalInput(projectRoot, flags.get("--java-log")!);
  const planPath = canonicalInput(projectRoot, flags.get("--plan")!);
  const sqlitePath = canonicalMatureClone(flags.get("--sqlite-path")!);
  const sourceDatabaseSha256 = flags.get("--source-database-sha256")!;
  if (!HASH.test(sourceDatabaseSha256)) throw new Error("invalid_source_database_hash");
  const reportPath = canonicalOutput(projectRoot, flags.get("--report")!);
  const journalPath = canonicalOutput(projectRoot, flags.get("--journal")!);
  if (reportPath === journalPath) throw new Error("duplicate_output_path");
  const mcpMode = statSync(mcpConfigPath).mode & 0o777;
  if (mcpMode !== 0o600) throw new Error("mcp_config_mode_mismatch");
  const serviceToken = process.env.OPENHARNESS_SERVICE_TOKEN?.trim() ?? "";
  if (!serviceToken || /\s|Bearer/i.test(serviceToken)) throw new Error("service_token_unavailable");

  return {
    projectRoot,
    runId,
    javaUrl,
    mcpConfigPath,
    sqlitePath,
    sourceDatabaseSha256,
    reportPath,
    journalPath,
    javaLogPath,
    planPath,
    validateOnly,
    serviceToken
  };
}

async function preflight(input: CliInput): Promise<BoundState> {
  await assertPortFree(RUNTIME_PORT);
  await assertJavaHealthy(input.javaUrl);
  await probeGateDJavaFixtures({ javaUrl: input.javaUrl, serviceToken: input.serviceToken });
  await probeGateDMcpFixture(input.mcpConfigPath);
  const databaseBytes = statSync(input.sqlitePath).size;
  if (databaseBytes < MINIMUM_DATABASE_BYTES) throw new Error("mature_database_too_small");
  assertDiskHeadroom(dirname(input.sqlitePath));
  const state = boundState(input);
  if (state.databaseCloneStartSha256 !== input.sourceDatabaseSha256) {
    throw new Error("database_clone_hash_mismatch");
  }
  for (const value of Object.values(state)) {
    if (!HASH.test(value)) throw new Error("invalid_bound_state_hash");
  }
  const database = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
  try {
    assertGateDSeededConversationCount(database);
    assertDatabaseIntegrity(database);
    const outbox = readOutboxSnapshot(database);
    if (outbox.deadLetterTraceEvents > 0) throw new Error("mature_database_dead_letter");
  } finally {
    database.close();
  }
  return state;
}

function boundState(input: CliInput): BoundState {
  return {
    sourceStateSha256: hashSourceState(input.projectRoot),
    runnerSha256: hashFile(realpathSync(fileURLToPath(import.meta.url))),
    planSha256: hashFile(input.planPath),
    mcpConfigSha256: hashFile(input.mcpConfigPath),
    databaseCloneStartSha256: hashLargeFile(input.sqlitePath)
  };
}

async function runRegression(input: CliInput, initialState: BoundState): Promise<number> {
  const identity = readDatabaseIdentity(input.sqlitePath);
  const databaseStartBytes = statSync(input.sqlitePath).size;
  const initialDatabase = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
  let initialOutbox: OutboxSnapshot;
  try {
    assertGateDSeededConversationCount(initialDatabase);
    assertDatabaseIntegrity(initialDatabase);
    initialOutbox = readOutboxSnapshot(initialDatabase);
  } finally {
    initialDatabase.close();
  }
  const oracle = new MatureDatabaseIncrementalOracle(
    initialOutbox.runtimeEventHighWatermark,
    initialOutbox.messageHighWatermark
  );
  const journal = createGateDEvidenceJournal(input.journalPath);
  const samples: RuntimeBaselineSampleInput[] = [];
  const runFailures = new Set<string>();
  let supervisor: GateDRuntimeSupervisor | undefined;
  let continuous: GateDContinuousWorkload | undefined;
  let samplingStartedAt = 0;
  let samplingCompletedAt = 0;
  let backlogBreachSamples = 0;
  const javaLogStartBytes = statSync(input.javaLogPath).size;
  let javaLogEndBytes = javaLogStartBytes;
  let finalOutbox = initialOutbox;
  let databaseEndBytes = databaseStartBytes;
  let runtimeCleanupVerified = false;
  let operatorInterrupted = false;
  const interrupt = () => {
    operatorInterrupted = true;
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  journal.append({
    kind: "mature_database_bound",
    runId: input.runId,
    databaseCloneStartSha256: initialState.databaseCloneStartSha256,
    databaseStartBytes,
    initialOutbox
  });

  try {
    const runtimeUrl = `http://127.0.0.1:${RUNTIME_PORT}`;
    const childEntrypoint = join(
      input.projectRoot,
      "agent-runtime/src/baseline/formalSoakRuntimeChild.ts"
    );
    supervisor = new GateDRuntimeSupervisor({
      spawnChild: async () => spawnGateDRuntimeManagedChild({
        spec: buildGateDRuntimeChildSpawnSpec({
          childEntrypoint,
          databasePath: input.sqlitePath,
          mcpConfigPath: input.mcpConfigPath,
          javaBaseUrl: input.javaUrl,
          runtimePort: RUNTIME_PORT,
          serviceToken: input.serviceToken,
          expectedDatabaseIdentity: identity,
          baseEnvironment: { ...process.env, COMPRESSION_AUTO: "false" }
        }),
        journal
      }),
      waitUntilReady: child => waitUntilGateDRuntimeReady(child, {
        runtimeUrl,
        serviceToken: input.serviceToken
      })
    });
    await supervisor.start();
    journal.append({ kind: "runtime_started", runId: input.runId, pid: supervisor.currentPid });
    writeCheckpoint({ kind: "runtime_started", pid: supervisor.currentPid });

    const transport = new GateDRuntimeHttpTransport({
      runtimeUrl,
      serviceToken: input.serviceToken
    });
    const driver = new GateDWorkloadDriver(transport);
    const workload = buildDeterministicBaselineWorkload({
      seededConversations: 10_000,
      concurrency: 20
    });
    continuous = new GateDContinuousWorkload(driver, workload.operations);
    continuous.start();
    samplingStartedAt = performance.now();

    for (let sampleIndex = 0; sampleIndex < REQUIRED_SAMPLES; sampleIndex += 1) {
      const target = samplingStartedAt + (sampleIndex + 1) * SAMPLE_INTERVAL_MS;
      await delay(Math.max(0, target - performance.now()));
      const sampledAt = new Date().toISOString();
      const hardFailures = new Set<string>([
        ...supervisor.hardFailures,
        ...continuous.hardFailures
      ]);
      if (operatorInterrupted) hardFailures.add("OPERATOR_INTERRUPTION");

      const metrics = driver.drainMetrics();
      metrics.hardFailures.forEach(failure => hardFailures.add(failure));
      if (
        metrics.admissionLatenciesMs.length === 0
        || metrics.durableReplayLatenciesMs.length === 0
      ) {
        hardFailures.add("WORKLOAD_OBSERVATION_MISSING");
      }

      const pid = supervisor.currentPid;
      let processSnapshot = { rssBytes: 0, openFileDescriptors: 0, mcpChildCount: 0 };
      if (pid === undefined) {
        hardFailures.add("RUNTIME_CHILD_NOT_RUNNING");
      } else {
        try {
          processSnapshot = readGateDChildProcessSnapshot(pid);
        } catch {
          hardFailures.add("PROCESS_METRIC_PROBE_FAILURE");
        }
      }

      try {
        if (!await probeRuntimeReady(runtimeUrl, input.serviceToken)) {
          hardFailures.add("RUNTIME_READINESS_DEGRADED");
        }
      } catch {
        hardFailures.add("RUNTIME_READINESS_PROBE_FAILURE");
      }
      try {
        if (!await javaHealthy(input.javaUrl)) hardFailures.add("JAVA_GATEWAY_UNAVAILABLE");
      } catch {
        hardFailures.add("JAVA_GATEWAY_PROBE_FAILURE");
      }
      try {
        const operation = workload.operations[sampleIndex % workload.operations.length]!;
        for (const failure of await transport.probeScopeIsolation(operation)) {
          hardFailures.add(failure);
        }
      } catch {
        hardFailures.add("SCOPE_ISOLATION_PROBE_FAILURE");
      }

      let oracleObservation: OracleObservation = {
        eventObservations: [],
        hardFailures: [],
        timings: []
      };
      let outbox = emptyOutboxSnapshot();
      let databaseBytes = 0;
      try {
        const database = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
        try {
          oracleObservation = oracle.read(database);
          oracleObservation.hardFailures.forEach(failure => hardFailures.add(failure));
          outbox = readOutboxSnapshot(database);
          databaseBytes = statSync(input.sqlitePath).size;
        } finally {
          database.close();
        }
      } catch {
        hardFailures.add("DATABASE_EVIDENCE_PROBE_FAILURE");
      }

      if (outbox.deadLetterTraceEvents > 0) hardFailures.add("DEAD_LETTER_OUTBOX");
      const traceBacklog = outbox.pendingTraceEvents + outbox.retryTraceEvents;
      backlogBreachSamples = traceBacklog > BACKLOG_LIMIT ? backlogBreachSamples + 1 : 0;
      if (backlogBreachSamples >= SUSTAINED_SAMPLES) {
        hardFailures.add("SUSTAINED_TRACE_OUTBOX_BACKLOG");
      }
      try {
        javaLogEndBytes = statSync(input.javaLogPath).size;
      } catch {
        hardFailures.add("JAVA_LOG_PROBE_FAILURE");
      }

      const sample = collectRuntimeBaselineSample({
        sampledAt,
        admissionLatenciesMs: metrics.admissionLatenciesMs,
        durableReplayLatenciesMs: metrics.durableReplayLatenciesMs,
        walPath: `${input.sqlitePath}-wal`,
        readRssBytes: () => processSnapshot.rssBytes,
        readOpenFileDescriptors: () => processSnapshot.openFileDescriptors,
        mcpChildCount: processSnapshot.mcpChildCount,
        hardFailures: [...hardFailures],
        operations: workload.operations,
        eventObservations: [
          ...metrics.eventObservations,
          ...oracleObservation.eventObservations
        ]
      });
      samples.push(sample);
      const oracleDurationMs = oracleObservation.timings.reduce(
        (total, timing) => total + timing.durationMs,
        0
      );
      const checkpoint = {
        kind: "sample_checkpoint",
        sampleIndex,
        sampledAt,
        admissionP95Ms: sample.admissionP95Ms,
        durableReplayP95Ms: sample.durableReplayP95Ms,
        rssBytes: sample.rssBytes,
        openFileDescriptors: sample.openFileDescriptors,
        walBytes: sample.walBytes,
        mcpChildCount: sample.mcpChildCount,
        oracleDurationMs,
        probeTimings: oracleObservation.timings,
        databaseBytes,
        ...outbox,
        traceBacklog,
        javaLogBytes: javaLogEndBytes,
        hardFailures: sample.hardFailures
      };
      journal.append(checkpoint);
      writeCheckpoint({
        kind: checkpoint.kind,
        sampleIndex,
        admissionP95Ms: sample.admissionP95Ms,
        durableReplayP95Ms: sample.durableReplayP95Ms,
        rssMiB: Math.round(sample.rssBytes / 1_048_576),
        fd: sample.openFileDescriptors,
        walMiB: Math.round(sample.walBytes / 1_048_576),
        traceBacklog,
        deadLetter: outbox.deadLetterTraceEvents,
        oracleDurationMs,
        hardFailures: sample.hardFailures
      });
      if (sample.hardFailures.length > 0) break;
    }
    samplingCompletedAt = performance.now();
  } catch (error) {
    runFailures.add("MATURE_REGRESSION_EXECUTION_FAILURE");
    writeCheckpoint({
      kind: "execution_error",
      errorClass: error instanceof Error ? error.name : "UnknownError"
    });
  } finally {
    try {
      await continuous?.stop();
    } catch {
      runFailures.add("WORKLOAD_STOP_FAILURE");
    }
    try {
      await supervisor?.stop();
    } catch {
      runFailures.add("RUNTIME_STOP_FAILURE");
    }
    try {
      await assertPortFree(RUNTIME_PORT);
      runtimeCleanupVerified = true;
    } catch {
      runFailures.add("RUNTIME_PROCESS_CLEANUP_FAILURE");
    }
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }

  if (samples.length !== REQUIRED_SAMPLES) {
    runFailures.add("MATURE_REGRESSION_SAMPLE_COUNT_MISMATCH");
  }
  if (samplingCompletedAt - samplingStartedAt < DURATION_MS) {
    runFailures.add("MATURE_REGRESSION_DURATION_INCOMPLETE");
  }
  try {
    const database = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
    try {
      assertDatabaseIntegrity(database);
      finalOutbox = readOutboxSnapshot(database);
      if (finalOutbox.deadLetterTraceEvents > 0) runFailures.add("DEAD_LETTER_OUTBOX");
      databaseEndBytes = statSync(input.sqlitePath).size;
    } finally {
      database.close();
    }
  } catch {
    runFailures.add("SQLITE_FINAL_INTEGRITY_PROBE_FAILURE");
  }

  let finalState: Omit<BoundState, "databaseCloneStartSha256"> | undefined;
  try {
    const state = boundStateWithoutDatabase(input);
    finalState = state;
    if (state.sourceStateSha256 !== initialState.sourceStateSha256) {
      runFailures.add("SOURCE_STATE_CHANGED");
    }
    if (state.runnerSha256 !== initialState.runnerSha256) {
      runFailures.add("RUNNER_STATE_CHANGED");
    }
    if (state.planSha256 !== initialState.planSha256) {
      runFailures.add("PLAN_STATE_CHANGED");
    }
    if (state.mcpConfigSha256 !== initialState.mcpConfigSha256) {
      runFailures.add("MCP_CONFIG_STATE_CHANGED");
    }
  } catch {
    runFailures.add("FINAL_STATE_BINDING_FAILURE");
  }
  try {
    javaLogEndBytes = statSync(input.javaLogPath).size;
  } catch {
    runFailures.add("JAVA_LOG_PROBE_FAILURE");
  }
  if (
    containsCredentialMarker(readFileSync(input.javaLogPath, "utf8"), input.serviceToken)
    || containsCredentialMarker(readFileSync(input.journalPath, "utf8"), input.serviceToken)
  ) {
    runFailures.add("CREDENTIAL_MARKER_IN_EVIDENCE");
  }

  const measuredQualification = evaluateShortQualification(samples);
  if (samples.length === REQUIRED_SAMPLES) {
    if (
      measuredQualification.admissionMedianMs === null
      || measuredQualification.admissionMedianMs > 100
    ) {
      runFailures.add("SHORT_REGRESSION_ADMISSION_MEDIAN_EXCEEDED");
    }
    if (measuredQualification.admissionLongestConsecutiveAboveThreshold > 2) {
      runFailures.add("SHORT_REGRESSION_ADMISSION_CONSECUTIVE_BREACH");
    }
    if (
      measuredQualification.replayMedianMs === null
      || measuredQualification.replayMedianMs > 250
    ) {
      runFailures.add("SHORT_REGRESSION_REPLAY_MEDIAN_EXCEEDED");
    }
    if (measuredQualification.replayLongestConsecutiveAboveThreshold > 2) {
      runFailures.add("SHORT_REGRESSION_REPLAY_CONSECUTIVE_BREACH");
    }
    if (
      measuredQualification.improvementRatioFromAttempt004LastQuartile === null
      || measuredQualification.improvementRatioFromAttempt004LastQuartile
        < MINIMUM_IMPROVEMENT_RATIO
    ) {
      runFailures.add("SHORT_REGRESSION_IMPROVEMENT_INSUFFICIENT");
    }
  }
  const qualification: ShortQualification = {
    ...measuredQualification,
    qualified: measuredQualification.qualified && runFailures.size === 0
  };
  appendFailures(samples, runFailures);

  const completedAt = new Date().toISOString();
  const report = createRuntimeBaselineReport({
    track: "local",
    generatedAt: completedAt,
    workload: buildDeterministicBaselineWorkload({
      seededConversations: 10_000,
      concurrency: 20
    }),
    environment: {
      baselineKind: "mature-database-10-minute-regression",
      evidenceKind: "local-mature-database-performance-regression",
      qualificationBoundary: "attempt-005-eligibility-only",
      runId: input.runId,
      runComplete: samples.length === REQUIRED_SAMPLES && runFailures.size === 0,
      workloadSeededThisRun: false,
      workloadChanged: false,
      thresholdsChanged: false,
      outboxEnabled: true,
      oracleMode: "formal-incremental-from-bound-mature-high-watermark",
      durationMs: DURATION_MS,
      actualSamplingDurationMs: Math.max(0, samplingCompletedAt - samplingStartedAt),
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      expectedSampleCount: REQUIRED_SAMPLES,
      runtimePort: RUNTIME_PORT,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      databaseBasename: basename(input.sqlitePath),
      databaseStartBytes,
      databaseEndBytes,
      databaseCloneStartSha256: initialState.databaseCloneStartSha256,
      initialOutbox,
      finalOutbox,
      javaLogBasename: basename(input.javaLogPath),
      javaLogStartBytes,
      javaLogEndBytes,
      javaLogGrowthBytes: Math.max(0, javaLogEndBytes - javaLogStartBytes),
      runtimeCleanupVerified,
      sourceStateSha256: initialState.sourceStateSha256,
      finalSourceStateSha256: finalState?.sourceStateSha256 ?? null,
      runnerSha256: initialState.runnerSha256,
      planSha256: initialState.planSha256,
      mcpConfigSha256: initialState.mcpConfigSha256,
      qualification
    },
    thresholds: {
      ...DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
      mcpChildCount: 1
    },
    samples
  });
  if (JSON.stringify(report).includes(input.serviceToken)) {
    throw new Error("report_contains_service_token");
  }
  journal.append({
    kind: "regression_completed",
    runId: input.runId,
    result: report.result,
    sampleCount: report.samples.length,
    failureCodes: report.failures.map(failure => failure.code),
    qualification,
    reportHash: report.reportHash
  });
  journal.close();
  writeGateDReportNoOverwrite(report, input.reportPath);
  writeCheckpoint({
    kind: "regression_completed",
    result: report.result,
    sampleCount: report.samples.length,
    failures: report.failures.map(failure => failure.code),
    qualification,
    reportHash: report.reportHash
  });
  return (
    report.result === "local_verified"
    && report.samples.length === REQUIRED_SAMPLES
    && qualification.qualified
  ) ? 0 : 2;
}

function readOutboxSnapshot(database: GateDReadOnlyDatabaseProbe): OutboxSnapshot {
  const row = database.get<OutboxSnapshot>(`
    SELECT
      (SELECT COALESCE(MAX(rowid), 0) FROM messages) AS messageHighWatermark,
      (SELECT COALESCE(MAX(rowid), 0) FROM executions) AS executionHighWatermark,
      (SELECT COALESCE(MAX(rowid), 0) FROM approvals) AS approvalHighWatermark,
      (SELECT COALESCE(MAX(rowid), 0) FROM runtime_events) AS runtimeEventHighWatermark,
      (SELECT COUNT(*) FROM runtime_events INDEXED BY runtime_event_trace_outbox
        WHERE kind = 'trace' AND delivery_status IN ('pending','retry')
          AND delivery_status = 'pending') AS pendingTraceEvents,
      (SELECT COUNT(*) FROM runtime_events INDEXED BY runtime_event_trace_outbox
        WHERE kind = 'trace' AND delivery_status IN ('pending','retry')
          AND delivery_status = 'retry') AS retryTraceEvents,
      (SELECT COUNT(*) FROM runtime_events INDEXED BY runtime_event_trace_dead_letter
        WHERE kind = 'trace' AND delivery_status = 'dead_letter') AS deadLetterTraceEvents
  `);
  if (!row) throw new Error("outbox_snapshot_missing");
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, nonNegativeInteger(value)])
  ) as unknown as OutboxSnapshot;
}

function emptyOutboxSnapshot(): OutboxSnapshot {
  return {
    messageHighWatermark: 0,
    executionHighWatermark: 0,
    approvalHighWatermark: 0,
    runtimeEventHighWatermark: 0,
    pendingTraceEvents: 0,
    retryTraceEvents: 0,
    deadLetterTraceEvents: 0
  };
}

function evaluateShortQualification(samples: RuntimeBaselineSampleInput[]): ShortQualification {
  const admission = samples.map(sample => sample.admissionP95Ms);
  const replay = samples.map(sample => sample.durableReplayP95Ms);
  const admissionMedianMs = median(admission);
  const replayMedianMs = median(replay);
  const improvementRatioFromAttempt004LastQuartile = admissionMedianMs === null
    ? null
    : (ATTEMPT_004_LAST_QUARTILE_ADMISSION_MEDIAN_MS - admissionMedianMs)
      / ATTEMPT_004_LAST_QUARTILE_ADMISSION_MEDIAN_MS;
  const admissionLongestConsecutiveAboveThreshold = longestConsecutive(
    admission,
    value => value > 100
  );
  const replayLongestConsecutiveAboveThreshold = longestConsecutive(
    replay,
    value => value > 250
  );
  const qualified = samples.length === REQUIRED_SAMPLES
    && admissionMedianMs !== null
    && admissionMedianMs <= 100
    && admissionLongestConsecutiveAboveThreshold <= 2
    && replayMedianMs !== null
    && replayMedianMs <= 250
    && replayLongestConsecutiveAboveThreshold <= 2
    && improvementRatioFromAttempt004LastQuartile !== null
    && improvementRatioFromAttempt004LastQuartile >= MINIMUM_IMPROVEMENT_RATIO
    && samples.every(sample => sample.hardFailures.length === 0);
  return {
    admissionMedianMs,
    admissionLongestConsecutiveAboveThreshold,
    replayMedianMs,
    replayLongestConsecutiveAboveThreshold,
    improvementRatioFromAttempt004LastQuartile,
    qualified
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function longestConsecutive(values: number[], predicate: (value: number) => boolean): number {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = predicate(value) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function appendFailures(samples: RuntimeBaselineSampleInput[], failures: ReadonlySet<string>): void {
  if (failures.size === 0) return;
  if (samples.length === 0) {
    samples.push({
      sampledAt: new Date().toISOString(),
      admissionP95Ms: 0,
      durableReplayP95Ms: 0,
      rssBytes: 0,
      openFileDescriptors: 0,
      walBytes: 0,
      mcpChildCount: 0,
      hardFailures: [...failures]
    });
    return;
  }
  const last = samples[samples.length - 1]!;
  last.hardFailures = [...new Set([...last.hardFailures, ...failures])];
}

async function probeRuntimeReady(runtimeUrl: string, serviceToken: string): Promise<boolean> {
  const response = await fetch(`${runtimeUrl}/api/v1/health/ready`, {
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      "X-Tenant-Id": "gate-r5-readiness",
      "X-User-Id": "gate-r5-readiness",
      "X-Trace-Id": "gate-r5-readiness",
      "X-Request-Id": "gate-r5-readiness"
    },
    signal: AbortSignal.timeout(2_000)
  });
  return response.ok;
}

async function assertJavaHealthy(javaUrl: string): Promise<void> {
  if (!await javaHealthy(javaUrl)) throw new Error("java_gateway_unhealthy");
}

async function javaHealthy(javaUrl: string): Promise<boolean> {
  const response = await fetch(`${javaUrl}/actuator/health`, {
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) return false;
  const body = await response.json() as { status?: unknown };
  return body.status === "UP";
}

function assertDatabaseIntegrity(database: GateDReadOnlyDatabaseProbe): void {
  const result = database.get<Record<string, unknown>>("PRAGMA integrity_check");
  const value = result ? Object.values(result)[0] : undefined;
  if (value !== "ok") throw new Error("sqlite_integrity_failure");
}

function readDatabaseIdentity(path: string): DatabaseIdentity {
  const descriptor = openSync(path, "r");
  try {
    const identity = fstatSync(descriptor);
    return { dev: identity.dev, ino: identity.ino };
  } finally {
    closeSync(descriptor);
  }
}

function hashSourceState(projectRoot: string): string {
  const files = SOURCE_TARGETS.flatMap(target => collectFiles(projectRoot, target)).sort();
  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(join(projectRoot, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function collectFiles(projectRoot: string, relativePath: string): string[] {
  const absolutePath = join(projectRoot, relativePath);
  const metadata = lstatSync(absolutePath);
  if (metadata.isSymbolicLink()) throw new Error("bound_source_symlink");
  if (metadata.isFile()) return [relativePath];
  if (!metadata.isDirectory()) throw new Error("unsupported_bound_source");
  return readdirSync(absolutePath)
    .sort()
    .flatMap(name => collectFiles(projectRoot, join(relativePath, name)));
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

function boundStateWithoutDatabase(
  input: CliInput
): Omit<BoundState, "databaseCloneStartSha256"> {
  return {
    sourceStateSha256: hashSourceState(input.projectRoot),
    runnerSha256: hashFile(realpathSync(fileURLToPath(import.meta.url))),
    planSha256: hashFile(input.planPath),
    mcpConfigSha256: hashFile(input.mcpConfigPath)
  };
}

function canonicalInput(projectRoot: string, value: string): string {
  if (!isAbsolute(value)) throw new Error("input_path_not_absolute");
  const canonical = realpathSync(value);
  assertWithin(projectRoot, canonical);
  if (!statSync(canonical).isFile()) throw new Error("input_path_not_file");
  return canonical;
}

function canonicalMatureClone(value: string): string {
  if (!isAbsolute(value)) throw new Error("sqlite_path_not_absolute");
  const canonical = realpathSync(value);
  if (!statSync(canonical).isFile()) throw new Error("sqlite_path_not_file");
  if (!MATURE_CLONE_PARENT.test(dirname(canonical))) {
    throw new Error("sqlite_path_not_gate_r5_temp_clone");
  }
  if (!basename(canonical).endsWith(".sqlite")) throw new Error("sqlite_path_not_sqlite");
  return canonical;
}

function canonicalOutput(projectRoot: string, value: string): string {
  if (!isAbsolute(value)) throw new Error("output_path_not_absolute");
  const resolved = resolve(value);
  const parent = realpathSync(dirname(resolved));
  const canonical = join(parent, basename(resolved));
  assertWithin(projectRoot, canonical);
  if (existsSync(canonical)) throw new Error("output_path_exists");
  return canonical;
}

function assertWithin(projectRoot: string, candidate: string): void {
  const path = relative(projectRoot, candidate);
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error("path_outside_project");
  }
}

function loopbackOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password) {
    throw new Error("java_url_not_loopback_http");
  }
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("java_url_not_origin");
  return url.origin;
}

async function assertPortFree(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close(error => error ? reject(error) : resolvePromise());
    });
  });
}

function assertDiskHeadroom(path: string): void {
  const filesystem = statfsSync(path);
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (!Number.isFinite(availableBytes) || availableBytes < MINIMUM_FREE_BYTES) {
    throw new Error("insufficient_temp_disk_headroom");
  }
}

function countQuery(database: GateDReadOnlyDatabaseProbe, sql: string): number {
  const row = database.get<{ count: number }>(sql);
  return nonNegativeInteger(row?.count);
}

function timed<T>(
  timings: GateDDatabaseProbeTiming[],
  probe: GateDDatabaseProbeName,
  query: () => T,
  rowCount: (value: T) => number
): T {
  const startedAt = performance.now();
  const value = query();
  timings.push({
    probe,
    durationMs: Math.max(0, performance.now() - startedAt),
    rowCount: Math.max(0, Math.floor(rowCount(value)))
  });
  return value;
}

function scopeKey(value: { tenantId: string; userId: string; conversationId: string }): string {
  return JSON.stringify([value.tenantId, value.userId, value.conversationId]);
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("invalid_database_counter");
  return number;
}

function containsCredentialMarker(value: string, serviceToken: string): boolean {
  return value.includes(serviceToken)
    || /\bBearer\s+\S+/i.test(value)
    || /\bsk-[A-Za-z0-9_-]+/.test(value)
    || /OPENHARNESS_SERVICE_TOKEN\s*=/i.test(value)
    || /OPENHARNESS_SECRET_CANARY/.test(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function writeCheckpoint(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<number> {
  const input = parseCli(process.argv.slice(2));
  const state = await preflight(input);
  if (input.validateOnly) {
    writeCheckpoint({
      kind: "preflight_completed",
      result: "ok",
      runId: input.runId,
      sourceStateSha256: state.sourceStateSha256,
      runnerSha256: state.runnerSha256,
      planSha256: state.planSha256,
      mcpConfigSha256: state.mcpConfigSha256,
      databaseCloneStartSha256: state.databaseCloneStartSha256,
      databaseBytes: statSync(input.sqlitePath).size
    });
    return 0;
  }
  return await runRegression(input, state);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(`${JSON.stringify({
        result: "blocked",
        errorClass: error instanceof Error ? error.name : "UnknownError"
      })}\n`);
      process.exitCode = 2;
    });
}
