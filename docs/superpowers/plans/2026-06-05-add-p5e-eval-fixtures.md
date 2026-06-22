# Eval Fixtures Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical eval fixtures and a deterministic local smoke script for the Eval CLI.

**Architecture:** Store small fixtures under `agent-runtime/fixtures/eval/`. Extend `evalCli.ts` with an explicit `--mock-answer` deterministic mode for smoke runs, while preserving the existing default `HttpJavaClient` path. Add tests that parse the fixture with `EvalCaseSchema` and run the smoke path without Java Backend, Frontend, providers, or persisted sessions.

**Tech Stack:** TypeScript, Node.js `fs`, Zod `EvalCaseSchema`, Vitest, pnpm workspace, OpenSpec.

---

## Files

- Create: `agent-runtime/fixtures/eval/smoke.jsonl`
  - Canonical deterministic fixture.
- Modify: `agent-runtime/src/evalCli.ts`
  - Add `--mock-answer <text>` support that runs local deterministic results through the existing CLI result/summary path.
- Modify: `agent-runtime/test/evalCli.test.ts`
  - Add fixture parsing and smoke runner tests.
- Modify: `agent-runtime/package.json`
  - Add `eval:smoke` script.
- Modify: `openspec/changes/add-p5e-eval-fixtures/tasks.md`
  - Mark tasks after verified completion.

## Task 1: Fixture File and RED Tests

**Files:**
- Modify: `agent-runtime/test/evalCli.test.ts`
- Create: `agent-runtime/fixtures/eval/smoke.jsonl`

- [ ] **Step 1: Write failing fixture and smoke tests**

Add imports to `agent-runtime/test/evalCli.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { EvalCaseSchema } from "@openharness/shared-schema";
```

Add this constant near the top:

```ts
const smokeFixturePath = new URL("../fixtures/eval/smoke.jsonl", import.meta.url);
```

Add tests inside `describe("Eval CLI", () => { ... })`:

```ts
  it("parses the canonical smoke fixture through EvalCaseSchema", () => {
    const content = readFileSync(smokeFixturePath, "utf-8");
    const cases = parseEvalCases(content);

    expect(cases.length).toBeGreaterThan(0);
    for (const evalCase of cases) {
      expect(EvalCaseSchema.parse(evalCase).evalId).toBe(evalCase.evalId);
    }
  });

  it("runs the canonical smoke fixture with deterministic mock answer", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runEvalCli(["--file", smokeFixturePath.pathname, "--mock-answer", "hello from eval smoke"], {
      writeStdout: (line) => stdout.push(line),
      writeStderr: (line) => stderr.push(line)
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const lines = stdout.map((line) => JSON.parse(line));
    expect(lines[0]).toMatchObject({ type: "result", evalId: "smoke-hello", passed: true });
    expect(lines.at(-1)).toMatchObject({ type: "summary", total: 1, passed: 1, failed: 0 });
  });
```

- [ ] **Step 2: Run eval CLI tests and verify RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- evalCli
```

Expected: FAIL because `agent-runtime/fixtures/eval/smoke.jsonl` does not exist and `--mock-answer` is not implemented.

- [ ] **Step 3: Add canonical fixture**

Create `agent-runtime/fixtures/eval/smoke.jsonl`:

```jsonl
{"evalId":"smoke-hello","tenantId":"tenant-smoke","userId":"user-smoke","conversationId":"conv-smoke-eval","input":"Say hello for eval smoke","expectedAnswerContains":"hello","expectedStopReason":"FINAL_ANSWER"}
```

- [ ] **Step 4: Add deterministic mock-answer support**

In `agent-runtime/src/evalCli.ts`, change the `runCase` selection to:

```ts
  const runCase = deps.runCase ?? mockRunCase(argv) ?? defaultRunCase(deps.javaClient);
```

Add these helpers before the entrypoint block:

```ts
function mockRunCase(argv: string[]): ((evalCase: EvalCase) => Promise<EvalReplayResult>) | undefined {
  const answer = valueAfter(argv, "--mock-answer");
  if (!answer) return undefined;
  return async (evalCase) => {
    const stopReason = "FINAL_ANSWER" as const;
    const failureReason = failureForMock(evalCase, answer, stopReason);
    return {
      evalId: evalCase.evalId,
      passed: failureReason === undefined,
      answer,
      stopReason,
      status: "completed",
      failureReason,
      events: [{ eventId: `mock-${evalCase.evalId}-final`, kind: "final_answer", data: { answer } }]
    };
  };
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function failureForMock(evalCase: EvalCase, answer: string, stopReason: "FINAL_ANSWER"): string | undefined {
  if (evalCase.expectedStopReason && evalCase.expectedStopReason !== stopReason) {
    return `expectedStopReason ${evalCase.expectedStopReason} but got ${stopReason}`;
  }
  if (evalCase.expectedAnswerContains && !answer.includes(evalCase.expectedAnswerContains)) {
    return `expectedAnswerContains "${evalCase.expectedAnswerContains}" was not found`;
  }
  return undefined;
}
```

Do not change the existing default `HttpJavaClient` behavior when `--mock-answer` is absent.

- [ ] **Step 5: Run eval CLI tests and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- evalCli
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: PASS.

## Task 2: Smoke Script and Targeted Regression

**Files:**
- Modify: `agent-runtime/package.json`
- Modify: `openspec/changes/add-p5e-eval-fixtures/tasks.md`

- [ ] **Step 1: Add package script**

In `agent-runtime/package.json`, add:

```json
"eval:smoke": "pnpm eval:replay -- --file fixtures/eval/smoke.jsonl --mock-answer \"hello from eval smoke\""
```

Keep existing `dev`, `eval:replay`, `test`, and `typecheck` scripts unchanged.

- [ ] **Step 2: Run smoke script and targeted tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime run eval:smoke
pnpm --filter @openharness/agent-runtime test -- evalCli evalReplayHarness
pnpm --filter @openharness/agent-runtime typecheck
```

Expected:
- smoke script exits `0` and prints one result line plus one summary line
- targeted tests PASS
- typecheck PASS

- [ ] **Step 3: Update OpenSpec task checklist**

In `openspec/changes/add-p5e-eval-fixtures/tasks.md`, mark `1.1` through `3.1` as complete after targeted tests and smoke script pass. Keep `3.2` and `3.3` unchecked until full verification and archive complete.

- [ ] **Step 4: Validate active change**

Run:

```bash
npx openspec validate add-p5e-eval-fixtures --strict --no-interactive
```

Expected: `Change 'add-p5e-eval-fixtures' is valid`.

## Task 3: Full Verification and Archive

**Files:**
- OpenSpec archive path produced by CLI: `openspec/changes/archive/2026-06-05-add-p5e-eval-fixtures/`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck
pnpm test
mvn test
npx openspec validate --all --strict --no-interactive
```

Expected:
- `pnpm typecheck`: exit 0
- `pnpm test`: exit 0
- `mvn test`: `BUILD SUCCESS`
- OpenSpec validation: all specs/changes pass

- [ ] **Step 2: Mark full verification task complete**

In `openspec/changes/add-p5e-eval-fixtures/tasks.md`, mark `3.2` complete.

- [ ] **Step 3: Archive the approved and implemented change**

Run:

```bash
npx openspec archive add-p5e-eval-fixtures --yes
```

Expected: change moves to `openspec/changes/archive/2026-06-05-add-p5e-eval-fixtures/` and `openspec/specs/eval-replay/spec.md` is updated.

- [ ] **Step 4: Mark archive task complete in archived checklist**

In `openspec/changes/archive/2026-06-05-add-p5e-eval-fixtures/tasks.md`, mark `3.3` complete if the archive command could not mark it before moving.

- [ ] **Step 5: Validate after archive**

Run:

```bash
npx openspec validate --all --strict --no-interactive
npx openspec list
```

Expected:
- validation passes
- `npx openspec list` prints `No active changes found.`

## Self-Review

- Spec coverage: canonical fixture parsing maps to Task 1 fixture test; deterministic smoke path maps to Task 1 mock-answer test and Task 2 script; boundary constraints are covered by no external service usage in tests and smoke command.
- Placeholder scan: no `TBD`, deferred implementation, or unspecified validation steps remain.
- Type consistency: `EvalCaseSchema`, `parseEvalCases`, `runEvalCli`, and `EvalReplayResult` names match existing source files.
