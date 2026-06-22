# Codex Review: add-subagent-dispatcher Step 02

## 结论

通过：Antigravity CLI 的 Step 02 实现满足本轮 Brief 边界和 Superpowers plan Task 2 目标，可以进入下一步。为降低后续 runner 接入风险，下一步先执行 `ToolRegistry` catalog access helper，再接入 `AgentExecutionRunner`。

## Review 范围

- [Step 02 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/02-brief.md)
- [Step 02 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/02-report.md)
- [SubagentDispatcher 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [SubagentDispatcher 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts)
- [Step 01 Review](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/01-review.md)

## Code Facts

| 检查项 | 证据 |
|---|---|
| 默认模型策略 | `agent-runtime/src/subagent/dispatcher.ts:45-51` 使用 `input.skill.metadata.subagent_model ?? "default"`，避免空字符串进入 Java router。 |
| 标准 meta | `agent-runtime/src/subagent/dispatcher.ts:63-66` 仅传递 `meta.cacheEnabled`，移除了 Step 01 中的 `as any`。 |
| Java-provided cost 透传 | `agent-runtime/src/subagent/dispatcher.ts:85-90` 将 `response.usage.costUsdMicros` 透传到 `SubagentRunResult.usage`。 |
| child tool allow-set 检查 | `agent-runtime/src/subagent/dispatcher.ts:69-83` 对 child model 返回的 `toolCalls` 做 allow-set 校验。 |
| 模型和 cost 测试 | `agent-runtime/test/subagentDispatcher.test.ts:159-195` 覆盖 `subagent_model` 转发与 `costUsdMicros` 透传。 |
| default model 测试 | `agent-runtime/test/subagentDispatcher.test.ts:197-231` 覆盖缺省模型为 `default`。 |
| forbidden child tool 测试 | `agent-runtime/test/subagentDispatcher.test.ts:233-271` 覆盖 forbidden tool-call 拒绝且不执行 Java tool。 |

## Positive Checks

- 本轮只修改了 Brief 允许文件：`agent-runtime/src/subagent/dispatcher.ts`、`agent-runtime/test/subagentDispatcher.test.ts`、`docs/agent-collab/add-subagent-dispatcher/02-report.md`。
- 未接入 `AgentExecutionRunner`，没有越过 Step 02 边界。
- Step 01 的两个非阻塞风险已处理：空 model 改为 `default`，`meta as any` 已移除。
- 没有新增依赖、没有修改 OpenSpec、没有修改 shared schema。

## Negative Searches / Scope Drift

- 未发现本轮修改 `agent-runtime/src/agentExecutionRunner.ts`、`agent-runtime/src/toolRegistry.ts`、`packages/shared-schema/**`、`openspec/**`。
- 未发现 Antigravity 执行 `git add` / `git commit` / `npx openspec archive` 的痕迹。
- 无 `02-report-abort.md`，未声明中断。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：通过，4 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过，`tsc --noEmit` 零错误。

## 非阻塞风险 / 下一步关注

1. 当前 dispatcher 对 allowed child tool call 只做 allow-set 检查，尚未执行 allowed child tool 或调用 `beforeToolUse`；这符合 Step 02 边界，但后续 Task 5 必须补齐 policy-audit hardening。
2. runner 接入需要父 frozen catalog 的完整 tools 列表；当前 `ToolRegistry` 尚无只读 helper。下一步先补 `getCatalogTools()`，再做 runner wiring，能减少 Step 03 的耦合风险。

## Next-step Permission

yes。允许进入下一步：`ToolRegistry catalog access helper`。
