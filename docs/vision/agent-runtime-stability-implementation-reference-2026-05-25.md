# Agent Runtime Stability Implementation Reference

> 基于 `v1-v2-chat-sse-summary-2026-05-25.html` 对 V2 Chat / SSE 的梳理，提炼当前 OpenHarness 后续可参考的落地优化点。
> 本文是后续实施参考方案，不是已批准的 OpenSpec 契约，也不是单次迭代执行计划。

## 结论

当前 `agent-runtime` 已具备较好的 Agent Harness 雏形：TS Runtime 拥有 Agent Loop、History、ToolRegistry、beforeToolUse、Trace、Compression 和 MCP 路由。HTML 中 V2 Chat / SSE 的成熟点，值得后续重点补齐在两个方向：

1. **方案完整性**：把主聊天流、会话事件流、断线恢复、运行态锁、最终消息同步视为一组协议，而不是单个 `POST /stream` 接口。
2. **运行时稳定性**：让一次 agent turn 即使遇到客户端断线、工具审批、模型异常、MCP 不可用、上下文过长，也能有明确状态、可恢复事件和可观测结果。

如果后续进入实现，应先创建 OpenSpec change，明确事件协议、恢复语义、运行锁、审批恢复和兼容边界。

## 参考来源

- 当前参考文档：`docs/vision/v1-v2-chat-sse-summary-2026-05-25.html`
- 当前实现基线：`agent-runtime/`
- 当前领域术语：`CONTEXT.md`

## 优化点 1：主 Stream 与 Session Events 组成一套协议

### 现状参考

HTML 中的核心结论是：V2 不应只依赖主聊天 `POST /stream`。主 stream 负责当前请求的即时输出，session events 负责断线恢复、异步事件回流和最终状态同步。

当前 `agent-runtime` 已有 `/api/v1/agent/chat/stream`，但更接近单连接 SSE。后续应补一条独立的会话事件流：

```text
POST /api/v1/agent/chat/stream
GET  /api/v1/sessions/{conversationId}/events?last_event_id=...
```

### 后续方案

- 主 stream 返回本次 turn 的即时事件：`agent_start`、`model_call_start`、`tool_call`、`tool_result`、`final_answer`、`agent_end`。
- Session events 返回 conversation 级事件：`stream_text_delta`、`stream_snapshot`、`stream_done`、`stream_error`、`message_created`、`tool_call_event`、`stream_resync_required`。
- 所有事件必须带 `eventId`、`conversationId`、`executionId`、`traceId`、`requestId`、`createdAt`。
- 客户端维护 `last_event_id`，断线后重连 session events。
- 如果事件无法完整 replay，服务端返回 `stream_resync_required`，客户端清 cursor 并重拉 session messages。

### 稳定性收益

- 客户端断线不等于执行失败。
- 页面刷新、网络抖动、移动端后台恢复后仍能找回运行态。
- 后续多智能体、审批、产物提交不必塞进单条主 stream。

## 优化点 2：引入 executionId 与运行态锁

### 现状参考

HTML 中 V2 明确绑定 `execution_id`、active execution、run lock、abort signal。当前 `agent-runtime` 已有 `conversationId`、`requestId`、`traceId` 和 step budget，但还没有显式 execution 生命周期。

### 后续方案

为每次用户提交创建一个 `executionId`：

```text
conversationId: 会话维度
executionId: 一次 agent turn 维度
requestId: 单次 HTTP 请求维度
traceId: 链路追踪维度
```

运行态需要维护：

| 字段 | 用途 |
|---|---|
| `executionId` | 标识一次 turn，贯穿主 stream、session events、trace、tool call |
| `status` | `running` / `waiting_approval` / `completed` / `failed` / `aborted` |
| `activeStreamSnapshot` | 当前正在生成的草稿文本和最后 eventId |
| `startedAt` / `updatedAt` / `endedAt` | 运行态诊断与超时清理 |
| `abortSignal` | 用户取消或系统回收 |

同一 conversation 默认只允许一个 active execution。若新请求到达：

- active execution running：返回冲突或显式排队策略。
- active execution waiting approval：提示先处理审批。
- active execution terminal：允许启动新 execution。

### 稳定性收益

- 避免同会话并发写 history 造成消息顺序错乱。
- 断线恢复可以定位到“正在跑的那一次”，不是只看最终消息。
- 为取消、超时、审批恢复和后台任务提供统一锚点。

## 优化点 3：Detached Streaming 与后台 Drain

### 现状参考

HTML 强调“主流断开后，后端继续 drain，避免看的人断了，执行就立刻死掉”。当前 `agent-runtime` 的 stream loop 与 HTTP reply 生命周期绑定较紧。

### 后续方案

拆分执行和传输：

```text
AgentExecutionRunner
  -> 产生 RuntimeEvent
  -> 写 EventStore / ActiveSnapshot
  -> 写 HistoryStore terminal message

HttpStreamAdapter
  -> 订阅 RuntimeEvent
  -> 投影为主 SSE
```

主 stream 断开时：

- 不立即取消 execution。
- Runner 继续执行到 terminal 状态或系统超时。
- 事件继续写入 session event store。
- 客户端通过 session events 补偿缺失事件。

取消语义单独设计：

```text
POST /api/v1/sessions/{conversationId}/executions/{executionId}/abort
```

### 稳定性收益

- 网络连接生命周期和 agent turn 生命周期解耦。
- 后端可以明确区分“用户取消”和“连接断开”。
- 支持更长工具调用、审批等待、后台产物生成。

## 优化点 4：事件 Replay 与 Snapshot 双层恢复

### 现状参考

HTML 中 V2 同时使用 `last_event_id` replay 和 `stream_snapshot`。这是完整恢复语义的关键：replay 负责补事件，snapshot 负责补当前草稿状态。

### 后续方案

事件恢复采用两层：

1. **Event replay**：按 `last_event_id` 返回缺失事件。
2. **Snapshot fallback**：当 replay 不完整或客户端状态落后，返回当前 active stream snapshot。

建议保留事件窗口：

```text
session events retention: 24h 或最近 N 条
active snapshot retention: execution terminal 后短时间保留
terminal messages: 持久化到 HistoryStore
```

恢复决策：

| 场景 | 服务端响应 |
|---|---|
| cursor 命中 | replay missed events |
| cursor 过旧但 active execution 存在 | `stream_snapshot` + 后续实时事件 |
| cursor 过旧且无法恢复 | `stream_resync_required` |
| execution 已结束 | replay terminal event 或提示刷新 messages |

### 稳定性收益

- 不要求客户端永远可靠消费每个 token delta。
- 大幅降低断线后 UI 草稿丢失概率。
- 为低成本事件存储和最终一致性之间提供清晰边界。

## 优化点 5：审批等待成为运行态，而不是普通工具结果

### 现状参考

当前 `beforeToolUse` 已能返回 `REQUIRE_APPROVAL`，但 loop 中主要写入 `PENDING_APPROVAL`。这能让模型看到状态，但不足以支撑用户审批后恢复原 execution。

### 后续方案

把审批等待提升为 execution 状态：

```text
ALLOW            -> 执行工具并继续 loop
DENY             -> 写 policy deny tool result，继续或终止由策略决定
REQUIRE_APPROVAL -> status=waiting_approval，发 approval_requested 事件，暂停 runner
```

审批接口应带：

- `conversationId`
- `executionId`
- `toolCallId`
- `approvalToken`
- `action`: `approve` / `reject` / `revise`

审批后恢复：

- `approve`：执行原工具，追加 tool result，runner 继续。
- `revise`：使用 revised arguments 执行，追加 tool result，runner 继续。
- `reject`：追加 `USER_REJECTED` 或结构化拒绝结果，runner 继续让模型解释或终止。

### 稳定性收益

- 审批不会丢失在 HTTP 请求边界里。
- 用户刷新页面后仍能看到 pending approval。
- 工具执行和人工决策都能被 trace 与 session events 串起来。

## 优化点 6：终态持久化与中间态分层

### 现状参考

当前 `HistoryStore`、`toApi`、`toReplay` 已经有视图隔离雏形。后续需要把“可恢复运行态”和“最终消息历史”进一步分层。

### 后续方案

建议分三层：

| 层 | 内容 | 生命周期 |
|---|---|---|
| `RuntimeEventStore` | token delta、tool progress、approval event、snapshot event | 短期保留，可 replay |
| `ExecutionStateStore` | active execution、status、snapshot、run lock | running 到 terminal 后短期保留 |
| `HistoryStore` | user / assistant / tool 终态消息 | 长期保留 |

规则：

- token delta 不直接等于最终 assistant message。
- final answer / terminal message 成功写入 HistoryStore 后，再发 `message_created` 或 `stream_done`。
- 压缩只处理 HistoryStore 的稳定消息，不压缩 active execution。
- `toApi` 继续剥离内部字段；`toReplay` 只用于恢复稳定消息，不代替 event replay。

### 稳定性收益

- 避免把未完成草稿污染为最终消息。
- 压缩、重放、UI 展示各自有明确数据源。
- 支持“事件丢了但最终消息还在”的最终一致性恢复。

## 优化点 7：运行时故障分类与降级策略

### 现状参考

当前 runtime 已有 step budget、MCP timeout、trace failure 不阻断主路径、compression failure 不阻断响应等做法。这些应扩展成统一故障分类。

### 后续方案

为 runtime terminal event 定义错误类别：

| 类别 | 示例 | 推荐处理 |
|---|---|---|
| `MODEL_ERROR` | provider 超时、空响应、限流 | terminal event + 可重试标记 |
| `TOOL_ERROR` | Java tool error、MCP tool error | 作为 tool result 回灌模型或终止 |
| `POLICY_DENY` | policy 拒绝工具 | 结构化 tool result + trace |
| `APPROVAL_TIMEOUT` | 用户长期未审批 | execution terminal 或继续等待，按策略 |
| `STEP_BUDGET_EXHAUSTED` | 多步循环超限 | terminal event + 最后状态 |
| `EVENT_REPLAY_GAP` | cursor 无法补齐 | `stream_resync_required` |

降级原则：

- Trace、Compression、非关键事件写入失败，不阻断主回复。
- Tool / Model / Policy 失败必须结构化进入 execution terminal 或 tool result。
- 所有 terminal 状态必须可通过 session events 和 session messages 被客户端观察。

### 稳定性收益

- 故障不是“连接断了”或“前端没显示”这种模糊状态。
- 前端、后端、测试都能围绕同一组错误类别验收。
- 后续生产问题可以通过 traceId / executionId 定位。

## 分阶段落地建议

### Phase 1：事件协议和状态模型

- 定义 `ExecutionState`、`RuntimeEvent`、`RuntimeEventKind`。
- 为主 stream 事件补齐 `executionId` 和 `eventId`。
- 增加 session events endpoint 的最小实现。
- 增加 cursor replay 和 `stream_resync_required`。
- 测试覆盖：正常流、断线后 replay、cursor gap。

### Phase 2：执行与传输解耦

- 抽出 `AgentExecutionRunner`。
- 主 stream 变成 event adapter。
- 断开主 stream 后 runner 继续执行。
- 增加 active snapshot。
- 测试覆盖：主连接断开后最终消息仍落库；重连后收到 snapshot / done。

### Phase 3：审批恢复和运行锁

- 引入 per conversation active execution lock。
- `REQUIRE_APPROVAL` 进入 `waiting_approval` 状态。
- 审批接口按 `executionId + toolCallId` 恢复 runner。
- 测试覆盖：approve / reject / revise，刷新后仍可审批。

### Phase 4：稳定性和运维能力

- 统一 terminal error classes。
- 增加 execution timeout / approval timeout。
- 增加 event retention 清理。
- 增加 trace 和 metrics：active executions、replay gap、tool timeout、approval wait time。
- 测试覆盖：模型异常、工具超时、MCP unavailable、compression failure 不阻断主路径。

## 验收标准

后续实现完成时，至少满足：

- 客户端只断开主 stream 时，后端 execution 不被误取消。
- 客户端带 `last_event_id` 重连后，可以恢复缺失事件或收到明确 `stream_resync_required`。
- 同一 conversation 不会并发运行多个未终止 execution，除非规范显式允许。
- `REQUIRE_APPROVAL` 能在页面刷新后继续处理。
- 工具、模型、policy、event replay gap 都有结构化错误和 trace。
- HistoryStore 只保存稳定消息，active stream 草稿不污染最终历史。
- 压缩、trace、非关键事件失败不影响 terminal answer 的返回。

## OpenSpec 门禁建议

进入实现前，应创建 OpenSpec change，至少覆盖：

- 新增或修改 API：session events、abort execution、approval reply。
- 新增事件类型：`stream_text_delta`、`stream_snapshot`、`stream_done`、`stream_error`、`stream_resync_required`、`approval_requested`。
- 新增状态模型：`ExecutionState`、active execution lock、terminal status。
- 修改前端协议：同时消费主 stream 和 session events，维护 `last_event_id`。
- 修改测试契约：断线恢复、审批恢复、运行锁、错误分类。

建议 change-id：

```text
add-session-event-recovery-runtime
```

