import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMcpConfigFile } from "../mcpRegistry";
import { probeGateDJavaFixtures, probeGateDMcpFixture } from "./formalSoakCli";
import {
  assertGateDPerformanceDiagnosticReport,
  leastSquaresSlope,
  profileGateDOfflineDatabase,
  runGateDPerformanceDiagnostic,
  type GateDOfflineDatabaseProfile,
  type GateDPerformanceDiagnosticReport,
  type GateDPerformanceDiagnosticVariant,
  type RunGateDPerformanceDiagnosticInput
} from "./gateDPerformanceDiagnostics";

const DIAGNOSTIC_VARIANTS = ["full-oracle", "incremental-oracle", "workload-only"] as const;
const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SENSITIVE_STRING = /OPENHARNESS_SECRET_CANARY|Bearer\s|sk-[a-z0-9]|(?:api|access|service)[_-]?token|password|api[_-]?key/i;
const MATERIAL_REDUCTION_RATIO = 0.8;
const ANALYSIS_WINDOW_SAMPLES = 10;
const REQUIRED_DIAGNOSTIC_SAMPLES = 60;
const ADMISSION_P95_THRESHOLD_MS = 100;
const DURABLE_REPLAY_P95_THRESHOLD_MS = 250;
const SUSTAINED_BREACH_SAMPLES = 10;
const EXPECTED_PROJECT_ROOT = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
const FULL_ORACLE_PROBE_SIGNATURE = [
  "incremental-events",
  "dead-letter",
  "orphaned-approval",
  "duplicate-event",
  "sqlite-busy",
  "event-secret-canary",
  "message-secret-canary"
] as const;
const INCREMENTAL_ORACLE_PROBE_SIGNATURE = ["incremental-events"] as const;
const WORKLOAD_ONLY_PROBE_SIGNATURE = [] as const;

const PROFILE_FLAGS = ["--project-root", "--input-sqlite", "--output"] as const;
const RUN_FLAGS = [
  "--project-root",
  "--run-id",
  "--variant",
  "--java-url",
  "--mcp-config",
  "--sqlite-path",
  "--output"
] as const;
const ANALYZE_FLAGS = [
  "--project-root",
  "--full-report",
  "--incremental-report",
  "--workload-report",
  "--output"
] as const;

type GateDPerformanceDiagnosticCommand = "profile" | "run" | "analyze";

export interface GateDPerformanceDiagnosisDecision {
  schemaVersion: 1;
  track: "local";
  evidenceKind: "gate-d-performance-diagnosis";
  generatedAt: string;
  result: "confirmed" | "inconclusive";
  primaryCause:
    | "database-oracle-contention"
    | "session-replay-growth"
    | "outbox-backlog"
    | "combined"
    | "unresolved";
  findings: {
    hypothesis: string;
    status: "confirmed" | "rejected" | "contributing" | "unresolved";
    evidence: string[];
  }[];
  nextOpenSpecDecision: "existing-change" | "new-proposal-required" | "human-decision-required";
}

export interface GateDPerformanceDiagnosticCliDependencies {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  profileDatabase?: typeof profileGateDOfflineDatabase;
  runDiagnostic?: (
    input: RunGateDPerformanceDiagnosticInput
  ) => Promise<GateDPerformanceDiagnosticReport>;
  validateMcpConfig?: (path: string) => void | Promise<void>;
  probeJava?: typeof probeGateDJavaFixtures;
  probeMcp?: typeof probeGateDMcpFixture;
  writeOutput?: (value: string) => void;
  writeError?: (value: string) => void;
}

interface ReportAnalysis {
  admission: MetricAnalysis;
  replay: MetricAnalysis;
  pendingFirstMedian: number;
  pendingLastMedian: number;
  hasHardFailures: boolean;
}

interface MetricAnalysis {
  firstMedian: number;
  lastMedian: number;
  slopePerRuntimeEvent: number;
  sustainedBreach: boolean;
}

export async function runGateDPerformanceDiagnosticCli(
  argv: string[],
  dependencies: GateDPerformanceDiagnosticCliDependencies = {}
): Promise<number> {
  const writeOutput = dependencies.writeOutput ?? (value => process.stdout.write(`${value}\n`));
  const writeError = dependencies.writeError ?? (value => process.stderr.write(`${value}\n`));
  try {
    assertNoSensitiveArguments(argv);
    const values = argv[0] === "--" ? argv.slice(1) : [...argv];
    const command = parseCommand(values.shift());
    if (command === "profile") await executeProfile(values, dependencies);
    else if (command === "run") await executeRun(values, dependencies);
    else await executeAnalyze(values, dependencies);
    writeOutput(JSON.stringify({ result: "ok", command }));
    return 0;
  } catch (error) {
    writeError(JSON.stringify({ result: "blocked", errorClass: classifyError(error) }));
    return 2;
  }
}

async function executeProfile(
  argv: string[],
  dependencies: GateDPerformanceDiagnosticCliDependencies
): Promise<void> {
  const options = parseFlags(argv, PROFILE_FLAGS);
  const root = canonicalProjectRoot(options["--project-root"]);
  const inputSqlite = canonicalInput(root, options["--input-sqlite"], "input SQLite");
  const output = canonicalOutput(root, options["--output"], "profile output");
  const profile = (dependencies.profileDatabase ?? profileGateDOfflineDatabase)(inputSqlite, {
    generatedAt: (dependencies.now?.() ?? new Date()).toISOString()
  });
  assertOfflineProfile(profile);
  writeStableJsonNoOverwrite(output, profile);
}

async function executeRun(
  argv: string[],
  dependencies: GateDPerformanceDiagnosticCliDependencies
): Promise<void> {
  const options = parseFlags(argv, RUN_FLAGS);
  const root = canonicalProjectRoot(options["--project-root"]);
  const runId = options["--run-id"];
  if (!RUN_ID.test(runId)) throw new Error("Gate D diagnostic runId is invalid");
  const variant = diagnosticVariant(options["--variant"]);
  const javaUrl = loopbackHttpUrl(options["--java-url"]);
  const mcpConfigPath = canonicalInput(root, options["--mcp-config"], "MCP config");
  const sqlitePath = canonicalOutput(root, options["--sqlite-path"], "run SQLite");
  const outputPath = canonicalOutput(root, options["--output"], "run output");
  if (sqlitePath === outputPath) throw new Error("Gate D diagnostic run targets must be distinct");
  assertNotImmutableAttemptTarget(root, sqlitePath);
  assertNotImmutableAttemptTarget(root, outputPath);
  if (SENSITIVE_STRING.test(runId) || SENSITIVE_STRING.test(basename(sqlitePath)) || SENSITIVE_STRING.test(basename(outputPath))) {
    throw new Error("Gate D diagnostic output binding is sensitive");
  }
  const hasJavaProbeOverride = dependencies.probeJava !== undefined;
  const hasMcpProbeOverride = dependencies.probeMcp !== undefined;
  if (hasJavaProbeOverride !== hasMcpProbeOverride) {
    throw new Error("Gate D diagnostic probe test seams must be supplied as a complete pair");
  }
  await (dependencies.validateMcpConfig ?? validateMcpConfig)(mcpConfigPath);

  const serviceToken = (dependencies.env ?? process.env).OPENHARNESS_SERVICE_TOKEN?.trim();
  if (!serviceToken) throw new Error("Gate D diagnostic service credential is unavailable");
  await (dependencies.probeJava ?? probeGateDJavaFixtures)({ javaUrl, serviceToken });
  await (dependencies.probeMcp ?? probeGateDMcpFixture)(mcpConfigPath);
  const report = await (dependencies.runDiagnostic ?? runGateDPerformanceDiagnostic)({
    runId,
    variant,
    javaUrl,
    mcpConfigPath,
    sqlitePath,
    outputPath,
    serviceToken
  });
  assertGateDPerformanceDiagnosticReport(report);
  if (
    report.runId !== runId
    || report.variant !== variant
    || report.environment.databaseBasename !== basename(sqlitePath)
    || report.samples.length !== REQUIRED_DIAGNOSTIC_SAMPLES
  ) {
    throw new Error("Gate D diagnostic run report binding mismatch");
  }
  if (JSON.stringify(report).includes(serviceToken)) {
    throw new Error("Gate D diagnostic run report contains sensitive data");
  }
}

async function executeAnalyze(
  argv: string[],
  dependencies: GateDPerformanceDiagnosticCliDependencies
): Promise<void> {
  const options = parseFlags(argv, ANALYZE_FLAGS);
  const root = canonicalProjectRoot(options["--project-root"]);
  const paths = {
    full: canonicalInput(root, options["--full-report"], "full report"),
    incremental: canonicalInput(root, options["--incremental-report"], "incremental report"),
    workload: canonicalInput(root, options["--workload-report"], "workload report")
  };
  if (new Set(Object.values(paths)).size !== 3) {
    throw new Error("Gate D diagnosis requires three distinct reports");
  }
  const output = canonicalOutput(root, options["--output"], "diagnosis output");
  const reports = {
    full: readDiagnosticReport(paths.full, "full-oracle"),
    incremental: readDiagnosticReport(paths.incremental, "incremental-oracle"),
    workload: readDiagnosticReport(paths.workload, "workload-only")
  };
  assertComparableReports(Object.values(reports));
  const decision = analyzeReports(reports, (dependencies.now?.() ?? new Date()).toISOString());
  writeStableJsonNoOverwrite(output, decision);
}

function parseCommand(value: string | undefined): GateDPerformanceDiagnosticCommand {
  if (value === "profile" || value === "run" || value === "analyze") return value;
  throw new Error("Unsupported Gate D diagnostic command");
}

function parseFlags<const T extends readonly string[]>(
  argv: string[],
  requiredFlags: T
): Record<T[number], string> {
  const allowed = new Set<string>(requiredFlags);
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || !allowed.has(flag)) throw new Error("Unknown Gate D diagnostic flag");
    if (value === undefined || value.startsWith("--")) throw new Error("Missing Gate D diagnostic flag value");
    if (parsed.has(flag)) throw new Error("Duplicate Gate D diagnostic flag");
    parsed.set(flag, value);
  }
  for (const flag of requiredFlags) {
    if (!parsed.has(flag)) throw new Error("Missing Gate D diagnostic required flag");
  }
  return Object.fromEntries(parsed) as Record<T[number], string>;
}

function canonicalProjectRoot(path: string): string {
  if (!isAbsolute(path)) throw new Error("Gate D diagnostic project root must be absolute");
  const canonical = realpathSync(path);
  if (!statSync(canonical).isDirectory()) throw new Error("Gate D diagnostic project root must be a directory");
  if (canonical !== EXPECTED_PROJECT_ROOT) throw new Error("Gate D diagnostic project root does not match the repository root");
  return canonical;
}

function canonicalInput(root: string, path: string, label: string): string {
  if (!isAbsolute(path)) throw new Error(`Gate D diagnostic ${label} path must be absolute`);
  const canonical = realpathSync(path);
  assertWithinRoot(root, canonical, label);
  if (!statSync(canonical).isFile()) throw new Error(`Gate D diagnostic ${label} must be a file`);
  return canonical;
}

function canonicalOutput(root: string, path: string, label: string): string {
  if (!isAbsolute(path)) throw new Error(`Gate D diagnostic ${label} path must be absolute`);
  const canonicalParent = realpathSync(dirname(path));
  assertWithinRoot(root, canonicalParent, label);
  const canonical = resolve(canonicalParent, basename(path));
  if (canonical === canonicalParent || pathExistsNoFollow(canonical)) {
    throw new Error(`Gate D diagnostic ${label} already exists`);
  }
  return canonical;
}

function assertWithinRoot(root: string, path: string, label: string): void {
  const suffix = relative(root, path);
  if (suffix === "" || (!suffix.startsWith(`..${sep}`) && suffix !== ".." && !isAbsolute(suffix))) return;
  throw new Error(`Gate D diagnostic ${label} escapes project root`);
}

function pathExistsNoFollow(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function assertNotImmutableAttemptTarget(root: string, path: string): void {
  const segments = relative(root, path).split(sep);
  if (segments.some(segment =>
    /^gate-d-\d{8}-00[12]$/i.test(segment) || /^attempt[-_]?0*(?:1|2)$/i.test(segment)
  )) {
    throw new Error("Gate D immutable attempt target is forbidden");
  }
}

function diagnosticVariant(value: string): GateDPerformanceDiagnosticVariant {
  if (DIAGNOSTIC_VARIANTS.includes(value as GateDPerformanceDiagnosticVariant)) {
    return value as GateDPerformanceDiagnosticVariant;
  }
  throw new Error("Gate D diagnostic variant is unsupported");
}

function loopbackHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Gate D Java URL must be an absolute loopback HTTP URL");
  }
  if (
    parsed.protocol !== "http:"
    || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost" && parsed.hostname !== "[::1]")
    || parsed.username !== ""
    || parsed.password !== ""
    || (parsed.pathname !== "/" && parsed.pathname !== "")
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error("Gate D Java URL must be an absolute loopback HTTP URL");
  }
  return parsed.origin;
}

function validateMcpConfig(path: string): void {
  loadMcpConfigFile(path);
}

function readDiagnosticReport(
  path: string,
  expectedVariant: GateDPerformanceDiagnosticVariant
): GateDPerformanceDiagnosticReport {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("Gate D diagnostic report is not valid JSON");
  }
  assertGateDPerformanceDiagnosticReport(value);
  if (value.variant !== expectedVariant) throw new Error("Gate D diagnostic report variant mismatch");
  if (value.samples.length !== REQUIRED_DIAGNOSTIC_SAMPLES) {
    throw new Error("Gate D diagnostic report must contain exactly 60 samples");
  }
  assertAnalyzableReportStructure(value);
  return value;
}

function assertAnalyzableReportStructure(report: GateDPerformanceDiagnosticReport): void {
  const expectedSignature = report.variant === "full-oracle"
    ? FULL_ORACLE_PROBE_SIGNATURE
    : report.variant === "incremental-oracle"
      ? INCREMENTAL_ORACLE_PROBE_SIGNATURE
      : WORKLOAD_ONLY_PROBE_SIGNATURE;
  let previousSampledAt: number | undefined;
  for (let position = 0; position < report.samples.length; position += 1) {
    const sample = report.samples[position]!;
    if (sample.sampleIndex !== position) {
      throw new Error("Gate D diagnostic report sampleIndex sequence mismatch");
    }
    const sampledAt = Date.parse(sample.sampledAt);
    if (!Number.isFinite(sampledAt) || (previousSampledAt !== undefined && sampledAt <= previousSampledAt)) {
      throw new Error("Gate D diagnostic report sampledAt values must be strictly increasing");
    }
    previousSampledAt = sampledAt;
    if (
      sample.probeTimings.length !== expectedSignature.length
      || sample.probeTimings.some((timing, index) => timing.probe !== expectedSignature[index])
    ) {
      throw new Error("Gate D diagnostic report probe timing signature mismatch");
    }
  }
  if (previousSampledAt === undefined || Date.parse(report.generatedAt) < previousSampledAt) {
    throw new Error("Gate D diagnostic report generatedAt precedes the final sample");
  }
}

function assertComparableReports(reports: readonly GateDPerformanceDiagnosticReport[]): void {
  if (new Set(reports.map(report => report.runId)).size !== reports.length) {
    throw new Error("Gate D diagnostic report runIds must be distinct");
  }
  if (new Set(reports.map(report => report.environment.databaseBasename)).size !== reports.length) {
    throw new Error("Gate D diagnostic database basenames must be distinct");
  }
  const fingerprint = reports.map(report => [
    report.environment.nodeVersion,
    report.environment.platform,
    report.environment.architecture
  ].join("\0"));
  if (new Set(fingerprint).size !== 1) throw new Error("Gate D diagnostic environment fingerprint mismatch");
}

function analyzeReports(
  reports: {
    full: GateDPerformanceDiagnosticReport;
    incremental: GateDPerformanceDiagnosticReport;
    workload: GateDPerformanceDiagnosticReport;
  },
  generatedAt: string
): GateDPerformanceDiagnosisDecision {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Gate D diagnosis timestamp is invalid");
  const summaries = {
    full: analyzeReport(reports.full),
    incremental: analyzeReport(reports.incremental),
    workload: analyzeReport(reports.workload)
  };
  const admissionConfirmed = metricConfirmsOracle(
    summaries.full.admission,
    summaries.incremental.admission,
    summaries.workload.admission
  );
  const replayConfirmed = metricConfirmsOracle(
    summaries.full.replay,
    summaries.incremental.replay,
    summaries.workload.replay
  );
  const noHardFailures = !summaries.full.hasHardFailures
    && !summaries.incremental.hasHardFailures
    && !summaries.workload.hasHardFailures;
  const oracleConfirmed = noHardFailures && (admissionConfirmed || replayConfirmed);
  const fullSignal = hasMetricSignal(summaries.full.admission) || hasMetricSignal(summaries.full.replay);
  const replayContributing = hasMetricSignal(summaries.workload.replay)
    || summaries.workload.replay.lastMedian > summaries.workload.replay.firstMedian;
  const outboxContributing = summaries.workload.pendingLastMedian > summaries.workload.pendingFirstMedian;
  const findings: GateDPerformanceDiagnosisDecision["findings"] = [
    {
      hypothesis: "database-oracle-contention",
      status: oracleConfirmed ? "confirmed" : fullSignal ? "unresolved" : "rejected",
      evidence: [
        metricEvidence("full admission", summaries.full.admission),
        metricEvidence("full replay", summaries.full.replay),
        metricEvidence("incremental admission", summaries.incremental.admission),
        metricEvidence("incremental replay", summaries.incremental.replay),
        metricEvidence("workload admission", summaries.workload.admission),
        metricEvidence("workload replay", summaries.workload.replay),
        `material reduction rule: control latency or corresponding slope must be <= full * ${MATERIAL_REDUCTION_RATIO} (at least 20% lower), symmetrically for both controls`,
        noHardFailures ? "all three reports contain no hard failures" : "hard failures prevent confirmation"
      ]
    },
    {
      hypothesis: "session-replay-growth",
      status: replayContributing ? "contributing" : "unresolved",
      evidence: [
        metricEvidence("workload replay", summaries.workload.replay),
        "confirmation unavailable: analyze has no immutable-profile proof of rising scoped replay cost"
      ]
    },
    {
      hypothesis: "outbox-backlog",
      status: outboxContributing ? "contributing" : "unresolved",
      evidence: [
        `workload pending first10Median=${formatNumber(summaries.workload.pendingFirstMedian)} last10Median=${formatNumber(summaries.workload.pendingLastMedian)}`,
        "confirmation unavailable: analyze has no static-wiring proof that delivery lifecycle is absent or stalled"
      ]
    }
  ];
  const result = oracleConfirmed ? "confirmed" : "inconclusive";
  const primaryCause = oracleConfirmed
    ? "database-oracle-contention"
    : replayContributing && outboxContributing ? "combined" : "unresolved";
  return {
    schemaVersion: 1,
    track: "local",
    evidenceKind: "gate-d-performance-diagnosis",
    generatedAt,
    result,
    primaryCause,
    findings,
    nextOpenSpecDecision: oracleConfirmed ? "existing-change" : "human-decision-required"
  };
}

function analyzeReport(report: GateDPerformanceDiagnosticReport): ReportAnalysis {
  return {
    admission: analyzeMetric(report, sample => sample.admissionP95Ms, ADMISSION_P95_THRESHOLD_MS),
    replay: analyzeMetric(report, sample => sample.durableReplayP95Ms, DURABLE_REPLAY_P95_THRESHOLD_MS),
    pendingFirstMedian: median(report.samples.slice(0, ANALYSIS_WINDOW_SAMPLES).map(sample => sample.pendingEvents)),
    pendingLastMedian: median(report.samples.slice(-ANALYSIS_WINDOW_SAMPLES).map(sample => sample.pendingEvents)),
    hasHardFailures: report.hardFailures.length > 0 || report.samples.some(sample => sample.hardFailures.length > 0)
  };
}

function analyzeMetric(
  report: GateDPerformanceDiagnosticReport,
  select: (sample: GateDPerformanceDiagnosticReport["samples"][number]) => number,
  threshold: number
): MetricAnalysis {
  const values = report.samples.map(select);
  return {
    firstMedian: median(values.slice(0, ANALYSIS_WINDOW_SAMPLES)),
    lastMedian: median(values.slice(-ANALYSIS_WINDOW_SAMPLES)),
    slopePerRuntimeEvent: leastSquaresSlope(report.samples.map(sample => ({
      x: sample.runtimeEvents,
      y: select(sample)
    }))),
    sustainedBreach: hasSustainedBreach(values, threshold)
  };
}

function hasSustainedBreach(values: readonly number[], threshold: number): boolean {
  let consecutive = 0;
  for (const value of values) {
    if (value > threshold) {
      consecutive += 1;
      if (consecutive >= SUSTAINED_BREACH_SAMPLES) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

function metricConfirmsOracle(full: MetricAnalysis, incremental: MetricAnalysis, workload: MetricAnalysis): boolean {
  if (!hasMetricSignal(full)) return false;
  return controlMateriallyReduces(full, incremental) && controlMateriallyReduces(full, workload);
}

function hasMetricSignal(metric: MetricAnalysis): boolean {
  return metric.slopePerRuntimeEvent > 0 || metric.sustainedBreach;
}

function controlMateriallyReduces(full: MetricAnalysis, control: MetricAnalysis): boolean {
  return materiallyReduced(full.lastMedian, control.lastMedian)
    || materiallyReduced(full.slopePerRuntimeEvent, control.slopePerRuntimeEvent);
}

function materiallyReduced(full: number, control: number): boolean {
  return full > 0 && control <= full * MATERIAL_REDUCTION_RATIO;
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Gate D diagnosis median requires samples");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function metricEvidence(label: string, metric: MetricAnalysis): string {
  return `${label}: first10Median=${formatNumber(metric.firstMedian)} last10Median=${formatNumber(metric.lastMedian)} slopePerRuntimeEvent=${formatNumber(metric.slopePerRuntimeEvent)} sustainedThresholdBreach=${metric.sustainedBreach}`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(9)).toString();
}

function assertOfflineProfile(value: GateDOfflineDatabaseProfile): void {
  assertPlainDenseSecretFreeJson(value, "profile", new WeakSet<object>());
  if (
    value.schemaVersion !== 1
    || value.track !== "local"
    || value.evidenceKind !== "gate-d-offline-database-profile"
    || !Number.isFinite(Date.parse(value.generatedAt))
  ) {
    throw new Error("Gate D offline database profile is invalid");
  }
}

function writeStableJsonNoOverwrite(path: string, value: unknown): void {
  assertPlainDenseSecretFreeJson(value, "output", new WeakSet<object>());
  const json = JSON.stringify(value, null, 2);
  if (typeof json !== "string" || SENSITIVE_STRING.test(json)) {
    throw new Error("Gate D diagnostic output is not safe JSON");
  }
  const bytes = Buffer.from(`${json}\n`, "utf8");
  const flags = fsConstants.O_WRONLY
    | fsConstants.O_CREAT
    | fsConstants.O_EXCL
    | (fsConstants.O_NOFOLLOW ?? 0);
  let descriptor: number | undefined;
  let identity: { dev: number; ino: number } | undefined;
  try {
    descriptor = openSync(path, flags, 0o600);
    const created = fstatSync(descriptor);
    identity = { dev: created.dev, ino: created.ino };
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (written <= 0) throw new Error("Gate D diagnostic output write made no progress");
      offset += written;
    }
    fsyncSync(descriptor);
    const named = lstatSync(path);
    if (named.dev !== identity.dev || named.ino !== identity.ino) {
      throw new Error("Gate D diagnostic output identity changed after write");
    }
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original failure.
      }
    }
    if (identity !== undefined) {
      try {
        const named = lstatSync(path);
        if (named.dev === identity.dev && named.ino === identity.ino) unlinkSync(path);
      } catch {
        // Preserve the original failure and never delete a replacement.
      }
    }
    throw error;
  }
}

function assertPlainDenseSecretFreeJson(value: unknown, path: string, seen: WeakSet<object>): void {
  if (typeof value === "string") {
    if (SENSITIVE_STRING.test(value)) throw new Error("Gate D diagnostic output contains sensitive data");
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Gate D diagnostic ${path} contains a non-finite number`);
    return;
  }
  if (typeof value !== "object") throw new Error(`Gate D diagnostic ${path} is not plain JSON`);
  if (seen.has(value)) throw new Error(`Gate D diagnostic ${path} contains a cycle`);
  seen.add(value);
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new Error(`Gate D diagnostic ${path} is not plain JSON`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string")) throw new Error(`Gate D diagnostic ${path} has symbol keys`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (isArray) {
    const indexes = keys.filter(key => key !== "length");
    if (indexes.length !== value.length) throw new Error(`Gate D diagnostic ${path} is sparse`);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error(`Gate D diagnostic ${path}[${index}] has an accessor`);
      }
      assertPlainDenseSecretFreeJson(descriptor.value, `${path}[${index}]`, seen);
    }
  } else {
    for (const key of keys as string[]) {
      if (SENSITIVE_STRING.test(key)) throw new Error("Gate D diagnostic output contains sensitive data");
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error(`Gate D diagnostic ${path}.${key} has an accessor`);
      }
      assertPlainDenseSecretFreeJson(descriptor.value, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function assertNoSensitiveArguments(argv: readonly string[]): void {
  if (argv.some(value => SENSITIVE_STRING.test(value))) {
    throw new Error("Gate D diagnostic arguments contain sensitive data");
  }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

function classifyError(error: unknown): string {
  if (isNodeError(error) && error.code === "ENOENT") return "path_not_found";
  if (isNodeError(error) && error.code === "EEXIST") return "output_exists";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("already exists")) return "output_exists";
  if (message.includes("identity changed")) return "output_identity_changed";
  if (message.includes("insufficient") || message.includes("mismatch")) return "evidence_mismatch";
  return "invalid_input";
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  process.exitCode = await runGateDPerformanceDiagnosticCli(process.argv.slice(2));
}
