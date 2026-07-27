import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("Runtime storage Worker event-loop isolation", () => {
  it("keeps setImmediate heartbeat below 100ms during mature-shaped write pressure", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "openharness-worker-heartbeat-"));
    workspaces.push(workspace);
    const context = await openProductionRuntimeContext(join(workspace, "runtime.sqlite"));

    for (let index = 0; index < 100; index += 1) {
      const scope = lifecycleScope(`seed-${index}`);
      await context.lifecycle.startExecution({ ...scope, message: `seed-${index}` });
      await context.lifecycle.recordEvent({
        ...scope,
        kind: "trace",
        data: {
          name: `trace-${index}`,
          eventType: "MODEL_CALL_END",
          startTime: index
        }
      });
    }
    const candidates = await context.storage.execute("p2", "outbox.claim", {
      now: Number.MAX_SAFE_INTEGER,
      limit: 100
    });
    expect(candidates).toHaveLength(100);
    const outcomes = candidates.map(candidate => ({
      event: {
        tenantId: candidate.event.tenantId,
        userId: candidate.event.userId,
        conversationId: candidate.event.conversationId,
        eventId: candidate.event.eventId
      },
      transition: "retry" as const,
      nextAttemptAt: 1
    }));

    let sampling = true;
    const heartbeatDelays: number[] = [];
    const heartbeat = (async () => {
      while (sampling) {
        const startedAt = performance.now();
        await new Promise<void>(resolve => setImmediate(resolve));
        heartbeatDelays.push(performance.now() - startedAt);
      }
    })();
    const admissions = Array.from({ length: 20 }, (_, index) =>
      context.lifecycle.startExecution({
        ...lifecycleScope(`admission-${index}`),
        message: `admission-${index}`
      })
    );
    const transitions = Array.from({ length: 20 }, () =>
      context.storage.execute("p2", "outbox.applyOutcomes", { outcomes })
    );
    await Promise.all([...admissions, ...transitions]);
    sampling = false;
    await heartbeat;

    expect(heartbeatDelays.length).toBeGreaterThan(0);
    expect(Math.max(...heartbeatDelays)).toBeLessThan(100);
    await context.close();
  }, 20_000);
});

function lifecycleScope(suffix: string) {
  return {
    tenantId: "tenant-a",
    userId: "user-a",
    conversationId: `conversation-${suffix}`,
    executionId: `execution-${suffix}`,
    traceId: `trace-${suffix}`,
    requestId: `request-${suffix}`
  };
}
