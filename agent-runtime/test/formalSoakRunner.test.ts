import { describe, expect, it } from "vitest";
import { collectRuntimeBaselineSample } from "../src/baseline/localBaseline";
import {
  assertFixedTwentyFourHourSoakStartAllowed,
  createFixedTwentyFourHourSoakConfig,
  evaluateFixedTwentyFourHourSoakPreflight,
  runFixedTwentyFourHourSoak
} from "../src/baseline/formalSoakRunner";

describe("fixed 24-hour formal soak runner", () => {
  it("creates the fixed Gate D soak configuration without relaxing workload or thresholds", () => {
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" }
    });

    expect(config.track).toBe("production");
    expect(config.durationMs).toBe(24 * 60 * 60 * 1000);
    expect(config.sampleIntervalMs).toBe(30_000);
    expect(config.restartAtMs).toEqual([
      2 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      22 * 60 * 60 * 1000
    ]);
    expect(config.workload.seededConversations).toBe(10_000);
    expect(config.workload.concurrency).toBe(20);
    expect(config.workload.mix).toEqual({
      noTool: 0.6,
      javaSandbox: 0.2,
      mcp: 0.15,
      approvalInterruption: 0.05
    });
  });

  it("blocks formal start until Gate D approval and every preflight item passes", () => {
    const preflight = evaluateFixedTwentyFourHourSoakPreflight({
      javaGatewayRunning: false,
      deterministicFixturesReady: true,
      diskHeadroomBytes: 512 * 1024 * 1024,
      minimumDiskHeadroomBytes: 1024 * 1024 * 1024,
      reportPath: "",
      monitoringReady: true,
      interruptionProcedureDocumented: false
    });
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      preflight
    });

    expect(preflight.result).toBe("blocked");
    expect(preflight.failures).toEqual([
      "JAVA_GATEWAY_NOT_RUNNING",
      "INSUFFICIENT_DISK_HEADROOM",
      "REPORT_PATH_MISSING",
      "INTERRUPTION_PROCEDURE_MISSING"
    ]);
    expect(() => assertFixedTwentyFourHourSoakStartAllowed(config)).toThrow(/Gate D approval is required/);

    const approvedConfig = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      gateDApproval: {
        approved: true,
        approvedBy: "test-reviewer",
        approvedAt: "2026-07-09T00:00:00.000Z",
        reason: "unit test"
      },
      preflight
    });

    expect(() => assertFixedTwentyFourHourSoakStartAllowed(approvedConfig)).toThrow(/preflight is blocked/);
  });

  it("rejects changed fixed schedule, thresholds, workload operations, and unmarked custom delays before start", async () => {
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      gateDApproval: {
        approved: true,
        approvedBy: "test-reviewer",
        approvedAt: "2026-07-09T00:00:00.000Z",
        reason: "unit test"
      },
      preflight: evaluateFixedTwentyFourHourSoakPreflight({
        javaGatewayRunning: true,
        deterministicFixturesReady: true,
        diskHeadroomBytes: 2 * 1024 * 1024 * 1024,
        minimumDiskHeadroomBytes: 1024 * 1024 * 1024,
        reportPath: "/tmp/openharness-formal-soak.json",
        monitoringReady: true,
        interruptionProcedureDocumented: true
      })
    });

    expect(() => assertFixedTwentyFourHourSoakStartAllowed({
      ...config,
      durationMs: config.durationMs - 30_000
    })).toThrow(/duration must remain 24 hours/);
    expect(() => assertFixedTwentyFourHourSoakStartAllowed({
      ...config,
      thresholds: {
        ...config.thresholds,
        admissionP95Ms: config.thresholds.admissionP95Ms + 1
      }
    })).toThrow(/thresholds must not be changed/);
    expect(() => assertFixedTwentyFourHourSoakStartAllowed({
      ...config,
      workload: {
        ...config.workload,
        operations: config.workload.operations.slice(1)
      }
    })).toThrow(/workload operations must remain deterministic/);
    await expect(runFixedTwentyFourHourSoak({
      ...config,
      delayMs: async () => undefined,
      sample: ({ sampledAt }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10],
          durableReplayLatenciesMs: [20],
          readRssBytes: () => 100,
          readOpenFileDescriptors: () => 10,
          mcpChildCount: 1
        })
    })).rejects.toThrow(/custom delay requires compressed test simulation/);
  });

  it("runs a local compressed simulation of the fixed 24-hour schedule with three TS restart hooks", async () => {
    const restartEvents: number[] = [];
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      gateDApproval: {
        approved: true,
        approvedBy: "test-reviewer",
        approvedAt: "2026-07-09T00:00:00.000Z",
        reason: "unit test"
      },
      preflight: evaluateFixedTwentyFourHourSoakPreflight({
        javaGatewayRunning: true,
        deterministicFixturesReady: true,
        diskHeadroomBytes: 2 * 1024 * 1024 * 1024,
        minimumDiskHeadroomBytes: 1024 * 1024 * 1024,
        reportPath: "/tmp/openharness-formal-soak.json",
        monitoringReady: true,
        interruptionProcedureDocumented: true
      })
    });

    const report = await runFixedTwentyFourHourSoak({
      ...config,
      compressedTestRun: true,
      delayMs: async () => undefined,
      onRestart: ({ elapsedMs }) => {
        restartEvents.push(elapsedMs);
      },
      sample: ({ sampledAt }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10, 20, 80],
          durableReplayLatenciesMs: [20, 40, 120],
          readRssBytes: () => 100_000_000,
          readOpenFileDescriptors: () => 100,
          mcpChildCount: 1
        })
    });

    expect(restartEvents).toEqual([
      2 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      22 * 60 * 60 * 1000
    ]);
    expect(report.track).toBe("local");
    expect(report.result).toBe("local_verified");
    expect(report.environment).toMatchObject({ track: "local", evidenceKind: "compressed-test-simulation" });
    expect(report.environment.restartScheduleMs).toEqual(config.restartAtMs);
    expect(report.environment.observedRestartScheduleMs).toEqual(config.restartAtMs);
    expect(report.samples).toHaveLength(24 * 60 * 2);
    expect(report.failures).toEqual([]);
    expect(report.reportHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails the formal report when first and last two-hour resource medians grow over ten percent", async () => {
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-09T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      gateDApproval: {
        approved: true,
        approvedBy: "test-reviewer",
        approvedAt: "2026-07-09T00:00:00.000Z",
        reason: "unit test"
      },
      preflight: evaluateFixedTwentyFourHourSoakPreflight({
        javaGatewayRunning: true,
        deterministicFixturesReady: true,
        diskHeadroomBytes: 2 * 1024 * 1024 * 1024,
        minimumDiskHeadroomBytes: 1024 * 1024 * 1024,
        reportPath: "/tmp/openharness-formal-soak.json",
        monitoringReady: true,
        interruptionProcedureDocumented: true
      })
    });

    const report = await runFixedTwentyFourHourSoak({
      ...config,
      compressedTestRun: true,
      delayMs: async () => undefined,
      sample: ({ sampleIndex, sampledAt }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10, 20, 80],
          durableReplayLatenciesMs: [20, 40, 120],
          readRssBytes: () => sampleIndex < 240 ? 100_000_000 : 112_000_000,
          readOpenFileDescriptors: () => sampleIndex < 240 ? 100 : 112,
          mcpChildCount: 1
        })
    });

    expect(report.result).toBe("fail");
    expect(report.environment).toMatchObject({ track: "local", evidenceKind: "compressed-test-simulation" });
    expect(report.failures).toMatchObject([
      { code: "RSS_MEDIAN_GROWTH_LIMIT_EXCEEDED", severity: "hard" },
      { code: "FD_MEDIAN_GROWTH_LIMIT_EXCEEDED", severity: "hard" }
    ]);
  });

  it("checkpoints each observed sample and stops immediately after a hard failure", async () => {
    const checkpoints: number[] = [];
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-15T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      gateDApproval: {
        approved: true,
        approvedBy: "test-reviewer",
        approvedAt: "2026-07-15T00:00:00.000Z",
        reason: "unit test"
      },
      preflight: evaluateFixedTwentyFourHourSoakPreflight({
        javaGatewayRunning: true,
        deterministicFixturesReady: true,
        diskHeadroomBytes: 2 * 1024 * 1024 * 1024,
        minimumDiskHeadroomBytes: 1024 * 1024 * 1024,
        reportPath: "/tmp/openharness-formal-soak.json",
        monitoringReady: true,
        interruptionProcedureDocumented: true
      })
    });

    const report = await runFixedTwentyFourHourSoak({
      ...config,
      compressedTestRun: true,
      delayMs: async () => undefined,
      onCheckpoint: checkpoint => {
        checkpoints.push(checkpoint.samples.length);
      },
      sample: ({ sampleIndex, sampledAt }) =>
        collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10],
          durableReplayLatenciesMs: [20],
          readRssBytes: () => 100_000_000,
          readOpenFileDescriptors: () => 100,
          mcpChildCount: 1,
          hardFailures: sampleIndex === 1 ? ["CROSS_SCOPE_LEAKAGE"] : []
        })
    });

    expect(report.result).toBe("fail");
    expect(report.samples).toHaveLength(2);
    expect(checkpoints).toEqual([1, 2]);
  });

  it("turns checkpoint persistence failure into a retained FAIL report", async () => {
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-15T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      gateDApproval: {
        approved: true,
        approvedBy: "test-reviewer",
        approvedAt: "2026-07-15T00:00:00.000Z",
        reason: "unit test"
      },
      preflight: evaluateFixedTwentyFourHourSoakPreflight({
        javaGatewayRunning: true,
        deterministicFixturesReady: true,
        diskHeadroomBytes: 2 * 1024 * 1024 * 1024,
        minimumDiskHeadroomBytes: 1024 * 1024 * 1024,
        reportPath: "/tmp/openharness-formal-soak.json",
        monitoringReady: true,
        interruptionProcedureDocumented: true
      })
    });

    const report = await runFixedTwentyFourHourSoak({
      ...config,
      compressedTestRun: true,
      delayMs: async () => undefined,
      onCheckpoint: () => { throw new Error("disk unavailable"); },
      sample: ({ sampledAt }) => collectRuntimeBaselineSample({
        sampledAt,
        admissionLatenciesMs: [10],
        durableReplayLatenciesMs: [20],
        readRssBytes: () => 100_000_000,
        readOpenFileDescriptors: () => 100,
        mcpChildCount: 1
      })
    });

    expect(report.result).toBe("fail");
    expect(report.samples).toHaveLength(1);
    expect(report.failures.map(failure => failure.code)).toContain("EVIDENCE_CHECKPOINT_FAILURE");
  });

  it("targets absolute 30-second sample boundaries instead of accumulating sampler work drift", async () => {
    let monotonicMs = 0;
    const observedDelays: number[] = [];
    const config = createFixedTwentyFourHourSoakConfig({
      generatedAt: "2026-07-15T00:00:00.000Z",
      environment: { nodeVersion: "test-node", platform: "test-os" },
      gateDApproval: {
        approved: true,
        approvedBy: "test-reviewer",
        approvedAt: "2026-07-15T00:00:00.000Z",
        reason: "unit test"
      },
      preflight: evaluateFixedTwentyFourHourSoakPreflight({
        javaGatewayRunning: true,
        deterministicFixturesReady: true,
        diskHeadroomBytes: 2 * 1024 * 1024 * 1024,
        minimumDiskHeadroomBytes: 1024 * 1024 * 1024,
        reportPath: "/tmp/openharness-formal-soak.json",
        monitoringReady: true,
        interruptionProcedureDocumented: true
      })
    });

    await runFixedTwentyFourHourSoak({
      ...config,
      compressedTestRun: true,
      monotonicNowMs: () => monotonicMs,
      delayMs: async delayMs => {
        observedDelays.push(delayMs);
        monotonicMs += delayMs;
      },
      sample: ({ sampledAt }) => {
        monotonicMs += 5_000;
        return collectRuntimeBaselineSample({
          sampledAt,
          admissionLatenciesMs: [10],
          durableReplayLatenciesMs: [20],
          readRssBytes: () => 100,
          readOpenFileDescriptors: () => 10,
          mcpChildCount: 1
        });
      }
    });

    expect(observedDelays.slice(0, 4)).toEqual([30_000, 25_000, 25_000, 25_000]);
  });
});
