import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLocalThirtyMinuteBaseline } from "../src/baseline/localShortBaselineExecution";

describe("local short baseline execution", () => {
  it("seeds SQLite workload, triggers restart hook, and writes a no-overwrite local report", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openharness-baseline-exec-"));
    try {
      const outputPath = join(dir, "baseline-report.json");
      const result = await runLocalThirtyMinuteBaseline({
        outputPath,
        generatedAt: "2026-07-09T00:00:00.000Z",
        durationMs: 60_000,
        sampleIntervalMs: 30_000,
        restartAtMs: 30_000,
        seededConversations: 40,
        concurrency: 5,
        delayMs: async () => undefined,
        readRssBytes: () => 100_000_000,
        readOpenFileDescriptors: () => 100
      });

      expect(result.report.track).toBe("local");
      expect(result.report.result).toBe("local_verified");
      expect(result.report.workload.seededConversations).toBe(40);
      expect(result.report.workload.operations).toHaveLength(40);
      expect(result.report.samples).toHaveLength(2);
      expect(result.report.failures).toEqual([]);
      expect(result.restartEvents).toEqual([{ elapsedMs: 30_000, sampleIndex: 0 }]);
      expect(result.databasePath.endsWith("runtime-baseline.db")).toBe(true);
      expect(existsSync(outputPath)).toBe(true);
      expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(result.report);

      await expect(runLocalThirtyMinuteBaseline({
        outputPath,
        generatedAt: "2026-07-09T00:00:00.000Z",
        durationMs: 30_000,
        sampleIntervalMs: 30_000,
        seededConversations: 20,
        concurrency: 5,
        delayMs: async () => undefined
      })).rejects.toThrow(/already exists/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
