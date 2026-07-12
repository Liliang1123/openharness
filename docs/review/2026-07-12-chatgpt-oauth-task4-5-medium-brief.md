# ChatGPT/Codex OAuth Task 4.5 Medium Brief

## 状态

已授权执行。Task 4.4 已通过 authenticated continuation boundary；本切片只把 Codex pending turn 接入 TS Runtime 现有 policy/approval/execution pipeline，并保持同一 model step 与零稳定 payload persistence。

## Prerequisite

- [Task 4.4 Attempt-04 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-04-high-review.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)

## 允许修改

- [javaClient.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/javaClient.ts)
- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/agentExecutionRunner.ts)
- [approvalStore.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/approvalStore.ts)
- 新增 [codexPendingTurn.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/test/codexPendingTurn.test.ts)
- 最小修改 [agentExecutionRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/test/agentExecutionRunner.test.ts)、[approvalStore.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/test/approvalStore.test.ts) 仅用于回归。

禁止修改 Java、shared schema、MCP/Policy/approval API contract、OpenSpec、checkbox、dashboard、项目规则或历史 Review。

## 锁定设计

1. `JavaClient` 增加 optional `completeCodexToolCall(...)` 与 `cancelCodexTurn(...)`；`HttpJavaClient` 固定调用 Task 4.4 endpoints，并用 `ModelChatResponseSchema` 解析。
2. Runner 收到 `pendingTurn` 后不 append assistant stub、不 increment `stepIndex`、不再次 `chat()`；在当前 step 内循环 next pending/final/error。
3. Pending call 转为现有 `ToolCall` 并继续使用 frozen catalog、agent allow-list、`beforeToolUse`、approval decision、MCP/Java/subagent execution 与 trace boundary。
4. 提取共享的单 tool authorization/execution helper；普通 message.toolCalls 行为保持不变，不复制第二套 policy/executor。
5. terminal mapping：成功执行→`ok`；policy deny/user reject→`rejected`；approval/execution deadline→`timeout`；parse/tool/execution failure→`error`。每次只提交一个 bounded text content。
6. `ApprovalStore.createPending` 增加 optional `{ persist: false }`；JsonFile store 对该 key 只保存在内存并从写盘集合过滤。Codex approval UI 在进程存活时仍可读取原始参数；restart 后丢失并由 bridge cancel/orphan fail closed。
7. Codex `approval_requested`/`tool_result` runtime events 只含 call id、tool name、status、reason、stepIndex 等安全元数据；不得含 bridgeId、argumentsRaw、result content、approvalToken。
8. Pending tool assistant/result transport 均不写 history；仅最终 assistant message写入。Error/gone 终止 execution，不发第二次 chat。
9. abort、approval timeout、execution timeout、tool failure或 ambiguous completion 必须 best-effort 调用 exact `cancelCodexTurn`；cancel failure不得覆盖原始 terminal class，也不得 retry result。
10. completion idempotency key 使用当前 execution/request 与 call id 的稳定组合；相同 ambiguous HTTP retry仅允许一次 identical retry，conflict/gone fail closed。

## TDD matrix

- HttpJavaClient completion/cancel path、headers、schema validation。
- ALLOW、DENY、REQUIRE_APPROVAL approve/reject/timeout、parse failure、execution failure。
- sequential pending calls 同一 step、`chat()` 恰好一次、completion exactly once/identical retry。
- abort/timeout/gone/cancel failure fail closed。
- history 只有 user + final assistant；events/files 无 bridge/arguments/result/approval-token canary。
- ordinary tool-call、approval、multi-step、MCP/beforeToolUse regressions保持通过。

## 验证

- Focused：`pnpm --filter @openharness/agent-runtime test -- codexPendingTurn.test.ts agentExecutionRunner.test.ts approvalStore.test.ts`。
- Regression：`pnpm --filter @openharness/agent-runtime test -- approvalTimeout.test.ts beforeToolUse.test.ts multiStepLoop.test.ts mcpRouting.test.ts`。
- `pnpm typecheck`、agent-runtime full test、OpenSpec strict、`git diff --check`、敏感字段负向搜索。
- 独立 adversarial fake JavaClient probe 与最终 SHA/status 双采样。

## 停止条件

- 需要修改 Java/shared schema 或绕过现有 policy/approval/execution owner。
- 任何 bridge/raw arguments/result/approval token 进入稳定 history/event/file/SQLite。
- pending 时发生第二次 chat、重复 completion、Java tool execution或自动批准。
- 发现并发外部写入。

## 后续门禁

Fresh verification 后必须独立 High Review PASS，才能进入 Task 4.6。
