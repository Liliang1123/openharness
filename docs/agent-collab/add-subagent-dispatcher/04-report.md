# Agent Work Report: add-subagent-dispatcher Step 04

## 改动文件
- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/test/agentExecutionRunner.test.ts`

## 实现摘要
- **接入 SubagentDispatcher**：在 `AgentExecutionRunner` 内部引入并初始化了 `SubagentDispatcher` 私有实例。
- **Forked 技能分支拦截**：在 `executeTool()` 的 `invoke_skill` 拦截流程中，检查 `skill.metadata.fork_agent === true`。若是，直接通过 `SubagentDispatcher.run()` 分发子智能体，否则 fallback 走原有的 pending injection 机制。
- **历史记录与隔离**：当技能分发时，不再将其推入 `pendingInjections`，从而阻断子智能体的 instructions 及其 execution 历史泄露进父 history 中，父 history 仅记录 invoke_skill 的 summary 执行结果。
- **参数与工具目录透传**：调用 dispatcher 时通过 `ToolRegistry.getCatalogTools()` 从父会话中获取已冻结工具列表以支持降级派生，并对 subagent 执行进行超时（默认为 300,000ms）及 abortController 绑定。
- **集成测试与回归防御**：在 `agentExecutionRunner.test.ts` 中增设了对 forked skill 隔离执行的集成回归测试，并复跑了全部的 28 个测试以防 Regression。

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner`：passed
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：passed
- `pnpm --filter @openharness/agent-runtime typecheck`：passed

## RED/GREEN 证据
- RED：
  在只新增集成测试时，由于尚未接入拦截分支，集成测试运行失败：
  ```text
  × AgentExecutionRunner > routes fork_agent skills through subagent summary without parent pending injection 8ms
    → expected false to be true
  ```
- GREEN：
  在 `agentExecutionRunner.ts` 接入 dispatcher 拦截并捕获 RuntimeTerminalFailure 传导后，28 个测试全数通过：
  ```text
   ✓ test/subagentDispatcher.test.ts (4 tests) 3ms
   ✓ test/toolRegistryMerge.test.ts (8 tests) 4ms
   ✓ test/agentExecutionRunner.test.ts (16 tests) 245ms

   Test Files  3 passed (3)
        Tests  28 passed (28)
  ```

## 已知风险
- 依然尚未实现 Task 5 中更精细的父子 `AbortSignal` 强关联以及超时/中断分类捕获逻辑（已在 plan 中但本轮禁止扩大范围）。

## 未完成
- **Task 5**: Abort, timeout, and policy-audit hardening。

## 需要 Review Owner 判断的问题
- 无。
