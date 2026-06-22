# Change: Agent Definition Runtime Selection

## Why
Agent Definition Loader v0 can load validated local definitions, but chat execution still ignores them and always uses the default prompt. The next small slice should let callers select an already-loaded definition by `agentId` and make its `promptRef` drive prompt resolution for that turn.

## What Changes
- Add optional `agentId` to Agent Runtime chat requests for both sync and stream chat.
- Resolve the requested `agentId` from the loaded Agent Definition registry before starting execution.
- Use the selected definition's `promptRef` when resolving the system prompt through `PromptRegistry`.
- Fail closed before model calls when `agentId` is unknown or its `promptRef` cannot be resolved.
- Preserve existing behavior when `agentId` is omitted by selecting the default loaded definition.

## Out of Scope
- Tool allow-list enforcement or filtering.
- YAML support.
- SDK changes.
- Frontend UI.
- Remote CRUD APIs.
- Hot reload.
- Tenant-scoped dynamic definitions.
- Java model router changes or `model` hint enforcement.

## Impact
- Affected specs: `agent-definition`, `prompt-registry`
- Affected code: `agent-runtime/src/types.ts`, `agent-runtime/src/server.ts`, `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/src/prompts/registry.ts`, targeted tests under `agent-runtime/test/`
- Compatibility: existing chat requests without `agentId` keep current default-agent/default-prompt behavior.
