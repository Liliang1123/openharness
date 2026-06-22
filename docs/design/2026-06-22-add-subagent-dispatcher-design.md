# Add Subagent Dispatcher 设计方案

- 文档类型：OpenSpec 前置设计方案
- 日志及版本：2026-06-22 v0.1 proposed，随 `add-subagent-dispatcher` proposal 首次落地

## 结论
有风险：本方案适合进入 OpenSpec 审批，但在批准前不得实现代码。主要风险集中在父子执行取消竞态、子工具权限降级边界、summary 信息损失与费用归因口径。

## 核心逻辑
- `fork_agent: false`：沿用上一阶段 pending injection，把 Skill 内容注入主上下文。
- `fork_agent: true`：走 `SubagentDispatcher`，创建隔离 child execution，子 Agent 内部完成多步推理和工具调用。
- 父 Agent 只看到一条 `invoke_skill` tool result summary，不接收子 Agent 的中间消息、工具结果或 scratch context。
- 子 Agent 的工具目录只能从父 frozen catalog 降级派生：移除 `forbidden_tools`，并默认移除 `invoke_skill` 等特权元工具，避免递归提权。
- 子 Agent 每次工具调用仍必须经过 `beforeToolUse`，并携带 child attribution。
- `subagent_model` 只作为逻辑模型 id 转发给 Java Backend；provider router、credential 与 fallback 仍归 Java 所有。
- 子 Agent 的 usage/cost 仅聚合 Java 返回的 `ModelChatResponse.usage`，TS Runtime 不重新计算价格。

## 主要设计边界
1. 不新增公开 API、UI、SDK 或远程子 Agent 管理能力。
2. 不做容器级或系统进程级沙箱；本阶段目标是运行时上下文隔离与工具权限降级。
3. 不允许子 Agent 默认再次调用 `invoke_skill` 产生递归调度。
4. 父执行 abort 或 timeout 必须中止正在运行的子 Agent。

## 待办
- 编写 `SubagentDispatcher` 的 TDD 用例，先证明 forbidden tools 和特权元工具不会进入子 catalog。
- 在 `AgentExecutionRunner` 的 `invoke_skill` 分支中区分 fork 与非 fork。
- 补充父 history 隔离断言，确保子中间消息不落入父 conversation。
- 补充 usage/cost 聚合与 abort/timeout 传播回归。

## 验证门禁
- `npx openspec validate add-subagent-dispatcher --strict --no-interactive`
- `pnpm --filter @openharness/agent-runtime test`
- `pnpm --filter @openharness/agent-runtime typecheck`
- 实现完成后再生成 `docs/superpowers/plans/YYYY-MM-DD-add-subagent-dispatcher.md`，并进入 Step Evidence Gate。
