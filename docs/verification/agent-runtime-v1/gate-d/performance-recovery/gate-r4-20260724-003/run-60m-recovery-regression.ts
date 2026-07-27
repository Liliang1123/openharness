import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GateDContinuousWorkload,
  GateDDatabaseObservationCursor,
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
  type GateDDatabaseProbeTiming,
  type GateDEvidenceJournal
} from "../../../../../../agent-runtime/src/baseline/formalSoakExecution.ts";
import {
  DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
  buildDeterministicBaselineWorkload,
  collectRuntimeBaselineSample,
  createRuntimeBaselineReport,
  type RuntimeBaselineSampleInput
} from "../../../../../../agent-runtime/src/baseline/localBaseline.ts";
import {
  probeGateDJavaFixtures,
  probeGateDMcpFixture
} from "../../../../../../agent-runtime/src/baseline/formalSoakCli.ts";

const DURATION_MS = 3_600_000;
const SAMPLE_INTERVAL_MS = 30_000;
const REQUIRED_SAMPLES = DURATION_MS / SAMPLE_INTERVAL_MS;
const RUNTIME_PORT = 3_102;
const BACKLOG_LIMIT = 1_000;
const SUSTAINED_SAMPLES = 10;
const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
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
  const sqlitePath = canonicalOutput(projectRoot, flags.get("--sqlite-path")!);
  const reportPath = canonicalOutput(projectRoot, flags.get("--report")!);
  const journalPath = canonicalOutput(projectRoot, flags.get("--journal")!);
  const outputs = new Set([sqlitePath, reportPath, journalPath]);
  if (outputs.size !== 3) throw new Error("duplicate_output_path");
  for (const output of outputs) {
    if (existsSync(output)) throw new Error("output_already_exists");
  }
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
  const state = boundState(input);
  for (const value of Object.values(state)) {
    if (!HASH.test(value)) throw new Error("invalid_bound_state_hash");
  }
  return state;
}

function boundState(input: CliInput): BoundState {
  return {
    sourceStateSha256: hashSourceState(input.projectRoot),
    runnerSha256: hashFile(realpathSync(fileURLToPath(import.meta.url))),
    planSha256: hashFile(input.planPath),
    mcpConfigSha256: hashFile(input.mcpConfigPath)
  };
}

async function runRegression(input: CliInput, initialState: BoundState): Promise<number> {
  const identity = claimEmptyDatabase(input.sqlitePath);
  const journal = createGateDEvidenceJournal(input.journalPath);
  const samples: RuntimeBaselineSampleInput[] = [];
  const runFailures = new Set<string>();
  let supervisor: GateDRuntimeSupervisor | undefined;
  let continuous: GateDContinuousWorkload | undefined;
  let samplingStartedAt = 0;
  let samplingCompletedAt = 0;
  let backlogBreachSamples = 0;
  let javaLogStartBytes = statSync(input.javaLogPath).size;
  let javaLogEndBytes = javaLogStartBytes;
  let operatorInterrupted = false;
  const interrupt = () => {
    operatorInterrupted = true;
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

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
    await driver.seed(workload.operations);
    const seedMetrics = driver.drainMetrics();
    if (seedMetrics.hardFailures.length > 0) throw new Error("seed_failure");
    const seedProbe = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
    try {
      assertGateDSeededConversationCount(seedProbe);
    } finally {
      seedProbe.close();
    }
    journal.append({ kind: "seed_completed", scopedConversations: 10_000 });
    writeCheckpoint({ kind: "seed_completed", scopedConversations: 10_000 });

    const databaseTimings: GateDDatabaseProbeTiming[] = [];
    const cursor = new GateDDatabaseObservationCursor({
      mode: "formal-incremental",
      onTiming: timing => databaseTimings.push({ ...timing })
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
      if (metrics.admissionLatenciesMs.length === 0 || metrics.durableReplayLatenciesMs.length === 0) {
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
        const ready = await probeRuntimeReady(runtimeUrl, input.serviceToken);
        if (!ready) hardFailures.add("RUNTIME_READINESS_DEGRADED");
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
        for (const failure of await transport.probeScopeIsolation(operation)) hardFailures.add(failure);
      } catch {
        hardFailures.add("SCOPE_ISOLATION_PROBE_FAILURE");
      }

      databaseTimings.length = 0;
      let outbox: OutboxSnapshot = emptyOutboxSnapshot();
      let databaseEvents = [];
      let databaseBytes = 0;
      try {
        const database = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
        try {
          const observations = cursor.read(database);
          databaseEvents = observations.eventObservations;
          observations.hardFailures.forEach(failure => hardFailures.add(failure));
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
        eventObservations: [...metrics.eventObservations, ...databaseEvents]
      });
      samples.push(sample);
      const oracleDurationMs = databaseTimings.reduce(
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
        probeTimings: [...databaseTimings],
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
        hardFailures: sample.hardFailures
      });
      if (sample.hardFailures.length > 0) break;
    }
    samplingCompletedAt = performance.now();
  } catch {
    runFailures.add("RECOVERY_EXECUTION_FAILURE");
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
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }

  if (samples.length !== REQUIRED_SAMPLES) runFailures.add("RECOVERY_SAMPLE_COUNT_MISMATCH");
  if (samplingCompletedAt - samplingStartedAt < DURATION_MS) {
    runFailures.add("RECOVERY_DURATION_INCOMPLETE");
  }
  try {
    const database = openGateDReadOnlyDatabaseProbe(input.sqlitePath);
    try {
      const result = database.get<Record<string, unknown>>("PRAGMA integrity_check");
      const value = result ? Object.values(result)[0] : undefined;
      if (value !== "ok") runFailures.add("SQLITE_INTEGRITY_FAILURE");
    } finally {
      database.close();
    }
  } catch {
    runFailures.add("SQLITE_FINAL_INTEGRITY_PROBE_FAILURE");
  }

  let finalState: BoundState | undefined;
  try {
    finalState = boundState(input);
    if (finalState.sourceStateSha256 !== initialState.sourceStateSha256) {
      runFailures.add("SOURCE_STATE_CHANGED");
    }
    if (finalState.runnerSha256 !== initialState.runnerSha256) {
      runFailures.add("RUNNER_STATE_CHANGED");
    }
    if (finalState.planSha256 !== initialState.planSha256) {
      runFailures.add("PLAN_STATE_CHANGED");
    }
    if (finalState.mcpConfigSha256 !== initialState.mcpConfigSha256) {
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
      baselineKind: "fixed-60-minute-recovery-regression",
      evidenceKind: "local-performance-recovery-regression",
      qualificationBoundary: "local_verified_only",
      runId: input.runId,
      runComplete: samples.length === REQUIRED_SAMPLES && runFailures.size === 0,
      durationMs: DURATION_MS,
      actualSamplingDurationMs: Math.max(0, samplingCompletedAt - samplingStartedAt),
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      expectedSampleCount: REQUIRED_SAMPLES,
      runtimePort: RUNTIME_PORT,
      oracleMode: "formal-incremental",
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      databaseBasename: basename(input.sqlitePath),
      javaLogBasename: basename(input.javaLogPath),
      javaLogStartBytes,
      javaLogEndBytes,
      javaLogGrowthBytes: Math.max(0, javaLogEndBytes - javaLogStartBytes),
      sourceStateSha256: initialState.sourceStateSha256,
      finalSourceStateSha256: finalState?.sourceStateSha256 ?? null,
      runnerSha256: initialState.runnerSha256,
      planSha256: initialState.planSha256,
      mcpConfigSha256: initialState.mcpConfigSha256
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
    reportHash: report.reportHash
  });
  journal.close();
  writeGateDReportNoOverwrite(report, input.reportPath);
  writeCheckpoint({
    kind: "regression_completed",
    result: report.result,
    sampleCount: report.samples.length,
    failures: report.failures.map(failure => failure.code),
    reportHash: report.reportHash
  });
  return report.result === "local_verified" && report.samples.length === REQUIRED_SAMPLES ? 0 : 2;
}

function readOutboxSnapshot(
  database: ReturnType<typeof openGateDReadOnlyDatabaseProbe>
): OutboxSnapshot {
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
      "X-Tenant-Id": "gate-r4-readiness",
      "X-User-Id": "gate-r4-readiness",
      "X-Trace-Id": "gate-r4-readiness",
      "X-Request-Id": "gate-r4-readiness"
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

function claimEmptyDatabase(path: string): { dev: number; ino: number } {
  const descriptor = openSync(path, "wx+", 0o600);
  try {
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
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

function canonicalInput(projectRoot: string, value: string): string {
  if (!isAbsolute(value)) throw new Error("input_path_not_absolute");
  const canonical = realpathSync(value);
  assertWithin(projectRoot, canonical);
  if (!statSync(canonical).isFile()) throw new Error("input_path_not_file");
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

function nonNegativeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("invalid_database_counter");
  return number;
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
      mcpConfigSha256: state.mcpConfigSha256
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
    .catch(() => {
      process.stderr.write(`${JSON.stringify({
        result: "blocked",
        errorClass: "recovery_regression_failure"
      })}\n`);
      process.exitCode = 2;
    });
}
