# ChatGPT/Codex OAuth Via Local Codex App Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Add a fail-closed Java Gateway provider route that delegates ChatGPT/Codex OAuth model calls to a local official Codex app-server/CLI without OpenHarness reading or storing OAuth credentials.

**Architecture:** Keep `/api/v1/model/chat` as the entry point and API-key providers unchanged, while adding an optional Codex-only `pendingTurn` response plus authenticated result/cancel endpoints. Java holds the app-server turn and translates terminal outcomes; TS Runtime remains the only policy, human-approval, MCP routing, and tool-execution owner. Codex owns login, refresh, and OAuth token storage.

**Tech Stack:** Java 21, Spring Boot, Maven, existing ProviderAdapter/ModelRouter contracts, local process/IPC APIs, JUnit 5, existing qualification/report redaction, OpenSpec strict validation.

---

## Execution Contract

- OpenSpec change: [add-chatgpt-oauth-auth](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth)
- Approved design: [design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/design.md)
- Evidence profile: strict.
- Batch profile: staged.
- Gate C remains blocked until independently approved real-provider evidence passes.
- Task 4 implementation MUST run in an isolated worktree such as [add-chatgpt-oauth-auth-task4](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4), created from the current approved feature revision after checking for overlap. Do not implement Task 4 in the dirty main worktree.
- Execution mode: subagent-driven staged slices are authorized by the user's worktree/parallel directive; each slice still requires its own evidence and Task 4.6 strict Review PASS.
- Never read, copy, print, or persist OAuth credentials or Codex credential files.
- Never modify or check off unrelated tasks 3.1, 3.2, 3.5, or 3.6.
- No git add, commit, push, reset, clean, archive, or freeze without explicit user command.

## File Map

- [ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java): provider configuration for codex-app-server command and local endpoint metadata.
- [ProviderRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java) and [ModelRouter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ModelRouter.java): explicit openai-codex route resolution.
- New [CodexProcessSupervisor.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java): owned child lifecycle, readiness, bounded restart, cleanup.
- New [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java): approved local IPC request/response conversion.
- New [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java): atomic pending/terminal state, identity binding, expiry, cancellation, replay, and restart-orphan behavior.
- New [CodexTurnController.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/api/CodexTurnController.java): service-authenticated result/cancel boundary; no tool execution.
- New [CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java): ProviderAdapter boundary for model calls.
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/api/ModelController.java), [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/model/Contracts.java), and [shared schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts): pending-turn/result/cancel wire contracts.
- [javaClient.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/javaClient.ts) and [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts): TS-owned pending-turn policy/approval/execution loop.
- New focused Java tests beside each component.
- [docs/architecture/auth_contract.md](file:///Users/elvis/file/develop/opensource/openharness/docs/architecture/auth_contract.md), [docs/architecture/dev_runbook.md](file:///Users/elvis/file/develop/opensource/openharness/docs/architecture/dev_runbook.md): operator boundary and local Codex setup.
- Qualification evidence under [docs/verification/agent-runtime-v1/providers](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers), only after explicit real OAuth authorization.

## Stage 1 — Protocol Spike And Safety Gate

### Task 1: Confirm local Codex app-server contract

**Allowed files:** temporary files outside the repository and a protocol-spike report under [docs/review](file:///Users/elvis/file/develop/opensource/openharness/docs/review). No source/config changes.

- [ ] Step 1: Identify the installed official Codex CLI/app-server entry point without reading credential files.
- [ ] Step 2: Capture only non-secret protocol facts: command shape, handshake, request/response framing, streaming, cancellation, shutdown, exit codes, and supported local endpoint boundary.
- [ ] Step 3: Build a disposable fake protocol probe that uses synthetic messages and proves no token-bearing output is retained.
- [ ] Step 4: Run the probe and record supported/unsupported platforms and failure modes.
- [ ] Step 5: Stop with BLOCKED if the installed Codex surface cannot provide a supported local app-server contract; do not fall back to direct OAuth HTTP.

**Signoff:** protocol fingerprint is documented, local-only boundary is proven, and no credential material was read or emitted.

## Stage 2 — Provider Contract And Configuration

### Task 2: Add explicit codex-app-server provider configuration

**Files:** [ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java), [ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java), [ProviderRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java), [ModelRouter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ModelRouter.java), new [ProviderPropertiesTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/ProviderPropertiesTest.java), new [ProviderRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/ProviderRegistryTest.java), and [ModelRouterTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/ModelRouterTest.java).

- [x] Step 1: Write RED tests for type `codex-app-server`, exact route `openai-codex/<bare-model>`, bare-model allow-list enforcement, missing-route no-fallback, non-Codex target rejection, remote endpoint rejection, and preservation of existing providers.
- [x] Step 2: Run `mvn -o -f backend/pom.xml -Dtest=ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest test` and record failures caused by the missing configuration/routing contract.
- [x] Step 3: Add command/args/local endpoint metadata to `ProviderConfig` and property binding. A Codex provider must leave the pre-existing shared `baseUrl`/`apiKey` slots null and must not add token, credentialPath, or importPath fields.
- [x] Step 4: Make registry/router accept `codex-app-server` only when a matching adapter is supplied and an exact route is configured. Tests use a fake adapter; the production `CodexAppServerAdapter` bean remains Task 5. For `openai-codex/<bare-model>`, validate the suffix against the provider's bare-model allow-list and fail closed on missing route, type mismatch, or disallowed model.
- [x] Step 5: Run `mvn -o -f backend/pom.xml -Dtest=ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest,ModelControllerTest test`, `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`, and `git diff --check`.

**Signoff:** existing Zhipu/API-key routes remain unchanged; openai-codex routes cannot silently resolve to another adapter.

**Workspace/scope:** Execute in [the repository root](file:///Users/elvis/file/develop/opensource/openharness) on the already-authorized feature branch because the Task 2 production/test files are clean there. Do not edit the separate [Stage 0 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout). Audit only the files listed for Task 2 plus this plan, the Task 2 review, and Task 2 checkbox updates; preserve all unrelated dirty files.

**Rollback/stop:** Roll back only the Task 2 configuration/router/test edits using a reviewed inverse patch. Stop on any credential field, accepted non-local endpoint, implicit Codex default, silent fallback, production Adapter implementation before Task 5, unrelated dirty-file overlap, or baseline regression.

## Stage 3 — Process Supervisor And IPC Client

### Task 3: Implement bounded Codex process lifecycle

**Files:** new [CodexProcessSupervisor.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java), focused lifecycle test.

- [x] Step 1: Write RED tests for start timeout, handshake timeout, ready transition, crash transition, bounded restart backoff, graceful shutdown, and orphan cleanup.
- [x] Step 2: Run the focused lifecycle test and verify the failures are lifecycle assertions, not test setup errors.
- [x] Step 3: Implement ProcessBuilder invocation using only configured executable/args; never include credentials in arguments or environment injection.
- [x] Step 4: Enforce loopback/OS-local endpoint checks, process ownership, startup/shutdown deadlines, and bounded restart policy.
- [x] Step 5: Capture only pid/state/exit code/timing in logs and run GREEN plus the existing backend test suite.

**Signoff:** supervisor never exposes child output containing token material, never accepts non-local endpoints by default, and cleans up owned children.

### Task 4: Implement the asynchronous Codex tool bridge

**Files:** [shared schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts), [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/model/Contracts.java), new [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java), new [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java), new [CodexTurnController.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/api/CodexTurnController.java), [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/api/ModelController.java), [javaClient.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/javaClient.ts), [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts), and focused tests beside those units.

#### Task 4.1: Lock the shared pending-turn contract

- [ ] Step 1: Add RED schema tests in [schema.test.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/test/schema.test.ts) for the following discriminated response and exact result payload. Reject responses containing more or fewer than one of `message`, `pendingTurn`, or `error`.

```ts
type PendingCodexTurn = {
  bridgeId: string; threadId: string; turnId: string; callId: string;
  toolName: string; argumentsRaw: string; expiresAt: string;
};
type CodexToolResultSubmission = {
  requestId: string; conversationId: string; threadId: string; turnId: string;
  callId: string; idempotencyKey: string;
  status: "ok" | "error" | "rejected" | "timeout";
  content: string;
};
```

- [ ] Step 2: Run `pnpm --filter @openharness/shared-schema test` and require RED because the pending schemas/one-of invariant do not exist. Stop if failure is unrelated.
- [ ] Step 3: Add `PendingCodexTurnSchema`, `CodexToolResultSubmissionSchema`, `CodexTurnCancelRequestSchema`, and `idempotentReplay` on the continuation response; mirror the records in Java. Bound every identifier/content field and parse `argumentsRaw` as canonical JSON object text.
- [ ] Step 4: Run `pnpm --filter @openharness/shared-schema test` and `pnpm typecheck`; require GREEN.

#### Task 4.2: Hold and resume the exact app-server turn

- [ ] Step 1: Create RED tests in [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java) using a deterministic fake JSON-RPC peer. Prove sync final response, stream delta aggregation, reasoning, usage, malformed frame/auth failure, and that `item/tool/call` does not complete until its `DynamicToolCallResponse` is supplied.
- [ ] Step 2: Run `mvn -o -f backend/pom.xml -Dtest=CodexAppServerClientTest test`; require RED at the absent client/continuation boundary.
- [ ] Step 3: Implement one reader loop and request-id responder table. `startTurn(...)` returns either final/error or a pending handle; `resumeToolCall(...)` writes exactly one `{success,contentItems}` response and continues the same turn. No method accepts a tool executor, policy service, approval token generator, or shell/MCP dependency.
- [ ] Step 4: Map `ok` to `success=true`; map `error|rejected|timeout` to `success=false`. Emit only bounded redacted `inputText`; reject `inputImage` in v1. Preserve request/thread/turn/call correlations without logging raw ids, arguments, results, or app-server payloads.
- [ ] Step 5: Run the focused test and `mvn -o -f backend/pom.xml -Dtest=CodexProcessSupervisorTest,CodexAppServerClientTest test`; require GREEN.

#### Task 4.3: Enforce pending state, identity, timeout, cancel, replay, and restart

- [ ] Step 1: Create RED tests in [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java) for exact tenant/user/request/conversation/thread/turn/call binding, one pending call per turn, expiry, cancel-vs-complete race, identical replay, conflicting replay, bounded terminal retention, and restart orphaning.
- [ ] Step 2: Run `mvn -o -f backend/pom.xml -Dtest=CodexPendingTurnRegistryTest test`; require RED at missing state transitions.
- [ ] Step 3: Implement atomic `ACTIVE -> PENDING_TOOL -> ACTIVE|COMPLETED` plus terminal `CANCELLING|TIMED_OUT|FAILED|ORPHANED`. The first valid `(bridgeId,callId,idempotencyKey,payloadHash)` wins; identical retry returns cached redacted continuation with `idempotentReplay=true`; conflict returns `BRIDGE_RESULT_CONFLICT`; missing/restarted state returns `BRIDGE_TURN_GONE`.
- [ ] Step 4: On timeout/cancel, fail the outstanding JSON-RPC response when writable, interrupt the exact turn, discard raw arguments/results, and retain only correlation metadata, payload hash, terminal state, redacted response, and expiry. Never reconstruct responder handles after restart and never re-execute a tool.
- [ ] Step 5: Run the focused registry/client tests 20 times to exercise races: `for i in {1..20}; do mvn -q -o -f backend/pom.xml -Dtest=CodexPendingTurnRegistryTest,CodexAppServerClientTest test || exit 1; done`.

#### Task 4.4: Add the authenticated internal result/cancel boundary

- [ ] Step 1: Create RED MVC tests in [CodexTurnControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/api/CodexTurnControllerTest.java) for `POST /api/v1/model/codex/turns/{bridgeId}/tool-result` and `/cancel`: valid service identity, missing/invalid service token, cross-tenant/user/request mismatch, expired/gone handle, replay, conflict, and non-disclosing 404/403 behavior.
- [ ] Step 2: Run `mvn -o -f backend/pom.xml -Dtest=CodexTurnControllerTest test`; require RED because endpoints are absent.
- [ ] Step 3: Implement controller methods that only validate, delegate to the registry/client, and return the next `ModelChatResponse`. Do not inject `ToolExecutionService`, `PolicyService`, MCP clients, `ProcessBuilder`, or approval stores. The existing AuthFilter remains mandatory.
- [ ] Step 4: Extend the Codex branch of `/api/v1/model/chat` to return `pendingTurn`; non-Codex adapters remain synchronous and byte-contract compatible.
- [ ] Step 5: Run `mvn -o -f backend/pom.xml -Dtest=CodexTurnControllerTest,ModelControllerTest,CodexAppServerClientTest,CodexPendingTurnRegistryTest test`; require GREEN.

#### Task 4.5: Keep policy, approval, and execution in TS Runtime

- [ ] Step 1: Add RED tests in [agentExecutionRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/agentExecutionRunner.test.ts) and new [codexPendingTurn.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/codexPendingTurn.test.ts) for ALLOW execution, DENY, REQUIRE_APPROVAL/approval timeout, parse failure, execution failure, sequential pending calls in one model step, abort cancellation, ambiguous completion retry, restart gone, and no second `chat()` while a bridge remains pending.
- [ ] Step 2: Run `pnpm --filter @openharness/agent-runtime test -- codexPendingTurn.test.ts agentExecutionRunner.test.ts`; require RED at missing `completeCodexToolCall`/`cancelCodexTurn` methods.
- [ ] Step 3: Add typed JavaClient completion/cancel methods. Refactor the existing tool pipeline so both ordinary `message.toolCalls` and `pendingTurn` use the same frozen-catalog, agent allow-list, `beforeToolUse`, approval store, MCP/Java execution, tracing, and terminal status mapping. Pending assistant stubs/results are transport-only: never append them to conversation history and never persist `bridgeId`, raw pending arguments, or result content in runtime events; append only the final assistant response.
- [ ] Step 4: Keep each pending continuation inside the current `stepIndex`; after submitting one terminal outcome, consume the returned next pending/final/error response. On abort, approval/execution deadline, or `BRIDGE_TURN_GONE`, cancel/terminate fail closed and do not issue another model request.
- [ ] Step 5: Run `pnpm --filter @openharness/agent-runtime test -- codexPendingTurn.test.ts agentExecutionRunner.test.ts approvalTimeout.test.ts beforeToolUse.test.ts multiStepLoop.test.ts` and `pnpm typecheck`; require GREEN.

#### Task 4.6: Security negative evidence and slice review

- [ ] Step 1: Add canaries to arguments, result, app-server error, Authorization header, and synthetic OAuth fields. Assert absence from Java/TS logs, traces, runtime persistence, thrown errors, HTTP errors, and generated fixtures.
- [ ] Step 2: Run `rg -n "ToolExecutionService|PolicyService|executeTool|approve" backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java backend/src/main/java/org/openharness/backend/api/CodexTurnController.java`; expected result is no execution/approval dependency or method.
- [ ] Step 3: Run the Task 4 Java/TS/shared-schema matrix, then `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive` and `git diff --check`.
- [ ] Step 4: Write a distinct strict implementation review under [docs/review](file:///Users/elvis/file/develop/opensource/openharness/docs/review). Any finding returns to Task 4.1-4.5, reruns affected verification, and requires Review PASS before Task 5.

**Signoff:** the same app-server turn survives TS policy/approval/execution; every terminal outcome produces at most one DynamicToolCallResponse; timeout/cancel/restart fail closed; Java cannot execute or auto-approve; canaries are absent.

**Rollback/stop:** Stop on any need to read Codex credentials, expose a non-local endpoint, persist responder handles/raw payloads, bypass TS policy/approval, auto-approve, execute in Java, synthesize success, start a second model turn while pending, or accept an identity mismatch. Roll back only Task 4 files with a reviewed inverse patch.

### Task 5: Wire the ProviderAdapter

**Files:** new [CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java), [ProviderRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java), focused adapter/router/controller tests.

- [ ] Step 1: Write RED tests for ready call, needs-login error, app-server unavailable error, no fallback, and unchanged API-key provider behavior.
- [ ] Step 2: Run RED and record the expected missing-adapter failures.
- [ ] Step 3: Implement the adapter as the only consumer of CodexAppServerClient; do not add OAuth token fields to ProviderConfig.
- [ ] Step 4: Wire registry and router resolution for openai-codex/*.
- [ ] Step 5: Run GREEN plus ModelRouterTest, ModelControllerTest, and focused fake app-server tests.

**Signoff:** Java remains the gateway boundary; TS Runtime receives only ordinary model responses/errors and existing service authentication.

## Stage 4 — Operator Control And Redaction

### Task 6: Delegate login/status/logout safely

**Files:** local operator command surface, [docs/architecture/auth_contract.md](file:///Users/elvis/file/develop/opensource/openharness/docs/architecture/auth_contract.md), [docs/architecture/dev_runbook.md](file:///Users/elvis/file/develop/opensource/openharness/docs/architecture/dev_runbook.md), focused command tests.

- [x] Step 1: Write RED tests asserting status output contains only provider id, readiness, process state, model availability, and needs-login state.
- [x] Step 2: Run RED and inspect that token-like fixture values would fail the redaction assertion.
- [x] Step 3: Implement delegation to the official Codex CLI/app login/status/logout command without importing credential files or printing command output verbatim.
- [x] Step 4: Document prerequisites, supported Codex versions, local startup, login recovery, logout, and platform limitations.
- [x] Step 5: Run GREEN and scan command output/docs fixtures for token canaries.

**Signoff:** OpenHarness never becomes an OAuth client; the operator uses the official Codex login surface.

## Stage 5 — Qualification And Review

### Task 7: Fake matrix and strict evidence

**Files:** existing qualification harness/report schema/tests, new fake app-server fixture, new report template if required.

- [ ] Step 1: Write RED matrix assertions for handshake, sync, stream, pending/sequential tool continuation, reasoning, usage, cancellation, approval timeout, identical/conflicting completion, restart orphaning, auth failure, malformed response, and no fallback.
- [ ] Step 2: Run RED and record the missing evidence assertions.
- [ ] Step 3: Add deterministic fake app-server responses and redacted environment fingerprint fields.
- [ ] Step 4: Run GREEN and secret-canary scans over logs, traces, reports, command output, and JSON artifacts.
- [ ] Step 5: Confirm missing local login produces BLOCKED/needs_login rather than mock PASS.

**Signoff:** fake evidence proves contracts but never promotes real OAuth qualification.

### Task 8: Authorized real smoke and final verification

**Files:** new production evidence JSON under [docs/verification/agent-runtime-v1/providers](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers), review under [docs/review](file:///Users/elvis/file/develop/opensource/openharness/docs/review), status/dashboard only after review.

- [ ] Step 1: Obtain explicit authorization for a real local Codex OAuth smoke; do not request or display the OAuth token.
- [ ] Step 2: Run only the approved local app-server path for sync, reasoning, usage, stream, cancellation, and redaction rows.
- [ ] Step 3: Write immutable redacted evidence; mark missing login/unavailable/unsupported rows BLOCKED.
- [ ] Step 4: Run the full step-critical set:
  - mvn -o -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test
  - pnpm --filter @openharness/shared-schema test -- schema
  - npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive
  - pnpm dashboard:check
  - git diff --check
- [ ] Step 5: Perform strict Review; do not promote Gate C or check unrelated tasks from this change.

**Signoff:** real smoke evidence is PASS only when the app-server path and all required row oracles pass without secret exposure.

## Rollback And Stop Conditions

- Disable or remove the openai-codex route; existing API-key providers remain available.
- Stop immediately on protocol ambiguity, remote endpoint configuration, token exposure, orphan process, silent fallback, failed redaction, or missing real evidence.
- Rollback removes only the new provider registration/process supervisor/client and preserves existing provider adapters.

## Plan Self-Review

- Provider routing, process lifecycle, same-turn pending bridge, identity/authentication, TS policy/approval/execution ownership, timeout/cancel/replay/restart, operator delegation, redaction, qualification, and docs each have an explicit task.
- No task requires direct OAuth token handling or credential-file import.
- No Gate C/task checkbox promotion is included.
- Task 4 uses an isolated worktree and subagent-driven staged execution; no plan text grants git add/commit/push/archive authority.
