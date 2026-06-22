# Codex Review: add-subagent-dispatcher Step 04

## 结论

通过：Antigravity CLI 的 Step 04 实现满足本轮 Brief 边界和 `AgentExecutionRunner` forked skill wiring 目标，可以进入 abort/timeout hardening 步骤。

## Review 范围

- [Step 04 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/04-brief.md)
- [Step 04 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/04-report.md)
- [AgentExecutionRunner 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)
- [AgentExecutionRunner 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/agentExecutionRunner.test.ts)
- [SubagentDispatcher 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [ToolRegistry 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/toolRegistry.ts)

## Code Facts

| 检查项 | 证据 |
|---|---|
| runner 持有 dispatcher | `agent-runtime/src/agentExecutionRunner.ts:18` import `SubagentDispatcher`，`agent-runtime/src/agentExecutionRunner.ts:108-120` 初始化私有实例。 |
| forked skill 分支 | `agent-runtime/src/agentExecutionRunner.ts:518-569` 在 `skill.metadata.fork_agent === true` 时调用 `subagentDispatcher.run()` 并返回 summary tool message。 |
| 非 fork 分支保留 | `agent-runtime/src/agentExecutionRunner.ts:571-585` 原 pending injection 路径仍在 fork 分支之后，非 fork 行为未被删除。 |
| 父 frozen catalog 传递 | `agent-runtime/src/agentExecutionRunner.ts:535-539` 使用 `toolRegistry.getCatalogTools()` 提供父会话 frozen tools。 |
| 子执行 attribution trace | `agent-runtime/src/agentExecutionRunner.ts:543-567` trace attributes 包含 `childExecutionId`、`childConversationId` 和 `subagentCostUsdMicros`。 |
| fork integration test | `agent-runtime/test/agentExecutionRunner.test.ts:640-714` 覆盖 forked skill summary、父 history 不注入 child-only instructions、child model 使用 `cheap-worker`。 |

## Positive Checks

- 本轮只修改 Brief 允许文件：`agent-runtime/src/agentExecutionRunner.ts`、`agent-runtime/test/agentExecutionRunner.test.ts`、`docs/agent-collab/add-subagent-dispatcher/04-report.md`。
- forked skill 不再进入 `pendingInjections`，父 history 只保留 `invoke_skill` summary tool result。
- 既有非 fork `invoke_skill` 测试仍通过，说明 pending injection 行为未回退。
- 未修改 dispatcher、ToolRegistry、OpenSpec、shared schema 或 dashboard。

## Negative Searches / Scope Drift

- 未发现本轮修改 Brief 禁止文件。
- 无 `04-report-abort.md`，未声明中断。
- 未发现敏感词残留。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner`：通过，16 tests passed。
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：通过，28 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过，`tsc --noEmit` 零错误。

## 非阻塞风险 / 下一步关注

1. 当前 dispatcher 已接收父 `AbortSignal` 与 timeoutMs，但 dispatcher 内部尚未真正检查 abort 或执行 timeout race；这正是下一步 hardening 范围。
2. 当前 subagent failure 路径由 runner 转成 `TOOL_ERROR` 终止；后续应至少补充 timeout/abort 分类测试，避免子执行卡住或错误分类不清。
3. 当前 child allowed tool 的 `beforeToolUse` 审计仍未实现；这是完整 policy-audit hardening 的后续风险，不能将当前阶段误判为完整功能完成。

## Next-step Permission

yes。允许进入下一步：`SubagentDispatcher abort/timeout hardening`。
