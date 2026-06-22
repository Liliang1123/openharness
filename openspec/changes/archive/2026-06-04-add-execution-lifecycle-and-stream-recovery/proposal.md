# Change: add-execution-lifecycle-and-stream-recovery

## Why

当前 Agent Runtime SSE 路径在多个稳定性维度上存在 gap，根因都来自同一个：HTTP 连接生命周期与 agent execution 生命周期被错误地耦合在 `AgentStreamLoop.stream()` 一处函数里。这带来 6 类外部可见问题：

1. **主 stream 断线 = execution 终止**：客户端网络抖动会导致正在运行的 execution 被静默丢弃，最终 assistant message 不入 history。
2. **页面刷新无法恢复**：刷新后没有 cursor 协议，前端拿不到错过的事件。
3. **审批不可恢复**：`REQUIRE_APPROVAL` 直接把字符串 `PENDING_APPROVAL` 写进 HistoryStore，刷新后看不到 pending；`AskUserStore` 已存在但 `AgentStreamLoop` 未集成，approve/reject/revise 路径在 stream 模式下断裂。
4. **HistoryStore 被运行中草稿污染**：`PENDING_APPROVAL` / `POLICY_DENY` 等运行时字符串混入稳定历史，破坏 compression 输入与 replay 语义。
5. **同会话并发未定义**：无 active execution lock，两个并发请求会同时写一个 conversation 的 history。
6. **terminal 错误不可观测**：除 `STEP_BUDGET_EXHAUSTED` / `EMPTY_MODEL_RESPONSE` 外，model error / tool error / approval timeout / abort 都没有结构化的 terminal error 表示。

详细分析见 `docs/review/2026-05-25-agent-runtime-stability-final-plan.md`（权威参考）。

## What Changes

> 范围对齐 final plan §"OpenSpec 门禁不得低估" 与 §"Phase 0/1/2/3/4"。本 change 只覆盖 spec 层面的契约定义；实施按 Phase 分批进入后续 Superpowers plan。

### A. 事件协议与 ID 体系

1. **新增** `ExecutionId`、`EventId`、`RuntimeEventKind`、`SessionEvent` 数据模型。
2. **修改** 主 stream（`POST /api/v1/agent/chat/stream`）：每个 SSE 事件 data 携带 `eventId`、`executionId`、`conversationId`、`traceId`、`requestId`、`createdAt`。
3. **新增** `RuntimeEventStore`：`append` / `since(afterEventId)` / `latestEventId` / `subscribe(listener)`。replay 与 live subscribe 必须保证不漏事件。
4. **新增** session events SSE：`GET /api/v1/sessions/:conversationId/events?last_event_id=...`。先 replay 缺失事件，再 push live 事件；cursor 过旧推 `stream_resync_required`；终止时推 `stream_done` / `stream_error`；长连接 heartbeat。

### B. Detached Runner

5. **新增** `AgentExecutionRunner`：承载真正 loop 执行逻辑，不持有 `FastifyReply`，只写 `RuntimeEventStore` 和 `HistoryStore`。
6. **修改** `AgentStreamLoop` 退化为 HTTP/SSE adapter：转发 store 事件到 reply。客户端断开只停止当前连接的写入，不取消 runner。
7. **新增** `ExecutionStateStore`：维护 `executionId` → `{ conversationId, tenantId, status, startedAt, updatedAt, endedAt, abortController }`。
8. **新增** abort API：`POST /api/v1/sessions/:conversationId/executions/:executionId/abort`。

### C. 运行锁与审批恢复

9. **新增** active execution 锁：同一 `(tenantId, conversationId)` 默认只允许一个 active execution。`running` → `409 Conflict`；`waiting_approval` → `409 pending approval`；terminal 后允许新 execution。
10. **修改** `REQUIRE_APPROVAL` 语义：execution 状态变为 `waiting_approval`；发 `approval_requested` 事件；runner 等待 approval。**HistoryStore 不再写 `PENDING_APPROVAL` 字符串。**
11. **新增** approval recovery API：`POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId`，body 支持 `approve` / `reject` / `revise`。现有 `POST /api/v1/agent/ask-user/:askUserId/reply` 进入兼容期。
12. **新增** `ApprovalStore`：持久化 pending approvals，刷新后可通过 session events 看到。

### D. 持久化分层与 terminal error

13. **修改** HistoryStore 语义：只保存稳定 user / assistant / completed tool result。运行中草稿、`PENDING_APPROVAL`、stream token delta 一律不进 HistoryStore。compression 仅基于稳定 HistoryStore。
14. **新增** `RuntimeTerminalError` 集合：`MODEL_ERROR` / `TOOL_ERROR` / `POLICY_DENY` / `APPROVAL_TIMEOUT` / `STEP_BUDGET_EXHAUSTED` / `EVENT_REPLAY_GAP` / `EXECUTION_ABORTED` / `EMPTY_MODEL_RESPONSE`。
15. **新增** approval timeout 与 execution timeout 语义。

## Impact

### Affected specs

- `agent-sse`：MODIFIED `SSE Streaming Endpoint`（事件携带 ids + 新事件名）；ADDED `Session Events Replay SSE`、`Heartbeat`、`Stream Done / Error / Resync`、`Approval Requested Event`
- `agent-runtime`：ADDED `Execution Identifiers`、`Runtime Event Store`、`Execution State Store`、`Active Execution Lock`、`Detached Runner`、`Abort API`、`Runtime Terminal Errors`、`Execution Timeouts`
- `message-history`：MODIFIED `Persistent Message History`（仅稳定消息）；ADDED `Stable History Layering`
- `ask-user`：MODIFIED `Ask User Pending Store`（execution-paused 模型）；MODIFIED `Ask User Reply API`（execution-scoped 路径，兼容旧接口）；ADDED `Approval Recovery via Session Events`

### Affected code（实施分阶段进入后续 plan，本 change 不直接动代码）

- `agent-runtime/src/types.ts`：新 ID/event 类型
- `agent-runtime/src/runtimeEventStore.ts`（新建）
- `agent-runtime/src/executionStateStore.ts`（新建）
- `agent-runtime/src/agentExecutionRunner.ts`（新建）
- `agent-runtime/src/approvalStore.ts`（新建）
- `agent-runtime/src/agentStreamLoop.ts`（重构为 adapter）
- `agent-runtime/src/server.ts`（新 endpoints + 锁）
- `agent-runtime/src/history.ts` / `jsonFileHistoryStore.ts`：分层语义
- `frontend/src/api.ts`、`frontend/src/components/`（事件解析 + reconnect 逻辑）

### Breaking changes

- **主 stream SSE 事件 data shape**：现有事件 data（如 `{ stepIndex, hasToolCalls }`）将新增 `eventId` / `executionId` / `createdAt` 字段。**这是新增字段，向后兼容**；前端旧 parser 不消费新字段也不会出错。
- **HistoryStore 内容**：旧 history 中可能存在 `PENDING_APPROVAL` / `POLICY_DENY` 字符串记录；迁移策略：读取时跳过这些 sentinel 值；写入侧停止生成。**对现有持久化文件向后兼容**。
- **`AskUser` 旧 API** `POST /api/v1/agent/ask-user/:askUserId/reply` 进入兼容期，**不立刻删除**。

### Risk

- 中等：execution lifecycle 改动是重构性的，错误的事件顺序会影响前端。需要 Phase 1（事件协议）严格 TDD，再进入 Phase 2/3/4。
- 低：HistoryStore 分层是新增写入侧约束，读取兼容；compression 算法不变。

## Phasing

实施按 final plan 顺序分 4 个 Superpowers plan，每个 plan 在本 change 批准后生成：

| Phase | 范围 | 对应章节 |
|-------|------|---------|
| Phase 1 | 事件协议 + ID 体系 + RuntimeEventStore + session events SSE | A |
| Phase 2 | Detached Runner + ExecutionStateStore + abort API | B |
| Phase 3 | Active execution lock + approval recovery + ApprovalStore | C |
| Phase 4 | HistoryStore 分层 + terminal errors + timeouts + 收敛 | D |

每个 Phase 完成后经 `pnpm test` + `pnpm typecheck` + `mvn test`（如涉及）+ `openspec validate --strict` 全绿才能进入下个 Phase。本 change 在 Phase 4 完成后才 archive。

## Open Questions

1. `RuntimeEventStore` 是否需要持久化（durability）？建议：P0 用 in-memory + per-conversation TTL，未持久化；后续 change 再上 durable。本 change spec 明确这点。
2. `ApprovalStore` 是否使用 `JsonFileHistoryStore` 同款持久化机制？建议：是；同一 `data/sessions/{tenantId}/` 下另开 `approvals.json`。
3. `last_event_id` 过期判定标准？建议：`since` 找不到对应事件视为 gap，立即推 `stream_resync_required`，由 frontend 重新 GET 完整快照。
