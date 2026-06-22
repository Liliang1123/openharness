# agent-loop Specification

## Purpose
TBD - created by archiving change add-p3a-multi-step-loop. Update Purpose after archive.
## Requirements
### Requirement: Agent runtime SHALL execute a bounded multi-step loop until model produces no tool calls

The TS Agent Runtime MUST drive the model in a loop where each step consists of: (1) one model invocation; (2) policy evaluation on returned tool calls; (3) execution of allowed tool calls; (4) appending tool results to history. The loop terminates when the model returns a message without `toolCalls` or when `stepBudget` is exhausted, whichever comes first.

#### Scenario: Multi-step tool loop completes normally

- Given a conversation where the model returns tool calls in step 1 and step 2, and a final answer (no tool calls) in step 3
- When `AgentLoop.run()` is invoked
- Then `javaClient.chat` is called at least 3 times
- And `javaClient.executeTool` is called for every allowed tool call across step 1 and step 2
- And the response `stopReason` equals `FINAL_ANSWER`
- And the response `answer` equals the content of the step-3 model message

#### Scenario: Single-step happy path is preserved

- Given a conversation where the model returns no tool calls in step 1
- When `AgentLoop.run()` is invoked
- Then `javaClient.chat` is called exactly once
- And `javaClient.executeTool` is not called
- And the response `stopReason` equals `FINAL_ANSWER`

### Requirement: Agent runtime SHALL respect a configurable step budget

The runtime MUST resolve `stepBudget` in the following order: (1) `AgentChatRequest.stepBudget` if provided; (2) the value of environment variable `AGENT_STEP_BUDGET` if set; (3) the built-in default of 25. When the loop reaches `stepBudget` steps without producing a final answer, the runtime MUST stop, return the most recent assistant text content (possibly empty), and set `stopReason` to `STEP_BUDGET_EXHAUSTED`.

#### Scenario: Step budget exhausted

- Given `AgentChatRequest.stepBudget = 2`
- And the model returns tool calls in every step
- When `AgentLoop.run()` is invoked
- Then `javaClient.chat` is called exactly 2 times
- And the response `stopReason` equals `STEP_BUDGET_EXHAUSTED`
- And a `STEP_BUDGET_EXHAUSTED` trace event is emitted with attribute `stepBudget = 2`

#### Scenario: Environment variable overrides the default budget

- Given environment variable `AGENT_STEP_BUDGET=3`
- And no per-request `stepBudget` is provided
- And the model returns tool calls in every step
- When `AgentLoop.run()` is invoked
- Then `javaClient.chat` is called exactly 3 times
- And the response `stopReason` equals `STEP_BUDGET_EXHAUSTED`

### Requirement: Empty model response SHALL terminate the loop without error

The runtime MUST treat a model response with no `message` field as a terminal condition: it stops the loop, returns an empty `answer`, and sets `stopReason` to `EMPTY_MODEL_RESPONSE`. The runtime MUST NOT throw or retry within the same `run()` call.

#### Scenario: Provider returns empty message

- Given the model gateway returns a response with `message === null` in step 1
- When `AgentLoop.run()` is invoked
- Then the response `stopReason` equals `EMPTY_MODEL_RESPONSE`
- And the response `answer` is the empty string
- And the conversation history is persisted (autoCompress runs once if applicable)

### Requirement: Each step SHALL emit structured trace events with monotonic stepIndex

For every step in the loop, the runtime MUST emit a `STEP_START` trace event before the model call and a `STEP_END` trace event after the tool batch finishes. Both events MUST carry a numeric `stepIndex` attribute starting at 1 and incrementing by 1 per step. Existing per-call events (`MODEL_NODE_START`, `MODEL_NODE_END`, `TOOL_EXECUTE_REQUEST`, `OBSERVE_TOOL_RESULT`) MUST also carry the current `stepIndex` attribute.

#### Scenario: Trace stepIndex is monotonic across a 3-step run

- Given the model triggers tool calls in step 1 and step 2 and a final answer in step 3
- When `AgentLoop.run()` completes
- Then the trace contains `STEP_START` events with `stepIndex` values `[1, 2, 3]` in that order
- And every `MODEL_NODE_START` event carries the matching `stepIndex`
- And `STEP_END` is emitted only for steps that executed at least one tool (steps 1 and 2)

### Requirement: Auto-compression SHALL run exactly once per agent invocation

When the loop terminates for any reason (`FINAL_ANSWER`, `STEP_BUDGET_EXHAUSTED`, or `EMPTY_MODEL_RESPONSE`), the runtime MUST invoke the auto-compression hook exactly once before persisting history. The hook MUST be invoked even when the loop exits via `STEP_BUDGET_EXHAUSTED`, so that long stuck conversations still benefit from compression.

#### Scenario: Single autoCompress call after multi-step run

- Given a conversation that runs 3 steps before producing a final answer
- And the auto-compression hook is observed via a spy
- When `AgentLoop.run()` completes
- Then the auto-compression hook is invoked exactly once
- And `history.save` is invoked exactly once after the auto-compression hook returns

### Requirement: AgentStreamLoop SHALL emit per-step SSE events compatible with existing clients

The streaming variant MUST keep all existing SSE event names (`agent_start`, `model_call_start`, `model_call_end`, `tool_call`, `tool_result`, `final_answer`). It MUST add a numeric `stepIndex` field to `model_call_start` and `model_call_end` payloads, emit a new `step_budget_exhausted` event when the budget is reached, and emit an `agent_end` event with `stopReason` immediately before closing the response stream.

#### Scenario: Streaming client receives stepIndex on each model call

- Given a streaming client connected to `POST /api/v1/agent/chat/stream`
- And the conversation runs 2 steps
- When the stream completes
- Then the client receives two `model_call_start` events with `stepIndex` 1 and 2
- And the client receives an `agent_end` event with `stopReason` equal to `FINAL_ANSWER`

