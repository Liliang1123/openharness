# Superpowers Plan: implement-p0b-hookable

> Date: 2026-05-20
> Status: Approved
> Change: `openspec/changes/implement-p0b-hookable`

## Scope

Frontend SSE 展示 + ApprovalCard + P0b 负向集成测试。

## Steps

### Step 1: Frontend `api.ts` — SSE 客户端 + replyAskUser

File: `frontend/src/api.ts`

- 新增 `sendAgentChatStream(input, onEvent)` 使用 fetch + ReadableStream 解析 SSE
- 新增 `replyAskUser(askUserId, action, message?)` 调 reply API
- 保留原有 `sendAgentChat` 同步接口

验证: `cd frontend && pnpm typecheck`

### Step 2: Frontend `App.tsx` — SSE 模式渲染

File: `frontend/src/App.tsx`

- 替换 `sendAgentChat` 为 `sendAgentChatStream`
- 用 state 数组收集 SSE 事件，逐步渲染：
  - `model_call_start` → "思考中..."
  - `tool_call` → "调用工具: {toolName}"
  - `tool_result` + status=denied → "工具被拒绝"
  - `tool_result` + status=pending_approval → 渲染 ApprovalCard
  - `final_answer` → 显示最终回答
- Trace 面板展示完整事件列表

验证: `cd frontend && pnpm typecheck`

### Step 3: Frontend `ApprovalCard` 组件

File: `frontend/src/ApprovalCard.tsx`

- Props: `askUserId`, `toolName`, `reason`, `onResolved`
- Approve 按钮 → `replyAskUser(id, "approve")`
- Reject 按钮 → `replyAskUser(id, "reject")`
- 调用后 disable 按钮，显示结果

验证: `cd frontend && pnpm typecheck`

### Step 4: Frontend 测试

File: `frontend/test/App.test.tsx`

- 测试 SSE 事件渲染（mock fetch 返回 SSE 流）
- 测试 ApprovalCard approve/reject 交互

验证: `cd frontend && pnpm test`

### Step 5: P0b 集成测试

File: `integration-tests/test/p0b.integration.test.ts`

- 4.1 deny: 调 policy evaluate with `blocked_tool` → DENY
- 4.2 绕过 403: 直接调 Java execute sensitive 工具无 allow record → 403
- 4.3 batch: 多 toolCalls evaluate → 独立 decisions
- 4.4 幂等: 重复 idempotencyKey → 原结果 + idempotentReplay=true
- 4.5 SSE: POST /api/v1/agent/chat/stream → 验证事件序列

验证: `cd integration-tests && pnpm test` (需 backend 运行在 :18080)

### Step 6: 全量验证

```bash
cd frontend && pnpm typecheck && pnpm test
cd ../agent-runtime && pnpm typecheck && pnpm test
cd ../backend && mvn compile
```

## Execution Mode

Inline sequential — 步骤间有依赖。
