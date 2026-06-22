## 1. Backend — Policy & Defense (已完成)
- [x] 1.1 `POST /api/v1/policies/tool-review/evaluate`：默认 ALLOW，`blocked_` 前缀 DENY，skill requiresApprovalFor → REQUIRE_APPROVAL
- [x] 1.2 `/api/v1/tools/execute` 防绕过：sensitive/destructive 工具无 allow record 返回 403
- [x] 1.3 CatalogService 新增 `submit_payment` sensitive 工具

## 2. Agent-runtime — Hook & Stream (已完成)
- [x] 2.1 `beforeToolUse` 批量调 Java policy evaluate，按 decision 分流
- [x] 2.2 `POST /api/v1/agent/chat/stream` SSE 端点，emit agent_start/model_call_start/model_call_end/tool_call/tool_result/final_answer
- [x] 2.3 `AskUserStore` 内存 pending 结构
- [x] 2.4 `POST /api/v1/agent/ask-user/:askUserId/reply` 路由（approve/reject/revise）

## 3. Frontend — SSE + ApprovalCard (已完成)
- [x] 3.1 `api.ts` 新增 `sendAgentChatStream` SSE 客户端 + `replyAskUser` 调用
- [x] 3.2 `App.tsx` 切换为 SSE 模式，逐步展示 model_call/tool_call/tool_result/final_answer 事件
- [x] 3.3 `ApprovalCard` 组件：展示 pending_approval 事件，提供 Approve/Reject 按钮
- [x] 3.4 Frontend 测试覆盖 SSE 事件渲染和 ApprovalCard 交互

## 4. Integration Tests — P0b 负向 (已完成)
- [x] 4.1 deny 规则触发 `tool_result(rejected)`
- [x] 4.2 绕过 TS 直调 Java sensitive 工具返回 403 `POLICY_DENY`
- [x] 4.3 batch evaluate：多个 toolCalls 一次响应，ALLOW 执行 + DENY 拒绝
- [x] 4.4 重复幂等键返回原结果
- [x] 4.5 SSE 端点端到端验证（事件序列正确性）
