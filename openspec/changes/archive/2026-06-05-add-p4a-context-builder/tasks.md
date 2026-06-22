## 1. OpenSpec and Planning
- [x] 1.1 Create proposal, design, tasks, and spec deltas for `add-p4a-context-builder`.
- [x] 1.2 Update `CONTEXT.md` with ContextBuilder glossary terms.
- [x] 1.3 Create Superpowers implementation plan.
- [x] 1.4 Validate the active change with strict OpenSpec checks.

## 2. Schema Contract
- [x] 2.1 Add optional context builder metadata to `ModelChatRequest.meta`.
- [x] 2.2 Add shared-schema tests for valid context metadata.

## 3. Agent Runtime ContextBuilder
- [x] 3.1 Add failing tests for summary preservation, budgeted recent message selection, and oversize newest-message fallback.
- [x] 3.2 Implement `agent-runtime/src/contextBuilder.ts`.
- [x] 3.3 Add cache hint tests proving hints use selected context positions.

## 4. Runner Integration
- [x] 4.1 Add runner test proving Java model requests receive selected context and context metadata.
- [x] 4.2 Wire `AgentExecutionRunner.callModel()` through ContextBuilder and recompute cache hints after selection.
- [x] 4.3 Keep history persistence and auto-compression behavior unchanged.

## 5. Docs and Verification
- [x] 5.1 Update architecture docs with the ContextBuilder contract.
- [x] 5.2 Run targeted tests: shared-schema, agent-runtime.
- [x] 5.3 Run full verification: `pnpm typecheck`, `pnpm test`, `mvn test`, OpenSpec validate all.
- [x] 5.4 Archive the change and run post-archive OpenSpec validation.
