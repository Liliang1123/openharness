# Agent Work Report: add-subagent-dispatcher Step 05

## 改动文件
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`

## 实现摘要
- **父 AbortSignal 启动前拦截**：在 `SubagentDispatcher.run()` 初始化 child 标识后、派发底层 Java model 调用前，判定 `parent.abortSignal.aborted`。如果已中止，直接返回 `SUBAGENT_ABORTED`，避免产生不必要的调用。
- **Timeout 异步控制**：编写了本地 Promise 超时阻断工具函数 `withTimeout()`，利用 `Promise.race` 和 `setTimeout` 进行计时并抛出竞态结论。
- **超时拦截处理**：使用 `withTimeout` 封装 `javaClient.chat`，如果超时直接退出并返回 `SUBAGENT_TIMEOUT` 错误描述，而非溢出破坏 dispatcher run result 的契约约定。
- **TDD 测试覆盖**：在 `subagentDispatcher.test.ts` 补充了针对启动前已 abort 的防护测试，以及针对执行中超时的竞态测试。

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：passed
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：passed
- `pnpm --filter @openharness/agent-runtime typecheck`：passed

## RED/GREEN 证据
- RED：
  在只新增测试用例时，执行测试未通过：
  ```text
  × SubagentDispatcher > returns SUBAGENT_ABORTED without model call when parent signal is already aborted 3ms
    → expected 'ok' to be 'error'
  × SubagentDispatcher > returns SUBAGENT_TIMEOUT when child model exceeds timeout 52ms
    → expected 'ok' to be 'error'
  ```
- GREEN：
  实现完 abort 拦截、超时包装，并通过 typecheck 类型系统验证后，30 个测试用例全数通过：
  ```text
   ✓ test/subagentDispatcher.test.ts (6 tests) 5ms
   ✓ test/toolRegistryMerge.test.ts (8 tests) 4ms
   ✓ test/agentExecutionRunner.test.ts (16 tests) 245ms

   Test Files  3 passed (3)
        Tests  30 passed (30)
  ```

## 已知风险
- 暂无，变更均被限制在 dispatcher 内部且完全满足单元测试保障。

## 未完成
- **Task 5 (Policy-audit)**: 本轮仅完成 Task 5 中 abort/timeout hardening，child allowed-tool 的安全审计与 `beforeToolUse` 接入等，仍待后续工作安排。

## 需要 Review Owner 判断的问题
- 无。
