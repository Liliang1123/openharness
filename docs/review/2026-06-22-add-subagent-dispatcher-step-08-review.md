# Codex Review: add-subagent-dispatcher Step 08

## 结论

需修改：Step 08 已修复大部分 Step 07 文档问题，归档顺序也已基本改正；但仍有两处文档准确性问题需要最后修正后才能进入用户批准归档阶段。

## Review 范围

- [Step 08 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/08-brief.md)
- [Step 08 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/08-report.md)
- [Step 07 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/07-report.md)
- [Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md)
- [Closeout](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-add-subagent-dispatcher-closeout.md)
- [SubagentDispatcher](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [AgentExecutionRunner](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)

## 已通过项

- 归档流程已改为先执行 `npx openspec archive add-subagent-dispatcher --yes`，再复验，再人工检查文件范围并精确暂存。
- 文档已不再把独立 `HistoryStore` 实例写成已实现事实。
- 文档已将参数错误类修正为 `SUBAGENT_TOOL_ERROR`。
- 文档已将 dispatcher 超时错误类修正为 `SUBAGENT_TIMEOUT`。
- `pnpm dashboard:check`：通过，dashboard generated outputs current。

## 阻塞问题

### P1: 文档仍写成聚合 tokens，但当前实现只聚合 costUsdMicros

- 位置：
  - [implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md)
  - [closeout.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-add-subagent-dispatcher-closeout.md)
- 证据：`agent-runtime/src/subagent/dispatcher.ts:33` 的 `usage` 类型只有 `costUsdMicros`；`agent-runtime/src/subagent/dispatcher.ts:267-269` 的 `costOf()` 只读取 `response.usage.costUsdMicros`；`agent-runtime/src/agentExecutionRunner.ts:566` trace metadata 只记录 `subagentCostUsdMicros`。
- 问题：文档仍写“tokens 和 cost”或“输入/输出 tokens 数量与费用”，这会误导后续归档理解。
- 必须修正：改成“聚合 Java 返回的 `usage.costUsdMicros` / cost”，不要宣称当前已聚合 token counts。

### P2: Step 08 Report 声称关键词零命中，但复核实际有命中

- 位置：[08-report.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/08-report.md)
- 复核命令：`rg -n "git add \\.|mcp/|invoke_subagent|define_subagent|HistoryStore|POLICY_DENY|EXECUTION_TIMEOUT|tokens" ...`
- 结果：有命中，其中部分是允许的“禁止使用/事实澄清”语境，但不能写“零命中”。
- 必须修正：改为“仍有命中，但均为禁止事项说明或事实澄清语境；已逐项确认无错误事实”。

## 验证结果

- `pnpm dashboard:check`：通过。
- 文档关键词复核：存在命中，需要 Step 09 修正报告表述并清理 token 聚合误述。

## Fix Brief

已创建 [09-brief.md](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/09-brief.md)。本轮只允许修正文档表述，不允许修改 runtime 源码、测试、OpenSpec spec delta、dashboard 状态。

## Next-step Permission

no。需完成 Step 09 文档准确性修正后，再进入归档批准阶段。
