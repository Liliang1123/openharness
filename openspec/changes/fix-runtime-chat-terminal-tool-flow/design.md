# Design: Runtime Chat Terminal And Codex Tool Flow

## Context

The Local Trial stack uses the Frontend as an interaction projection, the TypeScript Agent Runtime as the Agent loop and durable lifecycle owner, and the Java Gateway as the Codex app-server provider owner.

Observed browser evidence showed:

- ordinary model calls spent almost all wall time inside the configured `gpt-5.6-sol / high` provider call;
- `model_call_start` appended a permanent chat message, while `model_call_end`, `stream_done`, and `stream_error` did not reconcile it;
- the Frontend ignored `stream_error` in the message projection even though runtime progress reached a terminal error;
- persistence-mode Codex continuation emitted `tool_call`, executed the tool with `persistHistory: false`, and did not commit the corresponding safe `tool_result`;
- a real turn issued five sequential `read_file` calls before the provider ended with a redacted `PROTOCOL_FAILURE`.

The latency finding does not justify silently lowering reasoning effort or adding token streaming to this P0 change. The P0 goal is accurate progress and deterministic terminal behavior while the existing model call is in flight.

## Goals

- Ensure no completed or errored turn appears to remain in `thinking`.
- Retain all safe execution states in an interactive, compact Frontend representation.
- Guarantee observable terminal feedback for every Codex pending dynamic tool call.
- Support sequential pending calls in one app-server turn without duplicate execution or an uncorrelated continuation.
- Preserve existing Runtime, provider, credential, replay, and redaction boundaries.
- Make deterministic tests reproduce the five-tool sequence independently of real-model variability.

## Non-Goals

- No partial-token answer stream.
- No reasoning-effort change.
- No new tool or skill-authoring capability.
- No general Frontend redesign.
- No automatic provider retry beyond existing idempotent ambiguous-HTTP completion retry.
- No automatic new turn after a Codex protocol failure.
- No persistence of raw tool arguments, tool results, provider bodies, bridge identifiers, or credentials.

## Decisions

### 1. Frontend uses one execution activity projection

The Frontend SHALL derive an `Execution Activity Group` from existing durable SSE events and safe `RuntimeProgressSnapshot` data. This is a display projection, not a second lifecycle authority.

The projection is keyed by `executionId` and maintains:

- whether a model call is currently active;
- ordered tool activities keyed by `toolCallId`;
- final answer presence;
- execution terminal status and safe error classes;
- collapsed tool-name counts and status counts.

Event transitions are:

| Event | Projection transition |
|---|---|
| `model_call_start` | Mark model work active and show transient thinking state. |
| `model_call_end` | Mark model work inactive immediately. |
| `tool_call` | Add or update one running tool item keyed by `toolCallId`. |
| `tool_result` | Resolve the matching item to `ok`, `error`, `rejected`, `timeout`, or the existing safe status. |
| `final_answer` | Append the assistant answer without preserving stale thinking. |
| `stream_done` | Mark completed, clear active work, and auto-collapse the group. |
| `stream_error` | Mark errored/aborted, clear active work, show a persistent safe error summary, and auto-collapse the group. |

The collapsed row groups repeated tool names, for example `read_file ×5`, plus the terminal state and elapsed time. Expanding it shows every safe chronological state. Replay duplicates with the same durable `eventId` MUST NOT create duplicate activities.

### 2. Sensitive event payloads are never rendered

The activity group uses an allowlist of:

- execution and event identity already authorized for Frontend use;
- event kind, timestamps, step index;
- tool call id and tool name;
- tool terminal status;
- Runtime terminal class and safe upstream class identifier;
- elapsed timing and safe counts.

It MUST NOT render or retain raw arguments, result content, prompt/reasoning content, headers, tenant/user values beyond existing scoped API ownership, bridge ids, OAuth values, authorization values, provider response bodies, or unredacted error messages.

### 3. Runtime commits event-only tool terminal feedback

Codex pending-turn continuation intentionally avoids adding each dynamic tool call/result to stable model history because the official app-server owns that in-flight turn. This history decision MUST NOT suppress operator-visible lifecycle feedback.

For each pending call:

1. Runtime validates the call and policy.
2. An allowed call commits one durable `tool_call`.
3. Runtime executes the tool at most once.
4. Runtime commits one logical durable `tool_result` with only safe metadata and a terminal status.
5. Runtime submits the bounded result to the exact Java pending responder using the existing deterministic idempotency key.
6. If the same app-server turn returns another pending call, the loop repeats.
7. A final model response exits the continuation and completes the normal outer model call.

Denied or malformed pending calls still receive one logical terminal `tool_result`, but MUST NOT emit a `tool_call` that claims execution occurred. At-least-once SSE replay may redeliver the same durable event; it does not create a second logical result.

If provider continuation fails after a tool result was committed, Runtime keeps that tool result and then commits one `stream_error` with top-level `MODEL_ERROR` plus safe `upstreamErrorClass` when available. It does not retry or re-execute the tool.

### 4. Java retires each pending responder before accepting the next

The Codex app-server client keeps the same turn reader active while a pending dynamic tool callback is waiting for Runtime.

For each pending responder, Java SHALL:

- allow at most one terminal response;
- atomically record/retire the responder before the next sequential `item/tool/call` becomes active;
- keep reading the same app-server turn after successful or failed tool completion;
- allow a later, distinct pending call in that same turn after its predecessor is terminal;
- reject overlapping, conflicting, expired, orphaned, or protocol-invalid transitions with the existing redacted structured failure;
- never answer the same app-server callback twice.

An unexpected overlapping pending callback is a protocol failure. The exact turn is cancelled or terminated, and no new uncorrelated turn is started.

### 5. Terminal classification remains backward compatible

The Runtime terminal enum is not expanded. A provider continuation failure remains `MODEL_ERROR`. When the Java structured response already carries a safe class such as `PROTOCOL_FAILURE`, Runtime forwards it as safe terminal metadata (`upstreamErrorClass`) and the Frontend may display `MODEL_ERROR · PROTOCOL_FAILURE`.

The Frontend does not depend on the provider class being present. It always terminates correctly from `stream_error.errorClass`.

## Error Handling

- Model completion: `model_call_end` closes transient thinking even when a later tool or terminal event follows.
- Tool failure: one safe terminal `tool_result` is committed before execution-level terminal handling.
- Policy denial: no execution claim; one denied/rejected safe result remains visible.
- Completion ambiguity: only the existing identical idempotent HTTP retry is allowed.
- Protocol failure: no tool replay and no silent fallback; one redacted execution terminal event.
- Client disconnect: the detached runner continues; replay reconstructs the same activity group from durable events.
- UI parsing failure for an unknown field: ignore the field and continue processing known event semantics.

## Testing

### Frontend

- A model start followed by model end/final/done leaves no active thinking state.
- A stream error clears busy/thinking and leaves a visible terminal error.
- Five `read_file` calls collapse to a grouped summary and expand to five ordered entries.
- Duplicate replay event ids do not duplicate entries.
- Sensitive canaries in unknown/raw fields never render.

### Agent Runtime

- Persistence-mode Codex continuation with five sequential pending calls commits five logical safe tool results.
- Every allowed tool call has a matching result before execution terminal state.
- Denied, malformed, timeout, and tool-error outcomes emit safe terminal results without raw content.
- A provider failure after tool execution keeps the tool result, emits one `stream_error`, and does not execute the tool again.
- Disconnect/replay preserves pairing and terminal order.

### Java Provider

- A deterministic fake app-server turn issues five sequential pending calls and then a final answer.
- Each callback receives exactly one response and the same turn continues.
- Identical completion retry is idempotent.
- Conflicting, overlapping, expired, and orphaned transitions fail closed without duplicate callback mutation.
- Protocol and secret canaries are absent from logs, structured errors, and test evidence.

### Local Trial

After focused tests and Review PASS, back up only the affected user-local isolated source files, synchronize verified files, restart through the existing wrapper, and run a targeted browser smoke for:

- a simple greeting;
- a model identity question;
- a sequential multi-read request;
- terminal activity collapse/expand and error visibility.

The real smoke records model-call duration separately from Runtime transition duration. It does not claim that `high` reasoning becomes fast and does not claim Production Verified.

## Rollout And Rollback

- Implement only in the existing `main-local-trial` worktree.
- Do not modify the primary checkout.
- Before user-local synchronization, create a scoped backup and hash manifest for only the affected files.
- If readiness, focused tests, redaction, or browser smoke fails, stop the local services, restore the scoped user-local backup, and restart the previously verified source.
- Do not use Git reset/clean or destructive repository operations for rollback.

## Open Questions

None. The user approved the interactive retained-state option, the contract-centered architecture, the data flow and terminal semantics, and this acceptance boundary on 2026-07-30.
