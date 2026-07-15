import { createHash } from "node:crypto";
import type { RuntimeBaselineReport, RuntimeBaselineThresholds } from "@openharness/shared-schema";
import {
  buildDeterministicBaselineWorkload,
  createRuntimeBaselineReport,
  DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
  type DeterministicRuntimeBaselineWorkload,
  type RuntimeBaselineSampleInput
} from "./localBaseline";

const HOUR_MS = 60 * 60 * 1000;
const FIXED_DURATION_MS = 24 * HOUR_MS;
const FIXED_SAMPLE_INTERVAL_MS = 30_000;
const FIXED_RESTART_AT_MS = [2 * HOUR_MS, 12 * HOUR_MS, 22 * HOUR_MS];
const FIXED_SEEDED_CONVERSATIONS = 10_000;
const FIXED_CONCURRENCY = 20;
const RESOURCE_GROWTH_WINDOW_MS = 2 * HOUR_MS;
const RESOURCE_GROWTH_LIMIT = 0.10;
const FIXED_WORKLOAD = buildDeterministicBaselineWorkload({
  seededConversations: FIXED_SEEDED_CONVERSATIONS,
  concurrency: FIXED_CONCURRENCY
});

export type FixedTwentyFourHourSoakPreflightFailure =
  | "JAVA_GATEWAY_NOT_RUNNING"
  | "DETERMINISTIC_FIXTURES_NOT_READY"
  | "INSUFFICIENT_DISK_HEADROOM"
  | "REPORT_PATH_MISSING"
  | "MONITORING_NOT_READY"
  | "INTERRUPTION_PROCEDURE_MISSING";

export interface FixedTwentyFourHourSoakPreflightInput {
  javaGatewayRunning: boolean;
  deterministicFixturesReady: boolean;
  diskHeadroomBytes: number;
  minimumDiskHeadroomBytes: number;
  reportPath?: string;
  monitoringReady: boolean;
  interruptionProcedureDocumented: boolean;
}

export interface FixedTwentyFourHourSoakPreflight {
  result: "pass" | "blocked";
  failures: FixedTwentyFourHourSoakPreflightFailure[];
  diskHeadroomBytes: number;
  minimumDiskHeadroomBytes: number;
  reportPath?: string;
}

export interface GateDApproval {
  approved: true;
  approvedBy: string;
  approvedAt: string;
  reason: string;
}

export interface CreateFixedTwentyFourHourSoakConfigInput {
  generatedAt: string;
  environment: Record<string, unknown>;
  gateDApproval?: GateDApproval;
  preflight?: FixedTwentyFourHourSoakPreflight;
  thresholds?: RuntimeBaselineThresholds;
}

export interface FixedTwentyFourHourSoakConfig {
  track: "production";
  generatedAt: string;
  environment: Record<string, unknown>;
  durationMs: number;
  sampleIntervalMs: number;
  restartAtMs: number[];
  workload: DeterministicRuntimeBaselineWorkload;
  thresholds: RuntimeBaselineThresholds;
  gateDApproval?: GateDApproval;
  preflight?: FixedTwentyFourHourSoakPreflight;
}

export interface FixedTwentyFourHourSoakSampleContext {
  sampleIndex: number;
  elapsedMs: number;
  sampledAt: string;
  workload: DeterministicRuntimeBaselineWorkload;
}

export interface FixedTwentyFourHourSoakRestartContext {
  elapsedMs: number;
  sampleIndex: number;
  workload: DeterministicRuntimeBaselineWorkload;
}

export interface RunFixedTwentyFourHourSoakInput extends FixedTwentyFourHourSoakConfig {
  sample(input: FixedTwentyFourHourSoakSampleContext): RuntimeBaselineSampleInput | Promise<RuntimeBaselineSampleInput>;
  onRestart?: (input: FixedTwentyFourHourSoakRestartContext) => void | Promise<void>;
  onCheckpoint?: (report: RuntimeBaselineReport) => void | Promise<void>;
  delayMs?: (ms: number) => void | Promise<void>;
  monotonicNowMs?: () => number;
  compressedTestRun?: boolean;
}

export function evaluateFixedTwentyFourHourSoakPreflight(
  input: FixedTwentyFourHourSoakPreflightInput
): FixedTwentyFourHourSoakPreflight {
  const failures: FixedTwentyFourHourSoakPreflightFailure[] = [];
  if (!input.javaGatewayRunning) failures.push("JAVA_GATEWAY_NOT_RUNNING");
  if (!input.deterministicFixturesReady) failures.push("DETERMINISTIC_FIXTURES_NOT_READY");
  if (input.diskHeadroomBytes < input.minimumDiskHeadroomBytes) failures.push("INSUFFICIENT_DISK_HEADROOM");
  if (!input.reportPath?.trim()) failures.push("REPORT_PATH_MISSING");
  if (!input.monitoringReady) failures.push("MONITORING_NOT_READY");
  if (!input.interruptionProcedureDocumented) failures.push("INTERRUPTION_PROCEDURE_MISSING");

  return {
    result: failures.length === 0 ? "pass" : "blocked",
    failures,
    diskHeadroomBytes: input.diskHeadroomBytes,
    minimumDiskHeadroomBytes: input.minimumDiskHeadroomBytes,
    reportPath: input.reportPath
  };
}

export function createFixedTwentyFourHourSoakConfig(
  input: CreateFixedTwentyFourHourSoakConfigInput
): FixedTwentyFourHourSoakConfig {
  return {
    track: "production",
    generatedAt: input.generatedAt,
    environment: {
      ...input.environment,
      track: "production",
      baselineKind: "fixed-24-hour-soak"
    },
    durationMs: FIXED_DURATION_MS,
    sampleIntervalMs: FIXED_SAMPLE_INTERVAL_MS,
    restartAtMs: [...FIXED_RESTART_AT_MS],
    workload: cloneWorkload(FIXED_WORKLOAD),
    thresholds: input.thresholds ?? DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
    gateDApproval: input.gateDApproval,
    preflight: input.preflight
  };
}

export function assertFixedTwentyFourHourSoakStartAllowed(config: FixedTwentyFourHourSoakConfig): void {
  assertFixedSoakConstants(config);
  if (config.gateDApproval?.approved !== true) {
    throw new Error("Gate D approval is required before starting the fixed 24-hour soak");
  }
  if (!config.preflight) {
    throw new Error("Gate D preflight is required before starting the fixed 24-hour soak");
  }
  if (config.preflight.result !== "pass") {
    throw new Error(`Gate D preflight is blocked: ${config.preflight.failures.join(", ")}`);
  }
}

export async function runFixedTwentyFourHourSoak(
  input: RunFixedTwentyFourHourSoakInput
): Promise<RuntimeBaselineReport> {
  assertFixedTwentyFourHourSoakStartAllowed(input);
  if (input.delayMs && input.compressedTestRun !== true) {
    throw new Error("custom delay requires compressed test simulation marker and cannot produce Gate D evidence");
  }
  if (input.monotonicNowMs && input.compressedTestRun !== true) {
    throw new Error("custom monotonic clock requires compressed test simulation marker and cannot produce Gate D evidence");
  }
  const samples: RuntimeBaselineSampleInput[] = [];
  const observedRestartScheduleMs: number[] = [];
  let nextRestartIndex = 0;
  const sampleCount = input.durationMs / input.sampleIntervalMs;
  const delay = input.delayMs ?? sleep;
  const monotonicNow = input.monotonicNowMs ?? (() => performance.now());
  const monotonicStartedAt = monotonicNow();
  const reportTrack = input.compressedTestRun === true ? "local" : "production";
  const evidenceKind = input.compressedTestRun === true ? "compressed-test-simulation" : "formal-24-hour-soak";

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const sampleTargetMs = monotonicStartedAt + (sampleIndex + 1) * input.sampleIntervalMs;
    await delay(Math.max(0, sampleTargetMs - monotonicNow()));

    const elapsedMs = (sampleIndex + 1) * input.sampleIntervalMs;
    while (nextRestartIndex < input.restartAtMs.length && input.restartAtMs[nextRestartIndex] <= elapsedMs) {
      await input.onRestart?.({
        elapsedMs: input.restartAtMs[nextRestartIndex],
        sampleIndex,
        workload: input.workload
      });
      observedRestartScheduleMs.push(input.restartAtMs[nextRestartIndex]);
      nextRestartIndex += 1;
    }

    samples.push(await input.sample({
      sampleIndex,
      elapsedMs,
      sampledAt: addMsToIso(input.generatedAt, elapsedMs),
      workload: input.workload
    }));

    const lastSample = samples[samples.length - 1]!;
    const shouldEvaluateCheckpoint = input.onCheckpoint !== undefined ||
      lastSample.hardFailures.length > 0 ||
      (reportTrack === "production" && samples.length % 10 === 0);
    if (!shouldEvaluateCheckpoint) continue;

    const checkpoint = buildFixedTwentyFourHourSoakReport(
      input, samples, reportTrack, evidenceKind, observedRestartScheduleMs
    );
    try {
      await input.onCheckpoint?.(checkpoint);
    } catch {
      const failedSamples = [
        ...samples.slice(0, -1),
        {
          ...lastSample,
          hardFailures: [...new Set([...lastSample.hardFailures, "EVIDENCE_CHECKPOINT_FAILURE"])]
        }
      ];
      return buildFixedTwentyFourHourSoakReport(
        input, failedSamples, reportTrack, evidenceKind, observedRestartScheduleMs
      );
    }
    if (checkpoint.result === "fail") return checkpoint;
  }

  return buildFixedTwentyFourHourSoakReport(
    input, samples, reportTrack, evidenceKind, observedRestartScheduleMs
  );
}

function buildFixedTwentyFourHourSoakReport(
  input: RunFixedTwentyFourHourSoakInput,
  samples: RuntimeBaselineSampleInput[],
  reportTrack: "local" | "production",
  evidenceKind: "compressed-test-simulation" | "formal-24-hour-soak",
  observedRestartScheduleMs: number[]
): RuntimeBaselineReport {
  return createRuntimeBaselineReport({
    track: reportTrack,
    generatedAt: input.generatedAt,
    workload: input.workload,
    environment: {
      ...input.environment,
      track: reportTrack,
      evidenceKind,
      runComplete: samples.length === input.durationMs / input.sampleIntervalMs,
      restartScheduleMs: input.restartAtMs,
      observedRestartScheduleMs,
      gateDApproval: redactedGateDApproval(input.gateDApproval),
      preflight: input.preflight
    },
    thresholds: input.thresholds,
    samples: withFormalResourceGrowthFailures(samples, input.sampleIntervalMs)
  });
}

function assertFixedSoakConstants(config: FixedTwentyFourHourSoakConfig): void {
  if (config.track !== "production") throw new Error("fixed 24-hour soak must use production track");
  if (config.durationMs !== FIXED_DURATION_MS) throw new Error("fixed 24-hour soak duration must remain 24 hours");
  if (config.sampleIntervalMs !== FIXED_SAMPLE_INTERVAL_MS) throw new Error("fixed 24-hour soak sample interval must remain 30 seconds");
  if (!arraysEqual(config.restartAtMs, FIXED_RESTART_AT_MS)) throw new Error("fixed 24-hour soak restart schedule must remain at hours 2, 12, and 22");
  if (config.workload.seededConversations !== FIXED_SEEDED_CONVERSATIONS) throw new Error("fixed 24-hour soak must seed 10,000 conversations");
  if (config.workload.concurrency !== FIXED_CONCURRENCY) throw new Error("fixed 24-hour soak must run 20 concurrent executions");
  if (!mixEqual(config.workload.mix, FIXED_WORKLOAD.mix)) {
    throw new Error("fixed 24-hour soak workload mix must remain 60/20/15/5");
  }
  if (JSON.stringify(config.workload.operations) !== JSON.stringify(FIXED_WORKLOAD.operations)) {
    throw new Error("fixed 24-hour soak workload operations must remain deterministic");
  }
  if (!thresholdsEqual(config.thresholds, DEFAULT_RUNTIME_BASELINE_THRESHOLDS)) {
    throw new Error("fixed 24-hour soak thresholds must not be changed");
  }
}

function mixEqual(left: DeterministicRuntimeBaselineWorkload["mix"], right: DeterministicRuntimeBaselineWorkload["mix"]): boolean {
  return left.noTool === right.noTool &&
    left.javaSandbox === right.javaSandbox &&
    left.mcp === right.mcp &&
    left.approvalInterruption === right.approvalInterruption;
}

function thresholdsEqual(left: RuntimeBaselineThresholds, right: RuntimeBaselineThresholds): boolean {
  return left.admissionP95Ms === right.admissionP95Ms &&
    left.durableReplayP95Ms === right.durableReplayP95Ms &&
    left.rssBytes === right.rssBytes &&
    left.openFileDescriptors === right.openFileDescriptors &&
    left.walBytes === right.walBytes &&
    left.mcpChildCount === right.mcpChildCount &&
    left.sustainedBreachMs === right.sustainedBreachMs;
}

function cloneWorkload(workload: DeterministicRuntimeBaselineWorkload): DeterministicRuntimeBaselineWorkload {
  return {
    seededConversations: workload.seededConversations,
    concurrency: workload.concurrency,
    mix: { ...workload.mix },
    operations: workload.operations.map((operation) => ({ ...operation }))
  };
}

function withFormalResourceGrowthFailures(
  samples: RuntimeBaselineSampleInput[],
  sampleIntervalMs: number
): RuntimeBaselineSampleInput[] {
  const windowSamples = Math.ceil(RESOURCE_GROWTH_WINDOW_MS / sampleIntervalMs);
  if (samples.length < windowSamples * 2) return samples;

  const rssGrowth = medianGrowthRatio(
    samples.slice(0, windowSamples).map((sample) => sample.rssBytes),
    samples.slice(-windowSamples).map((sample) => sample.rssBytes)
  );
  const fdGrowth = medianGrowthRatio(
    samples.slice(0, windowSamples).map((sample) => sample.openFileDescriptors),
    samples.slice(-windowSamples).map((sample) => sample.openFileDescriptors)
  );
  const failures: string[] = [];
  if (rssGrowth > RESOURCE_GROWTH_LIMIT) failures.push("RSS_MEDIAN_GROWTH_LIMIT_EXCEEDED");
  if (fdGrowth > RESOURCE_GROWTH_LIMIT) failures.push("FD_MEDIAN_GROWTH_LIMIT_EXCEEDED");
  if (failures.length === 0) return samples;

  const lastSample = samples[samples.length - 1];
  return [
    ...samples.slice(0, -1),
    {
      ...lastSample,
      hardFailures: [...new Set([...lastSample.hardFailures, ...failures])]
    }
  ];
}

function medianGrowthRatio(firstValues: number[], lastValues: number[]): number {
  const first = median(firstValues);
  const last = median(lastValues);
  if (first === 0) return last === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (last - first) / first;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function redactedGateDApproval(approval?: GateDApproval): Record<string, unknown> | undefined {
  if (!approval) return undefined;
  return {
    approved: true,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    reasonHash: hashString(approval.reason)
  };
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function arraysEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function addMsToIso(isoTimestamp: string, elapsedMs: number): string {
  return new Date(new Date(isoTimestamp).getTime() + elapsedMs).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
