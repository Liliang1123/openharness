## 1. Shared Schema

- [x] 1.1 Add `ToolResultProvenanceSchema = "trusted" | "untrusted"` and exported type.
- [x] 1.2 Add optional `provenance` to `ToolCallResponse` success/failure schemas.
- [x] 1.3 Add optional internal `toolName` and `toolResultProvenance` fields to `AgentMessageSchema`.
- [x] 1.4 Add `UNTRUSTED_CONTEXT` to `DecisionSourceSchema`.
- [x] 1.5 Add `ToolContext.untrustedToolOutputSinceLastUser?: boolean` and `toolPermissions?: Record<string, "safe"|"sensitive"|"destructive">`.
- [x] 1.6 Add shared-schema tests for provenance fields and new policy context fields.

## 2. Java Policy And Tool Response

- [x] 2.1 Add `provenance` to `Contracts.ToolCallResponse`.
- [x] 2.2 Java catalog tool responses default to `provenance="trusted"`.
- [x] 2.3 Extend `PolicyService.PolicyContext` with `untrustedToolOutputSinceLastUser` and `toolPermissions`.
- [x] 2.4 Add policy rule: if untrusted context is true and requested tool permission is `sensitive` or `destructive`, return `REQUIRE_APPROVAL` with source `UNTRUSTED_CONTEXT` and approval token.
- [x] 2.5 Add Java tests for sensitive/destructive upgrade, safe allow, and existing blocked/MCP precedence.

## 3. TS Runtime Provenance Guard

- [x] 3.1 Add history helpers to detect untrusted tool output since the last user message.
- [x] 3.2 Add `ToolRegistry.getPermissions(...)` for frozen tool permission metadata.
- [x] 3.3 Update `beforeToolUse` to send `untrustedToolOutputSinceLastUser` and `toolPermissions`.
- [x] 3.4 Update `AgentExecutionRunner.executeTool` to default Java catalog outputs to trusted and MCP outputs to untrusted.
- [x] 3.5 Wrap untrusted tool output in `<tool_output trust="untrusted" tool="...">...</tool_output>` before appending to history.
- [x] 3.6 Ensure internal provenance fields are stripped from model/API views while wrapped content remains model-visible.
- [x] 3.7 Add TS tests for wrapper content, policy context forwarding, approval upgrade path, and regression for trusted output.

## 4. Docs

- [x] 4.1 Update `CONTEXT.md` with provenance / untrusted output / injection guard terms.
- [x] 4.2 Update `docs/architecture/policy_contract.md` with untrusted context approval rule.
- [x] 4.3 Update `docs/architecture/tool_catalog_contract.md` with provenance semantics.

## 5. Verification

- [x] 5.1 `pnpm --filter @openharness/shared-schema test`
- [x] 5.2 `pnpm --filter @openharness/agent-runtime test`
- [x] 5.3 `pnpm typecheck`
- [x] 5.4 `mvn test`
- [x] 5.5 `npx openspec validate add-p3d-injection-guard --strict --no-interactive`
- [x] 5.6 `pnpm test`
- [x] 5.7 `npx openspec validate --all --strict --no-interactive`
