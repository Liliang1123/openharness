# Runtime Chat Lifecycle Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit redacted accepted/terminal JSON-lines records for synchronous and streaming Runtime chat so the existing local `logs` command can correlate a real execution by conversation, request, trace, or execution identifier.

**Architecture:** A small allowlist serializer owns stdout formatting and catches sink failures. `createServer` injects that logger into both chat inputs, while the shared detached `AgentExecutionRunner` emits accepted after admission and terminal after completion; eval/direct-runner callers that do not inject it remain silent. No API, shared schema, durable event, database, Java, Frontend, or wrapper syntax changes are allowed.

**Tech Stack:** TypeScript 5.8, Node.js stdout, Fastify, Vitest, pnpm workspace, OpenSpec, Bash user-local wrapper.

---

## File Map And Boundaries

- Create [runtimeChatLifecycleLog.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/runtimeChatLifecycleLog.ts): fixed-field JSON-lines serializer and non-throwing stdout sink.
- Modify [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts): accept an optional request-scoped lifecycle logger and emit once after admission and once after terminal completion.
- Modify [agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentStreamLoop.ts): carry the optional internal logger through the shared runner input; no SSE shape change.
- Modify [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts): create/inject the production logger into both sync and stream handlers and expose a controlled test seam.
- Create [runtimeChatLifecycleLog.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/runtimeChatLifecycleLog.test.ts): exact-shape, privacy-canary, and sink-failure unit tests.
- Modify [agentExecutionRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/agentExecutionRunner.test.ts): exactly-once accepted/terminal runner integration tests.
- Modify [terminalErrors.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/terminalErrors.test.ts): classified terminal-error lifecycle assertion.
- Modify [streamEventIds.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/streamEventIds.test.ts): prove stream and sync server paths inject the same logger without changing SSE.
- Modify [openharness-local-cli-wrapper.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md): document fields, privacy boundary, lookup, and rollback.
- Update [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/tasks.md), [dashboard JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json), generated dashboard outputs, and an implementation Review under [docs/review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review).
- User-local sync is limited to the four production TypeScript files above under [isolated source](file:///Users/elvis/.local/share/openharness/source). Existing `.env`, provider configuration, agent definition, wrapper, Java files, tests, and credential storage are not changed.
- Do not modify [primary checkout](file:///Users/elvis/file/develop/opensource/openharness), Java Backend, packages/shared-schema, SQLite/storage, Frontend, wrapper executable, local gateway helper, OAuth files, or provider configuration.
- Do not run `git add`, `git commit`, `git push`, `git reset`, `git clean`, archive, full-repository regression, or a 24-hour Gate.

### Task 1: Planning, Approval, And Preflight

- [ ] **Step 1: Record approval and plan path**

Mark OpenSpec task `1.3` complete and add this plan path to the proposed
dashboard entry. Do not mark `1.4` until Preflight Review passes.

- [ ] **Step 2: Run plan self-review**

Run:

```bash
rg -n 'TBD|TODO|implement later|fill in|git (add|commit|push|reset|clean)' docs/superpowers/plans/2026-07-28-add-runtime-chat-lifecycle-logs.md
rg -n 'Frontend|shared-schema|SQLite|Java Backend|wrapper executable|OAuth' docs/superpowers/plans/2026-07-28-add-runtime-chat-lifecycle-logs.md
git diff --check
```

Expected: no placeholders or executable Git mutation steps; only intentional
boundary/non-goal references; no whitespace errors.

- [ ] **Step 3: Create and pass Plan Preflight Review**

Create
`docs/review/2026-07-28-runtime-chat-lifecycle-logs-plan-preflight-review.md`
with `结论：通过`, file-URL scope, exact allowed files, TDD sequence, privacy
canaries, user-local backup/sync/rollback, formal commands, and stop conditions.
Any finding revises this plan and restarts Preflight.

- [ ] **Step 4: Validate planning state**

Run:

```bash
openspec validate add-runtime-chat-lifecycle-logs --strict --no-interactive
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
git diff --check
```

Expected: exit `0`; the known offline PostHog flush warning is non-blocking.
Then mark OpenSpec task `1.4` complete.

### Task 2: Lifecycle Serializer TDD

- [ ] **Step 1: Write exact-shape RED tests**

Create `agent-runtime/test/runtimeChatLifecycleLog.test.ts` with a collecting
sink and deterministic clock:

```ts
import { describe, expect, it, vi } from "vitest";
import { createRuntimeChatLifecycleLogger } from "../src/runtimeChatLifecycleLog";

const identity = {
  conversationId: "conv-log",
  requestId: "req-log",
  traceId: "trace-log",
  executionId: "exec-log"
};

describe("RuntimeChatLifecycleLogger", () => {
  it("writes exact allowlisted accepted and terminal JSON lines", () => {
    const lines: string[] = [];
    const logger = createRuntimeChatLifecycleLogger(line => lines.push(line));

    logger.accepted(identity, 1_000);
    logger.terminal(identity, {
      status: "completed",
      stopReason: "FINAL_ANSWER",
      durationMs: 25,
      timestampMs: 1_025
    });

    expect(lines.map(line => JSON.parse(line))).toEqual([
      {
        schemaVersion: 1,
        event: "runtime_chat_accepted",
        timestamp: "1970-01-01T00:00:01.000Z",
        ...identity
      },
      {
        schemaVersion: 1,
        event: "runtime_chat_terminal",
        timestamp: "1970-01-01T00:00:01.025Z",
        ...identity,
        status: "completed",
        stopReason: "FINAL_ANSWER",
        durationMs: 25
      }
    ]);
  });
});
```

- [ ] **Step 2: Add privacy and sink-failure RED tests**

Add:

```ts
it("ignores non-allowlisted canary properties", () => {
  const lines: string[] = [];
  const logger = createRuntimeChatLifecycleLogger(line => lines.push(line));
  const tainted = {
    ...identity,
    message: "MESSAGE-CANARY",
    answer: "ANSWER-CANARY",
    prompt: "PROMPT-CANARY",
    toolArguments: "TOOL-CANARY",
    authorization: "Bearer AUTH-CANARY",
    tenantId: "TENANT-CANARY",
    userId: "USER-CANARY",
    oauth: "OAUTH-CANARY",
    error: "ERROR-CANARY"
  };

  logger.accepted(tainted, 1_000);
  logger.terminal(tainted, {
    status: "errored",
    stopReason: "MODEL_ERROR",
    durationMs: 1,
    timestampMs: 1_001
  });

  const output = lines.join("\n");
  for (const canary of [
    "MESSAGE-CANARY", "ANSWER-CANARY", "PROMPT-CANARY", "TOOL-CANARY",
    "AUTH-CANARY", "TENANT-CANARY", "USER-CANARY", "OAUTH-CANARY",
    "ERROR-CANARY"
  ]) expect(output).not.toContain(canary);
});

it("swallows serializer sink failures", () => {
  const logger = createRuntimeChatLifecycleLogger(() => {
    throw new Error("SINK-CANARY");
  });
  expect(() => logger.accepted(identity, 1_000)).not.toThrow();
  expect(() => logger.terminal(identity, {
    status: "completed",
    stopReason: "FINAL_ANSWER",
    durationMs: 0,
    timestampMs: 1_000
  })).not.toThrow();
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/runtimeChatLifecycleLog.test.ts
```

Expected: FAIL because `runtimeChatLifecycleLog.ts` does not exist.

- [ ] **Step 4: Implement the allowlist serializer**

Create `agent-runtime/src/runtimeChatLifecycleLog.ts`:

```ts
import type { ExecutionStatus } from "./executionStateStore";

export interface RuntimeChatLifecycleIdentity {
  conversationId: string;
  requestId: string;
  traceId: string;
  executionId: string;
}

export interface RuntimeChatLifecycleLogger {
  accepted(identity: RuntimeChatLifecycleIdentity, timestampMs: number): void;
  terminal(
    identity: RuntimeChatLifecycleIdentity,
    terminal: {
      status: ExecutionStatus;
      stopReason?: string;
      durationMs: number;
      timestampMs: number;
    }
  ): void;
}

export function createRuntimeChatLifecycleLogger(
  writeLine: (line: string) => void = line => process.stdout.write(`${line}\n`)
): RuntimeChatLifecycleLogger {
  const safeWrite = (record: Record<string, unknown>) => {
    try {
      writeLine(JSON.stringify(record));
    } catch {
      // Operator logging must never alter execution semantics.
    }
  };
  return {
    accepted(identity, timestampMs) {
      safeWrite({
        schemaVersion: 1,
        event: "runtime_chat_accepted",
        timestamp: new Date(timestampMs).toISOString(),
        conversationId: identity.conversationId,
        requestId: identity.requestId,
        traceId: identity.traceId,
        executionId: identity.executionId
      });
    },
    terminal(identity, terminal) {
      safeWrite({
        schemaVersion: 1,
        event: "runtime_chat_terminal",
        timestamp: new Date(terminal.timestampMs).toISOString(),
        conversationId: identity.conversationId,
        requestId: identity.requestId,
        traceId: identity.traceId,
        executionId: identity.executionId,
        status: terminal.status,
        ...(terminal.stopReason ? { stopReason: terminal.stopReason } : {}),
        durationMs: Math.max(0, Math.floor(terminal.durationMs))
      });
    }
  };
}
```

- [ ] **Step 5: Run serializer GREEN**

Run the focused command from Step 3.

Expected: all serializer tests pass with no canary in output.

### Task 3: Shared Runner Wiring TDD

- [ ] **Step 1: Add runner RED test**

In `agentExecutionRunner.test.ts`, import `RuntimeChatLifecycleLogger`, inject a
collector through `baseInput`, and add:

```ts
it("emits one accepted and one terminal lifecycle record after admission", async () => {
  const accepted = vi.fn();
  const terminal = vi.fn();
  const lifecycleLogger: RuntimeChatLifecycleLogger = { accepted, terminal };
  const runner = new AgentExecutionRunner(
    new FakeJavaClient(),
    history,
    undefined,
    runtimeEventStore,
    executionStateStore
  );

  const { executionId, done } = runner.start({ ...baseInput, lifecycleLogger });
  const final = await done;

  expect(accepted).toHaveBeenCalledTimes(1);
  expect(accepted).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: baseInput.conversationId,
      requestId: baseInput.requestId,
      traceId: baseInput.traceId,
      executionId
    }),
    expect.any(Number)
  );
  expect(terminal).toHaveBeenCalledTimes(1);
  expect(terminal).toHaveBeenCalledWith(
    expect.objectContaining({ executionId }),
    expect.objectContaining({
      status: final.status,
      stopReason: "FINAL_ANSWER",
      durationMs: expect.any(Number),
      timestampMs: expect.any(Number)
    })
  );
});
```

In `terminalErrors.test.ts`, import `vi` and
`RuntimeChatLifecycleLogger`. Change `runTerminalCase` to inject:

```ts
const accepted = vi.fn();
const terminal = vi.fn();
const lifecycleLogger: RuntimeChatLifecycleLogger = { accepted, terminal };
const { executionId, done } = runner.start({
  ...baseInput,
  ...inputOptions,
  lifecycleLogger
});
```

Return `accepted` and `terminal`, then extend the existing model-error case:

```ts
expect(result.accepted).toHaveBeenCalledTimes(1);
expect(result.terminal).toHaveBeenCalledTimes(1);
expect(result.terminal).toHaveBeenCalledWith(
  expect.objectContaining({
    conversationId: "conv-terminal",
    requestId: "req1",
    traceId: "tr1"
  }),
  expect.objectContaining({
    status: "errored",
    stopReason: "MODEL_ERROR",
    durationMs: expect.any(Number),
    timestampMs: expect.any(Number)
  })
);
expect(JSON.stringify(result.terminal.mock.calls)).not.toContain("provider failed");
```

- [ ] **Step 2: Run runner RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/agentExecutionRunner.test.ts test/terminalErrors.test.ts
```

Expected: TypeScript compilation/test failure because `lifecycleLogger` is not
part of `AgentExecutionInput` and the runner does not call it.

- [ ] **Step 3: Implement shared runner emission**

Extend `AgentExecutionInput`:

```ts
lifecycleLogger?: RuntimeChatLifecycleLogger;
```

In `start`, build the identity from four explicit fields. Keep the existing
admission expression and catch body intact, but insert the success projection
before the catch. Capture `acceptedAt = Date.now()` and call `accepted`. Chain
the existing `runLoop`, then call `terminal` exactly once before returning its
terminal state:

```ts
let acceptedAt = 0;
const identity = {
  conversationId: input.conversationId,
  requestId: input.requestId,
  traceId: input.traceId,
  executionId
};
const admitted = (this.persistence
  ? this.publishCommit(this.persistence.lifecycle.startExecution({
      ...this.lifecycleScope(executionId, input),
      message: input.message
    }))
  : Promise.resolve())
  .then(() => {
    acceptedAt = Date.now();
    input.lifecycleLogger?.accepted(identity, acceptedAt);
  })
  .catch(error => {
    this.executionStateStore.transitionToTerminal(
      input.tenantId,
      input.userId,
      input.conversationId,
      executionId,
      "errored",
      admissionFailureReason(error)
    );
    throw error;
  });
const done = admitted
  .then(() => this.runLoop(executionId, input))
  .then(state => {
    const timestampMs = Date.now();
    input.lifecycleLogger?.terminal(identity, {
      status: state.status,
      ...(state.endReason ? { stopReason: state.endReason } : {}),
      durationMs: timestampMs - acceptedAt,
      timestampMs
    });
    return state;
  });
```

Preserve the current admission-failure state transition and rejection. Do not
log accepted before durable admission. Do not pass `input.message`, headers,
tenant/user, state object, or error object to the logger.

- [ ] **Step 4: Run runner GREEN**

Run the focused runner test command. Expected: all selected tests pass.

### Task 4: Server Sync/Stream Wiring TDD

- [ ] **Step 1: Add server injection RED coverage**

Add an optional test seam to the planned test expectations:

```ts
runtimeChatLifecycleLogger?: RuntimeChatLifecycleLogger | null;
```

In `streamEventIds.test.ts`, create a collecting logger and pass it to the
server. Run one existing sync request and one stream request with distinct
correlation identifiers. Assert each execution produces one accepted and one
terminal call and that existing SSE event assertions remain unchanged.

- [ ] **Step 2: Run server RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/streamEventIds.test.ts
```

Expected: FAIL because `CreateServerOptions` does not accept the logger and the
handlers do not inject it.

- [ ] **Step 3: Wire production logger without changing protocols**

In `server.ts`, import the logger types/factory, add the option seam, resolve:

```ts
const runtimeChatLifecycleLogger =
  options.runtimeChatLifecycleLogger === undefined
    ? createRuntimeChatLifecycleLogger()
    : options.runtimeChatLifecycleLogger ?? undefined;
```

Pass `lifecycleLogger: runtimeChatLifecycleLogger` in both `runner.start` input
and `streamLoop.stream` input. Add the optional field to `StreamInput` and let
the stream adapter forward it unchanged to `runner.start`.

Do not enable Fastify logging and do not change response headers, JSON payloads,
SSE events, disconnect behavior, or persistence.

- [ ] **Step 4: Run focused GREEN and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/runtimeChatLifecycleLog.test.ts test/agentExecutionRunner.test.ts test/terminalErrors.test.ts test/streamEventIds.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/productionStartupScript.test.ts
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: all selected tests and typecheck pass.

### Task 5: Documentation And Repository Verification

- [ ] **Step 1: Update wrapper guide**

Document:

```text
runtime_chat_accepted:
  schemaVersion, event, timestamp, conversationId, requestId, traceId, executionId

runtime_chat_terminal:
  accepted fields + status, optional stopReason, durationMs
```

State that logs contain no message, answer, prompt, tool data, identity header,
credential, OAuth material, or arbitrary error text; `logs` remains a tail
command and the records are not a persistence/audit authority.

- [ ] **Step 2: Run formal focused verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/runtimeChatLifecycleLog.test.ts test/agentExecutionRunner.test.ts test/terminalErrors.test.ts test/streamEventIds.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/productionStartupScript.test.ts
pnpm --filter @openharness/agent-runtime typecheck
bash -n /Users/elvis/.local/bin/openharness
openspec validate add-runtime-chat-lifecycle-logs --strict --no-interactive
git diff --check
```

Expected: all exit `0`; no sensitive canary appears in lifecycle output.

### Task 6: Back Up And Synchronize User-Local Runtime

- [ ] **Step 1: Confirm stopped state and exact targets**

Run wrapper status and port checks. If running, use only `openharness down`.
Confirm no listeners on `8080`, `3001`, `3101`, or `5173`.

- [ ] **Step 2: Create a timestamped backup**

Under [user-local backups](file:///Users/elvis/.local/state/openharness/backups),
back up existing:

```text
agent-runtime/src/agentExecutionRunner.ts
agent-runtime/src/agentStreamLoop.ts
agent-runtime/src/server.ts
```

Record that `agent-runtime/src/runtimeChatLifecycleLog.ts` was absent if so.
Write a `0600` manifest with source/backup paths and SHA-256 hashes only. Do not
read or print `.env`, agent definition content, provider keys, or OAuth storage.

- [ ] **Step 3: Sync only four production files**

Copy the verified worktree versions of:

```text
agent-runtime/src/runtimeChatLifecycleLog.ts
agent-runtime/src/agentExecutionRunner.ts
agent-runtime/src/agentStreamLoop.ts
agent-runtime/src/server.ts
```

to the same relative paths in the isolated source. Do not sync tests,
OpenSpec/dashboard files, Java files, configuration, Git metadata, or Frontend.

- [ ] **Step 4: Verify hashes and isolated-source typecheck**

Compare the four worktree/local hashes and run:

```bash
pnpm --filter @openharness/agent-runtime typecheck
```

from the isolated source. Expected: hashes match and typecheck passes.

### Task 7: Real Six-Command Smoke And Review

- [ ] **Step 1: Execute the six commands in order**

Run:

```text
openharness doctor
openharness up
openharness status
openharness chat "只回复 OPENHARNESS_RUNTIME_LOG_CLOSURE_OK"
openharness logs runtime
openharness down
```

Capture non-secret conversation/request/trace identifiers from chat. Stop the
tail with `Ctrl-C`. `logs` is PASS only if the accepted and terminal JSON lines
contain all three identifiers and the terminal line contains
`FINAL_ANSWER`; scan the matched lines for prohibited canaries/field names.

- [ ] **Step 2: Verify final stopped state**

Require `status` to report stopped and no listeners on `8080`, `3001`, `3101`,
or `5173`. On any startup/smoke failure, use wrapper-owned `down`, retain logs,
and stop for diagnosis; never kill by broad process name.

- [ ] **Step 3: Perform implementation Review**

Create
`docs/review/2026-07-28-runtime-chat-lifecycle-logs-implementation-review.md`.
Review the complete diff, production wiring, exact shapes, sync/stream coverage,
privacy canaries, sink-failure behavior, user-local backup/sync, 6/6 evidence,
rollback, and final stop state. Any finding returns to fix → verification →
Review.

- [ ] **Step 4: Reconcile dashboard and OpenSpec tasks**

When implementation and real smoke pass, set the dashboard entry to `verified`,
list source/tests/commands/results, render generated outputs, and mark tasks
truthfully. Keep both active changes unarchived.

- [ ] **Step 5: Run fresh final verification**

After the last repository edit, run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/runtimeChatLifecycleLog.test.ts test/agentExecutionRunner.test.ts test/terminalErrors.test.ts test/streamEventIds.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/productionStartupScript.test.ts
pnpm --filter @openharness/agent-runtime typecheck
bash -n /Users/elvis/.local/bin/openharness
openspec validate add-runtime-chat-lifecycle-logs --strict --no-interactive
pnpm dashboard:check
git diff --check
git status --short
```

Expected: focused tests, typecheck, syntax, strict validation, dashboard, and
diff checks pass; only approved worktree/local files changed; wrapper remains
stopped. Report Local Trial evidence only, never Production Verified.
