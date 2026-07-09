import { describe, expect, it } from "vitest";
import {
  buildDeterministicBaselineWorkload,
  createRuntimeBaselineReport,
  evaluateRuntimeBaselineSamples,
  DEFAULT_RUNTIME_BASELINE_THRESHOLDS,
  type RuntimeBaselineSampleInput
} from "../src/baseline/localBaseline";

describe("local runtime baseline harness", () => {
  it("generates deterministic 60/20/15/5 workload with tenant and user collision cases", () => {
    const workload = buildDeterministicBaselineWorkload({ seededConversations: 100, concurrency: 20 });
    const counts = countByKind(workload.operations.map((operation) => operation.kind));

    expect(workload.seededConversations).toBe(100);
    expect(workload.concurrency).toBe(20);
    expect(counts.no_tool).toBe(60);
    expect(counts.java_sandbox).toBe(20);
    expect(counts.mcp).toBe(15);
    expect(counts.approval_interruption).toBe(5);
    expect(workload.operations[0]).toMatchObject({
      operationId: "op-000001",
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conv-000001"
    });
    expect(new Set(workload.operations.map((operation) => operation.operationId)).size).toBe(100);
    expect(new Set(workload.operations.map((operation) =>
      `${operation.tenantId}:${operation.userId}:${operation.conversationId}`
    )).size).toBe(100);
    expect(hasConversationIdCollisionAcrossScopes(workload.operations)).toBe(true);
    expect(buildDeterministicBaselineWorkload({ seededConversations: 100, concurrency: 20 })).toEqual(workload);
  });

  it("keeps scoped conversation keys unique while retaining cross-scope collision pressure", () => {
    const workload = buildDeterministicBaselineWorkload({ seededConversations: 8, concurrency: 4 });

    expect(new Set(workload.operations.map((operation) =>
      `${operation.tenantId}:${operation.userId}:${operation.conversationId}`
    )).size).toBe(8);
    expect(hasConversationIdCollisionAcrossScopes(workload.operations)).toBe(true);
  });

  it("marks hard failures as fail and sustained five-minute threshold breaches as fail", () => {
    const cleanSamples = samples(10, { admissionP95Ms: 80 });
    expect(evaluateRuntimeBaselineSamples(cleanSamples, DEFAULT_RUNTIME_BASELINE_THRESHOLDS).failures).toEqual([]);

    const hardFailure = evaluateRuntimeBaselineSamples(
      samples(1, { hardFailures: ["SQLITE_INTEGRITY_FAILURE"] }),
      DEFAULT_RUNTIME_BASELINE_THRESHOLDS
    );
    expect(hardFailure.failures).toMatchObject([
      { code: "SQLITE_INTEGRITY_FAILURE", severity: "hard" }
    ]);

    const shortSpike = evaluateRuntimeBaselineSamples(samples(9, { admissionP95Ms: 101 }), DEFAULT_RUNTIME_BASELINE_THRESHOLDS);
    expect(shortSpike.failures).toEqual([]);

    const sustained = evaluateRuntimeBaselineSamples(samples(10, { admissionP95Ms: 101 }), DEFAULT_RUNTIME_BASELINE_THRESHOLDS);
    expect(sustained.failures).toMatchObject([
      { code: "SUSTAINED_THRESHOLD_BREACH", metric: "admissionP95Ms", severity: "hard" }
    ]);
  });

  it("creates a canonical local_verified report hash when all local baseline oracles pass", () => {
    const workload = buildDeterministicBaselineWorkload({ seededConversations: 20, concurrency: 5 });
    const report = createRuntimeBaselineReport({
      track: "local",
      generatedAt: "2026-07-09T00:00:00.000Z",
      workload,
      environment: { nodeVersion: "v20.20.2", platform: "darwin", track: "local" },
      samples: samples(10, { admissionP95Ms: 80 })
    });

    expect(report.result).toBe("local_verified");
    expect(report.failures).toEqual([]);
    expect(report.reportHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createRuntimeBaselineReport({
      track: "local",
      generatedAt: "2026-07-09T00:00:00.000Z",
      workload,
      environment: { nodeVersion: "v20.20.2", platform: "darwin", track: "local" },
      samples: samples(10, { admissionP95Ms: 80 })
    })).toEqual(report);
  });
});

function samples(count: number, overrides: Partial<RuntimeBaselineSampleInput>): RuntimeBaselineSampleInput[] {
  return Array.from({ length: count }, (_, index) => ({
    sampledAt: new Date(Date.UTC(2026, 6, 9, 0, 0, (index + 1) * 30)).toISOString(),
    admissionP95Ms: 80,
    durableReplayP95Ms: 120,
    rssBytes: 100_000_000,
    openFileDescriptors: 100,
    walBytes: 1024,
    mcpChildCount: 2,
    hardFailures: [],
    ...overrides
  }));
}

function countByKind(kinds: string[]): Record<string, number> {
  return kinds.reduce<Record<string, number>>((counts, kind) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
}

function hasConversationIdCollisionAcrossScopes(operations: { tenantId: string; userId: string; conversationId: string }[]): boolean {
  const seen = new Map<string, string>();
  for (const operation of operations) {
    const scope = `${operation.tenantId}:${operation.userId}`;
    const previousScope = seen.get(operation.conversationId);
    if (previousScope && previousScope !== scope) return true;
    seen.set(operation.conversationId, scope);
  }
  return false;
}
