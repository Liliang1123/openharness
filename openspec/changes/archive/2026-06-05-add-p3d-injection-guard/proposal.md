# Change: Add Prompt Injection Guard For Tool Results

## Why
Tool results are currently serialized directly into model-visible `role: "tool"` messages. If a tool returns untrusted content containing instructions, the model can treat that data as a command and then call a sensitive or destructive tool.

## What Changes
- Add tool result provenance (`trusted` / `untrusted`) to shared schemas and Java tool responses.
- Wrap untrusted tool output in a stable model-visible boundary before appending it to `HistoryStore`.
- Track whether untrusted tool output exists since the last user message.
- Extend policy evaluation context with untrusted-output state and tool permission metadata.
- Require approval when a model attempts a `sensitive` or `destructive` tool call after untrusted tool output.
- Update policy and tool-result architecture docs.

## Impact
- Affected specs: `shared-schema`, `agent-runtime`, `policy-evaluate`
- Affected code:
  - `packages/shared-schema/src/index.ts`
  - `agent-runtime/src/agentExecutionRunner.ts`
  - `agent-runtime/src/beforeToolUse.ts`
  - `agent-runtime/src/history.ts`
  - `agent-runtime/src/toolRegistry.ts`
  - `backend/src/main/java/org/openharness/backend/model/Contracts.java`
  - `backend/src/main/java/org/openharness/backend/service/PolicyService.java`
  - `backend/src/main/java/org/openharness/backend/service/ToolExecutionService.java`
  - `docs/architecture/policy_contract.md`
  - `docs/architecture/tool_catalog_contract.md`
