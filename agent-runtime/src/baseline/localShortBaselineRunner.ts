import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  RuntimeBaselineReportSchema,
  type RuntimeBaselineReport,
  type RuntimeBaselineThresholds
} from "@openharness/shared-schema";
import {
  buildDeterministicBaselineWorkload,
  createRuntimeBaselineReport,
  DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
  type DeterministicRuntimeBaselineWorkload,
  type RuntimeBaselineSampleInput
} from "./localBaseline";

const DEFAULT_BASELINE_DURATION_MS = 30 * 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 30_000;
const DEFAULT_RESTART_AT_MS = 15 * 60 * 1000;
const DEFAULT_SOAK_DURATION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SOAK_RESTART_SCHEDULE_MS = [
  2 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  22 * 60 * 60 * 1000
];
const DEFAULT_SEEDED_CONVERSATIONS = 10_000;
const DEFAULT_CONCURRENCY = 20;

export interface CreateThirtyMinuteLocalBaselineConfigInput {
  generatedAt: string;
  environment: Record<string, unknown>;
  durationMs?: number;
  sampleIntervalMs?: number;
  restartAtMs?: number;
  seededConversations?: number;
  concurrency?: number;
  thresholds?: RuntimeBaselineThresholds;
}

export interface CreateTwentyFourHourLocalSoakConfigInput extends CreateThirtyMinuteLocalBaselineConfigInput {
  restartScheduleMs?: number[];
  allowCompressedScheduleForTest?: boolean;
}

export interface LocalShortBaselineConfig {
  track: "local";
  generatedAt: string;
  environment: Record<string, unknown>;
  durationMs: number;
  sampleIntervalMs: number;
  restartAtMs?: number;
  restartScheduleMs: number[];
  workload: DeterministicRuntimeBaselineWorkload;
  thresholds: RuntimeBaselineThresholds;
}

export interface LocalShortBaselineSampleContext {
  sampleIndex: number;
  elapsedMs: number;
  sampledAt: string;
  workload: DeterministicRuntimeBaselineWorkload;
}

export interface LocalShortBaselineRestartContext {
  elapsedMs: number;
  sampleIndex: number;
  workload: DeterministicRuntimeBaselineWorkload;
}

export interface RunDeterministicLocalShortBaselineInput extends LocalShortBaselineConfig {
  sample(input: LocalShortBaselineSampleContext): RuntimeBaselineSampleInput | Promise<RuntimeBaselineSampleInput>;
  onRestart?: (input: LocalShortBaselineRestartContext) => void | Promise<void>;
  delayMs?: (ms: number) => void | Promise<void>;
}

export interface WriteRuntimeBaselineReportOptions {
  overwrite?: boolean;
}

export function createThirtyMinuteLocalBaselineConfig(
  input: CreateThirtyMinuteLocalBaselineConfigInput
): LocalShortBaselineConfig {
  const durationMs = input.durationMs ?? DEFAULT_BASELINE_DURATION_MS;
  const sampleIntervalMs = input.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const restartAtMs = input.restartAtMs ?? DEFAULT_RESTART_AT_MS;
  const restartScheduleMs = normalizeRestartSchedule([restartAtMs], durationMs);
  return {
    track: "local",
    generatedAt: input.generatedAt,
    environment: withTimingEnvironment(
      { baselineKind: "deterministic-local-short-baseline", ...input.environment },
      durationMs,
      sampleIntervalMs,
      restartScheduleMs
    ),
    durationMs,
    sampleIntervalMs,
    restartAtMs,
    restartScheduleMs,
    workload: buildDeterministicBaselineWorkload({
      seededConversations: input.seededConversations ?? DEFAULT_SEEDED_CONVERSATIONS,
      concurrency: input.concurrency ?? DEFAULT_CONCURRENCY
    }),
    thresholds: input.thresholds ?? DEFAULT_RUNTIME_BASELINE_THRESHOLDS
  };
}

export function createTwentyFourHourLocalSoakConfig(
  input: CreateTwentyFourHourLocalSoakConfigInput
): LocalShortBaselineConfig {
  const durationMs = input.durationMs ?? DEFAULT_SOAK_DURATION_MS;
  const sampleIntervalMs = input.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const restartScheduleMs = input.allowCompressedScheduleForTest === true
    ? validateCompressedRestartSchedule(input.restartScheduleMs ?? DEFAULT_SOAK_RESTART_SCHEDULE_MS, durationMs, { requireNonEmpty: true })
    : validateFormalSoakRestartSchedule(input.restartScheduleMs ?? DEFAULT_SOAK_RESTART_SCHEDULE_MS, durationMs, sampleIntervalMs);
  return {
    track: "local",
    generatedAt: input.generatedAt,
    environment: withTimingEnvironment(
      { ...input.environment, baselineKind: "fixed-24-hour-local-soak" },
      durationMs,
      sampleIntervalMs,
      restartScheduleMs
    ),
    durationMs,
    sampleIntervalMs,
    restartScheduleMs,
    workload: buildDeterministicBaselineWorkload({
      seededConversations: input.seededConversations ?? DEFAULT_SEEDED_CONVERSATIONS,
      concurrency: input.concurrency ?? DEFAULT_CONCURRENCY
    }),
    thresholds: input.thresholds ?? DEFAULT_RUNTIME_BASELINE_THRESHOLDS
  };
}

export async function runDeterministicLocalShortBaseline(
  input: RunDeterministicLocalShortBaselineInput
): Promise<RuntimeBaselineReport> {
  validateRunnerTiming(input.durationMs, input.sampleIntervalMs);
  const samples: RuntimeBaselineSampleInput[] = [];
  const sampleCount = Math.ceil(input.durationMs / input.sampleIntervalMs);
  const restartScheduleMs = validateCompressedRestartSchedule(input.restartScheduleMs, input.durationMs);
  const observedRestartScheduleMs: number[] = [];
  let nextRestartIndex = 0;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    if (input.delayMs) await input.delayMs(input.sampleIntervalMs);

    const elapsedMs = Math.min((sampleIndex + 1) * input.sampleIntervalMs, input.durationMs);
    while (nextRestartIndex < restartScheduleMs.length && elapsedMs >= restartScheduleMs[nextRestartIndex]!) {
      const restartAtMs = restartScheduleMs[nextRestartIndex]!;
      nextRestartIndex += 1;
      await input.onRestart?.({ elapsedMs: restartAtMs, sampleIndex, workload: input.workload });
      observedRestartScheduleMs.push(restartAtMs);
    }

    samples.push(await input.sample({
      sampleIndex,
      elapsedMs,
      sampledAt: addMsToIso(input.generatedAt, elapsedMs),
      workload: input.workload
    }));
  }

  return createRuntimeBaselineReport({
    track: "local",
    generatedAt: input.generatedAt,
    workload: input.workload,
    environment: withObservedRestartEnvironment(input.environment, observedRestartScheduleMs),
    thresholds: input.thresholds,
    samples
  });
}

export function writeRuntimeBaselineReport(
  report: RuntimeBaselineReport,
  outputPath: string,
  options: WriteRuntimeBaselineReportOptions = {}
): void {
  if (existsSync(outputPath) && options.overwrite !== true) {
    throw new Error(`Runtime baseline report already exists: ${outputPath}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const parsed = RuntimeBaselineReportSchema.parse(report);
  writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function validateRunnerTiming(durationMs: number, sampleIntervalMs: number): void {
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new Error("durationMs must be a positive integer");
  }
  if (!Number.isInteger(sampleIntervalMs) || sampleIntervalMs <= 0) {
    throw new Error("sampleIntervalMs must be a positive integer");
  }
}

function normalizeRestartSchedule(restartScheduleMs: number[], durationMs: number): number[] {
  return [...new Set(restartScheduleMs)]
    .filter((restartAtMs) => Number.isInteger(restartAtMs) && restartAtMs > 0 && restartAtMs < durationMs)
    .sort((left, right) => left - right);
}

function validateFormalSoakRestartSchedule(
  restartScheduleMs: number[],
  durationMs: number,
  sampleIntervalMs: number
): number[] {
  if (durationMs !== DEFAULT_SOAK_DURATION_MS || sampleIntervalMs !== DEFAULT_SAMPLE_INTERVAL_MS) {
    throw new Error("compressed restart schedule requires allowCompressedScheduleForTest");
  }
  if (!sameNumberArray(restartScheduleMs, DEFAULT_SOAK_RESTART_SCHEDULE_MS)) {
    throw new Error("restart schedule must match the fixed 24-hour soak schedule exactly");
  }
  return validateCompressedRestartSchedule(restartScheduleMs, durationMs, { requireNonEmpty: true });
}

function validateCompressedRestartSchedule(
  restartScheduleMs: number[],
  durationMs: number,
  options: { requireNonEmpty?: boolean } = {}
): number[] {
  const normalized = normalizeRestartSchedule(restartScheduleMs, durationMs);
  if (
    (options.requireNonEmpty === true && normalized.length === 0) ||
    normalized.length !== restartScheduleMs.length ||
    !sameNumberArray(normalized, restartScheduleMs)
  ) {
    throw new Error("restart schedule must contain sorted unique positive integer offsets within durationMs");
  }
  return normalized;
}

function withTimingEnvironment(
  environment: Record<string, unknown>,
  durationMs: number,
  sampleIntervalMs: number,
  restartScheduleMs: number[]
): Record<string, unknown> {
  return {
    ...environment,
    durationMs,
    sampleIntervalMs,
    restartScheduleMs
  };
}

function withObservedRestartEnvironment(
  environment: Record<string, unknown>,
  observedRestartScheduleMs: number[]
): Record<string, unknown> {
  return {
    ...environment,
    observedRestartScheduleMs
  };
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function addMsToIso(isoTimestamp: string, elapsedMs: number): string {
  return new Date(new Date(isoTimestamp).getTime() + elapsedMs).toISOString();
}
