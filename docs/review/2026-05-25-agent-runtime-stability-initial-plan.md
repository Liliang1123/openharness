# Agent Runtime 完整性与稳定性提升实施 Plan（initial draft）

> ⚠️ **此文档已被 superseded**：最终参考方案见 [`2026-05-25-agent-runtime-stability-final-plan.md`](./2026-05-25-agent-runtime-stability-final-plan.md)。本文件保留作为初稿历史记录。  
> 原始位置违规：曾被错误放置在 `docs/superpowers/plans/`，于 2026-05-25 review 修正后移到本目录。  
> 状态：未批准，仅供历史参考，不可作为可执行计划使用。

---

## 一、现状评估

### 1.1 已具备的能力（保留优点）

| 能力 | 实现位置 | 状态 |
|------|---------|------|
| Agent Loop（多步 model + tool 循环） | `agentLoop.ts` / `agentStreamLoop.ts` | ✅ 稳定 |
| ToolRegistry per-conversation freeze + catalog version/hash | `toolRegistry.ts` | ✅ 稳定 |
| beforeToolUse policy gate（ALLOW/DENY/REQUIRE_APPROVAL） | `beforeToolUse.ts` | ✅ 稳定 |
| Trace 不阻断主路径（try/catch 吞掉 trace 失败） | `agentLoop.ts:emit` | ✅ 稳定 |
| Compression failure 不阻断响应（autoCompress catch warn） | `agentStreamLoop.ts:autoCompress` | ✅ 稳定 |
| MCP failure degrade（server unavailable 返回结构化错误，不崩溃） | `mcpRegistry.ts` | ✅ 稳定 |
| HistoryStore 接口抽象（InMemory / JsonFile 两实现） | `history.ts` / `jsonFileHistoryStore.ts` | ✅ 稳定 |
| toApi / toReplay 视图隔离（剥离 internal fields / 跳过 transient） | `history.ts` | ✅ 稳定 |
| AskUserStore（per-conversation 单 pending 存储） | `askUserStore.ts` | ✅ 存在但未完整集成 |
| SSE 主 stream（agent_start / model_call_start / tool_call / tool_result / final_answer / agent_end） | `agentStreamLoop.ts` | ✅ 可用 |
| StepBudget 防无限循环 | 两个 loop | ✅ 稳定 |
| idempotencyKey 透传 Java | `agentStreamLoop.ts:executeTool` | ✅ 稳定 |

### 1.2 缺口（Gap）

**G1 — 执行与传输生命周期耦合**  
`AgentStreamLoop.stream()` 直接持有 `FastifyReply`，在方法内调用 `reply.raw.write` 和 `reply.raw.end`。客户端断开连接 = HTTP 连接关闭 = 方法执行中断（Node.js 不会自动继续写入已关闭的 socket）。没有 detached runner，没有后台 drain。

**G2 — 无 executionId，ID 语义混用**  
当前只有 `conversationId`（会话维度）、`requestId`（HTTP 请求维度）、`traceId`（链路维度）。没有 `executionId`（一次 agent turn 维度）。`requestId` 在 `ask-user reply` 端点中被复用为 `traceId`（`server.ts` 约第 170 行），语义已混乱。

**G3 — 无 active execution lock，同会话可并发**  
`AgentStreamLoop` 和 `AgentLoop` 都没有检查同一 `conversationId` 是否已有 running execution。两个并发请求会同时 `history.append`，导致消息顺序不确定。

**G4 — REQUIRE_APPROVAL 不暂停 loop，审批无法恢复执行**  
`agentStreamLoop.ts:runToolBatch` 遇到 `REQUIRE_APPROVAL` 时，写入 `"PENDING_APPROVAL"` 字符串到 history，然后 `continue` 继续处理下一个 toolCall，loop 不暂停。`AskUserStore` 存在但 stream loop 从未调用它。`ask-user reply` 端点执行工具后只写 history，不恢复任何 runner。审批结果对已结束的 stream 没有意义。

**G5 — 无 session events endpoint，无断线恢复**  
只有 `POST /api/v1/agent/chat/stream`（主 stream）。没有 `GET /api/v1/sessions/{conversationId}/events`。没有 `last_event_id`，没有 `stream_resync_required`，没有 `stream_snapshot`。客户端断线后无法补偿缺失事件。

**G6 — HistoryStore 无分层，草稿污染终态**  
`PENDING_APPROVAL` 字符串、`POLICY_DENY` 字符串、`MODEL_TOOL_PARSE_ERROR` 字符串直接写入 `HistoryStore`，与正常 user/assistant/tool 消息混在同一序列。没有 RuntimeEventStore（短期事件）和 ExecutionStateStore（运行态快照）的分层。压缩时会处理这些中间态消息。

**G7 — 两套 loop 逻辑高度重复，维护成本高**  
`agentLoop.ts`（非 stream）和 `agentStreamLoop.ts`（stream）的 `runToolBatch`、`executeTool`、`callModel`、`autoCompress` 逻辑几乎完全相同，只差 `send()` 调用。任何 bug fix 需要改两处。

**G8 — 错误分类不完整**  
当前只有 `MODEL_TOOL_PARSE_ERROR`、`MCP_TOOL_TIMEOUT`、`MCP_SERVER_UNAVAILABLE`、`PENDING_APPROVAL`、`POLICY_DENY`、`USER_REJECTED`。缺少：`MODEL_ERROR`（provider 超时/空响应）、`APPROVAL_TIMEOUT`、`STEP_BUDGET_EXHAUSTED`（结构化 terminal error）、`EVENT_REPLAY_GAP`。

**G9 — 主 stream 事件无 eventId，无 executionId**  
`send("agent_start", { traceId, conversationId })` 等事件没有 `eventId`（单调递增序号）和 `executionId`。客户端无法基于 `last_event_id` 做 replay，也无法区分同一 conversation 的不同 turn。

### 1.3 风险

| 风险 | 严重度 | 触发条件 |
|------|--------|---------|
| 同会话并发写 history 导致消息顺序错乱 | 高 | 用户快速重复提交，或前端重试 |
| 客户端断线导致 execution 中断，最终消息未落库 | 高 | 移动端、弱网、页面刷新 |
| REQUIRE_APPROVAL 后 loop 已结束，审批结果孤立 | 高 | 任何需要人工审批的工具调用 |
| 草稿消息（PENDING_APPROVAL 等）被压缩处理 | 中 | 长对话触发 compression |
| requestId 被复用为 traceId，trace 链路断裂 | 中 | ask-user reply 端点 |
| 两套 loop 不同步修复，行为不一致 | 中 | 任何 bug fix 只改一处 |

---

## 二、分阶段实施 Plan

### Phase 1 — 事件协议与 ID 体系

**目标**：为后续所有改动建立基础。补齐 `executionId`，为主 stream 事件加 `eventId`，建立最小 session events endpoint，实现 cursor replay 和 `stream_resync_required`。

**不改变**：loop 逻辑、history 分层、审批流程、运行锁。

#### 涉及文件

| 文件 | 改动性质 |
|------|---------|
| `src/types.ts` | 新增 `ExecutionId`、`EventId`、`RuntimeEventKind`、`SessionEvent` 类型 |
| `src/agentStreamLoop.ts` | `StreamInput` 增加 `executionId`；`send()` 增加 `eventId`（单调递增）；写入 `RuntimeEventStore` |
| `src/server.ts` | 新增 `GET /api/v1/sessions/:conversationId/events?last_event_id=` endpoint |
| `src/runtimeEventStore.ts` | 新增文件：内存 ring buffer，按 `conversationId` 存储最近 N 条 `SessionEvent`，支持 cursor 查询 |

#### 主要接口/类型

```typescript
// types.ts 新增
type ExecutionId = string;  // crypto.randomUUID()，每次 turn 生成
type EventId = number;      // 单调递增，per-conversation

interface SessionEvent {
  eventId: EventId;
  conversationId: string;
  executionId: ExecutionId;
  traceId: string;
  requestId: string;
  kind: RuntimeEventKind;
  payload: unknown;
  createdAt: string;  // ISO 8601
}

type RuntimeEventKind =
  | "agent_start" | "model_call_start" | "model_call_end"
  | "tool_call" | "tool_result" | "step_budget_exhausted"
  | "final_answer" | "agent_end"
  | "stream_resync_required";

// runtimeEventStore.ts
interface RuntimeEventStore {
  append(tenantId: string, conversationId: string, event: SessionEvent): void;
  since(tenantId: string, conversationId: string, afterEventId: EventId): SessionEvent[];
  latestEventId(tenantId: string, conversationId: string): EventId | null;
}
```

#### Session Events Endpoint 语义

```
GET /api/v1/sessions/:conversationId/events?last_event_id=42

响应场景：
- cursor 命中：返回 eventId > 42 的事件列表
- cursor 过旧（超出 ring buffer）：返回 { kind: "stream_resync_required" }
- 无 cursor：返回最近 N 条事件
```

#### 测试点

- 正常流：主 stream 事件带 `eventId` 单调递增，`executionId` 一致
- 断线后 replay：带 `last_event_id` 重连，收到缺失事件
- cursor gap：cursor 过旧，收到 `stream_resync_required`
- 并发两个 turn：两个 `executionId` 不同，事件可区分

#### 风险

- `runtimeEventStore` 内存 ring buffer 大小需合理设置（建议 per-conversation 最近 200 条）
- `eventId` 单调递增需要 per-conversation 计数器，并发写需注意 async 边界

---

### Phase 2 — 执行与传输解耦（Detached Runner）

**目标**：将 `AgentStreamLoop` 拆分为 `AgentExecutionRunner`（纯执行，产生事件）和 `HttpStreamAdapter`（订阅事件，投影为 SSE）。主 stream 断开后 runner 继续执行到 terminal 状态。

**依赖**：Phase 1（需要 `RuntimeEventStore` 和 `executionId`）。

#### 涉及文件

| 文件 | 改动性质 |
|------|---------|
| `src/agentExecutionRunner.ts` | 新增文件：纯执行逻辑，不持有 reply，产生 `SessionEvent` 写入 `RuntimeEventStore` |
| `src/agentStreamLoop.ts` | 重构为 `HttpStreamAdapter`：订阅 `RuntimeEventStore`，投影为 SSE；主 stream 断开不取消 runner |
| `src/executionStateStore.ts` | 新增文件：存储 active execution 状态（`executionId`、`status`、`startedAt`、`updatedAt`） |
| `src/server.ts` | 新增 `POST /api/v1/sessions/:conversationId/executions/:executionId/abort` |

#### 主要接口/类型

```typescript
// executionStateStore.ts
type ExecutionStatus = "running" | "waiting_approval" | "completed" | "failed" | "aborted";

interface ExecutionState {
  executionId: ExecutionId;
  conversationId: string;
  tenantId: string;
  status: ExecutionStatus;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  abortController: AbortController;  // 内部持有，不序列化
}

interface ExecutionStateStore {
  create(state: ExecutionState): void;
  get(tenantId: string, conversationId: string): ExecutionState | undefined;
  getById(executionId: ExecutionId): ExecutionState | undefined;
  updateStatus(executionId: ExecutionId, status: ExecutionStatus): void;
  remove(executionId: ExecutionId): void;
}

// agentExecutionRunner.ts
class AgentExecutionRunner {
  async run(input: RunnerInput, eventStore: RuntimeEventStore, signal: AbortSignal): Promise<void>
  // 不持有 reply，不写 HTTP，只写 eventStore
}
```

#### 解耦边界

```
POST /api/v1/agent/chat/stream
  → 生成 executionId
  → ExecutionStateStore.create({ status: "running" })
  → AgentExecutionRunner.run()  ← 在独立 Promise 中启动，不 await
  → HttpStreamAdapter.subscribe(conversationId, reply)  ← 订阅事件，写 SSE
  → reply 断开时：HttpStreamAdapter 停止写，但 runner 继续

POST /api/v1/sessions/:conversationId/executions/:executionId/abort
  → ExecutionStateStore.getById(executionId).abortController.abort()
```

#### 测试点

- 主连接断开后，runner 继续执行，最终消息落库
- 重连后通过 session events 收到 `final_answer` / `agent_end`
- abort 端点调用后，runner 在下一个 await 点检查 signal 并终止
- 区分"连接断开"和"用户取消"的 trace 事件

#### 风险

- Node.js 单进程：runner 作为 floating Promise，需确保未捕获异常不崩溃进程（加 `.catch` 兜底）
- `AbortSignal` 需在 runner 的每个 `await` 点检查（model call、tool execute、beforeToolUse）
- 内存泄漏：completed execution 需及时从 `ExecutionStateStore` 清理（建议 terminal 后保留 5 分钟）

---

### Phase 3 — 运行锁 + 审批恢复

**目标**：同会话只允许一个 active execution；`REQUIRE_APPROVAL` 真正暂停 runner；审批后恢复执行。

**依赖**：Phase 2（需要 `ExecutionStateStore` 和 detached runner）。

#### 涉及文件

| 文件 | 改动性质 |
|------|---------|
| `src/executionStateStore.ts` | 增加 `getActive(tenantId, conversationId)` 和冲突检测逻辑 |
| `src/agentExecutionRunner.ts` | `REQUIRE_APPROVAL` 时：更新 status 为 `waiting_approval`，发 `approval_requested` 事件，`await approvalPromise` |
| `src/approvalStore.ts` | 新增文件：存储 pending approval（`executionId + toolCallId → Promise resolve/reject`） |
| `src/server.ts` | 新增 `POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId`；现有 `ask-user reply` 端点进入兼容期 |

#### 主要接口/类型

```typescript
// approvalStore.ts
interface PendingApproval {
  executionId: ExecutionId;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  approvalToken: string;
  createdAt: string;
  resolve: (action: ApprovalAction) => void;
  reject: (reason: string) => void;
}

interface ApprovalAction {
  action: "approve" | "reject" | "revise";
  revisedArguments?: Record<string, unknown>;
}

// server.ts 新增端点
// POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId
// Body: { action: "approve" | "reject" | "revise", revisedArguments?: {...} }
```

#### 运行锁语义

```
新请求到达时：
  active execution status = "running"          → 返回 409 Conflict
  active execution status = "waiting_approval" → 返回 409 with hint "pending approval"
  active execution status = terminal           → 允许启动新 execution
  无 active execution                          → 允许启动
```

#### 审批恢复流程

```
runner 遇到 REQUIRE_APPROVAL：
  1. 创建 approvalPromise（Promise<ApprovalAction>）
  2. ApprovalStore.create({ executionId, toolCallId, resolve, reject })
  3. ExecutionStateStore.updateStatus(executionId, "waiting_approval")
  4. RuntimeEventStore.append("approval_requested", { toolCallId, toolName, ... })
  5. await approvalPromise  ← runner 在此暂停

用户调用 approval 端点：
  1. ApprovalStore.get(executionId, toolCallId).resolve({ action, revisedArguments })
  2. runner 从 await 恢复，执行工具，继续 loop
```

#### 测试点

- 同会话并发请求：第二个请求收到 409
- approve：工具执行，loop 继续，最终消息落库
- reject：写 `USER_REJECTED` tool result，loop 继续（模型解释）
- revise：使用 revisedArguments 执行工具，loop 继续
- 页面刷新后：通过 session events 看到 `approval_requested`，仍可调用 approval 端点

#### 风险

- `approvalPromise` 需要 timeout 机制（Phase 4 补充），否则 runner 永久挂起
- 现有 `AskUserStore` 和 `ask-user reply` 端点需要迁移或兼容处理（建议 Phase 3 同步废弃旧端点，或保留为 alias）
- server 重启后 `ExecutionStateStore` 清空（内存实现），重启后 active execution 自动消失，客户端需处理

---

### Phase 4 — 稳定性、错误分类与运维能力

**目标**：统一 terminal error class；补齐 approval timeout / execution timeout；HistoryStore 分层（草稿不污染终态）；合并两套 loop；补充 metrics。

**依赖**：Phase 1-3 全部完成。

#### 4.1 统一 Terminal Error Class

```typescript
// types.ts 新增
type RuntimeTerminalError =
  | "MODEL_ERROR"              // provider 超时、空响应、限流
  | "TOOL_ERROR"               // Java tool error、MCP tool error（非 degrade）
  | "POLICY_DENY"              // policy 拒绝，且策略决定终止 loop
  | "APPROVAL_TIMEOUT"         // 用户长期未审批
  | "STEP_BUDGET_EXHAUSTED"    // 多步循环超限（升级为结构化错误）
  | "EVENT_REPLAY_GAP"         // cursor 无法补齐（session events 层返回）
  | "EXECUTION_ABORTED"        // 用户主动 abort
  | "EMPTY_MODEL_RESPONSE";    // 模型返回空响应
```

每个 terminal error 必须：
1. 写入 `RuntimeEventStore`（`agent_end` 事件携带 `errorClass`）
2. 写入 `ExecutionStateStore`（`status: "failed"` + `errorClass`）
3. 通过 session events 可被客户端观察

#### 4.2 HistoryStore 分层

```
当前：所有消息（含 PENDING_APPROVAL、POLICY_DENY 草稿）→ HistoryStore

目标分层：
  RuntimeEventStore   → token delta、tool progress、approval event（短期，Phase 1 引入）
  ExecutionStateStore → active execution、status、snapshot（Phase 2 引入）
  HistoryStore        → 只写 terminal 消息（user input、final assistant answer、completed tool result）

规则：
  - PENDING_APPROVAL 不写 HistoryStore，只写 RuntimeEventStore
  - POLICY_DENY 写结构化 tool result 到 HistoryStore（已是终态）
  - final_answer 成功后，assistant message 写 HistoryStore
  - 压缩只处理 HistoryStore 的稳定消息
```

#### 4.3 合并两套 Loop

- `agentExecutionRunner.ts`（Phase 2 引入）承载全部执行逻辑
- `agentLoop.ts` 退化为 runner 的同步包装（用于测试和非 stream 场景）
- `agentStreamLoop.ts` 退化为 `HttpStreamAdapter`（Phase 2 引入）
- 删除两套 loop 中重复的 `runToolBatch` / `executeTool` / `callModel` / `autoCompress`

#### 4.4 Timeout 补充

```typescript
const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000;  // 30 分钟，可配置
const EXECUTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟，可配置

// approval 超时后 reject approvalPromise → APPROVAL_TIMEOUT terminal error
// execution 超时后 abort signal → EXECUTION_ABORTED terminal error
```

#### 4.5 Metrics / Observability 补充

复用现有 `postTrace`，在 trace event attributes 中补充：

| Metric | 来源 |
|--------|------|
| `active_executions_count` | `ExecutionStateStore.size()` |
| `approval_wait_time_ms` | approval resolve 时间 - `approval_requested` 时间 |
| `tool_timeout_count` | MCP timeout 计数 |
| `replay_gap_count` | `stream_resync_required` 发送次数 |
| `execution_duration_ms` | `endedAt - startedAt` |

#### 涉及文件（Phase 4 汇总）

| 文件 | 改动性质 |
|------|---------|
| `src/types.ts` | 新增 `RuntimeTerminalError` 类型 |
| `src/agentExecutionRunner.ts` | 统一错误分类，检查 abort signal，写 terminal error 到 eventStore |
| `src/history.ts` | 分层规则：只写 terminal 消息；移除 PENDING_APPROVAL 写入 |
| `src/agentLoop.ts` | 重构为 runner 的同步包装，删除重复逻辑 |
| `src/agentStreamLoop.ts` | 重构为 HttpStreamAdapter，删除重复逻辑 |
| `src/executionStateStore.ts` | 增加 timeout 定时器、metrics 收集 |

#### 测试点

- 模型超时：`MODEL_ERROR` terminal event，session events 可观察
- 工具超时：`TOOL_ERROR` terminal event（区别于 MCP degrade）
- approval timeout：`APPROVAL_TIMEOUT` terminal event，runner 终止
- execution timeout：`EXECUTION_ABORTED` terminal event
- compression 触发时只处理 HistoryStore 稳定消息，不处理 PENDING_APPROVAL
- 合并后 agentLoop（非 stream）行为与之前一致（回归测试）

---

## 三、OpenSpec 门禁要求

以下改动**必须先创建 OpenSpec change，批准后才能实现**：

| 改动 | 所在 Phase | 原因 |
|------|-----------|------|
| 新增 `GET /api/v1/sessions/:conversationId/events` endpoint | Phase 1 | 新增 API 契约，Frontend 需同步适配 |
| 主 stream 事件增加 `eventId` 和 `executionId` 字段 | Phase 1 | 修改现有 SSE 协议，Frontend 需适配 |
| 新增 `stream_resync_required` 事件类型 | Phase 1 | 新增事件类型，Frontend 需处理 |
| 新增 `POST /api/v1/sessions/:conversationId/executions/:executionId/abort` | Phase 2 | 新增 API 契约 |
| 新增 `POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId` | Phase 3 | 新增 API 契约，替换现有 ask-user 端点 |
| 废弃 `POST /api/v1/agent/ask-user/:askUserId/reply` | Phase 3 | 破坏性变更，需兼容期 |
| `REQUIRE_APPROVAL` 改为暂停 runner（而非 continue） | Phase 3 | 改变现有行为语义 |
| HistoryStore 分层（PENDING_APPROVAL 不再写入 HistoryStore） | Phase 4 | 改变持久化语义，影响 session messages API 返回内容 |

**建议 change-id**：`add-execution-lifecycle-and-stream-recovery`

以下改动**不需要 OpenSpec**（内部实现，不改变外部 API）：

- 新增 `RuntimeEventStore`、`ExecutionStateStore`、`ApprovalStore`（内部模块）
- 合并两套 loop 为 runner + adapter（不改变外部 API）
- 统一 terminal error class（只影响 trace events 的 attributes）
- 补充 timeout 定时器（行为变化但属于 bug fix 范畴）

---

## 四、实施顺序与依赖关系

```
Phase 1（事件协议 + ID 体系）
  ↓
Phase 2（执行与传输解耦）
  ↓
Phase 3（运行锁 + 审批恢复）
  ↓
Phase 4（稳定性 + 错误分类 + 合并 loop）
```

Phase 1 和 Phase 2 可以并行准备 OpenSpec，但 Phase 2 实现依赖 Phase 1 的 `RuntimeEventStore`。  
Phase 3 依赖 Phase 2 的 `ExecutionStateStore` 和 detached runner。  
Phase 4 是收尾，依赖前三个 Phase 的基础设施。

---

## 五、验收标准（全部 Phase 完成后）

- 客户端只断开主 stream 时，后端 execution 不被误取消，最终消息落库
- 客户端带 `last_event_id` 重连后，收到缺失事件或明确 `stream_resync_required`
- 同一 conversation 不会并发运行多个未终止 execution
- `REQUIRE_APPROVAL` 在页面刷新后仍可处理（通过 session events 看到 `approval_requested`）
- 工具、模型、policy、event replay gap 都有结构化 `RuntimeTerminalError` 和 trace
- `HistoryStore` 只保存稳定消息，`PENDING_APPROVAL` 草稿不污染最终历史
- 压缩、trace、非关键事件失败不影响 terminal answer 的返回（现有优点保留）
- `agentLoop.ts` 和 `agentStreamLoop.ts` 不再有重复的 `runToolBatch` / `executeTool` 逻辑
