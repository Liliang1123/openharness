# Change: Fix Runtime Chat Terminal And Codex Tool Flow

## Why

The Local CLI browser trial exposed three user-visible failures in the current chat path:

- model work can take tens of seconds without an accurate terminal transition in the chat timeline;
- transient `thinking` entries remain visible after the model has answered or errored;
- one Codex turn that requests several sequential dynamic tools can emit repeated tool-call feedback and then terminate with `MODEL_ERROR / PROTOCOL_FAILURE`, while the frontend never shows the terminal failure.

The existing specifications already require progressive tool feedback, terminal SSE outcomes, and continuation of the same Codex turn. The current implementation does not provide a coherent end-to-end projection of those requirements in persistence mode. Because the correction spans Frontend behavior, Runtime durable SSE semantics, and the Java Codex provider bridge, it is governed as a new OpenSpec change rather than an unreviewed local patch.

## What Changes

- Project each execution's safe model/tool lifecycle into one interactive Frontend activity group.
  - Active model work is transient.
  - Terminal executions auto-collapse to a one-line summary.
  - Expanding the group retains every safe chronological state.
  - Repeated tools are grouped in the collapsed summary without losing per-call detail.
- Make `stream_error` a visible persistent terminal outcome and clear all stale busy/thinking state on every terminal path.
- Guarantee one logical durable `tool_result` for every Codex pending dynamic tool call, including persistence-mode continuation where tool results are intentionally not appended to model history.
- Keep one Codex app-server turn open across sequential pending tool calls, retire each completed pending responder before accepting the next one, and fail closed on protocol conflicts without re-executing tools or starting an uncorrelated turn.
- Preserve the current Runtime terminal class (`MODEL_ERROR`) for provider failures while exposing only safe provider classification metadata such as `PROTOCOL_FAILURE`.
- Add focused Frontend, Runtime, Java provider, redaction, replay, and user-local browser smoke evidence.

## Impact

- Affected specs:
  - `frontend-runtime`
  - `agent-sse`
  - `provider-adapter`
- Expected implementation areas:
  - Frontend execution-activity projection and rendering
  - Agent Runtime Codex pending-turn event persistence
  - Java Codex app-server pending responder lifecycle
  - Focused tests and the Local CLI wrapper guide
- Compatibility:
  - Existing SSE event names remain unchanged.
  - Existing clients may ignore the stricter event pairing and safe terminal metadata.
  - No provider fallback, credential ownership, or tool-execution authority changes.

## Non-Goals

- Do not add token-level answer streaming.
- Do not change `gpt-5.6-sol` or its configured `high` reasoning effort.
- Do not add `write_file`, `edit_file`, skill authoring, or any other workspace mutation capability.
- Do not perform general visual redesign or chat-interface beautification.
- Do not change the Local CLI command contract, installation, upgrade, credential, or OAuth boundary.
- Do not archive existing OpenSpec changes, merge branches, run full-repository regression, run a 24-hour Gate, commit, push, reset, clean, or claim Production Verified.
