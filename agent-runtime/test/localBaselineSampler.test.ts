import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  collectRuntimeBaselineSample,
  createRuntimeBaselineReport,
  DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
  type RuntimeBaselineSampleInput
} from "../src/baseline/localBaseline";

describe("local runtime baseline sampler", () => {
  it("collects injectable runtime metrics and computes admission/replay p95", () => {
    const dir = mkdtempSync(join(tmpdir(), "openharness-baseline-"));
    try {
      const walPath = join(dir, "runtime.db-wal");
      writeFileSync(walPath, Buffer.alloc(2048));

      const sample = collectRuntimeBaselineSample({
        sampledAt: "2026-07-09T00:00:30.000Z",
        admissionLatenciesMs: [1, 2, 3, 4, 100],
        durableReplayLatenciesMs: [10, 20, 30, 40, 250],
        walPath,
        database: {
          path: join(dir, "runtime.db"),
          run(sql: string) {
            expect(sql).toBe("PRAGMA wal_checkpoint(PASSIVE)");
            return { changes: 0 };
          },
          get<T>(sql: string): T | undefined {
            expect(sql).toBe("PRAGMA integrity_check");
            return { integrity_check: "ok" } as T;
          }
        },
        readRssBytes: () => 123_456_789,
        readOpenFileDescriptors: () => 42,
        mcpChildCount: () => 2
      });

      expect(sample).toEqual<RuntimeBaselineSampleInput>({
        sampledAt: "2026-07-09T00:00:30.000Z",
        admissionP95Ms: 100,
        durableReplayP95Ms: 250,
        rssBytes: 123_456_789,
        openFileDescriptors: 42,
        walBytes: 2048,
        mcpChildCount: 2,
        hardFailures: []
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("turns integrity and canary leakage observations into hard failures", () => {
    const sample = collectRuntimeBaselineSample({
      sampledAt: "2026-07-09T00:01:00.000Z",
      admissionLatenciesMs: [],
      durableReplayLatenciesMs: [],
      database: {
        path: "/tmp/missing-runtime.db",
        run() {
          return { changes: 0 };
        },
        get<T>(): T | undefined {
          return { integrity_check: "row 2 missing from index" } as T;
        }
      },
      readRssBytes: () => 1,
      readOpenFileDescriptors: () => 1,
      mcpChildCount: 0,
      inspectText: "OPENHARNESS_SECRET_CANARY leaked into report"
    });

    expect(sample.hardFailures).toEqual(["SQLITE_INTEGRITY_FAILURE", "SECRET_CANARY_LEAK"]);
  });

  it("turns duplicate operations, event ordering, and explicit scope leakage into hard failures", () => {
    const sample = collectRuntimeBaselineSample({
      sampledAt: "2026-07-09T00:01:30.000Z",
      admissionLatenciesMs: [],
      durableReplayLatenciesMs: [],
      readRssBytes: () => 1,
      readOpenFileDescriptors: () => 1,
      mcpChildCount: 0,
      operations: [
        { operationId: "op-1", tenantId: "tenant-a", userId: "user-a", conversationId: "conv-1", kind: "no_tool" },
        { operationId: "op-1", tenantId: "tenant-b", userId: "user-b", conversationId: "conv-1", kind: "mcp" }
      ],
      eventObservations: [
        { tenantId: "tenant-a", userId: "user-a", conversationId: "conv-1", cursor: 2, eventId: "e-2" },
        { tenantId: "tenant-a", userId: "user-a", conversationId: "conv-1", cursor: 1, eventId: "e-1" },
        {
          tenantId: "tenant-a",
          userId: "user-a",
          conversationId: "conv-1",
          cursor: 3,
          eventId: "e-3",
          visibleTenantId: "tenant-b"
        }
      ]
    });

    expect(sample.hardFailures).toEqual([
      "DUPLICATE_OPERATION_ID",
      "EVENT_ORDERING_FAILURE",
      "CROSS_SCOPE_LEAKAGE"
    ]);
  });

  it("feeds collected samples into the existing local_verified report oracle", () => {
    const cleanSamples = Array.from({ length: 10 }, (_, index) =>
      collectRuntimeBaselineSample({
        sampledAt: new Date(Date.UTC(2026, 6, 9, 0, 0, (index + 1) * 30)).toISOString(),
        admissionLatenciesMs: [10, 20, 80],
        durableReplayLatenciesMs: [20, 40, 120],
        readRssBytes: () => 100_000_000,
        readOpenFileDescriptors: () => 100,
        mcpChildCount: 1
      })
    );

    const report = createRuntimeBaselineReport({
      track: "local",
      generatedAt: "2026-07-09T00:05:00.000Z",
      workload: {
        seededConversations: 10_000,
        concurrency: 20,
        mix: { noTool: 0.6, javaSandbox: 0.2, mcp: 0.15, approvalInterruption: 0.05 }
      },
      environment: { nodeVersion: "v20.20.2", platform: "darwin", track: "local" },
      thresholds: DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
      samples: cleanSamples
    });

    expect(report.result).toBe("local_verified");
    expect(report.failures).toEqual([]);
  });

  it("blocks a completed production soak whose observed Runtime restarts do not match the fixed schedule", () => {
    const report = createRuntimeBaselineReport({
      track: "production",
      generatedAt: "2026-07-15T00:00:00.000Z",
      workload: {
        seededConversations: 10_000,
        concurrency: 20,
        mix: { noTool: 0.6, javaSandbox: 0.2, mcp: 0.15, approvalInterruption: 0.05 }
      },
      environment: {
        baselineKind: "fixed-24-hour-soak",
        runComplete: true,
        restartScheduleMs: [2, 12, 22],
        observedRestartScheduleMs: [2, 12]
      },
      samples: []
    });

    expect(report.result).toBe("fail");
    expect(report.failures.map(failure => failure.code)).toContain("RESTART_SCHEDULE_MISMATCH");
  });
});
