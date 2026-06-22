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

  const runCase = deps.runCase ?? mockRunCase(argv) ?? defaultRunCase(deps.javaClient);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runEvalCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
