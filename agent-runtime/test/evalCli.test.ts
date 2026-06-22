import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvalCaseSchema } from "@openharness/shared-schema";
import { describe, expect, it } from "vitest";
import { parseEvalCases, runEvalCli } from "../src/evalCli";
import type { EvalReplayResult } from "../src/evalReplayHarness";

const smokeFixturePath = new URL("../fixtures/eval/smoke.jsonl", import.meta.url);

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
