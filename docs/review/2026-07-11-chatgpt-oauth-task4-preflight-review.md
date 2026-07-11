# ChatGPT/Codex OAuth Task 4 Preflight Review

## 结论

需修改。Task 4 当前不能按现有计划进入实现：Codex app-server v2 的动态工具调用是 app-server 在同一个 turn 内向宿主发起的 JSON-RPC server request，宿主必须返回 `DynamicToolCallResponse` 后 turn 才能继续；OpenHarness 当前契约则要求 Java 模型调用先返回 `ModelChatResponse.message.toolCalls`，随后由 TS Runtime 完成审批、执行并发起下一轮模型调用。两种生命周期不等价，直接做字段转换无法同时保留工具审批、执行归属、取消和 turn 连续性。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/tasks.md)
- [Superpowers implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Java model contracts](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [TS Runtime agent execution loop](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)
- [Generated Codex v2 protocol schema](file:///private/tmp/openharness-codex-app-server-schema/codex_app_server_protocol.v2.schemas.json)
- [DynamicToolCallParams schema](file:///private/tmp/openharness-codex-app-server-schema/DynamicToolCallParams.json)
- [DynamicToolCallResponse schema](file:///private/tmp/openharness-codex-app-server-schema/DynamicToolCallResponse.json)

## 主要发现

### 阻断：工具调用生命周期不兼容

- Codex v2 `item/tool/call` 请求包含 `callId`、`threadId`、`turnId`、工具名和参数，宿主需要在同一 JSON-RPC 会话中返回带 `success` 与 `contentItems` 的响应。它不是一个可以在 `turn/completed` 后再回填的普通响应字段。
- OpenHarness 的 [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/model/Contracts.java#L21) 将工具调用建模为 `AgentMessage.toolCalls`；[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts#L221) 在模型调用已经结束后才校验、审批并执行工具，然后开始下一轮模型调用。
- 因此，将 `item/tool/call` 暂存为 `ToolCall` 并提前返回会让 app-server turn 等不到响应；先回伪造结果再返回 `ToolCall` 会让 Codex 与 Runtime 看到不同的工具结果；在 Java 内直接执行工具会绕过现有 TS Runtime 的策略、审批、追踪和执行归属。

### 高风险：现有设计把“字段保留”误当成“交互语义保留”

[design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/design.md#L65) 要求在现有 `ModelChatRequest` / `ModelChatResponse` 边界上保留 tool calls，但没有定义 app-server server request 如何跨越同步 Java HTTP 响应、TS Runtime 审批和工具结果回填。Task 4 的 fake fixture 即使能验证 JSON 字段，也无法证明运行时工具循环成立。

### 中风险：普通消息、流、reasoning、usage 与取消仍可转换，但不能独立宣称 Task 4 完成

`thread/start`、`turn/start`、`item/agentMessage/delta`、`item/reasoning/textDelta`、`thread/tokenUsage/updated`、`turn/completed` 和 `turn/interrupt` 可以形成窄 IPC 客户端；然而 Task 4 的验收明确包含 tools。只实现无工具路径并勾选 Task 4 会产生测试覆盖与批准契约不一致。

## 最终建议

推荐修订为“异步工具桥接”方案：

1. Java `CodexAppServerClient` 保持 app-server turn 与 `item/tool/call` server request 挂起，并把待处理工具调用暴露为受鉴权、可关联 `requestId/threadId/turnId/callId` 的内部状态。
2. TS Runtime 继续拥有工具策略、审批与执行；执行结果通过新增的内部回填接口送回 Java，由 Java 生成 `DynamicToolCallResponse`，同一 app-server turn 随后继续。
3. 明确定义断线、审批超时、取消、重复回填、服务重启和敏感字段脱敏语义；禁止 Java 自行执行工具或自动批准。
4. 更新 OpenSpec design/spec delta/tasks 与 Superpowers plan，增加跨 Java/TS 的 RED 测试和恢复测试，重新完成 Preflight Review 后再实现。

若不接受跨服务异步桥接，次选方案是将首版 `openai-codex` 明确限制为无工具模型调用，并在收到 `item/tool/call` 时 fail closed；这同样是用户可见能力收缩，必须更新并重新批准 OpenSpec。不得用伪工具结果或把工具执行迁入 Java 作为临时兼容。

## 后续门禁

- 仍使用 active change `add-chatgpt-oauth-auth`，但必须先显著更新其 design/spec delta/tasks 并取得用户重新批准。
- 未批准修订前，不创建 `CodexAppServerClient` 生产实现，不勾选 Task 4，不推进 Task 5，不运行真实 OAuth smoke。
- 修订后必须重新生成或更新可执行计划并做 strict Preflight Review；实现继续遵守 TDD、独立 Review、secret-canary 与 final verification 门禁。
- 本次未修改项目规则，未修改生产代码，也未同步 dashboard；change 状态仍为 `proposed`/active implementation，不能标记 verified。
