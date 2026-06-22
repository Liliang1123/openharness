# add-subagent-dispatcher Step 04 Review

## 结论

通过：Step 04 满足 Antigravity Brief 的验收标准。`AgentExecutionRunner` 已能对 `fork_agent: true` 的 Skill 调用 `SubagentDispatcher`，并保持父 history 隔离与非 fork 行为不回退。

## Review 范围

- [Step 04 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/04-brief.md)
- [Step 04 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/04-report.md)
- [AgentExecutionRunner 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)
- [AgentExecutionRunner 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/agentExecutionRunner.test.ts)
- [Superpowers plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md)

## 主要发现

### P0 / 阻塞问题

未发现阻塞问题。

### P1 / 关键依据

1. **forked skill 已接入 dispatcher**
   - `agent-runtime/src/agentExecutionRunner.ts:518-569` 识别 `fork_agent: true` 后调用 `subagentDispatcher.run()`，并返回 summary tool message。

2. **父 history 隔离已有集成测试**
   - `agent-runtime/test/agentExecutionRunner.test.ts:705-708` 验证父 history 有 `invoke_skill` summary，且不包含 child-only instructions。

3. **非 fork 行为未回退**
   - 既有 `invoke_skill` deferred injection 测试仍在 `agentExecutionRunner` focused suite 中通过。

4. **验证证据充分**
   - `agentExecutionRunner`、`subagentDispatcher`、`toolRegistryMerge` focused suites 与 typecheck 均通过。

### P2 / 非阻塞风险

1. dispatcher 仍未实现真正的 abort/timeout race，本轮只是传入了 `abortSignal` 和 `timeoutMs`。
2. child allowed tool 的 `beforeToolUse` 审计仍未实现，后续需单独 harden。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner`：通过，16 tests passed。
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：通过，28 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。

## 最终建议

- 允许进入 abort/timeout hardening。
- 下一步应只修改 dispatcher 和 dispatcher tests，先收敛父 abort 与 subagent timeout 行为，再决定是否补 child allowed-tool policy audit。

## 后续门禁

- 下一步不得更新 OpenSpec tasks/dashboard 到完成态。
- 整个 change 完成前不得归档。
