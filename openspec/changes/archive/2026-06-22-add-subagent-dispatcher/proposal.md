# Change: Add Subagent Dispatcher

## Why
`invoke_skill` 已能完成非 fork 技能的延迟注入，但 `fork_agent: true` 仍缺少真正隔离的子智能体执行路径。没有隔离分发器时，复杂技能的大量工具调用、临时上下文、取消/超时与费用统计会污染主 Agent 历史，且 `forbidden_tools` 等降权约束缺少强制执行边界。

## What Changes
- 新增 `SubagentDispatcher`，当技能元数据 `fork_agent: true` 时在独立子执行上下文中运行技能任务，并只向主 Agent 返回压缩 summary tool result。
- 规定子智能体必须继承并降级父执行权限：显式移除 `forbidden_tools`，默认屏蔽特权元工具，并继续对每个子工具调用执行 `beforeToolUse` 审计。
- 规定子智能体拥有独立 history/trace attribution，不得把子执行的中间消息、工具结果或内部提示词写入父 conversation history。
- 规定父执行 abort、执行超时与子智能体超时必须传播到子执行，并产生可审计的终止分类。
- 规定子智能体模型选择使用 `subagent_model` 逻辑模型 id；TS Runtime 只转发逻辑模型，不持有 provider credential。
- 规定子智能体 usage/cost 以 Java `ModelChatResponse.usage` 为准聚合到父执行观测结果，不在 TS 端重新计价。

## Impact
- Affected specs: `agent-loop`, `agent-runtime`
- Affected code: `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/src/subagent/dispatcher.ts`, `agent-runtime/src/skills/types.ts`, `agent-runtime/src/toolRegistry.ts`, `agent-runtime/src/types.ts`
- Affected tests: `agent-runtime/test/subagentDispatcher.test.ts`, `agent-runtime/test/agentExecutionRunner.test.ts`, `agent-runtime/test/toolRegistryMerge.test.ts`
