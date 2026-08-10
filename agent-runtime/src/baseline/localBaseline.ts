import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  RuntimeBaselineReportSchema,
  type QualificationTrack,
  type RuntimeBaselineFailure,
  type RuntimeBaselineOperation,
  type RuntimeBaselineOperationKind,
  type RuntimeBaselineReport,
  type RuntimeBaselineThresholds,
  type RuntimeBaselineWorkload,
  type RuntimeBaselineWorkloadMix
} from "@openharness/shared-schema";

const SAMPLE_INTERVAL_MS = 30_000;
const RESOURCE_GROWTH_WINDOW_MS = 2 * 60 * 60 * 1000;
const RESOURCE_GROWTH_MAX_RATIO = 0.10;

export const DEFAULT_RUNTIME_BASELINE_THRESHOLDS: RuntimeBaselineThresholds = {
  admissionP95Ms: 100,
  durableReplayP95Ms: 250,
  rssBytes: 1_610_612_736,
  openFileDescriptors: 1_024,
  walBytes: 268_435_456,
  mcpChildCount: 2,
  sustainedBreachMs: 300_000
};

export type RuntimeBaselineSampleInput = RuntimeBaselineReport["samples"][number];

export interface BuildDeterministicBaselineWorkloadOptions {
  seededConversations: number;
  concurrency: number;
}

export type DeterministicRuntimeBaselineWorkload = RuntimeBaselineWorkload & {
  operations: RuntimeBaselineOperation[];
};

export interface CreateRuntimeBaselineReportInput {
  track: QualificationTrack;
  generatedAt: string;
  workload: RuntimeBaselineWorkload;
  environment: Record<string, unknown>;
  samples: RuntimeBaselineSampleInput[];
  thresholds?: RuntimeBaselineThresholds;
}

export interface RuntimeBaselineDatabaseProbe {
  readonly path: string;
  run(sql: string): { changes: number };
  get<T>(sql: string): T | undefined;
}

export interface RuntimeBaselineEventObservation {
  tenantId: string;
  userId: string;
  conversationId: string;
  cursor: number;
  eventId: string;
  visibleTenantId?: string;
  visibleUserId?: string;
}

export interface CollectRuntimeBaselineSampleInput {
  sampledAt: string;
  admissionLatenciesMs: number[];
  durableReplayLatenciesMs: number[];
  database?: RuntimeBaselineDatabaseProbe;
  walPath?: string;
  readRssBytes?: () => number;
  readOpenFileDescriptors?: () => number;
  mcpChildCount?: number | (() => number);
  inspectText?: string;
  hardFailures?: string[];
  operations?: RuntimeBaselineOperation[];
  eventObservations?: RuntimeBaselineEventObservation[];
}

export function buildDeterministicBaselineWorkload(options: BuildDeterministicBaselineWorkloadOptions): DeterministicRuntimeBaselineWorkload {
  if (!Number.isInteger(options.seededConversations) || options.seededConversations <= 0) {
    throw new Error("seededConversations must be a positive integer");
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error("concurrency must be a positive integer");
  }

  const mix: RuntimeBaselineWorkloadMix = {
    noTool: 0.6,
    javaSandbox: 0.2,
    mcp: 0.15,
    approvalInterruption: 0.05
  };
  const counts = distributeOperationCounts(options.seededConversations);
  const operations = Array.from({ length: options.seededConversations }, (_, index) =>
    buildOperation(index, counts, options.seededConversations)
  );

  return {
    seededConversations: options.seededConversations,
    concurrency: options.concurrency,
    mix,
    operations
  };
}

export function evaluateRuntimeBaselineSamples(
  samples: RuntimeBaselineSampleInput[],
  thresholds: RuntimeBaselineThresholds = DEFAULT_RUNTIME_BASELINE_THRESHOLDS
): { failures: RuntimeBaselineFailure[] } {
  const failures = new Map<string, RuntimeBaselineFailure>();
  for (const sample of samples) {
    for (const code of sample.hardFailures) {
      failures.set(code, {
        code,
        message: `Runtime baseline hard failure: ${code}`,
        severity: "hard"
      });
    }
  }

  for (const metric of thresholdMetrics()) {
    if (hasSustainedBreach(samples, thresholds, metric)) {
      failures.set(`SUSTAINED_THRESHOLD_BREACH:${metric}`, {
        code: "SUSTAINED_THRESHOLD_BREACH",
        message: `${metric} breached for at least ${thresholds.sustainedBreachMs}ms`,
        severity: "hard",
        metric
      });
    }
  }

  for (const metric of resourceGrowthMetrics()) {
    const formalFailureCode = metric === "rssBytes"
      ? "RSS_MEDIAN_GROWTH_LIMIT_EXCEEDED"
      : "FD_MEDIAN_GROWTH_LIMIT_EXCEEDED";
    if (failures.has(formalFailureCode)) continue;
    if (hasResourceGrowthBreach(samples, metric)) {
      failures.set(`RESOURCE_GROWTH_BREACH:${metric}`, {
        code: "RESOURCE_GROWTH_BREACH",
        message: `${metric} first-to-last two-hour median growth exceeded ${RESOURCE_GROWTH_MAX_RATIO * 100}%`,
        severity: "hard",
        metric
      });
    }
  }

  return { failures: [...failures.values()] };
}

export function createRuntimeBaselineReport(input: CreateRuntimeBaselineReportInput): RuntimeBaselineReport {
  const thresholds = input.thresholds ?? DEFAULT_RUNTIME_BASELINE_THRESHOLDS;
  const { failures } = evaluateRuntimeBaselineSamples(input.samples, thresholds);
  const restartScheduleFailure = evaluateRestartSchedule(input.environment);
  if (restartScheduleFailure) failures.push(restartScheduleFailure);
  const result = failures.length === 0
    ? (input.track === "local" ? "local_verified" : "pass")
    : "fail";
  const reportWithoutHash = {
    track: input.track,
    generatedAt: input.generatedAt,
    result,
    workload: input.workload,
    environment: input.environment,
    thresholds,
    samples: input.samples,
    failures
  };
  const reportHash = hashCanonicalJson(reportWithoutHash);

  return RuntimeBaselineReportSchema.parse({
    ...reportWithoutHash,
    reportHash
  });
}

export function collectRuntimeBaselineSample(input: CollectRuntimeBaselineSampleInput): RuntimeBaselineSampleInput {
  const hardFailures = new Set(input.hardFailures ?? []);
  const integrityFailure = readSqliteIntegrityFailure(input.database);
  if (integrityFailure) hardFailures.add(integrityFailure);
  if (containsSecretCanary(input.inspectText)) hardFailures.add("SECRET_CANARY_LEAK");
  if (hasDuplicateOperationId(input.operations)) hardFailures.add("DUPLICATE_OPERATION_ID");
  if (hasEventOrderingFailure(input.eventObservations)) hardFailures.add("EVENT_ORDERING_FAILURE");
  if (hasCrossScopeLeakage(input.eventObservations)) hardFailures.add("CROSS_SCOPE_LEAKAGE");

  return {
    sampledAt: input.sampledAt,
    admissionP95Ms: percentile95(input.admissionLatenciesMs),
    durableReplayP95Ms: percentile95(input.durableReplayLatenciesMs),
    rssBytes: Math.max(0, Math.floor((input.readRssBytes ?? readProcessRssBytes)())),
    openFileDescriptors: Math.max(0, Math.floor((input.readOpenFileDescriptors ?? readOpenFileDescriptorCount)())),
    walBytes: measureWalBytes(input.database, input.walPath),
    mcpChildCount: readMcpChildCount(input.mcpChildCount),
    hardFailures: [...hardFailures]
  };
}

function distributeOperationCounts(total: number): Record<RuntimeBaselineOperationKind, number> {
  const noTool = Math.round(total * 0.6);
  const javaSandbox = Math.round(total * 0.2);
  const mcp = Math.round(total * 0.15);
  return {
    no_tool: noTool,
    java_sandbox: javaSandbox,
    mcp,
    approval_interruption: total - noTool - javaSandbox - mcp
  };
}

function buildOperation(
  index: number,
  counts: Record<RuntimeBaselineOperationKind, number>,
  total: number
): RuntimeBaselineOperation {
  const collisionWindow = Math.max(1, Math.ceil(total / 2));
  const baseIndex = index % collisionWindow;
  const collisionRound = Math.floor(index / collisionWindow);
  const tenantAFirst = baseIndex % 2 === 0;
  const userAFirst = Math.floor(baseIndex / 2) % 2 === 0;

  return {
    operationId: `op-${String(index + 1).padStart(6, "0")}`,
    tenantId: (tenantAFirst !== (collisionRound % 2 === 1)) ? "tenant-a" : "tenant-b",
    userId: (userAFirst !== (collisionRound % 2 === 1)) ? "user-a" : "user-b",
    conversationId: `conv-${String(baseIndex + 1).padStart(6, "0")}`,
    kind: operationKindForIndex(index, counts)
  };
}

function operationKindForIndex(index: number, counts: Record<RuntimeBaselineOperationKind, number>): RuntimeBaselineOperationKind {
  if (index < counts.no_tool) return "no_tool";
  if (index < counts.no_tool + counts.java_sandbox) return "java_sandbox";
  if (index < counts.no_tool + counts.java_sandbox + counts.mcp) return "mcp";
  return "approval_interruption";
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function readProcessRssBytes(): number {
  return process.memoryUsage().rss;
}

function readOpenFileDescriptorCount(): number {
  for (const dir of ["/proc/self/fd", "/dev/fd"]) {
    if (!existsSync(dir)) continue;
    try {
      return readdirSync(dir).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

function measureWalBytes(database?: RuntimeBaselineDatabaseProbe, walPath?: string): number {
  if (database) database.run("PRAGMA wal_checkpoint(PASSIVE)");
  const path = walPath ?? (database ? `${database.path}-wal` : undefined);
  if (!path || !existsSync(path)) return 0;
  return statSync(path).size;
}

function readSqliteIntegrityFailure(database?: RuntimeBaselineDatabaseProbe): string | null {
  if (!database) return null;
  const result = database.get<Record<string, unknown>>("PRAGMA integrity_check");
  const integrityCheck = result ? Object.values(result)[0] : "ok";
  return integrityCheck === "ok" ? null : "SQLITE_INTEGRITY_FAILURE";
}

function containsSecretCanary(value?: string): boolean {
  return typeof value === "string" && value.includes("OPENHARNESS_SECRET_CANARY");
}

function readMcpChildCount(input?: number | (() => number)): number {
  if (typeof input === "function") return Math.max(0, Math.floor(input()));
  return Math.max(0, Math.floor(input ?? 0));
}

function hasDuplicateOperationId(operations?: RuntimeBaselineOperation[]): boolean {
  if (!operations) return false;
  const seen = new Set<string>();
  for (const operation of operations) {
    if (seen.has(operation.operationId)) return true;
    seen.add(operation.operationId);
  }
  return false;
}

function hasEventOrderingFailure(events?: RuntimeBaselineEventObservation[]): boolean {
  if (!events) return false;
  const previousCursorByScope = new Map<string, number>();
  for (const event of events) {
    const scope = `${event.tenantId}:${event.userId}:${event.conversationId}`;
    const previous = previousCursorByScope.get(scope);
    if (previous !== undefined && event.cursor <= previous) return true;
    previousCursorByScope.set(scope, event.cursor);
  }
  return false;
}

function hasCrossScopeLeakage(events?: RuntimeBaselineEventObservation[]): boolean {
  if (!events) return false;
  return events.some((event) =>
    (event.visibleTenantId !== undefined && event.visibleTenantId !== event.tenantId) ||
    (event.visibleUserId !== undefined && event.visibleUserId !== event.userId)
  );
}

function thresholdMetrics(): (keyof Omit<RuntimeBaselineThresholds, "sustainedBreachMs">)[] {
  return [
    "admissionP95Ms",
    "durableReplayP95Ms",
    "rssBytes",
    "openFileDescriptors",
    "walBytes",
    "mcpChildCount"
  ];
}

function resourceGrowthMetrics(): ("rssBytes" | "openFileDescriptors")[] {
  return ["rssBytes", "openFileDescriptors"];
}

function hasSustainedBreach(
  samples: RuntimeBaselineSampleInput[],
  thresholds: RuntimeBaselineThresholds,
  metric: keyof Omit<RuntimeBaselineThresholds, "sustainedBreachMs">
): boolean {
  const requiredConsecutiveSamples = Math.ceil(thresholds.sustainedBreachMs / SAMPLE_INTERVAL_MS);
  let consecutiveSamples = 0;
  for (const sample of samples) {
    if (sample[metric] > thresholds[metric]) {
      consecutiveSamples += 1;
      if (consecutiveSamples >= requiredConsecutiveSamples) return true;
    } else {
      consecutiveSamples = 0;
    }
  }
  return false;
}

function hasResourceGrowthBreach(
  samples: RuntimeBaselineSampleInput[],
  metric: "rssBytes" | "openFileDescriptors"
): boolean {
  const timestamps = samples.map((sample) => Date.parse(sample.sampledAt));
  if (timestamps.some((timestamp) => Number.isNaN(timestamp))) return false;
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps.at(-1);
  if (firstTimestamp === undefined || lastTimestamp === undefined) return false;
  if ((lastTimestamp - firstTimestamp) < RESOURCE_GROWTH_WINDOW_MS * 2) return false;

  const firstWindowEnd = firstTimestamp + RESOURCE_GROWTH_WINDOW_MS;
  const lastWindowStart = lastTimestamp - RESOURCE_GROWTH_WINDOW_MS;
  const firstValues = samples
    .filter((_, index) => timestamps[index]! <= firstWindowEnd)
    .map((sample) => sample[metric]);
  const lastValues = samples
    .filter((_, index) => timestamps[index]! >= lastWindowStart)
    .map((sample) => sample[metric]);
  if (firstValues.length === 0 || lastValues.length === 0) return false;

  const firstMedian = median(firstValues);
  const lastMedian = median(lastValues);
  if (firstMedian === 0) return lastMedian > 0;
  return ((lastMedian - firstMedian) / firstMedian) > RESOURCE_GROWTH_MAX_RATIO;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function evaluateRestartSchedule(environment: Record<string, unknown>): RuntimeBaselineFailure | null {
  const baselineKind = environment.baselineKind;
  if (baselineKind !== "fixed-24-hour-local-soak" && baselineKind !== "fixed-24-hour-soak") return null;
  if (baselineKind === "fixed-24-hour-soak" && environment.runComplete !== true) return null;

  const planned = numberArray(environment.restartScheduleMs);
  const observed = numberArray(environment.observedRestartScheduleMs);
  if (planned && planned.length > 0 && observed && sameNumberArray(planned, observed)) return null;

  return {
    code: "RESTART_SCHEDULE_MISMATCH",
    message: "Observed TS-only restart schedule did not match the planned 24-hour soak schedule",
    severity: "hard",
    metric: "restartScheduleMs"
  };
}

function numberArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "number")
    ? value
    : null;
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function hashCanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)])
    );
  }
  return value;
}
