# Eval Replay CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local TS Runtime CLI that replays `EvalCase` fixtures from JSON/JSONL files and emits JSONL results plus a summary.

**Architecture:** Add a testable `agent-runtime/src/evalCli.ts` module with injectable file I/O and `runCase` dependencies. The production path uses `HttpJavaClient` and existing `runEvalCase`; tests inject a fake runner so no Java service, frontend, or persisted sessions are required. Add a package script that runs the CLI through `tsx`.

**Tech Stack:** TypeScript, Node.js `fs`, Zod `EvalCaseSchema`, `EvalReplayHarness`, Vitest, pnpm workspace, OpenSpec.

---

## Files

- Create: `agent-runtime/src/evalCli.ts`
  - Parse JSON array and JSONL fixtures.
  - Run cases sequentially through an injectable case runner.
  - Emit per-case JSONL and final summary.
  - Return deterministic exit codes.
- Create: `agent-runtime/test/evalCli.test.ts`
  - TDD coverage for JSON array input, JSONL input, failure exit code, invalid input, and summary output.
- Modify: `agent-runtime/package.json`
  - Add `eval:replay` script.
- Modify: `openspec/changes/add-p5d-eval-cli/tasks.md`
  - Mark tasks after verified completion.

## Task 1: Eval CLI Parser and Runner

**Files:**
- Create: `agent-runtime/test/evalCli.test.ts`
- Create: `agent-runtime/src/evalCli.ts`

- [ ] **Step 1: Write failing eval CLI tests**

Create `agent-runtime/test/evalCli.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvalCases, runEvalCli } from "../src/evalCli";
import type { EvalReplayResult } from "../src/evalReplayHarness";

const passingCase = {
  evalId: "eval-pass",
  tenantId: "tenant-a",
  userId: "user-a",
  conversationId: "conv-a",
  input: "Say hello",
  expectedAnswerContains: "hello"
};

const failingCase = {
  evalId: "eval-fail",
  tenantId: "tenant-a",
  userId: "user-a",
  conversationId: "conv-b",
  input: "Say goodbye",
  expectedAnswerContains: "goodbye"
};

function result(evalId: string, passed: boolean): EvalReplayResult {
  return {
    evalId,
    passed,
    answer: passed ? "hello" : "no match",
    stopReason: "FINAL_ANSWER",
    status: "completed",
    failureReason: passed ? undefined : "expectedAnswerContains was not found",
    events: [{ eventId: `${evalId}-event`, kind: "final_answer", data: { answer: passed ? "hello" : "no match" } }]
  };
}

function tmpFile(name: string, content: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "openharness-eval-cli-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return { dir, path };
}

describe("Eval CLI", () => {
  it("parses eval cases from a JSON array", () => {
    const cases = parseEvalCases(JSON.stringify([passingCase]));

    expect(cases).toHaveLength(1);
    expect(cases[0]?.evalId).toBe("eval-pass");
  });

  it("parses eval cases from JSONL", () => {
    const cases = parseEvalCases(`${JSON.stringify(passingCase)}\n\n${JSON.stringify(failingCase)}\n`);

    expect(cases.map((item) => item.evalId)).toEqual(["eval-pass", "eval-fail"]);
  });

  it("runs JSON array cases and emits JSONL results plus summary", async () => {
    const { dir, path } = tmpFile("cases.json", JSON.stringify([passingCase]));
    const stdout: string[] = [];
    try {
      const exitCode = await runEvalCli(["--file", path], {
        writeStdout: (line) => stdout.push(line),
        writeStderr: () => {},
        runCase: async (evalCase) => result(evalCase.evalId, true)
      });

      expect(exitCode).toBe(0);
      const lines = stdout.map((line) => JSON.parse(line));
      expect(lines[0]).toMatchObject({ type: "result", evalId: "eval-pass", passed: true });
      expect(lines[1]).toMatchObject({ type: "summary", total: 1, passed: 1, failed: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns non-zero when any eval case fails", async () => {
    const { dir, path } = tmpFile("cases.jsonl", `${JSON.stringify(passingCase)}\n${JSON.stringify(failingCase)}\n`);
    const stdout: string[] = [];
    try {
      const exitCode = await runEvalCli(["--file", path], {
        writeStdout: (line) => stdout.push(line),
        writeStderr: () => {},
        runCase: async (evalCase) => result(evalCase.evalId, evalCase.evalId !== "eval-fail")
      });

      expect(exitCode).toBe(1);
      const lines = stdout.map((line) => JSON.parse(line));
      expect(lines[1]).toMatchObject({ type: "result", evalId: "eval-fail", passed: false });
      expect(lines[2]).toMatchObject({ type: "summary", total: 2, passed: 1, failed: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns structured error evidence for invalid input", async () => {
    const { dir, path } = tmpFile("bad.json", "{\"evalId\":");
    const stderr: string[] = [];
    try {
      const exitCode = await runEvalCli(["--file", path], {
        writeStdout: () => {},
        writeStderr: (line) => stderr.push(line),
        runCase: async () => result("unused", true)
      });

      expect(exitCode).toBe(2);
      expect(JSON.parse(stderr[0])).toMatchObject({ type: "error", errorClass: "EVAL_CLI_INPUT_ERROR" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run eval CLI tests and verify RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- evalCli
```

Expected: FAIL because `agent-runtime/src/evalCli.ts` does not exist.

- [ ] **Step 3: Add minimal eval CLI implementation**

Create `agent-runtime/src/evalCli.ts`:

```ts
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { EvalCaseSchema, type EvalCase } from "@openharness/shared-schema";
import { runEvalCase, type EvalReplayResult } from "./evalReplayHarness";
import { HttpJavaClient, type JavaClient } from "./javaClient";

export interface EvalCliDeps {
  writeStdout?: (line: string) => void;
  writeStderr?: (line: string) => void;
  runCase?: (evalCase: EvalCase) => Promise<EvalReplayResult>;
  javaClient?: JavaClient;
}

export function parseEvalCases(content: string): EvalCase[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Expected JSON array of EvalCase objects");
    return parsed.map((item) => EvalCaseSchema.parse(item));
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => EvalCaseSchema.parse(JSON.parse(line)));
}

export async function runEvalCli(argv: string[], deps: EvalCliDeps = {}): Promise<number> {
  const writeStdout = deps.writeStdout ?? ((line) => console.log(line));
  const writeStderr = deps.writeStderr ?? ((line) => console.error(line));
  const file = fileArg(argv);
  if (!file) {
    writeStderr(JSON.stringify({ type: "error", errorClass: "EVAL_CLI_USAGE_ERROR", errorMessage: "Usage: eval:replay -- --file <path>" }));
    return 2;
  }

  let cases: EvalCase[];
  try {
    cases = parseEvalCases(readFileSync(file, "utf-8"));
  } catch (error) {
    writeStderr(JSON.stringify({
      type: "error",
      errorClass: "EVAL_CLI_INPUT_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error)
    }));
    return 2;
  }

  const runCase = deps.runCase ?? defaultRunCase(deps.javaClient);
  let passed = 0;
  let failed = 0;
  for (const evalCase of cases) {
    const result = await runCase(evalCase);
    if (result.passed) passed++;
    else failed++;
    writeStdout(JSON.stringify({ type: "result", ...result }));
  }
  writeStdout(JSON.stringify({ type: "summary", total: cases.length, passed, failed }));
  return failed === 0 ? 0 : 1;
}

function fileArg(argv: string[]): string | undefined {
  const index = argv.indexOf("--file");
  if (index >= 0) return argv[index + 1];
  return argv[0]?.startsWith("-") ? undefined : argv[0];
}

function defaultRunCase(javaClient?: JavaClient): (evalCase: EvalCase) => Promise<EvalReplayResult> {
  const client = javaClient ?? new HttpJavaClient(process.env.JAVA_BACKEND_URL ?? "http://localhost:8080");
  return (evalCase) => runEvalCase(evalCase, client);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runEvalCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
```

- [ ] **Step 4: Run eval CLI tests and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- evalCli
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: PASS.

## Task 2: Package Script and Targeted Regression

**Files:**
- Modify: `agent-runtime/package.json`
- Modify: `openspec/changes/add-p5d-eval-cli/tasks.md`

- [ ] **Step 1: Add package script**

In `agent-runtime/package.json`, add:

```json
"eval:replay": "tsx src/evalCli.ts"
```

Keep existing `dev`, `test`, and `typecheck` scripts unchanged.

- [ ] **Step 2: Run targeted eval tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- evalCli evalReplayHarness
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: PASS.

- [ ] **Step 3: Update OpenSpec task checklist**

In `openspec/changes/add-p5d-eval-cli/tasks.md`, mark `1.1` through `3.2` as complete after targeted tests pass. Keep `3.3` and `3.4` unchecked until full verification and archive complete.

- [ ] **Step 4: Validate active change**

Run:

```bash
npx openspec validate add-p5d-eval-cli --strict --no-interactive
```

Expected: `Change 'add-p5d-eval-cli' is valid`.

## Task 3: Full Verification and Archive

**Files:**
- OpenSpec archive path produced by CLI: `openspec/changes/archive/2026-06-05-add-p5d-eval-cli/`

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

In `openspec/changes/add-p5d-eval-cli/tasks.md`, mark `3.3` complete.

- [ ] **Step 3: Archive the approved and implemented change**

Run:

```bash
npx openspec archive add-p5d-eval-cli --yes
```

Expected: change moves to `openspec/changes/archive/2026-06-05-add-p5d-eval-cli/` and `openspec/specs/eval-replay/spec.md` is updated.

- [ ] **Step 4: Mark archive task complete in archived checklist**

In `openspec/changes/archive/2026-06-05-add-p5d-eval-cli/tasks.md`, mark `3.4` complete if the archive command could not mark it before moving.

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

- Spec coverage: JSON array/JSONL replay maps to Task 1 parser tests; per-case JSONL result and summary map to Task 1 runner tests; non-zero failure/invalid input exit codes map to Task 1 tests; package script maps to Task 2.
- Placeholder scan: no `TBD`, deferred implementation, or unspecified validation steps remain.
- Type consistency: `EvalCase`, `EvalReplayResult`, `runEvalCase`, and `HttpJavaClient` names match existing source files.
