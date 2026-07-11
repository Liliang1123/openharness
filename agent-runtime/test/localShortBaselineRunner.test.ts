import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectRuntimeBaselineSample,
  createRuntimeBaselineReport
} from "../src/baseline/localBaseline";
import {
  createTwentyFourHourLocalSoakConfig,
  createThirtyMinuteLocalBaselineConfig,
  runDeterministicLocalShortBaseline,
  writeRuntimeBaselineReport
} from "../src/baseline/localShortBaselineRunner";

describe("deterministic local short baseline runner", () => {
  it("creates the default 30-minute local baseline configuration without running it", () => {
    const config = createThirtyMinuteLocalBaselineConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "v20.20.2", platform: "darwin", track: "local" }
    });

    expect(config.track).toBe("local");
    expect(config.durationMs).toBe(30 * 60 * 1000);
    expect(config.sampleIntervalMs).toBe(30_000);
    expect(config.restartAtMs).toBe(15 * 60 * 1000);
    expect(config.restartScheduleMs).toEqual([15 * 60 * 1000]);
    expect(config.workload.seededConversations).toBe(10_000);
    expect(config.workload.concurrency).toBe(20);
  });

  it("creates the fixed 24-hour soak configuration without starting Gate D", () => {
    const config = createTwentyFourHourLocalSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "v20.20.2", platform: "darwin", track: "local" }
    });

    expect(config.track).toBe("local");
    expect(config.durationMs).toBe(24 * 60 * 60 * 1000);
    expect(config.sampleIntervalMs).toBe(30_000);
    expect(config.restartScheduleMs).toEqual([
      2 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      22 * 60 * 60 * 1000
    ]);
    expect(config.workload.seededConversations).toBe(10_000);
    expect(config.workload.concurrency).toBe(20);
  });

  it("rejects invalid formal 24-hour restart schedules instead of filtering them away", () => {
    const base = {
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "v20.20.2", platform: "darwin", track: "local" }
    };

    expect(() => createTwentyFourHourLocalSoakConfig({ ...base, restartScheduleMs: [] }))
      .toThrow(/restart schedule/i);
    expect(() => createTwentyFourHourLocalSoakConfig({
      ...base,
      restartScheduleMs: [2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000]
    })).toThrow(/restart schedule/i);
    expect(() => createTwentyFourHourLocalSoakConfig({
      ...base,
      restartScheduleMs: [2 * 60 * 60 * 1000, -1, 22 * 60 * 60 * 1000]
    })).toThrow(/restart schedule/i);
    expect(() => createTwentyFourHourLocalSoakConfig({
      ...base,
      restartScheduleMs: [2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, 25 * 60 * 60 * 1000]
    })).toThrow(/restart schedule/i);
    expect(() => createTwentyFourHourLocalSoakConfig({
      ...base,
      durationMs: 120_000,
      sampleIntervalMs: 30_000,
      restartScheduleMs: [],
      allowCompressedScheduleForTest: true
    })).toThrow(/restart schedule/i);
  });

  it("runs a compressed deterministic local baseline using seed, sampler, restart hook, and report schema", async () => {
    const restartCalls: number[] = [];
    const config = createThirtyMinuteLocalBaselineConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os", track: "local" },
      durationMs: 90_000,
      sampleIntervalMs: 30_000,
      restartAtMs: 60_000,
      seededConversations: 20,
      concurrency: 5
    });

    const report = await runDeterministicLocalShortBaseline({
      ...config,
      onRestart: ({ elapsedMs }) => {
        restartCalls.push(elapsedMs);
      },
      sample: ({ sampleIndex, sampledAt, workload }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10, 20, 80],
          durableReplayLatenciesMs: [20, 40, 120],
          readRssBytes: () => 100_000_000 + sampleIndex,
          readOpenFileDescriptors: () => 100,
          mcpChildCount: 1,
          operations: sampleIndex === 0 ? workload.operations : undefined
        })
    });

    expect(restartCalls).toEqual([60_000]);
    expect(report.track).toBe("local");
    expect(report.result).toBe("local_verified");
    expect(report.workload.seededConversations).toBe(20);
    expect(report.workload.operations).toHaveLength(20);
    expect(report.samples.map((sample) => sample.sampledAt)).toEqual([
      "2026-07-09T00:00:30.000Z",
      "2026-07-09T00:01:00.000Z",
      "2026-07-09T00:01:30.000Z"
    ]);
    expect(report.failures).toEqual([]);
    expect(report.reportHash).toMatch(/^[a-f0-9]{64}$/);

    await expect(runDeterministicLocalShortBaseline({
      ...config,
      onRestart: () => undefined,
      sample: ({ sampleIndex, sampledAt, workload }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10, 20, 80],
          durableReplayLatenciesMs: [20, 40, 120],
          readRssBytes: () => 100_000_000 + sampleIndex,
          readOpenFileDescriptors: () => 100,
          mcpChildCount: 1,
          operations: sampleIndex === 0 ? workload.operations : undefined
        })
    })).resolves.toEqual(report);
  });

  it("runs a compressed soak schedule with every TS-only restart hook exactly once", async () => {
    const restartCalls: number[] = [];
    const config = createTwentyFourHourLocalSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os", track: "local" },
      durationMs: 120_000,
      sampleIntervalMs: 30_000,
      restartScheduleMs: [30_000, 90_000],
      allowCompressedScheduleForTest: true,
      seededConversations: 20,
      concurrency: 5
    });

    const report = await runDeterministicLocalShortBaseline({
      ...config,
      onRestart: ({ elapsedMs }) => {
        restartCalls.push(elapsedMs);
      },
      sample: ({ sampleIndex, sampledAt, workload }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10, 20, 80],
          durableReplayLatenciesMs: [20, 40, 120],
          readRssBytes: () => 100_000_000 + sampleIndex,
          readOpenFileDescriptors: () => 100,
          mcpChildCount: 1,
          operations: sampleIndex === 0 ? workload.operations : undefined
        })
    });

    expect(restartCalls).toEqual([30_000, 90_000]);
    expect(report.result).toBe("local_verified");
    expect(report.environment.restartScheduleMs).toEqual([30_000, 90_000]);
    expect(report.environment.observedRestartScheduleMs).toEqual([30_000, 90_000]);
    expect(report.samples).toHaveLength(4);
  });

  it("overwrites any preseeded observed restart schedule with runner observations", async () => {
    const config = createTwentyFourHourLocalSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: {
        nodeVersion: "test-node",
        platform: "test-os",
        track: "local",
        observedRestartScheduleMs: [999_000]
      },
      durationMs: 120_000,
      sampleIntervalMs: 30_000,
      restartScheduleMs: [30_000, 90_000],
      allowCompressedScheduleForTest: true,
      seededConversations: 20,
      concurrency: 5
    });

    const report = await runDeterministicLocalShortBaseline({
      ...config,
      sample: ({ sampleIndex, sampledAt, workload }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10, 20, 80],
          durableReplayLatenciesMs: [20, 40, 120],
          readRssBytes: () => 100_000_000 + sampleIndex,
          readOpenFileDescriptors: () => 100,
          mcpChildCount: 1,
          operations: sampleIndex === 0 ? workload.operations : undefined
        })
    });

    expect(report.result).toBe("local_verified");
    expect(report.environment.observedRestartScheduleMs).toEqual([30_000, 90_000]);
  });

  it("fails the report when observed restarts do not match the planned schedule", () => {
    const config = createTwentyFourHourLocalSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os", track: "local" },
      durationMs: 120_000,
      sampleIntervalMs: 30_000,
      restartScheduleMs: [30_000, 90_000],
      allowCompressedScheduleForTest: true,
      seededConversations: 20,
      concurrency: 5
    });

    const report = createRuntimeBaselineReport({
      track: "local",
      generatedAt: config.generatedAt,
      workload: config.workload,
      environment: {
        ...config.environment,
        observedRestartScheduleMs: [30_000]
      },
      thresholds: config.thresholds,
      samples: [
        collectRuntimeBaselineSample({
          sampledAt: "2026-07-09T00:00:30.000Z",
          admissionLatenciesMs: [10, 20, 80],
          durableReplayLatenciesMs: [20, 40, 120],
          readRssBytes: () => 100_000_000,
          readOpenFileDescriptors: () => 100,
          mcpChildCount: 1
        })
      ]
    });

    expect(report.result).toBe("fail");
    expect(report.failures).toMatchObject([
      { code: "RESTART_SCHEDULE_MISMATCH", severity: "hard" }
    ]);
  });

  it("writes baseline reports without overwriting unless explicitly requested", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openharness-short-baseline-"));
    try {
      const outputPath = join(dir, "baseline-report.json");
      const report = await runDeterministicLocalShortBaseline({
        ...createThirtyMinuteLocalBaselineConfig({
          generatedAt: "2026-07-09T00:00:00.000Z",
          environment: { nodeVersion: "test-node", platform: "test-os", track: "local" },
          durationMs: 30_000,
          sampleIntervalMs: 30_000,
          seededConversations: 20,
          concurrency: 5
        }),
        sample: ({ sampledAt }) =>
          collectRuntimeBaselineSample({
            sampledAt,
            admissionLatenciesMs: [10],
            durableReplayLatenciesMs: [20],
            readRssBytes: () => 100,
            readOpenFileDescriptors: () => 10,
            mcpChildCount: 1
          })
      });

      writeRuntimeBaselineReport(report, outputPath);
      expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(report);
      expect(() => writeRuntimeBaselineReport(report, outputPath)).toThrow(/already exists/);
      expect(() => writeRuntimeBaselineReport(report, outputPath, { overwrite: true })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
