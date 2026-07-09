import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectRuntimeBaselineSample } from "../src/baseline/localBaseline";
import {
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
    expect(config.workload.seededConversations).toBe(10_000);
    expect(config.workload.concurrency).toBe(20);
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
