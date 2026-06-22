## ADDED Requirements

### Requirement: SSE Streaming Endpoint
The agent-runtime SHALL expose `POST /api/v1/agent/chat/stream` that returns a `text/event-stream` response with structured SSE events for each agent loop step.

#### Scenario: Normal tool-call flow emits correct event sequence
- **WHEN** a user sends a message that triggers a tool call
- **THEN** the SSE stream emits events in order: `agent_start`, `model_call_start`, `model_call_end`, `tool_call`, `tool_result`, `model_call_start`, `model_call_end`, `final_answer`

#### Scenario: No tool call emits minimal sequence
- **WHEN** a user sends a message that does not trigger a tool call
- **THEN** the SSE stream emits: `agent_start`, `model_call_start`, `model_call_end`, `final_answer`

#### Scenario: Policy deny emits rejected tool_result
- **WHEN** a tool call is denied by policy
- **THEN** the SSE stream emits `tool_result` with `status: "denied"` and does not emit a `tool_call` event for that tool

### Requirement: Frontend SSE Rendering
The frontend SHALL consume the SSE stream and render each event progressively, showing model thinking, tool execution, and final answer as they arrive.

#### Scenario: Events render in order
- **WHEN** the SSE stream emits events
- **THEN** the frontend displays each step (model call, tool call, tool result, final answer) as it arrives without waiting for stream completion
