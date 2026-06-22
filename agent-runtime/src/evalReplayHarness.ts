import { EvalCaseSchema, type EvalCase, type SessionEvent } from "@openharness/shared-schema";
import { DEFAULT_AGENT_DEFINITION } from "./agentDefinitionLoader";
import { AgentExecutionRunner } from "./agentExecutionRunner";
import { InMemoryExecutionStateStore, type ExecutionState } from "./executionStateStore";
import { InMemoryHistoryStore } from "./history";
import type { JavaClient } from "./javaClient";
import type { MemoryStore } from "./memoryStore";
import { InMemoryRuntimeEventStore } from "./runtimeEventStore";
import type { StopReason } from "./types";

export interface EvalReplayResult {
  evalId: string;
  passed: boolean;
  answer: string;
  stopReason?: StopReason;
  status: ExecutionState["status"];
  failureReason?: string;
  events: Pick<SessionEvent, "eventId" | "kind" | "data">[];
}

export interface EvalReplayOptions {
  headers?: Record<string, string>;
  memoryStore?: MemoryStore;
}

export async function runEvalCase(
  input: EvalCase,
  javaClient: JavaClient,
  optionsOrHeaders: EvalReplayOptions | Record<string, string> = {}
): Promise<EvalReplayResult> {
  const options = normalizeOptions(optionsOrHeaders);
  const evalCase = EvalCaseSchema.parse(input);
  const history = new InMemoryHistoryStore();
  const runtimeEvents = new InMemoryRuntimeEventStore();
  const executionStates = new InMemoryExecutionStateStore();
  const runner = new AgentExecutionRunner(
    javaClient,
    history,
    undefined,
    runtimeEvents,
    executionStates,
    undefined,
    options.memoryStore
  );
  const requestId = `eval-${evalCase.evalId}`;
  const traceId = `trace-${evalCase.evalId}`;

  const handle = runner.start({
    conversationId: evalCase.conversationId,
    message: evalCase.input,
    userId: evalCase.userId,
    tenantId: evalCase.tenantId,
    traceId,
    requestId,
    agentDefinition: DEFAULT_AGENT_DEFINITION,
    headers: {
      Authorization: "Bearer eval",
      "X-User-Id": evalCase.userId,
      "X-Tenant-Id": evalCase.tenantId,
      "X-Trace-Id": traceId,
      "X-Request-Id": requestId,
      ...options.headers
    }
  });

  const finalState = await handle.done;
  const events = runtimeEvents.since(evalCase.tenantId, evalCase.conversationId, null);
  const finalAnswerEvent = [...events].reverse().find((event) => event.kind === "final_answer");
  const answer = typeof finalAnswerEvent?.data.answer === "string" ? finalAnswerEvent.data.answer : "";
  const stopReason = finalState.endReason as StopReason | undefined;
  const failureReason = failureFor(evalCase, answer, stopReason, finalState.status);

  return {
    evalId: evalCase.evalId,
    passed: failureReason === undefined,
    answer,
    stopReason,
    status: finalState.status,
    failureReason,
    events: events.map((event) => ({
      eventId: event.eventId,
      kind: event.kind,
      data: event.data
    }))
  };
}

function normalizeOptions(optionsOrHeaders: EvalReplayOptions | Record<string, string>): EvalReplayOptions {
  if ("memoryStore" in optionsOrHeaders || "headers" in optionsOrHeaders) {
    return optionsOrHeaders as EvalReplayOptions;
  }
  return { headers: optionsOrHeaders as Record<string, string> };
}

function failureFor(
  evalCase: EvalCase,
  answer: string,
  stopReason: StopReason | undefined,
  status: ExecutionState["status"]
): string | undefined {
  if (status !== "completed") {
    return `status expected completed but got ${status}`;
  }
  if (evalCase.expectedStopReason && stopReason !== evalCase.expectedStopReason) {
    return `expectedStopReason ${evalCase.expectedStopReason} but got ${stopReason ?? "undefined"}`;
  }
  if (evalCase.expectedAnswerContains && !answer.includes(evalCase.expectedAnswerContains)) {
    return `expectedAnswerContains "${evalCase.expectedAnswerContains}" was not found`;
  }
  return undefined;
}
