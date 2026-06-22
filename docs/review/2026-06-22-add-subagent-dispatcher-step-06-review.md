# Codex Review: add-subagent-dispatcher Step 06

## 结论

通过：Step 06 返工已修复上一轮 P0/P1 阻塞问题。`SubagentDispatcher` 现在对 child tool call 执行 deny-by-default policy decision 校验，并对 child tool arguments 执行 object-only 结构校验；复跑目标测试、组合回归与 typecheck 均通过。

## Review 范围

- [Step 06 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/06-brief.md)
- [Step 06 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/06-report.md)
- [SubagentDispatcher 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [SubagentDispatcher 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts)

## 主要发现

### 已修复：P0 policy 缺失 decision 时不再执行 child tool

- 证据：`agent-runtime/src/subagent/dispatcher.ts:140-155` 使用 `decisionMap` 按每个 `childToolCall.id` 查找 decision；缺失 decision 或非 `ALLOW` 均返回 `SUBAGENT_POLICY_DENY`。
- 回归：`agent-runtime/test/subagentDispatcher.test.ts:417-448` 覆盖 policy 返回空 decisions 时拒绝执行，且 `executedTools` 长度为 0。

### 已修复：P1 child tool arguments 执行 object-only 校验

- 证据：`agent-runtime/src/subagent/dispatcher.ts:160-166` 在 `JSON.parse()` 后拒绝 `null`、数组和非 object 参数。
- 回归：`agent-runtime/test/subagentDispatcher.test.ts:450-481` 覆盖数组参数被拒绝，且不执行 tool。

### 已确认：ALLOW happy path 与 cost 聚合仍可用

- 证据：`agent-runtime/src/subagent/dispatcher.ts:191-258` 在 policy `ALLOW` 后执行 child tool，随后二次 chat 生成 summary，并累加 first/second response cost。
- 回归：`agent-runtime/test/subagentDispatcher.test.ts:347-382` 覆盖 audit、execute、summary 与 `costUsdMicros = 14`。

## 验证结果

- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：通过，10 tests passed。
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：通过，34 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。

## 非阻塞风险

- 当前 dispatcher 只支持“一轮 child tool batch + 二次 summary”，不实现无限 child loop；这符合本阶段 Brief 边界，后续如需多轮应另开 OpenSpec delta。
- `withTimeout` 仍是 Promise race 级超时，不取消底层 Java 请求；此为既有 Step 05 已接受边界，本轮不扩大 scope。

## 最终建议

- Step 06 可以收尾。
- 下一步进入 Step 07：全量验证、OpenSpec tasks 勾选、dashboard verified 同步、implementation review 与 closeout 准备。
- 禁止在 Step 07 中执行 `npx openspec archive add-subagent-dispatcher --yes`，归档必须等待用户明确批准。

## 后续门禁

- 需要运行全量验证：`pnpm --filter @openharness/agent-runtime test`、`pnpm --filter @openharness/agent-runtime typecheck`、`npx openspec validate add-subagent-dispatcher --strict --no-interactive`。
- 全量验证通过后，才允许更新 `openspec/changes/add-subagent-dispatcher/tasks.md` 与 dashboard verified 状态。

## Next-step Permission

yes。允许进入 Step 07 final verification / closeout preparation。
