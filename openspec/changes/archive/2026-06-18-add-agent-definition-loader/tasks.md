## 1. Contract
- [x] 1.1 Add `AgentDefinitionSchema` and exported `AgentDefinition` type to shared schema.
- [x] 1.2 Add schema tests for valid definitions, invalid `agentId`, invalid `promptRef`, duplicate tools, and optional `model`.

## 2. Loader
- [x] 2.1 Add an Agent Definition Loader in the TS Runtime that reads JSON files from `agent-runtime/agents/`.
- [x] 2.2 Add a default definition when the directory is absent or empty.
- [x] 2.3 Fail closed for malformed JSON, invalid schema, and duplicate `agentId`.
- [x] 2.4 Add loader unit tests covering success, fallback, and failure paths.

## 3. Runtime Integration
- [x] 3.1 Wire the loader into runtime initialization without requiring Java Backend, Frontend, SDK, YAML, remote API, or hot reload.
- [x] 3.2 Add a minimal fixture definition under `agent-runtime/agents/` only if needed for tests or dev smoke.
- [x] 3.3 Add targeted runtime tests proving default behavior remains unchanged when no files are present.

## 4. Verification
- [x] 4.1 Run targeted shared-schema and agent-runtime tests.
- [x] 4.2 Run `pnpm typecheck`, `pnpm test`, `mvn test -f backend/pom.xml`, and `npx openspec validate --all --strict --no-interactive`.
- [x] 4.3 Archive the OpenSpec change after implementation and verification are complete.
