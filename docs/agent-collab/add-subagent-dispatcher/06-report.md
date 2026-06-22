# Agent Work Report: add-subagent-dispatcher Step 06

## 改动文件
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`

## 实现摘要
- **前置安全策略审计**：在子模型进行工具调用时，dispatcher 利用 `beforeToolUse` 对工具执行做前置评估。使用包含 child conversation id 以及派生出的子 toolPermissions 在内的 context 对其安全审计。
- **策略判定默认拒绝 (Deny-by-default)**：将原有的 `decisions` 循环审查重构为基于 `toolCallId` 精确匹配的 `decisionMap` 查表方式。当 policy 缺失了对某一 toolCall 的审计决策时，自动默认拒绝并返回 `SUBAGENT_POLICY_DENY`，且绝对不调用 Java backend 执行该工具。
- **参数严格对象类型校验**：对 `argumentsRaw` 在解析后强制执行对象结构校验，如果解析结果为 `null`、数组或非 `object` 基本类型，均抛错返回 `SUBAGENT_TOOL_ERROR`。
- **Java 工具安全派发**：通过安全策略审计后，dispatcher 将解析 `argumentsRaw`，向 `javaClient.executeTool` 派发执行，并在出错时安全返回 `SUBAGENT_TOOL_ERROR`。
- **多轮会话封装与防循环**：执行工具后，将 first model chat、tool calls 与 tool results 拼接为 child messages 追加至第二轮的模型请求中，再次请求 `javaClient.chat` 获取最终总结（使用了 Timeout 控制包装）。本阶段限定交付一次 toolCalls 处理，从源头上杜绝了子智能体递归运行产生的无限循环可能。
- **费用深度聚合**：透传并聚合了首轮与次轮模型 chat response 消耗 of cost 费用，汇总作为 dispatcher 最终的 usage 输出。
- **TDD 测试套件扩充**：在 `subagentDispatcher.test.ts` 中增设了对策略缺失默认拒绝以及非对象 arguments 拒绝的两个专项 TDD 测试用例。

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：passed
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge agentExecutionRunner`：passed
- `pnpm --filter @openharness/agent-runtime typecheck`：passed

## RED/GREEN 证据
- RED：
  在本次 Fix Brief 新增测试用例时，执行测试未通过：
  ```text
  × SubagentDispatcher > denies child tool call when policy decision is missing 3ms
    → expected 'ok' to be 'error'
  × SubagentDispatcher > rejects child tool arguments that are not objects 1ms
    → expected 'ok' to be 'error'
  ```
- GREEN：
  实现完 deny-by-default 安全判定与严格 arguments 对象结构校验，并通过 typecheck 类型系统校验后，全部 34 个测试点顺利通过：
  ```text
   ✓ test/toolRegistryMerge.test.ts (8 tests) 5ms
   ✓ test/subagentDispatcher.test.ts (10 tests) 7ms
   ✓ test/agentExecutionRunner.test.ts (16 tests) 248ms

   Test Files  3 passed (3)
        Tests  34 passed (34)
  ```

## 已知风险
- 无。在此阶段，本 change 的全部策略安全与类型防护均已完备通过。

## 未完成
- 暂无。

## 需要 Review Owner 判断的问题
- 无。
