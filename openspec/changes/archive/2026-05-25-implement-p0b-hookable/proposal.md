# Change: Implement P0b Hookable

## Why
P0a 已验证双运行时边界和同步 agent loop。P0b 需要把 beforeToolUse hook、policy evaluate、SSE 流式、ask_user 审批流接上，使 harness 具备真正的"不可绕过"安全能力。

## What Changes
- **Backend**: 新增 `POST /api/v1/policies/tool-review/evaluate`（已实现）；`/api/v1/tools/execute` 防绕过校验（已实现）
- **Agent-runtime**: `beforeToolUse` 调 Java policy evaluate（已实现）；SSE 流式端点 `POST /api/v1/agent/chat/stream`（已实现）；`ask_user` pending/resume 内存结构 + reply API（已实现）
- **Frontend**: SSE 事件展示 + ApprovalCard 最小版（**待实现**）
- **Integration tests**: P0b 负向测试覆盖 deny、绕过 403、幂等、batch evaluate（**待实现**）

## Impact
- Affected specs: 无现有 spec（首次创建 `agent-sse`、`policy-evaluate`、`ask-user` capabilities）
- Affected code:
  - `backend/src/main/java/org/openharness/backend/api/PolicyController.java`
  - `backend/src/main/java/org/openharness/backend/service/PolicyService.java`
  - `backend/src/main/java/org/openharness/backend/service/ToolExecutionService.java`
  - `agent-runtime/src/beforeToolUse.ts`
  - `agent-runtime/src/agentStreamLoop.ts`
  - `agent-runtime/src/askUserStore.ts`
  - `agent-runtime/src/server.ts`
  - `frontend/src/App.tsx`
  - `frontend/src/api.ts`
  - `integration-tests/test/p0b.integration.test.ts`

## Status
Tasks #1–#5 已实现（在 proposal 审批前完成，需追认）。Tasks #6–#7 待审批后实施。
