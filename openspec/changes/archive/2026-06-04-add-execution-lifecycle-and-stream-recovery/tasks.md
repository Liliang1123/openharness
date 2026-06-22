## Phase 1: 事件协议与 ID 体系

> 目标：把事件协议打稳，新建 `RuntimeEventStore` 与 session events SSE，让前端有 cursor 协议。本 Phase 不改 execution lifecycle。

- [x] 1.1 `agent-runtime/src/types.ts`：新增 `ExecutionId`、`EventId`、`RuntimeEventKind`、`SessionEvent` 类型定义
- [x] 1.2 `packages/shared-schema/src/index.ts`：同步 zod schema（`SessionEventSchema`、`RuntimeEventKindSchema`）
- [x] 1.3 新建 `agent-runtime/src/runtimeEventStore.ts`：实现 `append` / `since(afterEventId)` / `latestEventId` / `subscribe(listener)`，确保 replay+subscribe 顺序保证（mutex）
- [x] 1.4 `agent-runtime/src/agentStreamLoop.ts`：每次 SSE write 同时 `runtimeEventStore.append`，事件 data 携带 `eventId` / `executionId` / `conversationId` / `traceId` / `requestId` / `createdAt`
- [x] 1.5 `agent-runtime/src/server.ts`：新增 `GET /api/v1/sessions/:conversationId/events?last_event_id=...` SSE endpoint，先 replay 后订阅 live；cursor gap 推 `stream_resync_required`；terminal 推 `stream_done` / `stream_error`；30s heartbeat
- [x] 1.6 测试：`runtimeEventStore.test.ts`（append/since/subscribe 顺序保证）；`sessionEventsApi.test.ts`（replay / live / gap / terminal / heartbeat）；`agentStreamLoop.test.ts` 回归（确认旧字段仍存在 + 新字段新增）
- [x] 1.7 `frontend/src/api.ts`：解析新字段（向后兼容：忽略未知字段）；frontend 测试回归
- [x] 1.8 验证：`pnpm test` + `pnpm typecheck` + `mvn test` 全绿；手动 E2E：mock fixture `tool-time` 跑一次主 stream，confirm `eventId` 单调递增；断开重连 session events 收到缺失事件

## Phase 2: Detached Runner

> 目标：解耦 HTTP 与 execution。Phase 1 验证后才能进入。

- [x] 2.1 新建 `agent-runtime/src/agentExecutionRunner.ts`：承载 loop 逻辑，不持有 `FastifyReply`，只写 `runtimeEventStore` + `historyStore`
- [x] 2.2 新建 `agent-runtime/src/executionStateStore.ts`：维护 `executionId → ExecutionState`，含 `abortController`
- [x] 2.3 重构 `agent-runtime/src/agentStreamLoop.ts` 为 SSE adapter：仅创建 runner + 订阅 store + 转发 reply；客户端断开仅取消订阅，不取消 runner
- [x] 2.4 `agent-runtime/src/server.ts`：新增 `POST /api/v1/sessions/:conversationId/executions/:executionId/abort`
- [x] 2.5 测试：`agentExecutionRunner.test.ts`（runner 独立运行）；`detachedStream.test.ts`（断开重连后续接最终 assistant message）；`abortApi.test.ts`（abort 触发 `EXECUTION_ABORTED` terminal）
- [x] 2.6 验证：同上；手动 E2E：发起 stream → 主动断开 → 重连 session events → 看到完整 final_answer

## Phase 3: 运行锁与审批恢复

> 目标：单 active execution 锁定 + approval 进入显式 `waiting_approval` + 刷新恢复。

- [x] 3.1 `executionStateStore`：新增 `getActive(tenantId, conversationId)` + 状态机校验
- [x] 3.2 `agent-runtime/src/server.ts`：`POST /api/v1/agent/chat[/stream]` 入口检查 active execution，`running` → `409 EXECUTION_ALREADY_RUNNING`，`waiting_approval` → `409 EXECUTION_WAITING_APPROVAL`，response 携带 `executionId`
- [x] 3.3 新建 `agent-runtime/src/approvalStore.ts`：内存 + JSON 持久化（`data/sessions/{tenantId}/{conversationId}-approvals.json`）；`createPending` / `decide` / `subscribe` / `listPending`
- [x] 3.4 `agentExecutionRunner`：`beforeToolUse` 返回 `REQUIRE_APPROVAL` → 状态 `waiting_approval` + emit `approval_requested` 事件 + 等待 approval promise；`HistoryStore` 不再写 `PENDING_APPROVAL`
- [x] 3.5 新增 approval API：`POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId`，body `{ action: "approve"|"reject"|"revise", revisedArguments?, message? }`
- [x] 3.6 `GET /api/v1/sessions/:conversationId`：response 加 `activeExecution` 摘要 + `pendingApprovals: []`，刷新恢复路径
- [x] 3.7 旧 `POST /api/v1/agent/ask-user/:askUserId/reply`：路由到新 approvalStore（兼容期），找不到 → `404`
- [x] 3.8 测试：`activeExecutionLock.test.ts`、`approvalRecovery.test.ts`（含刷新恢复）、`approvalApi.test.ts`、`legacyAskUser.test.ts` 回归
- [x] 3.9 frontend：ApprovalCard 从 `pendingApprovals` 渲染（不只从 SSE）；`api.ts` 新 endpoint
- [x] 3.10 验证：同上；手动 E2E：触发审批 → 刷新 → 看到 ApprovalCard → approve → runner 继续 → final_answer

## Phase 4: 持久化分层与稳定性收敛

> 目标：HistoryStore 干净 + terminal error 完整 + timeout 治理。

- [x] 4.1 `agent-runtime/src/history.ts`：写入侧拒绝 `PENDING_APPROVAL` / `POLICY_DENY` sentinel；读取侧迁移期跳过这些 sentinel（仅迁移）
- [x] 4.2 `compression.ts`：`shouldCompress` 输入显式声明为稳定 history（无 sentinel），加防御性测试
- [x] 4.3 `agent-runtime/src/types.ts`：`StopReason` 扩展为完整 `RuntimeTerminalError` 集合（`MODEL_ERROR` / `TOOL_ERROR` / `POLICY_DENY` / `APPROVAL_TIMEOUT` / `EVENT_REPLAY_GAP` / `EXECUTION_ABORTED` 等）
- [x] 4.4 `agentExecutionRunner`：每个 terminal 路径都映射到具体 error class
- [x] 4.5 timeout：env var `APPROVAL_TIMEOUT_MS`（默认 3600000）+ `EXECUTION_TIMEOUT_MS`（默认 1800000），超时 emit terminal event
- [x] 4.6 合并 `agentLoop.ts` 与 `agentStreamLoop.ts` 重复逻辑：non-stream 路径成为 runner 的同步包装；stream 路径成为 SSE adapter
- [x] 4.7 测试：`historyLayering.test.ts`、`terminalErrors.test.ts`（每种 error class 一个 case）、`approvalTimeout.test.ts`、`executionTimeout.test.ts`
- [x] 4.8 docs：`CONTEXT.md` 加 `ExecutionId` / `ExecutionState` / `RuntimeEventStore` / `SessionEvent` / `ApprovalStore` / `RuntimeTerminalError` 术语；`docs/architecture/trace_schema.md` 加新事件名；`docs/architecture/policy_contract.md` 更新 approval flow
- [x] 4.9 验证：`pnpm test` + `pnpm typecheck` + `mvn test` + `npx openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive` 全绿；真 LLM E2E：长会话 + 多轮工具 + 审批 + 刷新恢复 + abort

## Phase 完成后

- [x] 5.1 全部 4 个 Phase 完成，所有 tasks 勾选
- [x] 5.2 `npx openspec archive add-execution-lifecycle-and-stream-recovery`（不带 `--yes`，确保 tasks 全勾）
- [x] 5.3 `npx openspec validate --all --strict --no-interactive` 全绿
- [x] 5.4 在本 change 的 archived tasks.md 末尾贴 4 个 Phase 的 E2E 摘要

## E2E 摘要

- Phase 1：mock fixture `tool-time` 验证主 stream 事件带 `eventId` 且单调递增；断开后通过 session events SSE replay 收到缺失事件和 terminal event。
- Phase 2：stream 主连接主动断开后 detached runner 继续执行；重连 `GET /api/v1/sessions/:conversationId/events` 可收到最终 `final_answer` / `stream_done`。
- Phase 3：MCP `get-sum` 触发 `approval_requested`，刷新 `GET /api/v1/sessions/:conversationId` 返回 `activeExecution.status="waiting_approval"` 和 `pendingApprovals`；approve 后 replay 收到 `tool_call`、`tool_result`、`final_answer`、`stream_done`。
- Phase 4：真 LLM chat 返回非空回答；`mcp-long` 触发 approval 后 approve，再 100ms 内 abort，abort API 返回 `status="aborted"`，原 stream 与 replay 均以 `stream_error` / `EXECUTION_ABORTED` 收尾。
