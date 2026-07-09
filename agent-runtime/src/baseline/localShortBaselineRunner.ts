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

export interface LocalShortBaselineConfig {
  track: "local";
  generatedAt: string;
  environment: Record<string, unknown>;
  durationMs: number;
  sampleIntervalMs: number;
  restartAtMs?: number;
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
  return {
    track: "local",
    generatedAt: input.generatedAt,
    environment: input.environment,
    durationMs: input.durationMs ?? DEFAULT_BASELINE_DURATION_MS,
    sampleIntervalMs: input.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS,
    restartAtMs: input.restartAtMs ?? DEFAULT_RESTART_AT_MS,
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
  let restartCalled = false;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    if (input.delayMs) await input.delayMs(input.sampleIntervalMs);

    const elapsedMs = Math.min((sampleIndex + 1) * input.sampleIntervalMs, input.durationMs);
    if (!restartCalled && input.restartAtMs !== undefined && elapsedMs >= input.restartAtMs) {
      restartCalled = true;
      await input.onRestart?.({ elapsedMs: input.restartAtMs, sampleIndex, workload: input.workload });
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
    environment: input.environment,
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

function addMsToIso(isoTimestamp: string, elapsedMs: number): string {
  return new Date(new Date(isoTimestamp).getTime() + elapsedMs).toISOString();
}
