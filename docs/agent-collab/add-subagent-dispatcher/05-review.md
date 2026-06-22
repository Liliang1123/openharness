# Codex Review: add-subagent-dispatcher Step 05

## 结论

通过：Antigravity CLI 的 Step 05 实现满足本轮 Brief 的 abort/timeout hardening 目标，可以进入 child allowed-tool policy audit 步骤。

## Review 范围

- [Step 05 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/05-brief.md)
- [Step 05 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/05-report.md)
- [SubagentDispatcher 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [SubagentDispatcher 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts)

## Code Facts

| 检查项 | 证据 |
|---|---|
| abort-before-start 防护 | `agent-runtime/src/subagent/dispatcher.ts:45-54` 在 Java model call 前检查 `input.parent.abortSignal.aborted` 并返回 `SUBAGENT_ABORTED`。 |
| timeout 包装 | `agent-runtime/src/subagent/dispatcher.ts:56-81` 使用 `withTimeout()` 包裹 `javaClient.chat()`。 |
| timeout 结构化返回 | `agent-runtime/src/subagent/dispatcher.ts:83-92` 超时返回 `SUBAGENT_TIMEOUT`，不抛出裸异常。 |
| timeout helper | `agent-runtime/src/subagent/dispatcher.ts:127-139` 使用 `Promise.race` 并清理 timer。 |
| abort 测试 | `agent-runtime/test/subagentDispatcher.test.ts:277-308` 覆盖已 abort 时不调用 model。 |
| timeout 测试 | `agent-runtime/test/subagentDispatcher.test.ts:310-339` 覆盖 child model 超时返回 `SUBAGENT_TIMEOUT`。 |

## Positive Checks

- 本轮只修改 Brief 允许文件：`agent-runtime/src/subagent/dispatcher.ts`、`agent-runtime/test/subagentDispatcher.test.ts`、`docs/agent-collab/add-subagent-dispatcher/05-report.md`。
- Step 01-04 行为未回退：dispatcher、ToolRegistry、runner focused suites 均通过。
- abort-before-start 不产生 Java model call，符合“父执行取消传播”的第一层防护。
- timeout 以 dispatcher result 形式返回，runner 可继续把它映射为 parent tool error。

## Negative Searches / Scope Drift

- 未发现本轮修改 `AgentExecutionRunner`、ToolRegistry、OpenSpec、shared schema 或 dashboard。
- 无 `05-report-abort.md`，未声明中断。
- 未发现敏感词残留。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：通过，6 tests passed。
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：通过，30 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过，`tsc --noEmit` 零错误。

## 非阻塞风险 / 下一步关注

1. 当前 timeout 使用 `Promise.race` 返回超时结果，但无法取消底层 `javaClient.chat()` Promise；这符合当前 JavaClient 接口限制。后续若 JavaClient 支持 AbortSignal，可进一步传递 signal。
2. child allowed-tool 的 `beforeToolUse` 审计仍未实现。OpenSpec 要求每个剩余 child tool call 仍必须经过 policy audit，因此下一步必须补齐。

## Next-step Permission

yes。允许进入下一步：child allowed-tool policy audit and execution。
