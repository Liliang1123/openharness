# Change: Add Agent Definition Model Selection

## Why
Agent Definitions can already carry an optional `model` field, but the runtime still sends a hard-coded logical model value to the Java model gateway. This prevents project-local agents from selecting different existing Java model-router entries while keeping provider credentials and routing policy in the Java backend.

## What Changes
- Use the selected Agent Definition's optional `model` as `ModelChatRequest.model` for each model call in that agent turn.
- Preserve backward compatibility by using the existing default logical model when the selected definition omits `model`.
- Keep Java model-router semantics unchanged: TS Runtime forwards only the logical model string and does not validate provider routes, hold credentials, or choose provider adapters directly.
- Keep the loaded `model` value visible in existing Agent Definition observability metadata.

## Impact
- Affected specs: `agent-definition`
- Affected code: `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/test/agentRuntime.test.ts`
- Non-goals: Java model router implementation changes, provider credential handling, route existence validation, SDK, Frontend UI, YAML, remote CRUD APIs, hot reload, tenant-scoped dynamic definitions
