# Change: Add Agent Definition Observability

## Why
Agent Definition loading, runtime selection, prompt binding, and tool filtering are now implemented, but debugging a turn still requires inferring which definition was selected from request payloads and code paths. When a prompt or tool-filtering issue appears, operators need first-class audit metadata to correlate model requests and trace events back to the selected Agent Definition.

## What Changes
- Add runtime audit metadata for the selected Agent Definition to each Java model request `meta`.
- Populate TS Runtime trace events with the selected `agentId` for the current execution.
- Record bounded tool-filtering summary metadata so debugging can distinguish default full exposure, allow-list exposure, and no-tool agents.
- Keep metadata internal to runtime/backend observability; do not expose it as model-visible messages or frontend UI.

## Impact
- Affected specs: `agent-definition`, `agent-runtime`, `shared-schema`
- Affected code: `packages/shared-schema/src/index.ts`, `packages/shared-schema/test/schema.test.ts`, `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/test/agentRuntime.test.ts` or focused runner tests
- Non-goals: YAML, SDK, Frontend UI, remote CRUD APIs, hot reload, tenant-scoped dynamic definitions, Java model router/model enforcement, Java policy changes, Java catalog changes
