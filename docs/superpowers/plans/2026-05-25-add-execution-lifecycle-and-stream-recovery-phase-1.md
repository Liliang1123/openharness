# Phase 1: Event Protocol & ID System & Session Events SSE

> Change: `add-execution-lifecycle-and-stream-recovery`  
> Phase: **1 / 4**（事件协议与 ID 体系；不改 execution lifecycle，不改 approval 语义）  
> Approval: ✅ 用户已批准 OpenSpec proposal  
> 实施方式：inline TDD（test-driven development）

---

## Goal

让 Agent Runtime 的 SSE 事件全部携带 `eventId` / `executionId` / `conversationId` / `traceId` / `requestId` / `createdAt`，新增 `RuntimeEventStore` 与 session events SSE endpoint。**本 Phase 不动 execution lifecycle、不动 approval 语义、不动 HistoryStore 写入侧**——这些留给 Phase 2/3/4。

具体覆盖 OpenSpec change 的 §A 范围（tasks 1.1-1.8）。

---

## Non-Goals（本 Phase 不做）

- 不引入 `AgentExecutionRunner`（Phase 2）
- 不引入 `ExecutionStateStore` 或 active execution lock（Phase 2/3）
- 不改 `REQUIRE_APPROVAL` 写 `PENDING_APPROVAL` 的现有行为（Phase 3）
- 不改 HistoryStore 写入侧（Phase 4）
- 不动 `agentLoop.ts`（同步路径，本 Phase 不接入 RuntimeEventStore）

---

## Files

### New

| 文件 | 用途 |
|------|------|
| `agent-runtime/src/runtimeEventStore.ts` | InMemoryRuntimeEventStore 实现 |
| `agent-runtime/src/sessionEvent.ts` | SessionEvent 类型 + helpers（eventId 生成器、createdAt 注入） |
| `agent-runtime/test/runtimeEventStore.test.ts` | 单测：append / since / latestEventId / hasEvent / subscribe / replay+live ordering / per-conversation isolation |
| `agent-runtime/test/sessionEventsApi.test.ts` | 集成测试：replay / live / gap / heartbeat / disconnect tolerance |
| `agent-runtime/test/streamEventIds.test.ts` | 集成测试：主 stream 事件携带新 id 字段 |

### Modified

| 文件 | 改动 |
|------|------|
| `agent-runtime/src/types.ts` | 新增 `ExecutionId`、`EventId`、`RuntimeEventKind`、`SessionEvent` 类型导出 |
| `packages/shared-schema/src/index.ts` | 新增 `RuntimeEventKindSchema` / `SessionEventSchema` |
| `packages/shared-schema/test/schema.test.ts` | 新增 schema 测试 |
| `agent-runtime/src/agentStreamLoop.ts` | 注入 `RuntimeEventStore`；每次 `send` 同时 append 到 store；事件 data 加新字段；保留所有旧 SSE 事件名 |
| `agent-runtime/src/server.ts` | 创建 `RuntimeEventStore` 单例；新增 `GET /api/v1/sessions/:conversationId/events?last_event_id=...` SSE endpoint |
| `frontend/src/api.ts` | 解析新字段（兼容：未知字段忽略）；现有 SSE event 类型加可选字段 |
| `frontend/test/App.test.tsx` | 加一条断言：未知字段不破坏 parser |

### Untouched (explicit)

- `agent-runtime/src/agentLoop.ts`（同步路径，Phase 2 才接入）
- `agent-runtime/src/history.ts`（写入侧不变）
- `agent-runtime/src/askUserStore.ts`（Phase 3）
- `agent-runtime/src/server.ts` 现有 endpoints（除新增 events endpoint 外）

---

## Test Commands

```bash
# Per-package
cd agent-runtime && npx vitest run
cd agent-runtime && npx tsc --noEmit
cd packages/shared-schema && npx vitest run

# Whole repo
cd .. && pnpm typecheck
cd .. && pnpm --filter @openharness/shared-schema test \
       && pnpm --filter @openharness/agent-runtime test \
       && pnpm --filter @openharness/frontend test

# OpenSpec
npx openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive

# Manual E2E（Phase 1 只验证事件 id 与 replay 协议）
# 1. 启动 backend + agent-runtime
cd backend && set -a && . ../.env && set +a && nohup mvn spring-boot:run -q > /tmp/oh-be.log 2>&1 &
cd agent-runtime && nohup npx tsx src/index.ts > /tmp/oh-ag.log 2>&1 &
sleep 15

# 2. 触发主 stream（mock fixture），抓取事件检查 eventId/executionId
curl -N -X POST http://localhost:3001/api/v1/agent/chat/stream \
  -H "Content-Type: application/json" \
  -H "X-User-Id: u1" -H "X-Tenant-Id: t1" -H "X-Trace-Id: tr1" \
  -H "X-Mock-Fixture: tool-time" \
  -d '{"conversationId":"conv-phase1-1","message":"现在几点？"}'

# 3. 用 last_event_id 断点重连验证 replay
curl -N "http://localhost:3001/api/v1/sessions/conv-phase1-1/events?last_event_id=conv-phase1-1:3" \
  -H "X-Tenant-Id: t1"
```

---

## Design Decisions（Phase 1 局部）

### EventId 格式

`${tenantId}::${conversationId}:${seq}`，seq 为 per-(tenant, conversation) 单调递增 64-bit 整数。理由：
- 跨租户隔离（即使 conversationId 同名）
- 可读，便于人工 debug
- 单调严格递增，比较廉价

外部 URL 使用形式 `last_event_id={tenantId}::{conversationId}:{seq}`。

### SessionEvent shape

```typescript
type RuntimeEventKind =
  | "agent_start" | "model_call_start" | "model_call_end"
  | "tool_call" | "tool_result"
  | "step_budget_exhausted" | "final_answer" | "agent_end"
  | "stream_done" | "stream_error" | "stream_resync_required"
  | "approval_requested";  // 协议预留，Phase 1 不发

interface SessionEvent {
  eventId: string;          // tenant::conv:seq
  executionId: string;      // UUID
  conversationId: string;
  tenantId: string;
  traceId: string;
  requestId: string;
  createdAt: number;        // Date.now()
  kind: RuntimeEventKind;
  data: Record<string, unknown>;  // event-specific payload (existing fields preserved)
}
```

### 兼容性策略

主 stream SSE 写出格式 **保持不变**（事件名 + data）：

```
event: agent_start
data: { "traceId": "...", "conversationId": "...", "eventId": "...", "executionId": "...", "tenantId": "...", "requestId": "...", "createdAt": 1779700000000 }
```

新字段 `eventId` / `executionId` / `tenantId` / `requestId` / `createdAt` 加入 data，旧字段如 `stepIndex` / `hasToolCalls` / `toolName` 保持。前端旧 parser 不消费新字段也不报错。

### 单线程 JS 的 replay+subscribe 顺序保证

无需显式 mutex：JS 事件循环单线程保证 `since()` 与 `subscribe()` 之间不会被 `append` 插入。HTTP handler 顺序：

```typescript
// 1. 同一 tick 内完成 since + subscribe
const replayed = store.since(tenantId, conversationId, lastEventId);
const unsubscribe = store.subscribe(tenantId, conversationId, (event) => sendSSE(event));
// 2. 发送 replay（可能 yield via socket write）
for (const e of replayed) sendSSE(e);
// 3. live 事件由 listener 通过 sendSSE 直接转发
```

### Gap detection

`since(afterEventId)` 在游标找不到时返回空数组。caller 用 `hasEvent(afterEventId)` 判断是真空还是 gap：

```typescript
if (lastEventId && !store.hasEvent(tenantId, convId, lastEventId)) {
  // gap
  sendSSE({ kind: "stream_resync_required", data: { lastAvailableEventId: store.latestEventId(...) }});
  reply.raw.end();
  return;
}
```

### Heartbeat

30s 无事件时发 SSE comment line `: heartbeat\n\n`（不是 event line，frontend 自动忽略）。用 `setInterval` + clean-up on disconnect。

---

## Steps (TDD)

### Step 1：types & schemas（红→绿）

1. 写 `packages/shared-schema/test/schema.test.ts` 新 case：`SessionEventSchema.parse(...)` 接受合法 event、拒绝缺失必填字段。**RED** ✅
2. 在 `packages/shared-schema/src/index.ts` 新增 `RuntimeEventKindSchema` + `SessionEventSchema`。**GREEN** ✅
3. 在 `agent-runtime/src/types.ts` 导出 `ExecutionId` / `EventId` / `RuntimeEventKind` / `SessionEvent`。
4. 跑 `pnpm --filter @openharness/shared-schema test` 全绿。

### Step 2：RuntimeEventStore（红→绿→重构）

5. 写 `agent-runtime/test/runtimeEventStore.test.ts`，cases：
   - `append` returns event with valid eventId
   - `since(null)` returns all events
   - `since(eventId)` returns events strictly after
   - `since(unknownEventId)` returns `[]`
   - `hasEvent(eventId)` true/false
   - `latestEventId` updates after append
   - `subscribe` listener receives appended events
   - `subscribe` returns unsubscribe that stops listener
   - per-conversation isolation: appending to convA doesn't notify convB subscriber
   - per-tenant isolation: same convId across tenants doesn't cross-leak
   
   **RED** ✅
6. 实现 `agent-runtime/src/runtimeEventStore.ts`：`InMemoryRuntimeEventStore`。**GREEN** ✅
7. 跑 `npx vitest run runtimeEventStore` 全绿。

### Step 3：agentStreamLoop 接入 RuntimeEventStore（红→绿）

8. 写 `agent-runtime/test/streamEventIds.test.ts`，cases：
   - 主 stream 每个 SSE event data 包含 `eventId` / `executionId` / `conversationId` / `tenantId` / `traceId` / `requestId` / `createdAt`
   - 同一 execution 的 `executionId` 一致
   - `eventId` 在同一 conversation 内严格递增
   - 跨 conversation 的 eventId 不重置（独立空间但都从 1 开始）
   - 旧字段保留：`agent_start` 仍有 `traceId` / `conversationId`；`model_call_end` 仍有 `stepIndex` / `hasToolCalls`；`tool_call` 仍有 `toolName`
   
   **RED** ✅
9. 修改 `agent-runtime/src/agentStreamLoop.ts`：构造器注入 `RuntimeEventStore`；新建一个 `emit(kind, data)` helper 同时调用 `runtimeEventStore.append` 与 `reply.raw.write`；event data 注入 6 个新字段。
10. 修改 `agent-runtime/src/server.ts`：创建 `RuntimeEventStore` 单例传入 `AgentStreamLoop`。
11. 跑 `npx vitest run` 全绿（确保旧测试不回归）。

### Step 4：session events SSE endpoint（红→绿）

12. 写 `agent-runtime/test/sessionEventsApi.test.ts`，cases：
    - 连接后已存在事件全部 replay（`last_event_id` 缺省）
    - 给定 `last_event_id` 只 replay 之后的事件
    - 连接后追加新事件，subscriber 收到
    - `last_event_id` 不存在 → 收到 `stream_resync_required` event 后断开
    - 多 subscriber 同时收 live 事件
    - 跨 tenant 不串
    
    **RED** ✅
13. 在 `agent-runtime/src/server.ts` 添加 `GET /api/v1/sessions/:conversationId/events`：headers 设 SSE，replay → subscribe → heartbeat 30s。disconnect 清理 listener + heartbeat timer。
14. 跑测试全绿。

### Step 5：frontend 兼容（红→绿）

15. 在 `frontend/test/App.test.tsx` 加 case：mock SSE response 含未知字段 `eventId` / `executionId`，断言 App 渲染不出错。
16. 检查 `frontend/src/api.ts` 类型定义：新字段加为 optional，必要时显式忽略。
17. 跑 `pnpm --filter @openharness/frontend test` 全绿。

### Step 6：完整验证

18. `pnpm test`（全库）→ 全绿
19. `pnpm typecheck` → 通过
20. `npx openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive` → 通过
21. 手动 E2E：用 mock fixture `tool-time` 触发主 stream，抓 `eventId` 单调递增；新开 SSE 连接给一个错的 `last_event_id` 验证 `stream_resync_required`。
22. 把 tasks.md 中 1.1-1.8 的 `- [ ]` 改为 `- [x]`。

---

## Verification（must run before completion claim）

| 项 | 命令 | 预期 |
|----|------|------|
| TS unit + integration | `cd agent-runtime && npx vitest run` | 现有 67 + 新增 3 个 test files |
| TS typecheck | `cd agent-runtime && npx tsc --noEmit` | 0 错误 |
| shared-schema | `cd packages/shared-schema && npx vitest run` | 现有 9 + 新 1 |
| Frontend | `cd frontend && npx vitest run && npx tsc --noEmit` | 现有 9 仍绿 |
| OpenSpec | `npx openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive` | valid |
| 全库 | `pnpm test && pnpm typecheck` | 全绿 |
| 手动 E2E | 见 Test Commands §3 | `eventId` 严格递增；gap 触发 resync |

---

## Risks for this Phase

| 风险 | 影响 | Mitigation |
|------|------|-----------|
| `tsc` 类型回归（types.ts 新增 union） | build 失败 | TDD 顺序确保 schema 先就位 |
| 旧 SSE 测试断言事件 data 完全相等 | 回归 | 检查现有断言用 `toMatchObject` 而非 `toEqual` |
| Frontend SSE parser 严格 typecheck | type 错 | api.ts 字段全 optional |
| 前端 `last_event_id` 协议未实现 | E2E 部分跑不通 | 本 Phase 不强制 frontend reconnect 逻辑，留给后续 |

---

## Done Criteria

- [ ] tasks.md 中 1.1 ~ 1.8 全部 `- [x]`
- [ ] 全部 test commands 全绿
- [ ] 手动 E2E：主 stream 看到带 `eventId` 的事件 + 假 cursor 收到 `stream_resync_required`
- [ ] 新增 3 个 test files（runtimeEventStore / sessionEventsApi / streamEventIds）
- [ ] OpenSpec change 状态：active（仍未 archive，等 Phase 2-4）
