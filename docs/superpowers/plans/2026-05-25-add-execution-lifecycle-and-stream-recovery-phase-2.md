# Phase 2: Detached Runner + ExecutionStateStore + Abort API

> Change: `add-execution-lifecycle-and-stream-recovery`  
> Phase: **2 / 4**  
> Approval: ✅ 父 OpenSpec 已批准；Phase 1 已完成验证  
> 实施方式：inline TDD

---

## Goal

把"执行"与"事件传输"解耦。HTTP 连接生命周期不再决定 execution 生命周期：

1. 新增 `AgentExecutionRunner` 承载所有 loop 执行逻辑，**不持有 `FastifyReply`**；只写 `RuntimeEventStore` 与 `HistoryStore`。
2. 新增 `ExecutionStateStore` 维护 `executionId → state`（含 `AbortController`）。
3. `AgentStreamLoop` 退化为 SSE adapter：launch runner（不 await）+ subscribe runtimeEventStore + 转发 reply。客户端断开仅取消订阅，不取消 runner。
4. 新增 `POST /api/v1/sessions/:conversationId/executions/:executionId/abort`。
5. Loop 在每个 step 边界检查 abort signal，aborted 时发 `stream_error` + `errorClass: "EXECUTION_ABORTED"`，状态 `aborted`。

覆盖 OpenSpec change §B "Detached Runner" 与 tasks 2.1-2.6。

---

## Non-Goals（本 Phase 不做）

- 不实现 active execution lock（Phase 3：`409 EXECUTION_ALREADY_RUNNING`）
- 不实现 approval recovery / waiting_approval 状态（Phase 3）
- 不改 `agentLoop.ts` 同步路径（Phase 4 合并）
- 不改 HistoryStore 写入侧（Phase 4）
- 不实现 execution timeout（Phase 4）
- AbortController 信号**不**穿透到 Java fetch 内部；只在 step 边界检查（Java 调用进行中无法中断）

---

## Files

### New

| 文件 | 用途 |
|------|------|
| `agent-runtime/src/agentExecutionRunner.ts` | Detached runner（loop 逻辑搬迁过来） |
| `agent-runtime/src/executionStateStore.ts` | InMemoryExecutionStateStore + ExecutionState 类型 |
| `agent-runtime/test/agentExecutionRunner.test.ts` | 单测：runner 独立运行；写 runtimeEventStore；正常/abort 状态转移 |
| `agent-runtime/test/detachedStream.test.ts` | 集成：客户端断开 → runner 继续 → final assistant 入 history → 重连 session events 看到 terminal |
| `agent-runtime/test/abortApi.test.ts` | 集成：abort 触发 stream_error；abort 已 terminal 是 no-op |

### Modified

| 文件 | 改动 |
|------|------|
| `agent-runtime/src/types.ts` | 新增 `ExecutionStatus` / `ExecutionState` 导出 |
| `agent-runtime/src/agentStreamLoop.ts` | 重写为 SSE adapter：构造时注入 runner & store；`stream()` 只 launch runner、subscribe store、转发 reply、清理 |
| `agent-runtime/src/server.ts` | 注入 `executionStateStore` 单例；构造 runner；新增 abort endpoint |

### Untouched (explicit)

- `agent-runtime/src/agentLoop.ts`（同步路径不变）
- `agent-runtime/src/runtimeEventStore.ts`（Phase 1 已就绪）
- `agent-runtime/src/history.ts`、`compression.ts`、`beforeToolUse.ts`、`toolRegistry.ts`、`mcpRegistry.ts`（Phase 2 不动）
- 现有 frontend src（runner abort 逻辑暂不接前端）

---

## Test Commands

```bash
# Per-package
cd agent-runtime && npx vitest run
cd agent-runtime && npx tsc --noEmit
# Whole repo
cd .. && pnpm typecheck && pnpm test
# OpenSpec
npx openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive

# Manual E2E
# 1. start services
cd backend && set -a && . ../.env && set +a && nohup mvn spring-boot:run -q > /tmp/oh-be.log 2>&1 &
cd agent-runtime && nohup npx tsx src/index.ts > /tmp/oh-ag.log 2>&1 &
sleep 15

# 2. start a slow stream and disconnect mid-execution
curl -s -N -X POST http://localhost:3001/api/v1/agent/chat/stream \
  -H "Content-Type: application/json" -H "X-User-Id: u1" -H "X-Tenant-Id: t-e2e2" \
  -H "X-Mock-Fixture: tool-time" \
  -d '{"conversationId":"conv-e2e2-1","message":"现在几点？"}' &
CURL_PID=$!
sleep 1
kill $CURL_PID  # disconnect mid-stream

# 3. reconnect via session events, expect to see stream_done
sleep 5
curl -s -N --max-time 5 "http://localhost:3001/api/v1/sessions/conv-e2e2-1/events" -H "X-Tenant-Id: t-e2e2" | grep "^event:"

# 4. verify HistoryStore contains the final assistant message
curl -s "http://localhost:3001/api/v1/sessions/conv-e2e2-1" -H "X-Tenant-Id: t-e2e2" | head -5

# 5. abort test: start a stream, get its executionId from agent_start event, abort it
# (manual; covered by integration test)
```

---

## Design Decisions（Phase 2 局部）

### Decision 1: ExecutionState shape

```typescript
export type ExecutionStatus = "running" | "completed" | "aborted" | "errored";

export interface ExecutionState {
  executionId: ExecutionId;
  conversationId: string;
  tenantId: string;
  status: ExecutionStatus;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  abortController: AbortController;
  endReason?: string;  // e.g. "FINAL_ANSWER" / "EXECUTION_ABORTED" / "EMPTY_MODEL_RESPONSE"
}
```

`waiting_approval` 状态留给 Phase 3。

### Decision 2: ExecutionStateStore API

```typescript
interface ExecutionStateStore {
  create(input: { executionId, conversationId, tenantId }): ExecutionState;
  get(executionId): ExecutionState | null;
  transitionToTerminal(executionId, status: "completed" | "aborted" | "errored", endReason?): ExecutionState | null;
  abort(executionId): boolean;  // calls abortController.abort() if non-terminal; returns true if it changed status
  // Phase 3 will add getActive(tenantId, conversationId)
}
```

### Decision 3: AgentExecutionRunner contract

```typescript
class AgentExecutionRunner {
  constructor(
    javaClient: JavaClient,
    history: HistoryStore,
    mcpRegistry: McpRegistry | undefined,
    runtimeEventStore: RuntimeEventStore,
    executionStateStore: ExecutionStateStore
  );

  /**
   * Starts a new execution. Returns the executionId immediately;
   * the actual loop runs in a background promise that is NOT awaited.
   * The promise resolves when the runner reaches a terminal state and is exposed
   * via `runner.runningPromises.get(executionId)` for tests.
   */
  start(input: AgentExecutionInput): { executionId: ExecutionId; done: Promise<ExecutionState> };
}
```

`start` 同步返回 `executionId`，让 HTTP adapter 立即拿到 ID 并 subscribe。`done` 给测试用。

### Decision 4: Abort signal 传播策略

Phase 2 最小可用：runner 在每个 **step 边界** 检查 `abortController.signal.aborted`：

- step start 前检查 → 已 abort 跳出 loop，状态 `aborted`，发 `stream_error`(`EXECUTION_ABORTED`)
- step 中 Java 调用进行中**不**中断（Java 没暴露 abort 通道；强制中断需要 Phase 4）
- tool batch 各 tool 之间检查
- final_answer 已发出后忽略 abort（execution 已是 terminal）

### Decision 5: AgentStreamLoop 重构

```typescript
async stream(input, reply) {
  const { executionId, done } = runner.start(input);

  // SSE headers + initial replay (empty for new execution, but consistent shape)
  reply.raw.writeHead(200, { ... SSE headers });

  let closed = false;
  const close = () => { ... clean unsubscribe + heartbeat + reply.raw.end() };

  const writeEvent = (e: SessionEvent) => reply.raw.write(`event: ${e.kind}\ndata: ${JSON.stringify({ ...e.data, eventId, executionId, ... })}\n\n`);

  const unsubscribe = runtimeEventStore.subscribe(input.tenantId, input.conversationId, (event) => {
    if (closed) return;
    if (event.executionId !== executionId) return;  // ignore other executions on same conversation (Phase 3 lock will preempt this)
    writeEvent(event);
    if (event.kind === "stream_done" || event.kind === "stream_error") close();
  });

  // Replay any events already in store (in case runner appended very fast)
  for (const e of runtimeEventStore.since(input.tenantId, input.conversationId, null)) {
    if (e.executionId !== executionId) continue;
    writeEvent(e);
    if (e.kind === "stream_done" || e.kind === "stream_error") { close(); return; }
  }

  // Heartbeat
  const hb = setInterval(...);

  // Client disconnect: clean up local resources only; runner continues
  reply.request.raw.on("close", close);

  // Don't await runner.done — handler returns when stream_done arrives via subscriber
  await new Promise<void>(r => { /* resolved by close() */ });
}
```

Hmm — fastify route handlers can't easily return early without ending the response. Strategy: keep handler alive via `await new Promise(r => closePromise = r)` and resolve in `close()`. Detail in implementation.

### Decision 6: Runner 写事件时使用 store.append

Runner 内部的 `send(kind, payload)` 不再写 reply.raw，只写 store：

```typescript
const send = (kind: RuntimeEventKind, payload: Record<string, unknown> = {}) => {
  runtimeEventStore.append(input.tenantId, input.conversationId, {
    executionId,
    conversationId: input.conversationId,
    tenantId: input.tenantId,
    traceId: input.traceId,
    requestId: input.requestId,
    createdAt: Date.now(),
    kind,
    data: payload
  });
};
```

HTTP adapter 通过 subscribe 收到 stamped SessionEvent（含 eventId），格式化为 SSE wire 格式写出。

### Decision 7: Abort endpoint 返回值

```
POST /api/v1/sessions/:conversationId/executions/:executionId/abort

200 OK
{ "executionId": "...", "status": "aborted" }            // 之前 running，已成功 abort
{ "executionId": "...", "status": "completed" }           // 已 terminal，no-op
{ "executionId": "...", "status": "aborted" }             // 已 abort，no-op

404
{ "error": { "errorClass": "EXECUTION_NOT_FOUND" } }     // executionId 未知
```

不区分 conversationId mismatch（按 spec scenario 简化）。

---

## Steps (TDD)

### Step 1: ExecutionStateStore（红→绿）

1. 写 `agent-runtime/test/agentExecutionRunner.test.ts`（先只测 store 部分），cases：
   - `create` returns running state with abortController
   - `get` returns null for unknown id
   - `transitionToTerminal(id, "completed", "FINAL_ANSWER")` updates status + endedAt + endReason
   - `abort(id)` on running → state becomes aborted, returns true
   - `abort(id)` on terminal → no-op, returns false
   
   **RED**
2. 实现 `agent-runtime/src/executionStateStore.ts`。**GREEN**

### Step 2: AgentExecutionRunner（红→绿）

3. 在同一 test file 加 cases：
   - `runner.start({...})` returns executionId immediately (synchronous)
   - background loop appends events to `runtimeEventStore` (assert via `since(null)`)
   - 终止时 `executionStateStore.get(id).status === "completed"`
   - 终止时 `runtimeEventStore` 末尾事件 kind 为 `stream_done`
   - 客户端不调用任何 await，runner 的 `done` promise 仍能 resolve
   - abort 中途调用 → `stream_error(EXECUTION_ABORTED)` 出现，status `aborted`
   
   **RED**
4. 实现 `agent-runtime/src/agentExecutionRunner.ts`。loop 逻辑从 `agentStreamLoop.ts` 搬过来：去掉 reply.raw.write，用 `send` 写 store。在 step 边界检查 abort signal。**GREEN**

### Step 3: AgentStreamLoop 重构为 adapter（红→绿）

5. 写 `agent-runtime/test/detachedStream.test.ts`，cases：
   - 触发主 stream，**不读完 body**就调 reply 等价的客户端断开（用 `payload` + `inject` 不太适合断开模拟，改用 real listen + AbortController on fetch）
   - 等 200ms，检查 store 中已有 `stream_done`（runner 仍跑完）
   - 检查 HistoryStore 包含 final assistant
   - 重连 `GET .../events`，看到 `stream_done`
   
   **RED**
6. 重构 `agentStreamLoop.ts` 为 adapter：launch runner、subscribe store、转发 reply、disconnect 仅清理。**GREEN**
7. 旧 `streamEventIds.test.ts` 应仍绿（事件序列、id 字段、stream_done 都在）；如果有断言依赖 reply.raw 直写顺序的细节，调整为依赖 store 内容。

### Step 4: Abort API（红→绿）

8. 写 `agent-runtime/test/abortApi.test.ts`，cases：
   - 启动 stream（不 await），抓 `agent_start` 事件拿到 executionId，调 abort，等 200ms，断言：
     - response.statusCode === 200，body.status === "aborted"
     - 后续 `since(null)` 包含 `stream_error` 与 `errorClass: "EXECUTION_ABORTED"`
     - executionStateStore 状态 aborted
   - abort 不存在 executionId → 404 `EXECUTION_NOT_FOUND`
   - abort 已 terminal → 200 OK，status "completed"，no-op
   
   **RED**
9. server.ts 添加 `POST /api/v1/sessions/:conversationId/executions/:executionId/abort`。**GREEN**

### Step 5: 全库 verification

10. `cd agent-runtime && npx vitest run` 全绿（baseline 92 + Phase 2 新增）
11. `npx tsc --noEmit` 通过
12. `pnpm test && pnpm typecheck` 全绿
13. `npx openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive` 通过
14. 手动 E2E：见 Test Commands §2-4
15. 把 tasks.md 中 2.1-2.6 改为 `- [x]`

---

## Verification（must run before completion claim）

| 项 | 命令 | 预期 |
|----|------|------|
| TS unit + integration | `cd agent-runtime && npx vitest run` | 现有 92 + 新增 ~12 个 cases |
| TS typecheck | `cd agent-runtime && npx tsc --noEmit` | 0 错误 |
| 全库 | `pnpm test && pnpm typecheck` | 全绿 |
| OpenSpec | `npx openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive` | valid |
| E2E disconnect | curl + kill | 重连 SSE 看到 `stream_done` |
| E2E abort | curl + abort endpoint | `stream_error` + `errorClass: "EXECUTION_ABORTED"` |

---

## Risks for this Phase

| 风险 | 影响 | Mitigation |
|------|------|-----------|
| 重构 agentStreamLoop 后旧测试断言失效 | streamEventIds 回归 | 旧测试只断言"事件序列存在"+"id 字段"；不依赖 reply.raw 直写顺序，应不受影响 |
| HTTP handler 需保持 alive 直到 stream_done | fastify 异步 handler 模式 | 用 `await new Promise(r => closePromise = r)` 直到 close() 调用 |
| AbortController 不穿透 Java fetch | abort 中途 Java 调用仍占用资源 | 文档化为 Phase 2 已知限制；step 边界检查可接受 |
| Runner 错误未捕获导致 unhandled rejection | 进程稳定性 | runner 顶层 try/catch；任何错误 → state errored + stream_error |
| 测试客户端断开模拟难（fastify inject 不支持） | 可能改用 real listen | 用 `app.listen(0)` + native fetch + AbortController 实现 |

---

## Done Criteria

- [ ] tasks.md 中 2.1 ~ 2.6 全部 `- [x]`
- [ ] 全部 test commands 全绿
- [ ] 手动 E2E 两个场景通过：disconnect-survive 与 explicit abort
- [ ] 新增 3 个 test files
- [ ] OpenSpec change 状态：active（仍未 archive，Phase 3 待开始）
