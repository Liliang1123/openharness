# add-subagent-dispatcher Step 02 Review

## 结论

通过：Step 02 满足 Antigravity Brief 与 Superpowers plan Task 2 的验收标准，可以继续推进。当前仅代表 `SubagentDispatcher` 的模型转发、费用透传和被移除工具调用拦截通过，不代表完整子智能体调度功能完成。

## Review 范围

- [Step 02 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/02-brief.md)
- [Step 02 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/02-report.md)
- [SubagentDispatcher 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [SubagentDispatcher 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts)
- [Superpowers plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md)

## 主要发现

### P0 / 阻塞问题

未发现阻塞问题。

### P1 / 关键依据

1. **逻辑模型转发与默认模型策略正确**
   - `agent-runtime/src/subagent/dispatcher.ts:50` 使用 `subagent_model ?? "default"`。
   - `agent-runtime/test/subagentDispatcher.test.ts:159-231` 覆盖显式 `cheap-worker` 与缺省 `default`。

2. **usage/cost 只透传 Java 返回值**
   - `agent-runtime/src/subagent/dispatcher.ts:85-90` 仅读取 `response.usage.costUsdMicros`，没有 TS 端计价逻辑。
   - `agent-runtime/test/subagentDispatcher.test.ts:193-194` 覆盖结果为 Java mock 返回的 `7`。

3. **被移除 child tool-call 已阻断**
   - `agent-runtime/src/subagent/dispatcher.ts:69-83` 对 child model 返回 tool call 做 allow-set 检查。
   - `agent-runtime/test/subagentDispatcher.test.ts:268-270` 断言返回 `SUBAGENT_POLICY_DENY` 且未执行 Java tool。

4. **Step 01 风险已收敛**
   - `meta as any` 已移除，`meta` 仅保留 shared schema 已允许的 `cacheEnabled`。

### P2 / 非阻塞风险

1. 当前只拒绝不在 child catalog 的工具调用，尚未实现 allowed child tool 的 `beforeToolUse` 审计与执行。这是后续 Task 5 范围。
2. `AgentExecutionRunner` 接入前需要 `ToolRegistry` 暴露 frozen catalog tools 的只读 helper；建议下一步先做该 helper，再接 runner。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：通过，4 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。

## 最终建议

- 允许进入下一步。
- 下一步建议先做 `ToolRegistry.getCatalogTools()` helper，作为 runner 接入前置依赖。

## 后续门禁

- 下一步仍不得接入 `AgentExecutionRunner`，除非 Brief 明确允许。
- 整个 change 未完成前不得更新 dashboard 到 verified，也不得归档 OpenSpec。
