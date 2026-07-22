import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync
} from "node:fs";
import { createServer } from "node:net";
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding
} from "node:child_process";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
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
  openGateDReadOnlyDatabaseProbe,
  spawnGateDRuntimeManagedChild,
  waitUntilGateDRuntimeReady,
  type GateDDatabaseObservations,
  type GateDDatabaseProbeName,
  type GateDDatabaseProbeTiming,
  type GateDEvidenceJournal,
  type GateDManagedChild,
  type GateDOperationTransport,
  type GateDReadOnlyDatabaseProbe,
  type GateDRuntimeChildSpawnSpec,
  type GateDWorkloadMetrics
} from "./formalSoakExecution";
import {
  buildDeterministicBaselineWorkload,
  type DeterministicRuntimeBaselineWorkload
} from "./localBaseline";
import type { RuntimeDatabaseIdentity } from "../storage/runtimeStorage";

const FIXED_DURATION_MS = 1_800_000 as const;
const FIXED_SAMPLE_INTERVAL_MS = 30_000 as const;
const FIXED_WORKLOAD = {
  seededConversations: 10_000,
  concurrency: 20,
  mix: {
    noTool: 0.6,
    javaSandbox: 0.2,
    mcp: 0.15,
    approvalInterruption: 0.05
  }
} as const;

const DATABASE_PROBE_NAMES = [
  "incremental-events",
  "dead-letter",
  "orphaned-approval",
  "duplicate-event",
  "sqlite-busy",
  "event-secret-canary",
  "message-secret-canary"
] as const satisfies readonly GateDDatabaseProbeName[];

const DIAGNOSTIC_VARIANTS = ["full-oracle", "incremental-oracle", "workload-only"] as const;
const SENSITIVE_STRING = /Bearer\s|sk-|OPENHARNESS_SECRET_CANARY|API_KEY|ACCESS_TOKEN|PASSWORD/i;
const DIAGNOSTIC_SAMPLE_COUNT = FIXED_DURATION_MS / FIXED_SAMPLE_INTERVAL_MS;

export type { GateDDatabaseProbeName, GateDDatabaseProbeTiming } from "./formalSoakExecution";

export type GateDPerformanceDiagnosticVariant = "full-oracle" | "incremental-oracle" | "workload-only";

export interface GateDPerformanceDiagnosticSample {
  sampleIndex: number;
  sampledAt: string;
  admissionP95Ms: number;
  durableReplayP95Ms: number;
  oracleDurationMs: number;
  probeTimings: GateDDatabaseProbeTiming[];
  databaseBytes: number;
  conversations: number;
  messages: number;
  executions: number;
  approvals: number;
  runtimeEvents: number;
  pendingEvents: number;
  hardFailures: string[];
}

export interface GateDPerformanceDiagnosticReport {
  schemaVersion: 1;
  track: "local";
  evidenceKind: "gate-d-performance-diagnostic";
  runId: string;
  variant: GateDPerformanceDiagnosticVariant;
  generatedAt: string;
  durationMs: 1_800_000;
  sampleIntervalMs: 30_000;
  workload: {
    seededConversations: 10_000;
    concurrency: 20;
    mix: {
      noTool: 0.6;
      javaSandbox: 0.2;
      mcp: 0.15;
      approvalInterruption: 0.05;
    };
  };
  environment: {
    nodeVersion: string;
    platform: string;
    architecture: string;
    databaseBasename: string;
  };
  samples: GateDPerformanceDiagnosticSample[];
  hardFailures: string[];
}

export interface CreateGateDPerformanceDiagnosticReportInput {
  runId: string;
  variant: GateDPerformanceDiagnosticVariant;
  generatedAt: string;
  databasePath: string;
  samples: readonly GateDPerformanceDiagnosticSample[];
  hardFailures?: readonly string[];
}

export function createGateDPerformanceDiagnosticReport(
  input: CreateGateDPerformanceDiagnosticReportInput
): GateDPerformanceDiagnosticReport {
  const report: GateDPerformanceDiagnosticReport = {
    schemaVersion: 1,
    track: "local",
    evidenceKind: "gate-d-performance-diagnostic",
    runId: input.runId,
    variant: input.variant,
    generatedAt: input.generatedAt,
    durationMs: FIXED_DURATION_MS,
    sampleIntervalMs: FIXED_SAMPLE_INTERVAL_MS,
    workload: {
      seededConversations: FIXED_WORKLOAD.seededConversations,
      concurrency: FIXED_WORKLOAD.concurrency,
      mix: { ...FIXED_WORKLOAD.mix }
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      databaseBasename: basename(input.databasePath)
    },
    samples: input.samples.map(sample => ({
      ...sample,
      probeTimings: sample.probeTimings.map(timing => ({ ...timing })),
      hardFailures: [...sample.hardFailures]
    })),
    hardFailures: [...(input.hardFailures ?? [])]
  };
  assertGateDPerformanceDiagnosticReport(report);
  return report;
}

export function assertGateDPerformanceDiagnosticReport(
  value: unknown
): asserts value is GateDPerformanceDiagnosticReport {
  const { snapshot } = serializeGateDPerformanceDiagnostic(value);
  validateGateDPerformanceDiagnosticSnapshot(snapshot);
}

function validateGateDPerformanceDiagnosticSnapshot(value: unknown): asserts value is GateDPerformanceDiagnosticReport {
  assertNoSensitiveStrings(value);
  const report = exactObject(value, "report", [
    "schemaVersion", "track", "evidenceKind", "runId", "variant", "generatedAt",
    "durationMs", "sampleIntervalMs", "workload", "environment", "samples", "hardFailures"
  ]);
  exactLiteral(report.schemaVersion, 1, "schemaVersion");
  exactLiteral(report.track, "local", "track");
  exactLiteral(report.evidenceKind, "gate-d-performance-diagnostic", "evidenceKind");
  nonEmptyString(report.runId, "runId");
  if (!DIAGNOSTIC_VARIANTS.includes(report.variant as GateDPerformanceDiagnosticVariant)) {
    throw new Error("variant must be a supported Gate D diagnostic variant");
  }
  isoTimestamp(report.generatedAt, "generatedAt");
  exactLiteral(report.durationMs, FIXED_DURATION_MS, "durationMs");
  exactLiteral(report.sampleIntervalMs, FIXED_SAMPLE_INTERVAL_MS, "sampleIntervalMs");

  const workload = exactObject(report.workload, "workload", ["seededConversations", "concurrency", "mix"]);
  exactLiteral(workload.seededConversations, FIXED_WORKLOAD.seededConversations, "workload.seededConversations");
  exactLiteral(workload.concurrency, FIXED_WORKLOAD.concurrency, "workload.concurrency");
  const mix = exactObject(workload.mix, "workload.mix", ["noTool", "javaSandbox", "mcp", "approvalInterruption"]);
  exactLiteral(mix.noTool, FIXED_WORKLOAD.mix.noTool, "workload.mix.noTool");
  exactLiteral(mix.javaSandbox, FIXED_WORKLOAD.mix.javaSandbox, "workload.mix.javaSandbox");
  exactLiteral(mix.mcp, FIXED_WORKLOAD.mix.mcp, "workload.mix.mcp");
  exactLiteral(mix.approvalInterruption, FIXED_WORKLOAD.mix.approvalInterruption, "workload.mix.approvalInterruption");

  const environment = exactObject(report.environment, "environment", [
    "nodeVersion", "platform", "architecture", "databaseBasename"
  ]);
  nonEmptyString(environment.nodeVersion, "environment.nodeVersion");
  nonEmptyString(environment.platform, "environment.platform");
  nonEmptyString(environment.architecture, "environment.architecture");
  const databaseBasename = nonEmptyString(environment.databaseBasename, "environment.databaseBasename");
  if (basename(databaseBasename) !== databaseBasename) {
    throw new Error("environment.databaseBasename must not contain a path");
  }

  const samples = denseArray(report.samples, "samples");
  if (samples.length === 0) {
    throw new Error("samples must contain at least one diagnostic sample");
  }
  for (let index = 0; index < samples.length; index += 1) {
    assertDiagnosticSample(samples[index], `samples[${index}]`);
  }
  assertStringArray(report.hardFailures, "hardFailures");
}

function assertDiagnosticSample(value: unknown, path: string): asserts value is GateDPerformanceDiagnosticSample {
  const sample = exactObject(value, path, [
    "sampleIndex", "sampledAt", "admissionP95Ms", "durableReplayP95Ms", "oracleDurationMs",
    "probeTimings", "databaseBytes",
    "conversations", "messages", "executions", "approvals", "runtimeEvents", "pendingEvents",
    "hardFailures"
  ]);
  nonNegativeInteger(sample.sampleIndex, `${path}.sampleIndex`);
  isoTimestamp(sample.sampledAt, `${path}.sampledAt`);
  nonNegativeFinite(sample.admissionP95Ms, `${path}.admissionP95Ms`);
  nonNegativeFinite(sample.durableReplayP95Ms, `${path}.durableReplayP95Ms`);
  nonNegativeFinite(sample.oracleDurationMs, `${path}.oracleDurationMs`);
  const probeTimings = denseArray(sample.probeTimings, `${path}.probeTimings`);
  for (let index = 0; index < probeTimings.length; index += 1) {
    const timing = probeTimings[index];
    const timingPath = `${path}.probeTimings[${index}]`;
    const timingHasRowCount = typeof timing === "object"
      && timing !== null
      && Object.prototype.hasOwnProperty.call(timing, "rowCount");
    const timingObject = exactObject(
      timing,
      timingPath,
      timingHasRowCount ? ["probe", "durationMs", "rowCount"] : ["probe", "durationMs"]
    );
    if (!DATABASE_PROBE_NAMES.includes(timingObject.probe as GateDDatabaseProbeName)) {
      throw new Error(`${timingPath}.probe is not a stable Gate D database probe`);
    }
    nonNegativeFinite(timingObject.durationMs, `${timingPath}.durationMs`);
    if (timingHasRowCount) nonNegativeInteger(timingObject.rowCount, `${timingPath}.rowCount`);
  }
  const oracleDurationMs = probeTimings.reduce<number>((sum, timing) =>
    sum + nonNegativeFinite((timing as { durationMs: unknown }).durationMs, `${path}.probeTimings.durationMs`), 0);
  if (sample.oracleDurationMs !== oracleDurationMs) {
    throw new Error(`${path}.oracleDurationMs must equal the sum of probeTimings durationMs`);
  }
  nonNegativeInteger(sample.databaseBytes, `${path}.databaseBytes`);
  nonNegativeInteger(sample.conversations, `${path}.conversations`);
  nonNegativeInteger(sample.messages, `${path}.messages`);
  nonNegativeInteger(sample.executions, `${path}.executions`);
  nonNegativeInteger(sample.approvals, `${path}.approvals`);
  nonNegativeInteger(sample.runtimeEvents, `${path}.runtimeEvents`);
  nonNegativeInteger(sample.pendingEvents, `${path}.pendingEvents`);
  assertStringArray(sample.hardFailures, `${path}.hardFailures`);
}

export interface RunGateDPerformanceDiagnosticInput {
  runId: string;
  variant: GateDPerformanceDiagnosticVariant;
  javaUrl: string;
  mcpConfigPath: string;
  sqlitePath: string;
  outputPath: string;
  serviceToken: string;
}

export interface GateDPerformanceDiagnosticAggregateSnapshot {
  conversations: number;
  messages: number;
  executions: number;
  approvals: number;
  runtimeEvents: number;
  pendingEvents: number;
}

interface GateDPerformanceDiagnosticRuntimeStartInput {
  javaUrl: string;
  mcpConfigPath: string;
  sqlitePath: string;
  serviceToken: string;
  expectedDatabaseIdentity: RuntimeDatabaseIdentity;
}

export interface GateDPerformanceDiagnosticDependencies {
  delay(milliseconds: number): Promise<void>;
  monotonicClock(): number;
  clock(): Date;
  startRuntime(input: GateDPerformanceDiagnosticRuntimeStartInput): Promise<void>;
  stopRuntime(): Promise<readonly string[] | void>;
  seed(workload: DeterministicRuntimeBaselineWorkload): Promise<void>;
  startWorkload(workload: DeterministicRuntimeBaselineWorkload): Promise<void>;
  stopWorkload(): Promise<readonly string[] | void>;
  drainMetrics(): GateDWorkloadMetrics;
  openProbe(sqlitePath: string): GateDReadOnlyDatabaseProbe;
  closeProbe(probe: GateDReadOnlyDatabaseProbe): void;
  readOracle(
    cursor: GateDDatabaseObservationCursor,
    probe: GateDReadOnlyDatabaseProbe
  ): GateDDatabaseObservations;
  readAggregateSnapshot(probe: GateDReadOnlyDatabaseProbe): GateDPerformanceDiagnosticAggregateSnapshot;
  readDatabaseBytes(sqlitePath: string): number;
}

const DIAGNOSTIC_INPUT_FIELDS = [
  "runId",
  "variant",
  "javaUrl",
  "mcpConfigPath",
  "sqlitePath",
  "outputPath",
  "serviceToken"
] as const;

const DIAGNOSTIC_DEPENDENCY_FIELDS = [
  "delay",
  "monotonicClock",
  "clock",
  "startRuntime",
  "stopRuntime",
  "seed",
  "startWorkload",
  "stopWorkload",
  "drainMetrics",
  "openProbe",
  "closeProbe",
  "readOracle",
  "readAggregateSnapshot",
  "readDatabaseBytes"
] as const;

interface CanonicalDiagnosticPaths {
  sqlitePath: string;
  outputPath: string;
}

interface DiagnosticFileClaim {
  path: string;
  fileDescriptor: number;
  identity: { dev: number; ino: number };
  closed: boolean;
}

interface DiagnosticTargetClaims {
  sqlite: DiagnosticFileClaim;
  output: DiagnosticFileClaim;
}

export interface GateDPerformanceDiagnosticRealBoundary {
  selectRuntimePort(): Promise<number>;
  spawnRuntime(spec: GateDRuntimeChildSpawnSpec): Promise<GateDManagedChild>;
  waitUntilRuntimeReady(
    child: GateDManagedChild,
    input: { runtimeUrl: string; serviceToken: string }
  ): Promise<void>;
  createTransport(input: { runtimeUrl: string; serviceToken: string }): GateDOperationTransport;
  openProbe(path: string): GateDReadOnlyDatabaseProbe;
  assertSeededConversationCount(probe: GateDReadOnlyDatabaseProbe): void;
}

export async function runGateDPerformanceDiagnostic(
  input: RunGateDPerformanceDiagnosticInput,
  dependencyOverrides: Partial<GateDPerformanceDiagnosticDependencies> = {}
): Promise<GateDPerformanceDiagnosticReport> {
  const validatedInput = validateDiagnosticRunInput(input);
  const paths = validateFreshDiagnosticPaths(
    validatedInput.sqlitePath,
    validatedInput.outputPath,
    validatedInput.serviceToken
  );
  const dependencies = diagnosticDependencies(dependencyOverrides);
  const claims = claimDiagnosticTargets(paths);
  try {
    return await runClaimedGateDPerformanceDiagnostic(validatedInput, paths, dependencies, claims);
  } catch (error) {
    try {
      closeDiagnosticClaim(claims.sqlite);
    } catch {
      // Preserve the diagnostic error.
    }
    try {
      closeDiagnosticClaim(claims.output);
    } catch {
      // Preserve the diagnostic error.
    }
    unlinkOwnedClaim(claims.output);
    throw error;
  }
}

async function runClaimedGateDPerformanceDiagnostic(
  validatedInput: RunGateDPerformanceDiagnosticInput,
  paths: CanonicalDiagnosticPaths,
  dependencies: GateDPerformanceDiagnosticDependencies,
  claims: DiagnosticTargetClaims
): Promise<GateDPerformanceDiagnosticReport> {
  const workload = buildDeterministicBaselineWorkload({
    seededConversations: FIXED_WORKLOAD.seededConversations,
    concurrency: FIXED_WORKLOAD.concurrency
  });
  let activeProbeTimings: GateDDatabaseProbeTiming[] | undefined;
  const cursor = validatedInput.variant === "workload-only"
    ? undefined
    : new GateDDatabaseObservationCursor({
        mode: validatedInput.variant === "full-oracle" ? "formal-full" : "diagnostic-incremental",
        now: dependencies.monotonicClock,
        onTiming(timing) {
          activeProbeTimings?.push({ ...timing });
        }
      });
  const samples: GateDPerformanceDiagnosticSample[] = [];
  const hardFailures = new Set<string>();
  let runtimeStarted = false;
  let workloadStarted = false;
  let probe: GateDReadOnlyDatabaseProbe | undefined;
  let stopSampling = false;
  let samplingStartedAt = 0;

  try {
    try {
      await dependencies.startRuntime({
        javaUrl: validatedInput.javaUrl,
        mcpConfigPath: validatedInput.mcpConfigPath,
        sqlitePath: paths.sqlitePath,
        serviceToken: validatedInput.serviceToken,
        expectedDatabaseIdentity: claims.sqlite.identity
      });
      runtimeStarted = true;
    } catch {
      hardFailures.add("RUNTIME_START_FAILURE");
      stopSampling = true;
    }

    if (!recordClaimIdentityFailures(claims, hardFailures)) stopSampling = true;

    if (!stopSampling) {
      try {
        await dependencies.seed(workload);
      } catch {
        hardFailures.add("SEED_FAILURE");
        stopSampling = true;
      }
    }

    if (!stopSampling) {
      try {
        probe = dependencies.openProbe(paths.sqlitePath);
      } catch {
        hardFailures.add("DATABASE_PROBE_OPEN_FAILURE");
        stopSampling = true;
      }
    }

    if (!stopSampling) {
      try {
        await dependencies.startWorkload(workload);
        workloadStarted = true;
      } catch {
        hardFailures.add("WORKLOAD_START_FAILURE");
        stopSampling = true;
      }
    }

    if (!stopSampling) {
      try {
        samplingStartedAt = monotonicMilliseconds(dependencies);
      } catch {
        hardFailures.add("MONOTONIC_CLOCK_FAILURE");
        stopSampling = true;
      }
    }

    for (let sampleIndex = 0; sampleIndex < DIAGNOSTIC_SAMPLE_COUNT && !stopSampling; sampleIndex += 1) {
      let delayMilliseconds: number;
      try {
        const target = samplingStartedAt + (sampleIndex + 1) * FIXED_SAMPLE_INTERVAL_MS;
        delayMilliseconds = Math.max(0, target - monotonicMilliseconds(dependencies));
      } catch {
        hardFailures.add("MONOTONIC_CLOCK_FAILURE");
        appendFailureSample(samples, sampleIndex, dependencies, hardFailures);
        break;
      }
      try {
        await dependencies.delay(delayMilliseconds);
      } catch {
        hardFailures.add("SAMPLE_DELAY_FAILURE");
        appendFailureSample(samples, sampleIndex, dependencies, hardFailures);
        break;
      }

      if (!recordClaimIdentityFailures(claims, hardFailures)) {
        appendFailureSample(samples, sampleIndex, dependencies, hardFailures);
        break;
      }

      const sampledAt = safeIsoTimestamp(dependencies, sampleIndex, hardFailures);
      let metrics: GateDWorkloadMetrics;
      try {
        metrics = validateWorkloadMetrics(dependencies.drainMetrics());
      } catch {
        hardFailures.add("WORKLOAD_METRICS_FAILURE");
        appendFailureSample(samples, sampleIndex, dependencies, hardFailures, sampledAt);
        break;
      }

      const sampleFailures = new Set(
        stableFailureCodes(metrics.hardFailures, validatedInput.serviceToken)
      );
      if (metrics.admissionLatenciesMs.length === 0 || metrics.durableReplayLatenciesMs.length === 0) {
        sampleFailures.add("WORKLOAD_OBSERVATION_MISSING");
      }
      sampleFailures.forEach(failure => hardFailures.add(failure));
      const admissionP95Ms = percentile95(metrics.admissionLatenciesMs);
      const durableReplayP95Ms = percentile95(metrics.durableReplayLatenciesMs);
      let probeTimings: GateDDatabaseProbeTiming[] = [];
      let aggregateSnapshot = emptyAggregateSnapshot();
      let databaseBytes = 0;
      let stageFailure: string | undefined;
      if (!probe) {
        stageFailure = "DATABASE_PROBE_NOT_AVAILABLE";
      } else {
        try {
          if (cursor) {
            activeProbeTimings = probeTimings;
            try {
              const observations = validateOracleObservations(dependencies.readOracle(cursor, probe));
              stableFailureCodes(observations.hardFailures, validatedInput.serviceToken)
                .forEach(failure => sampleFailures.add(failure));
            } finally {
              activeProbeTimings = undefined;
            }
          }
        } catch {
          stageFailure = "DATABASE_ORACLE_FAILURE";
        }
        if (!stageFailure) {
          try {
            const startedAt = safeClockMilliseconds(dependencies, sampleIndex, hardFailures);
            aggregateSnapshot = validateAggregateSnapshot(dependencies.readAggregateSnapshot(probe));
            void Math.max(0, safeClockMilliseconds(dependencies, sampleIndex, hardFailures) - startedAt);
          } catch {
            stageFailure = "DATABASE_AGGREGATE_SNAPSHOT_FAILURE";
          }
        }
        if (!stageFailure) {
          try {
            databaseBytes = nonNegativeInteger(
              dependencies.readDatabaseBytes(paths.sqlitePath),
              "databaseBytes"
            );
          } catch {
            stageFailure = "DATABASE_FILE_SIZE_FAILURE";
          }
        }
      }

      if (stageFailure) sampleFailures.add(stageFailure);
      sampleFailures.forEach(failure => hardFailures.add(failure));
      samples.push({
        sampleIndex,
        sampledAt,
        admissionP95Ms,
        durableReplayP95Ms,
        oracleDurationMs: probeTimings.reduce((sum, timing) => sum + timing.durationMs, 0),
        probeTimings,
        databaseBytes,
        ...aggregateSnapshot,
        hardFailures: [...sampleFailures]
      });
      if (stageFailure || sampleFailures.size > 0) stopSampling = true;
    }
  } finally {
    if (workloadStarted) {
      try {
        stableFailureCodes(
          (await dependencies.stopWorkload()) ?? [],
          validatedInput.serviceToken
        )
          .forEach(failure => hardFailures.add(failure));
      } catch {
        hardFailures.add("WORKLOAD_STOP_FAILURE");
      }
    }
    if (runtimeStarted) {
      try {
        stableFailureCodes(
          (await dependencies.stopRuntime()) ?? [],
          validatedInput.serviceToken
        )
          .forEach(failure => hardFailures.add(failure));
      } catch {
        hardFailures.add("RUNTIME_STOP_FAILURE");
      }
    }
    if (probe) {
      try {
        dependencies.closeProbe(probe);
      } catch {
        hardFailures.add("DATABASE_PROBE_CLOSE_FAILURE");
      }
    }
    recordClaimIdentityFailures(claims, hardFailures);
  }

  if (samples.length === 0) appendFailureSample(samples, 0, dependencies, hardFailures);
  if (hardFailures.size > 0) {
    const finalSample = samples[samples.length - 1]!;
    finalSample.hardFailures = [...new Set([...finalSample.hardFailures, ...hardFailures])];
  }
  const report = createGateDPerformanceDiagnosticReport({
    runId: validatedInput.runId,
    variant: validatedInput.variant,
    generatedAt: safeIsoTimestamp(dependencies, samples.length, hardFailures),
    databasePath: paths.sqlitePath,
    samples,
    hardFailures: [...hardFailures]
  });
  assertExactTokenAbsent(JSON.stringify(report), validatedInput.serviceToken);
  try {
    writeGateDPerformanceDiagnosticToClaim(report, claims.output);
    if (!claimIdentityMatches(claims.output)) {
      throw new Error("Gate D diagnostic output claim identity changed after write");
    }
  } finally {
    closeDiagnosticClaims(claims);
  }
  return report;
}

function validateDiagnosticRunInput(input: RunGateDPerformanceDiagnosticInput): RunGateDPerformanceDiagnosticInput {
  const object = exactObject(input, "Gate D diagnostic input", DIAGNOSTIC_INPUT_FIELDS);
  const serviceToken = nonEmptyString(object.serviceToken, "serviceToken").trim();
  const runId = nonEmptyString(object.runId, "runId");
  const variant = object.variant;
  const javaUrl = nonEmptyString(object.javaUrl, "javaUrl");
  const mcpConfigPath = nonEmptyString(object.mcpConfigPath, "mcpConfigPath");
  const sqlitePath = nonEmptyString(object.sqlitePath, "sqlitePath");
  const outputPath = nonEmptyString(object.outputPath, "outputPath");
  for (const value of [runId, String(variant), javaUrl, mcpConfigPath, sqlitePath, outputPath]) {
    assertExactTokenAbsent(value, serviceToken);
  }
  if (SENSITIVE_STRING.test(runId)) throw new Error("runId must not contain sensitive evidence");
  if (!DIAGNOSTIC_VARIANTS.includes(variant as GateDPerformanceDiagnosticVariant)) {
    throw new Error("variant must be a supported Gate D diagnostic variant");
  }
  if (!isAbsolute(mcpConfigPath)) throw new Error("mcpConfigPath must be absolute");
  return {
    runId,
    variant: variant as GateDPerformanceDiagnosticVariant,
    javaUrl,
    mcpConfigPath,
    sqlitePath,
    outputPath,
    serviceToken
  };
}

function validateFreshDiagnosticPaths(
  sqlitePath: string,
  outputPath: string,
  serviceToken: string
): CanonicalDiagnosticPaths {
  if (!isAbsolute(sqlitePath)) throw new Error("Gate D diagnostic SQLite path must be absolute");
  if (!isAbsolute(outputPath)) throw new Error("Gate D diagnostic output path must be absolute");
  const canonicalSqlitePath = canonicalAbsentTarget(sqlitePath, "SQLite");
  const canonicalOutputPath = canonicalAbsentTarget(outputPath, "output");
  assertExactTokenAbsent(basename(canonicalSqlitePath), serviceToken);
  if (SENSITIVE_STRING.test(basename(canonicalSqlitePath))) {
    throw new Error("Gate D diagnostic SQLite basename must not contain sensitive evidence");
  }
  const projectRoot = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
  for (const attempt of ["gate-d-20260716-001", "gate-d-20260716-002"]) {
    const packetPath = realpathSync(
      join(projectRoot, "docs", "verification", "agent-runtime-v1", "gate-d", attempt)
    );
    if (
      pathWithin(canonicalSqlitePath, packetPath)
      || pathWithin(canonicalOutputPath, packetPath)
    ) {
      throw new Error("Gate D diagnostic SQLite/output path must not target a formal attempt packet");
    }
  }
  assertPathEntryAbsent(canonicalSqlitePath, "SQLite");
  assertPathEntryAbsent(canonicalOutputPath, "output");
  if (canonicalSqlitePath === canonicalOutputPath) {
    throw new Error("Gate D diagnostic SQLite and output paths must be distinct");
  }
  return { sqlitePath: canonicalSqlitePath, outputPath: canonicalOutputPath };
}

function canonicalAbsentTarget(path: string, kind: string): string {
  const normalized = resolve(path);
  let canonicalParent: string;
  try {
    canonicalParent = realpathSync(dirname(normalized));
  } catch {
    throw new Error("Gate D diagnostic target parent is unavailable");
  }
  const targetName = basename(normalized);
  if (!targetName || targetName === "." || targetName === "..") {
    throw new Error(`Gate D diagnostic ${kind} target name is invalid`);
  }
  return join(canonicalParent, targetName);
}

function claimDiagnosticTargets(paths: CanonicalDiagnosticPaths): DiagnosticTargetClaims {
  let sqlite: DiagnosticFileClaim | undefined;
  try {
    sqlite = claimDiagnosticFile(paths.sqlitePath);
    const output = claimDiagnosticFile(paths.outputPath);
    return { sqlite, output };
  } catch {
    if (sqlite) {
      closeDiagnosticClaim(sqlite);
      unlinkOwnedClaim(sqlite);
    }
    throw new Error("Gate D diagnostic target claim failed");
  }
}

function claimDiagnosticFile(path: string): DiagnosticFileClaim {
  const flags = fsConstants.O_CREAT
    | fsConstants.O_EXCL
    | fsConstants.O_RDWR
    | (fsConstants.O_NOFOLLOW ?? 0);
  const fileDescriptor = openSync(path, flags, 0o600);
  let identity: { dev: number; ino: number } | undefined;
  try {
    const created = fstatSync(fileDescriptor);
    identity = { dev: created.dev, ino: created.ino };
    fchmodSync(fileDescriptor, 0o600);
    return {
      path,
      fileDescriptor,
      identity,
      closed: false
    };
  } catch (error) {
    try {
      closeSync(fileDescriptor);
    } catch {
      // Preserve the claim error.
    }
    try {
      const current = lstatSync(path);
      if (identity && current.dev === identity.dev && current.ino === identity.ino) unlinkSync(path);
    } catch {
      // Preserve the claim error and never remove a replacement.
    }
    throw error;
  }
}

function claimIdentityMatches(claim: DiagnosticFileClaim): boolean {
  try {
    const current = lstatSync(claim.path);
    return current.dev === claim.identity.dev && current.ino === claim.identity.ino;
  } catch {
    return false;
  }
}

function recordClaimIdentityFailures(
  claims: DiagnosticTargetClaims,
  hardFailures: Set<string>
): boolean {
  const sqliteMatches = claimIdentityMatches(claims.sqlite);
  const outputMatches = claimIdentityMatches(claims.output);
  if (!sqliteMatches) hardFailures.add("SQLITE_CLAIM_IDENTITY_CHANGED");
  if (!outputMatches) hardFailures.add("OUTPUT_CLAIM_IDENTITY_CHANGED");
  return sqliteMatches && outputMatches;
}

function closeDiagnosticClaim(claim: DiagnosticFileClaim): void {
  if (claim.closed) return;
  try {
    closeSync(claim.fileDescriptor);
  } finally {
    claim.closed = true;
  }
}

function closeDiagnosticClaims(claims: DiagnosticTargetClaims): void {
  let closeError: unknown;
  try {
    closeDiagnosticClaim(claims.sqlite);
  } catch (error) {
    closeError = error;
  }
  try {
    closeDiagnosticClaim(claims.output);
  } catch (error) {
    closeError ??= error;
  }
  if (closeError) throw closeError;
}

function unlinkOwnedClaim(claim: DiagnosticFileClaim): void {
  try {
    if (claimIdentityMatches(claim)) unlinkSync(claim.path);
  } catch {
    // A concurrent replacement is never removed.
  }
}

function writeGateDPerformanceDiagnosticToClaim(
  report: GateDPerformanceDiagnosticReport,
  claim: DiagnosticFileClaim
): void {
  const serialized = serializeGateDPerformanceDiagnostic(report);
  validateGateDPerformanceDiagnosticSnapshot(serialized.snapshot);
  const bytes = Buffer.from(`${serialized.json}\n`, "utf8");
  fchmodSync(claim.fileDescriptor, 0o600);
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(claim.fileDescriptor, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error("Gate D diagnostic evidence write made no progress");
    offset += written;
  }
  fsyncSync(claim.fileDescriptor);
}

function assertPathEntryAbsent(path: string, kind: string): void {
  try {
    lstatSync(path);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return;
    throw error;
  }
  throw new Error(`Gate D diagnostic ${kind} target must be fresh and not already exist`);
}

function pathWithin(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function diagnosticDependencies(
  overrides: Partial<GateDPerformanceDiagnosticDependencies>
): GateDPerformanceDiagnosticDependencies {
  const unknown = Object.keys(overrides).filter(field =>
    !(DIAGNOSTIC_DEPENDENCY_FIELDS as readonly string[]).includes(field)
  );
  if (unknown.length > 0) throw new Error(`Gate D diagnostic dependencies have unknown field ${unknown[0]}`);
  return { ...createRealDiagnosticDependencies(), ...overrides };
}

function appendFailureSample(
  samples: GateDPerformanceDiagnosticSample[],
  sampleIndex: number,
  dependencies: GateDPerformanceDiagnosticDependencies,
  hardFailures: ReadonlySet<string>,
  sampledAt = safeIsoTimestamp(dependencies, sampleIndex, new Set<string>())
): void {
  samples.push({
    sampleIndex,
    sampledAt,
    admissionP95Ms: 0,
    durableReplayP95Ms: 0,
    oracleDurationMs: 0,
    probeTimings: [],
    databaseBytes: 0,
    ...emptyAggregateSnapshot(),
    hardFailures: [...hardFailures]
  });
}

function safeIsoTimestamp(
  dependencies: GateDPerformanceDiagnosticDependencies,
  sampleIndex: number,
  hardFailures: Set<string>
): string {
  try {
    const value = dependencies.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid clock");
    return value.toISOString();
  } catch {
    hardFailures.add("CLOCK_FAILURE");
    return new Date(sampleIndex * FIXED_SAMPLE_INTERVAL_MS).toISOString();
  }
}

function safeClockMilliseconds(
  dependencies: GateDPerformanceDiagnosticDependencies,
  sampleIndex: number,
  hardFailures: Set<string>
): number {
  return Date.parse(safeIsoTimestamp(dependencies, sampleIndex, hardFailures));
}

function monotonicMilliseconds(dependencies: GateDPerformanceDiagnosticDependencies): number {
  const value = dependencies.monotonicClock();
  if (!Number.isFinite(value)) throw new Error("Gate D diagnostic monotonic clock is invalid");
  return value;
}

function stableFailureCodes(values: readonly string[], serviceToken: string): string[] {
  return values.map(value =>
    /^[A-Z][A-Z0-9_:.-]*$/.test(value)
      && !SENSITIVE_STRING.test(value)
      && !value.includes(serviceToken)
      ? value
      : "DEPENDENCY_REPORTED_FAILURE"
  );
}

function assertExactTokenAbsent(value: string, serviceToken: string): void {
  if (serviceToken.length > 0 && value.includes(serviceToken)) {
    throw new Error("Gate D diagnostic evidence contains the exact service token");
  }
}

function emptyAggregateSnapshot(): GateDPerformanceDiagnosticAggregateSnapshot {
  return {
    conversations: 0,
    messages: 0,
    executions: 0,
    approvals: 0,
    runtimeEvents: 0,
    pendingEvents: 0
  };
}

function validateAggregateSnapshot(
  value: GateDPerformanceDiagnosticAggregateSnapshot
): GateDPerformanceDiagnosticAggregateSnapshot {
  const object = exactObject(value, "aggregate snapshot", [
    "conversations", "messages", "executions", "approvals", "runtimeEvents", "pendingEvents"
  ]);
  return {
    conversations: nonNegativeInteger(object.conversations, "aggregateSnapshot.conversations"),
    messages: nonNegativeInteger(object.messages, "aggregateSnapshot.messages"),
    executions: nonNegativeInteger(object.executions, "aggregateSnapshot.executions"),
    approvals: nonNegativeInteger(object.approvals, "aggregateSnapshot.approvals"),
    runtimeEvents: nonNegativeInteger(object.runtimeEvents, "aggregateSnapshot.runtimeEvents"),
    pendingEvents: nonNegativeInteger(object.pendingEvents, "aggregateSnapshot.pendingEvents")
  };
}

function validateWorkloadMetrics(value: GateDWorkloadMetrics): GateDWorkloadMetrics {
  const object = exactObject(value, "workload metrics", [
    "admissionLatenciesMs", "durableReplayLatenciesMs", "hardFailures", "eventObservations"
  ]);
  const admissionLatenciesMs = finiteMetricArray(
    object.admissionLatenciesMs,
    "workloadMetrics.admissionLatenciesMs"
  );
  const durableReplayLatenciesMs = finiteMetricArray(
    object.durableReplayLatenciesMs,
    "workloadMetrics.durableReplayLatenciesMs"
  );
  assertStringArray(object.hardFailures, "workloadMetrics.hardFailures");
  if (!Array.isArray(object.eventObservations)) {
    throw new Error("workloadMetrics.eventObservations must be an array");
  }
  return {
    admissionLatenciesMs,
    durableReplayLatenciesMs,
    hardFailures: [...object.hardFailures],
    eventObservations: [...object.eventObservations] as GateDWorkloadMetrics["eventObservations"]
  };
}

function finiteMetricArray(value: unknown, path: string): number[] {
  const values = denseArray(value, path);
  return values.map((metric, index) => nonNegativeFinite(metric, `${path}[${index}]`));
}

function validateOracleObservations(
  observations: GateDDatabaseObservations
): GateDDatabaseObservations {
  if (!observations
    || !Array.isArray(observations.eventObservations)
    || !Array.isArray(observations.hardFailures)) {
    throw new Error("Gate D diagnostic oracle observations are invalid");
  }
  return observations;
}

const REAL_DIAGNOSTIC_BOUNDARY: GateDPerformanceDiagnosticRealBoundary = {
  selectRuntimePort: selectDiagnosticRuntimePort,
  async spawnRuntime(spec) {
    const journal: GateDEvidenceJournal = { append: () => undefined, close: () => undefined };
    return await spawnGateDRuntimeManagedChild({ spec, journal });
  },
  waitUntilRuntimeReady: waitUntilGateDRuntimeReady,
  createTransport: input => new GateDRuntimeHttpTransport(input),
  openProbe: openGateDReadOnlyDatabaseProbe,
  assertSeededConversationCount: assertGateDSeededConversationCount
};

export function createGateDPerformanceDiagnosticRealDependenciesForTest(
  boundary: GateDPerformanceDiagnosticRealBoundary
): GateDPerformanceDiagnosticDependencies {
  return createRealDiagnosticDependencies(boundary);
}

function createRealDiagnosticDependencies(
  boundary: GateDPerformanceDiagnosticRealBoundary = REAL_DIAGNOSTIC_BOUNDARY
): GateDPerformanceDiagnosticDependencies {
  let supervisor: GateDRuntimeSupervisor | undefined;
  let driver: GateDWorkloadDriver | undefined;
  let continuousWorkload: GateDContinuousWorkload | undefined;
  let databasePath: string | undefined;
  return {
    delay: sleep,
    monotonicClock: () => performance.now(),
    clock: () => new Date(),
    async startRuntime(input) {
      databasePath = input.sqlitePath;
      const runtimePort = await boundary.selectRuntimePort();
      const runtimeUrl = `http://127.0.0.1:${runtimePort}`;
      const childEntrypoint = fileURLToPath(new URL("./formalSoakRuntimeChild.ts", import.meta.url));
      supervisor = new GateDRuntimeSupervisor({
        spawnChild: async () => boundary.spawnRuntime(
          buildGateDRuntimeChildSpawnSpec({
            childEntrypoint,
            databasePath: input.sqlitePath,
            mcpConfigPath: input.mcpConfigPath,
            javaBaseUrl: input.javaUrl,
            runtimePort,
            serviceToken: input.serviceToken,
            expectedDatabaseIdentity: input.expectedDatabaseIdentity,
            baseEnvironment: { ...process.env, COMPRESSION_AUTO: "false" }
          })
        ),
        waitUntilReady: child => boundary.waitUntilRuntimeReady(child, {
          runtimeUrl,
          serviceToken: input.serviceToken
        })
      });
      await supervisor.start();
      try {
        const transport = boundary.createTransport({ runtimeUrl, serviceToken: input.serviceToken });
        driver = new GateDWorkloadDriver(transport);
      } catch (error) {
        try {
          await supervisor.stop();
        } catch {
          // Preserve the initialization failure after attempting child cleanup.
        }
        throw error;
      }
    },
    async stopRuntime() {
      driver?.stop();
      await supervisor?.stop();
      return supervisor?.hardFailures ?? [];
    },
    async seed(workload) {
      if (!driver) throw new Error("Gate D diagnostic Runtime must start before seed");
      await driver.seed(workload.operations);
      const metrics = driver.drainMetrics();
      if (metrics.hardFailures.length > 0) throw new Error("Gate D diagnostic seed failed");
      if (!databasePath) throw new Error("Gate D diagnostic database path is unavailable");
      const probe = boundary.openProbe(databasePath);
      try {
        boundary.assertSeededConversationCount(probe);
      } finally {
        probe.close();
      }
    },
    async startWorkload(workload) {
      if (!driver) throw new Error("Gate D diagnostic Runtime must start before workload");
      continuousWorkload = new GateDContinuousWorkload(driver, workload.operations);
      continuousWorkload.start();
    },
    async stopWorkload() {
      await continuousWorkload?.stop();
      return continuousWorkload?.hardFailures ?? [];
    },
    drainMetrics() {
      if (!driver) throw new Error("Gate D diagnostic workload driver is not available");
      return driver.drainMetrics();
    },
    openProbe: boundary.openProbe,
    closeProbe: probe => probe.close(),
    readOracle: (cursor, probe) => cursor.read(probe),
    readAggregateSnapshot,
    readDatabaseBytes: path => statSync(path).size
  };
}

function readAggregateSnapshot(probe: GateDReadOnlyDatabaseProbe): GateDPerformanceDiagnosticAggregateSnapshot {
  const row = probe.get<{
    conversations: number;
    messages: number;
    executions: number;
    approvals: number;
    runtimeEvents: number;
    pendingEvents: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM conversations) AS conversations,
      (SELECT COUNT(*) FROM messages) AS messages,
      (SELECT COUNT(*) FROM executions) AS executions,
      (SELECT COUNT(*) FROM approvals) AS approvals,
      (SELECT COUNT(*) FROM runtime_events) AS runtimeEvents,
      (SELECT COUNT(*) FROM runtime_events WHERE delivery_status = 'pending') AS pendingEvents
  `);
  if (!row) throw new Error("Gate D diagnostic aggregate snapshot returned no row");
  return validateAggregateSnapshot(row);
}

async function selectDiagnosticRuntimePort(): Promise<number> {
  const server = createServer();
  return await new Promise<number>((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Gate D diagnostic port selection failed"));
        return;
      }
      const port = address.port;
      server.close(error => error ? reject(error) : resolvePort(port));
    });
  });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}

export type GateDOfflineProbeName = GateDDatabaseProbeName
  | "session-messages-p50"
  | "session-messages-p95"
  | "session-messages-max"
  | "session-events-p50"
  | "session-events-p95"
  | "session-events-max"
  | "active-execution"
  | "pending-approval";

export interface GateDOfflineDatabaseProfile {
  schemaVersion: 1;
  track: "local";
  evidenceKind: "gate-d-offline-database-profile";
  generatedAt: string;
  databaseBytes: number;
  tableRows: Record<"conversations" | "messages" | "executions" | "approvals" | "runtime_events", number>;
  eventDeliveryStatus: Record<string, number>;
  objectBytes: { name: string; bytes: number }[];
  sessionCardinality: {
    messages: { p50: number; p95: number; max: number };
    executions: { p50: number; p95: number; max: number };
    runtimeEvents: { p50: number; p95: number; max: number };
  };
  queryPlans: { probe: GateDOfflineProbeName; plan: string[]; durationMs: number }[];
}

type GateDOfflineProfilerSpawn = (
  command: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding
) => GateDOfflineProfilerProcessResult;

interface GateDOfflineProfilerProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface ProfileGateDOfflineDatabaseOptions {
  generatedAt?: string;
  spawnSync?: GateDOfflineProfilerSpawn;
}

const FORMAL_PROBE_SQL: ReadonlyArray<{ probe: GateDDatabaseProbeName; sql: string }> = [
  {
    probe: "incremental-events",
    sql: `SELECT rowid AS rowId, tenant_id AS tenantId, user_id AS userId,
                 conversation_id AS conversationId, cursor, event_id AS eventId
          FROM runtime_events WHERE rowid > 0 ORDER BY rowid ASC`
  },
  {
    probe: "dead-letter",
    sql: `SELECT COUNT(*) AS count FROM runtime_events
          WHERE delivery_status = 'dead_letter' OR dead_letter_at IS NOT NULL`
  },
  {
    probe: "orphaned-approval",
    sql: `SELECT COUNT(*) AS count
          FROM approvals a
          LEFT JOIN executions e
            ON e.execution_id = a.execution_id AND e.tenant_id = a.tenant_id
           AND e.user_id = a.user_id AND e.conversation_id = a.conversation_id
          WHERE a.status = 'pending'
            AND (e.execution_id IS NULL OR e.status NOT IN ('running','waiting_approval'))`
  },
  {
    probe: "duplicate-event",
    sql: `SELECT COUNT(*) AS count FROM (
            SELECT tenant_id,user_id,conversation_id,event_id
            FROM runtime_events
            GROUP BY tenant_id,user_id,conversation_id,event_id HAVING COUNT(*) > 1
            UNION ALL
            SELECT tenant_id,user_id,conversation_id,CAST(cursor AS TEXT)
            FROM runtime_events
            GROUP BY tenant_id,user_id,conversation_id,cursor HAVING COUNT(*) > 1
          )`
  },
  {
    probe: "sqlite-busy",
    sql: `SELECT COUNT(*) AS count FROM runtime_events WHERE payload_json LIKE '%SQLITE_BUSY%'`
  },
  {
    probe: "event-secret-canary",
    sql: `SELECT COUNT(*) AS count FROM runtime_events WHERE payload_json LIKE '%OPENHARNESS_SECRET_CANARY%'`
  },
  {
    probe: "message-secret-canary",
    sql: `SELECT COUNT(*) AS count FROM messages WHERE content_json LIKE '%OPENHARNESS_SECRET_CANARY%'`
  }
];

const MESSAGE_COUNTS_CTE = `
  WITH scope_counts AS (
    SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(m.rowid) AS count
    FROM conversations c LEFT JOIN messages m
      ON m.tenant_id=c.tenant_id AND m.user_id=c.user_id AND m.conversation_id=c.conversation_id
    GROUP BY c.tenant_id,c.user_id,c.conversation_id
  )`;
const EVENT_COUNTS_CTE = `
  WITH scope_counts AS (
    SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(r.rowid) AS count
    FROM conversations c LEFT JOIN runtime_events r
      ON r.tenant_id=c.tenant_id AND r.user_id=c.user_id AND r.conversation_id=c.conversation_id
    GROUP BY c.tenant_id,c.user_id,c.conversation_id
  )`;
const COMBINED_COUNTS_CTE = `
  WITH message_counts AS (
    SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(m.rowid) AS count
    FROM conversations c LEFT JOIN messages m
      ON m.tenant_id=c.tenant_id AND m.user_id=c.user_id AND m.conversation_id=c.conversation_id
    GROUP BY c.tenant_id,c.user_id,c.conversation_id
  ), execution_counts AS (
    SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(e.rowid) AS count
    FROM conversations c LEFT JOIN executions e
      ON e.tenant_id=c.tenant_id AND e.user_id=c.user_id AND e.conversation_id=c.conversation_id
    GROUP BY c.tenant_id,c.user_id,c.conversation_id
  ), event_counts AS (
    SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(r.rowid) AS count
    FROM conversations c LEFT JOIN runtime_events r
      ON r.tenant_id=c.tenant_id AND r.user_id=c.user_id AND r.conversation_id=c.conversation_id
    GROUP BY c.tenant_id,c.user_id,c.conversation_id
  ), scope_counts AS (
    SELECT m.tenant_id,m.user_id,m.conversation_id,m.count+e.count+r.count AS count
    FROM message_counts m JOIN execution_counts e USING(tenant_id,user_id,conversation_id)
    JOIN event_counts r USING(tenant_id,user_id,conversation_id)
  )`;

function rankedScopeDetailSql(kind: "messages" | "events", percentile: 50 | 95 | 100): string {
  const cte = kind === "messages" ? MESSAGE_COUNTS_CTE : EVENT_COUNTS_CTE;
  const offset = percentile === 100
    ? "MAX(0,(SELECT COUNT(*) FROM scope_counts)-1)"
    : `MAX(0,((SELECT COUNT(*) FROM scope_counts)*${percentile}+99)/100-1)`;
  const representative = `representative AS (
    SELECT tenant_id,user_id,conversation_id FROM scope_counts
    ORDER BY count,tenant_id,user_id,conversation_id LIMIT 1 OFFSET ${offset}
  )`;
  if (kind === "messages") {
    return `${cte}, ${representative}
      SELECT m.content_json FROM messages m JOIN representative r
        ON m.tenant_id=r.tenant_id AND m.user_id=r.user_id AND m.conversation_id=r.conversation_id
      ORDER BY m.seq ASC`;
  }
  return `${cte}, ${representative}
    SELECT e.tenant_id,e.user_id,e.conversation_id,e.event_id,e.execution_id,e.cursor,e.kind,e.payload_json,
           e.created_at,e.delivery_status,e.delivery_attempts,e.next_attempt_at
    FROM runtime_events e JOIN representative r
      ON e.tenant_id=r.tenant_id AND e.user_id=r.user_id AND e.conversation_id=r.conversation_id
    WHERE e.cursor > 0 ORDER BY e.cursor ASC`;
}

const ACTIVE_EXECUTION_SQL = `${COMBINED_COUNTS_CTE}, representative AS (
  SELECT tenant_id,user_id,conversation_id FROM scope_counts
  ORDER BY count DESC,tenant_id DESC,user_id DESC,conversation_id DESC LIMIT 1
)
SELECT e.execution_id,e.tenant_id,e.user_id,e.conversation_id,e.status,e.stop_reason,e.created_at,e.updated_at
FROM executions e JOIN representative r
  ON e.tenant_id=r.tenant_id AND e.user_id=r.user_id AND e.conversation_id=r.conversation_id
WHERE e.status IN ('running','waiting_approval') ORDER BY e.updated_at DESC LIMIT 1`;

const PENDING_APPROVAL_SQL = `${COMBINED_COUNTS_CTE}, representative AS (
  SELECT tenant_id,user_id,conversation_id FROM scope_counts
  ORDER BY count DESC,tenant_id DESC,user_id DESC,conversation_id DESC LIMIT 1
)
SELECT a.approval_id,a.tenant_id,a.user_id,a.conversation_id,a.execution_id,a.status,a.payload_json,a.created_at,a.updated_at
FROM approvals a JOIN representative r
  ON a.tenant_id=r.tenant_id AND a.user_id=r.user_id AND a.conversation_id=r.conversation_id
WHERE a.status='pending' ORDER BY a.created_at ASC`;

const OFFLINE_PROBE_SQL: ReadonlyArray<{ probe: GateDOfflineProbeName; sql: string }> = [
  ...FORMAL_PROBE_SQL,
  { probe: "session-messages-p50", sql: rankedScopeDetailSql("messages", 50) },
  { probe: "session-messages-p95", sql: rankedScopeDetailSql("messages", 95) },
  { probe: "session-messages-max", sql: rankedScopeDetailSql("messages", 100) },
  { probe: "session-events-p50", sql: rankedScopeDetailSql("events", 50) },
  { probe: "session-events-p95", sql: rankedScopeDetailSql("events", 95) },
  { probe: "session-events-max", sql: rankedScopeDetailSql("events", 100) },
  { probe: "active-execution", sql: ACTIVE_EXECUTION_SQL },
  { probe: "pending-approval", sql: PENDING_APPROVAL_SQL }
];

const CARDINALITY_SQL = `
WITH message_counts AS (
  SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(m.rowid) AS count
  FROM conversations c LEFT JOIN messages m
    ON m.tenant_id=c.tenant_id AND m.user_id=c.user_id AND m.conversation_id=c.conversation_id
  GROUP BY c.tenant_id,c.user_id,c.conversation_id
), execution_counts AS (
  SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(e.rowid) AS count
  FROM conversations c LEFT JOIN executions e
    ON e.tenant_id=c.tenant_id AND e.user_id=c.user_id AND e.conversation_id=c.conversation_id
  GROUP BY c.tenant_id,c.user_id,c.conversation_id
), event_counts AS (
  SELECT c.tenant_id,c.user_id,c.conversation_id,COUNT(r.rowid) AS count
  FROM conversations c LEFT JOIN runtime_events r
    ON r.tenant_id=c.tenant_id AND r.user_id=c.user_id AND r.conversation_id=c.conversation_id
  GROUP BY c.tenant_id,c.user_id,c.conversation_id
)
SELECT '__GATE_D_CARDINALITY__' AS marker,
  COALESCE((SELECT count FROM message_counts ORDER BY count,tenant_id,user_id,conversation_id LIMIT 1 OFFSET MAX(0,((SELECT COUNT(*) FROM message_counts)*50+99)/100-1)),0) AS messagesP50,
  COALESCE((SELECT count FROM message_counts ORDER BY count,tenant_id,user_id,conversation_id LIMIT 1 OFFSET MAX(0,((SELECT COUNT(*) FROM message_counts)*95+99)/100-1)),0) AS messagesP95,
  COALESCE((SELECT MAX(count) FROM message_counts),0) AS messagesMax,
  COALESCE((SELECT count FROM execution_counts ORDER BY count,tenant_id,user_id,conversation_id LIMIT 1 OFFSET MAX(0,((SELECT COUNT(*) FROM execution_counts)*50+99)/100-1)),0) AS executionsP50,
  COALESCE((SELECT count FROM execution_counts ORDER BY count,tenant_id,user_id,conversation_id LIMIT 1 OFFSET MAX(0,((SELECT COUNT(*) FROM execution_counts)*95+99)/100-1)),0) AS executionsP95,
  COALESCE((SELECT MAX(count) FROM execution_counts),0) AS executionsMax,
  COALESCE((SELECT count FROM event_counts ORDER BY count,tenant_id,user_id,conversation_id LIMIT 1 OFFSET MAX(0,((SELECT COUNT(*) FROM event_counts)*50+99)/100-1)),0) AS runtimeEventsP50,
  COALESCE((SELECT count FROM event_counts ORDER BY count,tenant_id,user_id,conversation_id LIMIT 1 OFFSET MAX(0,((SELECT COUNT(*) FROM event_counts)*95+99)/100-1)),0) AS runtimeEventsP95,
  COALESCE((SELECT MAX(count) FROM event_counts),0) AS runtimeEventsMax`;

const SQLITE3_BINARY = "/usr/bin/sqlite3";
const SQLITE3_TIMEOUT_MS = 900_000;
const SQLITE3_MAX_BUFFER_BYTES = 8_388_608;
const PROFILER_FAILURE = "Gate D offline profiler failed";

function buildOfflineProfilerScript(): string {
  const lines = [
    ".bail on", ".echo off", ".headers on", ".mode json", ".explain off", "PRAGMA query_only=ON;",
    `SELECT '__GATE_D_CAPABILITY__' AS marker,sqlite_version() AS version,
      sqlite_compileoption_used('ENABLE_DBSTAT_VTAB') AS dbstat,json_valid('[]') AS json,
      (SELECT query_only FROM pragma_query_only) AS queryOnly,
      (SELECT file FROM pragma_database_list WHERE name='main') AS main;`,
    `SELECT '__GATE_D_AGGREGATE__' AS marker,
      (SELECT COUNT(*) FROM conversations) AS conversations,(SELECT COUNT(*) FROM messages) AS messages,
      (SELECT COUNT(*) FROM executions) AS executions,(SELECT COUNT(*) FROM approvals) AS approvals,
      (SELECT COUNT(*) FROM runtime_events) AS runtime_events;`,
    "SELECT delivery_status AS status,COUNT(*) AS count FROM runtime_events GROUP BY delivery_status ORDER BY delivery_status;",
    "SELECT name,SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY name;",
    `${CARDINALITY_SQL};`
  ];
  for (const { probe, sql } of OFFLINE_PROBE_SQL) {
    lines.push(
      `SELECT '__GATE_D_PROBE__' AS marker,'${probe}' AS probe;`,
      `EXPLAIN QUERY PLAN ${sql};`,
      ".mode off", ".timer on", `${sql};`, ".timer off", ".mode json"
    );
  }
  lines.push("SELECT '__GATE_D_COMPLETE__' AS marker;");
  return `${lines.join("\n")}\n`;
}

interface FileIdentitySnapshot {
  exists: boolean;
  dev?: bigint;
  ino?: bigint;
  size?: bigint;
  mtimeNs?: bigint;
  ctimeNs?: bigint;
}

interface DatabaseFamilySnapshot {
  main: FileIdentitySnapshot;
  wal: FileIdentitySnapshot;
  shm: FileIdentitySnapshot;
}

function snapshotProfilerFile(path: string, required: boolean): FileIdentitySnapshot {
  try {
    const stat = lstatSync(path, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(PROFILER_FAILURE);
    return {
      exists: true,
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeNs: stat.mtimeNs,
      ctimeNs: stat.ctimeNs
    };
  } catch (error) {
    if (!required && typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return { exists: false };
    }
    throw new Error(PROFILER_FAILURE);
  }
}

function snapshotProfilerDatabaseFamily(databasePath: string): DatabaseFamilySnapshot {
  return {
    main: snapshotProfilerFile(databasePath, true),
    wal: snapshotProfilerFile(`${databasePath}-wal`, false),
    shm: snapshotProfilerFile(`${databasePath}-shm`, false)
  };
}

function snapshotsMatch(left: DatabaseFamilySnapshot, right: DatabaseFamilySnapshot): boolean {
  return (["main", "wal", "shm"] as const).every(key => {
    const a = left[key];
    const b = right[key];
    return a.exists === b.exists && (!a.exists || (
      a.dev === b.dev && a.ino === b.ino && a.size === b.size
      && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
    ));
  });
}

export function profileGateDOfflineDatabase(
  databasePath: string,
  options: ProfileGateDOfflineDatabaseOptions = {}
): GateDOfflineDatabaseProfile {
  if (!isAbsolute(databasePath)) throw new Error(PROFILER_FAILURE);
  let generatedAt: string;
  try {
    generatedAt = options.generatedAt ?? new Date().toISOString();
    isoTimestamp(generatedAt, "generatedAt");
  } catch {
    throw new Error(PROFILER_FAILURE);
  }
  const before = snapshotProfilerDatabaseFamily(databasePath);
  let result: GateDOfflineProfilerProcessResult | undefined;
  let spawnFailed = false;
  try {
    const spawn = options.spawnSync ?? spawnSync;
    result = spawn(SQLITE3_BINARY, [
      "-batch", "-bail", `${pathToFileURL(databasePath).href}?mode=ro&immutable=1`
    ], {
      input: buildOfflineProfilerScript(),
      encoding: "utf8",
      timeout: SQLITE3_TIMEOUT_MS,
      maxBuffer: SQLITE3_MAX_BUFFER_BYTES,
      env: { LC_ALL: "C", LANG: "C" }
    });
  } catch {
    spawnFailed = true;
  }
  let after: DatabaseFamilySnapshot;
  try {
    after = snapshotProfilerDatabaseFamily(databasePath);
  } catch {
    throw new Error(PROFILER_FAILURE);
  }
  if (!snapshotsMatch(before, after)) throw new Error(PROFILER_FAILURE);
  if (spawnFailed || result === undefined) throw new Error(PROFILER_FAILURE);
  if (result.error || result.status !== 0 || result.signal !== null || result.stderr !== "") {
    throw new Error(PROFILER_FAILURE);
  }
  try {
    const parsed = parseOfflineProfilerOutput(result.stdout, databasePath);
    const profile: GateDOfflineDatabaseProfile = {
      schemaVersion: 1,
      track: "local",
      evidenceKind: "gate-d-offline-database-profile",
      generatedAt,
      databaseBytes: Number(before.main.size),
      ...parsed
    };
    assertNoSensitiveStrings(profile);
    return profile;
  } catch {
    throw new Error(PROFILER_FAILURE);
  }
}

interface ParsedOfflineProfilerOutput {
  tableRows: GateDOfflineDatabaseProfile["tableRows"];
  eventDeliveryStatus: GateDOfflineDatabaseProfile["eventDeliveryStatus"];
  objectBytes: GateDOfflineDatabaseProfile["objectBytes"];
  sessionCardinality: GateDOfflineDatabaseProfile["sessionCardinality"];
  queryPlans: GateDOfflineDatabaseProfile["queryPlans"];
}

function parseOfflineProfilerOutput(stdout: string, databasePath: string): ParsedOfflineProfilerOutput {
  if (!stdout.endsWith("\n") || stdout.includes("\r")) throw new Error(PROFILER_FAILURE);
  const lines = stdout.slice(0, -1).split("\n");
  if (lines.some(line => line.length === 0)) throw new Error(PROFILER_FAILURE);
  let index = 0;
  const nextJson = (): unknown[] => {
    let json = "";
    while (index < lines.length) {
      json += `${json.length === 0 ? "" : "\n"}${lines[index++]}`;
      try {
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) throw new Error(PROFILER_FAILURE);
        return parsed;
      } catch (error) {
        if (error instanceof Error && error.message === PROFILER_FAILURE) throw error;
      }
    }
    throw new Error(PROFILER_FAILURE);
  };
  const one = (label: string): Record<string, unknown> => {
    const rows = nextJson();
    if (rows.length !== 1) throw new Error(PROFILER_FAILURE);
    if (typeof rows[0] !== "object" || rows[0] === null || Array.isArray(rows[0])) {
      throw new Error(PROFILER_FAILURE);
    }
    return rows[0] as Record<string, unknown>;
  };
  const requireKeys = (value: Record<string, unknown>, keys: readonly string[]): void => {
    if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
      throw new Error(PROFILER_FAILURE);
    }
  };
  const count = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(PROFILER_FAILURE);
    return value;
  };

  const capability = one("capability");
  requireKeys(capability, ["marker", "version", "dbstat", "json", "queryOnly", "main"]);
  if (
    capability.marker !== "__GATE_D_CAPABILITY__"
    || typeof capability.version !== "string"
    || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(capability.version)
    || !isSupportedProfilerSqliteVersion(capability.version)
    || capability.dbstat !== 1
    || capability.json !== 1
    || capability.queryOnly !== 1
    || capability.main !== databasePath
  ) throw new Error(PROFILER_FAILURE);

  const aggregate = one("aggregate");
  requireKeys(aggregate, ["marker", "conversations", "messages", "executions", "approvals", "runtime_events"]);
  if (aggregate.marker !== "__GATE_D_AGGREGATE__") throw new Error(PROFILER_FAILURE);
  const tableRows = {
    conversations: count(aggregate.conversations),
    messages: count(aggregate.messages),
    executions: count(aggregate.executions),
    approvals: count(aggregate.approvals),
    runtime_events: count(aggregate.runtime_events)
  };

  const eventDeliveryStatus: Record<string, number> = {};
  for (const row of nextJson()) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error(PROFILER_FAILURE);
    const typed = row as Record<string, unknown>;
    requireKeys(typed, ["status", "count"]);
    if (typeof typed.status !== "string" || typed.status.length === 0 || Object.hasOwn(eventDeliveryStatus, typed.status)) {
      throw new Error(PROFILER_FAILURE);
    }
    eventDeliveryStatus[typed.status] = count(typed.count);
  }

  const objectBytes = nextJson().map(row => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error(PROFILER_FAILURE);
    const typed = row as Record<string, unknown>;
    requireKeys(typed, ["name", "bytes"]);
    if (typeof typed.name !== "string" || typed.name.length === 0) throw new Error(PROFILER_FAILURE);
    return { name: typed.name, bytes: count(typed.bytes) };
  });
  if (new Set(objectBytes.map(row => row.name)).size !== objectBytes.length) throw new Error(PROFILER_FAILURE);

  const cardinality = one("cardinality");
  requireKeys(cardinality, [
    "marker", "messagesP50", "messagesP95", "messagesMax",
    "executionsP50", "executionsP95", "executionsMax",
    "runtimeEventsP50", "runtimeEventsP95", "runtimeEventsMax"
  ]);
  if (cardinality.marker !== "__GATE_D_CARDINALITY__") throw new Error(PROFILER_FAILURE);
  const sessionCardinality = {
    messages: {
      p50: count(cardinality.messagesP50), p95: count(cardinality.messagesP95), max: count(cardinality.messagesMax)
    },
    executions: {
      p50: count(cardinality.executionsP50), p95: count(cardinality.executionsP95), max: count(cardinality.executionsMax)
    },
    runtimeEvents: {
      p50: count(cardinality.runtimeEventsP50), p95: count(cardinality.runtimeEventsP95), max: count(cardinality.runtimeEventsMax)
    }
  };

  const queryPlans: GateDOfflineDatabaseProfile["queryPlans"] = [];
  for (const expectedProbe of OFFLINE_PROBE_SQL.map(entry => entry.probe)) {
    const marker = one("probe marker");
    requireKeys(marker, ["marker", "probe"]);
    if (marker.marker !== "__GATE_D_PROBE__" || marker.probe !== expectedProbe) throw new Error(PROFILER_FAILURE);
    const planRows = nextJson();
    if (planRows.length === 0) throw new Error(PROFILER_FAILURE);
    const plan = planRows.map(row => {
      if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error(PROFILER_FAILURE);
      const typed = row as Record<string, unknown>;
      requireKeys(typed, ["id", "parent", "notused", "detail"]);
      count(typed.id);
      count(typed.parent);
      count(typed.notused);
      if (typeof typed.detail !== "string" || typed.detail.length === 0) throw new Error(PROFILER_FAILURE);
      return typed.detail;
    });
    const timer = lines[index++];
    const match = timer?.match(/^Run Time: real (\d+(?:\.\d+)?) user (\d+(?:\.\d+)?) sys (\d+(?:\.\d+)?)$/);
    if (!match) throw new Error(PROFILER_FAILURE);
    const realSeconds = Number(match[1]);
    if (!Number.isFinite(realSeconds) || realSeconds < 0) throw new Error(PROFILER_FAILURE);
    queryPlans.push({ probe: expectedProbe, plan, durationMs: realSeconds * 1000 });
  }

  const completion = one("completion");
  requireKeys(completion, ["marker"]);
  if (completion.marker !== "__GATE_D_COMPLETE__" || index !== lines.length) throw new Error(PROFILER_FAILURE);
  return { tableRows, eventDeliveryStatus, objectBytes, sessionCardinality, queryPlans };
}

function isSupportedProfilerSqliteVersion(version: string): boolean {
  const [major, minor, patch] = version.split(/[.+-]/, 3).map(Number);
  if (![major, minor, patch].every(value => Number.isSafeInteger(value) && value >= 0)) return false;
  return major! > 3 || (major === 3 && (minor! > 33 || (minor === 33 && patch! >= 0)));
}

export function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

export function leastSquaresSlope(values: readonly { x: number; y: number }[]): number {
  if (values.length < 2) return 0;
  const xMean = values.reduce((sum, value) => sum + value.x, 0) / values.length;
  const yMean = values.reduce((sum, value) => sum + value.y, 0) / values.length;
  const denominator = values.reduce((sum, value) => sum + (value.x - xMean) ** 2, 0);
  if (denominator === 0) return 0;
  return values.reduce(
    (sum, value) => sum + (value.x - xMean) * (value.y - yMean),
    0
  ) / denominator;
}

export function writeGateDPerformanceDiagnosticNoOverwrite(
  report: unknown,
  path: string
): void {
  const serialized = serializeGateDPerformanceDiagnostic(report);
  validateGateDPerformanceDiagnosticSnapshot(serialized.snapshot);
  const bytes = Buffer.from(`${serialized.json}\n`, "utf8");
  let fileDescriptor: number | undefined;
  let createdIdentity: { dev: number; ino: number } | undefined;
  try {
    fileDescriptor = openSync(path, "wx", 0o600);
    const createdStat = fstatSync(fileDescriptor);
    createdIdentity = { dev: createdStat.dev, ino: createdStat.ino };
    fchmodSync(fileDescriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fileDescriptor, bytes, offset, bytes.length - offset);
      if (written <= 0) throw new Error("Gate D diagnostic evidence write made no progress");
      offset += written;
    }
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        closeSync(fileDescriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    if (createdIdentity) {
      try {
        const current = lstatSync(path);
        if (current.dev === createdIdentity.dev && current.ino === createdIdentity.ino) unlinkSync(path);
      } catch {
        // The target may already have been removed; preserve the original error.
      }
    }
    throw error;
  }
}

function serializeGateDPerformanceDiagnostic(value: unknown): { json: string; snapshot: unknown } {
  assertStableJsonSource(value, "report", new WeakSet<object>());
  const json = JSON.stringify(value, null, 2);
  if (typeof json !== "string") throw new Error("report must be JSON evidence");
  return { json, snapshot: JSON.parse(json) as unknown };
}

function assertStableJsonSource(value: unknown, path: string, seen: WeakSet<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value !== "object") throw new Error(`${path} must contain only JSON evidence values`);
  if (seen.has(value)) throw new Error(`${path} must not contain circular references`);
  seen.add(value);

  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must contain only plain JSON objects and arrays`);
  }
  const keys = Reflect.ownKeys(value);
  if (array) {
    const indexKeys = keys.filter((key): key is string => typeof key === "string" && key !== "length");
    if (indexKeys.length !== value.length) throw new Error(`${path} must not be a sparse array`);
    for (const key of indexKeys) {
      if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new Error(`${path} has a non-JSON array property`);
      }
    }
  }

  for (const key of keys) {
    if (array && key === "length") continue;
    if (typeof key === "symbol") throw new Error(`${path} must not contain symbol properties`);
    if (key === "toJSON") throw new Error(`${path}.toJSON is not allowed in JSON evidence`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) throw new Error(`${path}.${key} has an unstable property descriptor`);
    if (descriptor.get || descriptor.set) throw new Error(`${path}.${key} accessor is not allowed in JSON evidence`);
    if (!descriptor.enumerable) throw new Error(`${path}.${key} must be enumerable JSON evidence`);
    assertStableJsonSource(descriptor.value, `${path}.${key}`, seen);
  }
}

function exactObject(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const object = value as Record<string, unknown>;
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(object, field)) throw new Error(`${field} is required`);
  }
  const allowed = new Set(fields);
  for (const field of Object.keys(object)) {
    if (!allowed.has(field)) throw new Error(`${path} has unknown field ${field}`);
  }
  return object;
}

function exactLiteral(value: unknown, expected: string | number, path: string): void {
  if (value !== expected) throw new Error(`${path} must be ${String(expected)}`);
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function isoTimestamp(value: unknown, path: string): string {
  const stringValue = nonEmptyString(value, path);
  const parsed = Date.parse(stringValue);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== stringValue) {
    throw new Error(`${path} must be an ISO timestamp`);
  }
  return stringValue;
}

function nonNegativeFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a finite non-negative number`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const numberValue = nonNegativeFinite(value, path);
  if (!Number.isInteger(numberValue)) throw new Error(`${path} must be an integer`);
  return numberValue;
}

function nonNegativeCount(value: unknown, path: string): number {
  return nonNegativeInteger(Number(value), path);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  const values = denseArray(value, path);
  for (let index = 0; index < values.length; index += 1) {
    nonEmptyString(values[index], `${path}[${index}]`);
  }
}

function denseArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error(`${path} must not be a sparse array`);
  }
  return value;
}

function assertNoSensitiveStrings(value: unknown): void {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      if (SENSITIVE_STRING.test(candidate)) throw new Error("Gate D local evidence contains a sensitive string");
      return;
    }
    if (typeof candidate !== "object" || candidate === null) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) visit(candidate[index]);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      visit(key);
      visit(nested);
    }
  };
  visit(value);
}
