## Context

Agent Runtime 当前的 SSE 路径在 `AgentStreamLoop.stream()` 一处函数里同时承担：
1. 主 loop 执行（model + tool 多轮循环）
2. SSE 事件序列化与写入 HTTP reply
3. HistoryStore 写入
4. trace 透传

这种耦合导致 6 类外部可见问题（见 proposal.md §Why）。本 change 通过把"执行"与"事件传输"解耦来修复，使 Agent Runtime 在网络不稳定、页面刷新、需要审批等场景下仍保持稳定可恢复。

stakeholders：
- **Frontend**：消费主 stream 与 session events SSE；需理解 `eventId` cursor 协议。
- **TS Runtime（本层）**：新增 `RuntimeEventStore` / `ExecutionStateStore` / `ApprovalStore` 与 `AgentExecutionRunner`。
- **Java Backend**：不变（execution lifecycle 是 TS Runtime 的责任，符合 `responsibility_boundary.md`）。

## Goals / Non-Goals

### Goals

- 主 stream HTTP 断开不取消执行
- 页面刷新可通过 `last_event_id` 恢复缺失事件
- `REQUIRE_APPROVAL` 进入显式 `waiting_approval` 状态，刷新可恢复
- HistoryStore 只保存稳定消息（compression 输入干净）
- 同 conversation 单 active execution，并发请求显式 `409`
- 完整 terminal error class 集合，可通过 trace 与 session events 观察

### Non-Goals

- 不引入分布式 execution（仍是单 process）
- 不引入 durable RuntimeEventStore（in-memory + TTL，未来 change）
- 不改 Java backend 任何契约
- 不删除现有 `POST /api/v1/agent/ask-user/:askUserId/reply`（兼容期）
- 不改 model router / cost calc（属于 `add-p3b-cost-and-router`）
- 不改 MCP transport（属于未来 change）

## Decisions

### Decision 1：execution lifecycle 三 store 分层

将运行时数据按生命周期分为三个 store：

| Store | 内容 | 生命周期 | Persistence |
|-------|------|---------|-------------|
| `HistoryStore` | 稳定 user / assistant / completed tool result | 与 conversation 一致，永久 | JSON file |
| `ExecutionStateStore` | active execution 元数据（status, abortController, timestamps） | 与 execution 一致，terminal 后保留摘要 | in-memory |
| `RuntimeEventStore` | session events（含主 stream 镜像） | per-conversation TTL（默认 24h） | in-memory |
| `ApprovalStore` | pending approvals | 与 execution 同生命周期 | JSON file（同 sessions 目录） |

理由：HistoryStore 只承担"模型上下文输入"职责，必须干净；`PENDING_APPROVAL` 是运行时状态，属于 Approval/ExecutionState；token delta 是事件，属于 RuntimeEventStore。

Alternative 考虑：把 RuntimeEventStore 做成 HistoryStore 的视图。**否决**——会让 HistoryStore 同时承担"上下文"与"事件回放"两个职责，违反单一职责原则，且 compression 会被运行时事件干扰。

### Decision 2：ID 体系

| ID | 来源 | 生命周期 | 用途 |
|----|------|---------|------|
| `traceId` | Frontend / Trace propagation | 跨 runtime 全链路 | 链路追踪 |
| `requestId` | 单次 HTTP 请求 | HTTP 请求生命周期 | idempotency / 日志 |
| `conversationId` | 业务实体 | 永久 | 业务单元 |
| `executionId` | TS Runtime 生成（每次 agent turn） | 单次 execution（runner 启动→ terminal） | 锁、abort、approval 关联 |
| `eventId` | RuntimeEventStore 自增 | per-conversation 单调递增 | SSE cursor |

`executionId` 由 TS Runtime 在 `runner.start()` 时生成 UUID，写入 `ExecutionStateStore`，并嵌入每个 SessionEvent。

`eventId` 使用 `${conversationId}:${seq}` 字符串形式，便于人工 debug；seq 为 per-conversation 单调递增 64-bit 整数。

Alternative：用全局自增 eventId。**否决**——跨 conversation 无意义，反而失去 per-conversation cursor 语义。

### Decision 3：RuntimeEventStore 的 replay vs subscribe 顺序保证

实现要点：

```
subscribe(tenantId, conversationId, listener):
  // 1. lock conversation event queue (cheap mutex)
  // 2. emit all events since last cursor synchronously
  // 3. register listener for future events
  // 4. unlock
```

通过持有 mutex 保证：subscribe 注册 listener 与初始 replay 之间不会插入新 append。`append` 路径必须先获取同一 mutex 再 push。

替代方案：用 monotonic cursor 在 listener 第一次回调中比较。**否决**——增加客户端逻辑复杂度，可能错过快速到达的事件。

### Decision 4：主 stream 与 session events 的关系

主 stream（`POST /api/v1/agent/chat/stream`）:
- 同步触发新 execution
- 立即把 RuntimeEventStore 的 events 转发到 reply
- 等同于"创建 execution + 订阅 session events"的语法糖

session events（`GET /api/v1/sessions/:id/events?last_event_id=...`）:
- 不创建 execution，只订阅
- 用于刷新恢复

实现上两者共享同一个 SSE adapter，区别在于前者额外在开头创建 execution。

### Decision 5：active execution lock 行为

```
新请求到达 chat/stream:
  state = executionStateStore.getActive(tenantId, conversationId)
  if state == null or state.status in {completed, aborted, errored}:
    create new execution
  if state.status == "running":
    return 409 { errorClass: "EXECUTION_ALREADY_RUNNING", executionId: state.executionId }
  if state.status == "waiting_approval":
    return 409 { errorClass: "EXECUTION_WAITING_APPROVAL", executionId: state.executionId, pendingApprovals: [...] }
```

`409` 响应携带 `executionId`，前端可据此打开 session events SSE 加入到现有 execution。

### Decision 6：approval 持久化模型

`ApprovalStore` 持久化结构（`data/sessions/{tenantId}/{conversationId}-approvals.json`）：

```json
[
  {
    "executionId": "exec-uuid",
    "toolCallId": "call-id",
    "toolName": "submit_artifacts",
    "argumentsRaw": "{\"...\"}",
    "approvalToken": "opaque-token-from-java",
    "status": "pending|approved|rejected|revised|timeout",
    "createdAt": 1779700000000,
    "decidedAt": null
  }
]
```

刷新恢复路径：
1. Frontend 调 `GET /api/v1/sessions/:id` 拉历史 + active execution 摘要
2. 摘要包含 `pendingApprovals: [...]`
3. Frontend 渲染 ApprovalCard
4. Frontend 调 `POST .../approvals/:toolCallId` 决策
5. Runner 收到 approval 通过 `ApprovalStore.subscribe` 唤醒

### Decision 7：terminal error class

| Class | 触发 |
|-------|------|
| `EMPTY_MODEL_RESPONSE` | model 返回空 message |
| `MODEL_ERROR` | Java model gateway 返回 error |
| `TOOL_ERROR` | 工具执行失败（非 ok） |
| `POLICY_DENY` | beforeToolUse 返回 DENY 且无后续 |
| `APPROVAL_TIMEOUT` | 等待 approval 超过 `APPROVAL_TIMEOUT_MS`（默认 1h） |
| `STEP_BUDGET_EXHAUSTED` | step ≥ stepBudget |
| `EVENT_REPLAY_GAP` | session events 检测到 cursor gap，无法 replay |
| `EXECUTION_ABORTED` | 显式 abort API 触发 |

`stopReason` 字段沿用 p3a 已有的取值，扩展为完整集合。

### Decision 8：兼容期策略

旧 `POST /api/v1/agent/ask-user/:askUserId/reply` 在本 change 中**保留**，行为映射到新的 ApprovalStore：
- `askUserId` → `(executionId, toolCallId)` lookup
- 找到则路由到新 approval 处理
- 找不到 → 旧 `404 ASK_USER_NOT_FOUND`

下一个 change（未编号）正式 deprecate 旧 endpoint。

## Risks / Trade-offs

| Risk | 影响 | Mitigation |
|------|------|-----------|
| Phase 1 事件协议错误 | Frontend 解析失败 | TDD：先写 contract test，确保新字段为 superset；老前端不消费也不报错 |
| in-memory RuntimeEventStore 进程崩溃丢事件 | 用户失去刷新恢复能力 | 文档化为 P0 已知限制；下个 change 上 durable |
| HistoryStore 既存 `PENDING_APPROVAL` 字符串 | 读取时困惑 | 读取侧 sentinel 跳过；写入侧立即停 |
| `409` 在并发请求下用户体验差 | 客户端易混淆 | response 携带 executionId；前端自动转 session events 重连 |
| approval timeout 默认 1h 可能不合适 | 需要环境配置 | 通过 `APPROVAL_TIMEOUT_MS` env var 配置；spec 不写死 |

## Migration Plan

### 数据迁移

- `data/sessions/{tenantId}/{conversationId}.json`：读取侧若发现 `tool` 消息内容为 `PENDING_APPROVAL` / `POLICY_DENY`，跳过该条（视为运行时草稿）。无需主动改写文件。
- `data/sessions/{tenantId}/{conversationId}-approvals.json`：新增文件，缺失视为无 pending。

### 兼容期

- 主 stream 旧事件名（`agent_start` / `model_call_start` 等）保留。
- 旧 `ask-user/reply` API 保留（详见 Decision 8）。

### 回滚

- 新增 store / runner 都在 in-memory，删除文件即回滚。
- HistoryStore 写入侧改动是"减少写"，回滚是"恢复写"，无破坏性。
- 旧持久化文件不变。

## Open Questions

见 proposal.md §Open Questions。
