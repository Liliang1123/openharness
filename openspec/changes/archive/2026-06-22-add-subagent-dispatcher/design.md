# Design: Add Subagent Dispatcher

## Context
上一阶段已经落地 `invoke_skill`、`SkillMetadata.fork_agent`、`subagent_model` 与 `forbidden_tools` 等字段。当前非 fork 技能通过 pending injection 注入主上下文；fork 技能需要相反的策略：把复杂执行隔离到子 Agent 内部，并把最终摘要作为父 Agent 的一个工具结果返回。

## Goals / Non-Goals
- Goals:
  - 支持 `fork_agent: true` 技能通过 `SubagentDispatcher` 在隔离上下文运行。
  - 父 Agent history 只保留 `invoke_skill` 工具调用和子执行 summary，不保留子 Agent 中间消息。
  - 子 Agent 工具目录从父目录降权派生，强制移除 `forbidden_tools` 与特权元工具。
  - 父执行 abort / timeout 传播到子执行。
  - 子执行 usage/cost 可归因、可聚合、可审计。
- Non-Goals:
  - 不新增公开 HTTP API、SDK、UI 或远程子 Agent 管理能力。
  - 不实现跨进程/容器级沙箱；本阶段只做运行时上下文与工具权限隔离。
  - 不在 TS Runtime 保存 provider API key，也不复制 Java model router。

## Decisions
- Decision: 以 `invoke_skill` + `fork_agent: true` 触发子智能体，而不是新增新的模型可见元工具。
  - Rationale: 保持 Tools Schema 稳定，复用已审计的 `invoke_skill` gate。
- Decision: 子 Agent 使用独立的 ephemeral child conversation id 与 parent execution attribution。
  - Rationale: 避免污染父 conversation history，同时保留 trace 可追溯性。
- Decision: 子 Agent 可见工具 = 父 frozen catalog 中允许工具 - `forbidden_tools` - runtime privileged meta tools。
  - Rationale: 权限只能继承降级，不能在子执行中升级。
- Decision: `subagent_model` 仅作为逻辑模型 id 传给 Java Backend。
  - Rationale: Java 继续拥有 provider router 与 credential，TS Runtime 不接触密钥。
- Decision: 子执行 summary 以 trusted tool result 返回给父 Agent，但子执行中的外部/MCP工具结果仍按 provenance 规则在子 history 内包裹。
  - Rationale: 父 Agent 只消费调度器产出的可审计摘要，不直接消费未信任原始输出。

## Risks / Trade-offs
- 子执行 summary 可能丢失细节 → 在 trace 中保留 childExecutionId、childConversationId、tool/cost 摘要。
- 子执行递归调用可能膨胀成本 → 默认禁止 `invoke_skill` / 子调度类特权元工具进入子 Agent 可见工具。
- 父子 timeout 竞态 → 子执行统一监听父 `AbortSignal`，并取父剩余 deadline 与 `SUBAGENT_TIMEOUT_MS` 的较小值。

## Migration Plan
1. 新增 `SubagentDispatcher` 与相关类型，不改变公开 API。
2. 在 `AgentExecutionRunner.executeTool()` 的 `invoke_skill` 分支中识别 `fork_agent: true` 并调用 dispatcher。
3. 为工具降权、history 隔离、abort/timeout、usage 聚合补充单测。
4. 通过 `pnpm --filter @openharness/agent-runtime test`、`typecheck` 与 OpenSpec 校验后再归档。

## Open Questions
- 子 Agent summary 的固定模板是否需要后续单独做 PromptRegistry 化？本 change 先使用内部稳定模板，不新增 prompt asset 管理需求。
