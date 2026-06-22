# Change: Add Agent Definition Loader

## Why
OpenHarness already has PromptRegistry, ToolRegistry, model routing metadata, and eval infrastructure, but agent configuration is still implicit in runtime defaults and call-site behavior. A small local Agent Definition Loader is the next stable step toward declarative agents without introducing SDK, UI, remote management, or dynamic deployment complexity.

## What Changes
- Add a new `agent-definition` capability for project-local JSON agent definitions.
- Define an `AgentDefinition` contract with `agentId`, `promptRef`, `tools`, and optional `model`.
- Load definitions from `agent-runtime/agents/` at runtime startup or initialization.
- Fail closed on malformed definitions, duplicate `agentId`, invalid `promptRef` shape, or invalid tool names.
- Keep YAML support, SDK, UI, remote APIs, hot reload, dynamic tenant-scoped definitions, and router behavior changes out of scope.

## Impact
- Affected specs: `agent-definition`
- Affected code: `packages/shared-schema/src/index.ts`, `agent-runtime/src/*agentDefinition*`, `agent-runtime/src/server.ts` or runtime initialization path, `agent-runtime/test/*agentDefinition*`
- Affected docs: `CONTEXT.md`, `docs/design/2026-06-18-agent-definition-loader-design.md`
