# Agent Work Report: add-subagent-dispatcher Step 02

## 改动文件
- `agent-runtime/test/subagentDispatcher.test.ts`
- `agent-runtime/src/subagent/dispatcher.ts`

## 实现摘要
- **模型默认值策略**：当技能未指定 `subagent_model` 时，dispatcher 默认使用 `"default"`，避免空字符串传给 Java Backend 路由。
- **费用透传**：透传 Java 提供的 `usage.costUsdMicros` 并在 `SubagentRunResult` 暴露，不做 TS 端重新计费。
- **非法工具调用拦截**：在 `chat` 结果返回时，对其 `toolCalls` 进行安全审计。如果子模型意图生成非 child tools 允许列表内的工具调用（如已被 `forbidden_tools` 屏蔽或已被特权过滤的工具），直接阻断并返回 `SUBAGENT_POLICY_DENY`，绝不向下执行真实 tool call。
- **清理 meta as any 强转**：移除了之前的 `as any` 非标准关联字段（如 `parentExecutionId` 等），整个 `meta` 只包含 shared schema 中已允许的 `cacheEnabled` 标准字段。
- **TDD 测试套件扩充**：新增了对默认模型选择、逻辑模型转发与费用透传、以及非法工具调用拦截的三个单元测试，保证核心策略无疏漏。

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：passed
- `pnpm --filter @openharness/agent-runtime typecheck`：passed

## RED/GREEN 证据
- RED：
  在只新增测试用例时，执行测试未通过：
  ```text
  × SubagentDispatcher > defaults child model to default when subagent_model is absent 3ms
    → expected '' to be 'default'
  × SubagentDispatcher > rejects child attempts to call tools removed from the child catalog 1ms
    → expected 'ok' to be 'error'
  ```
- GREEN：
  实现完拦截检验和 model 默认值，且通过 typecheck 编译后，测试顺利通过：
  ```text
   ✓ test/subagentDispatcher.test.ts (4 tests) 3ms

   Test Files  1 passed (1)
        Tests  4 passed (4)
  ```

## 已知风险
- 依然尚未在 `AgentExecutionRunner` 中接入 `SubagentDispatcher`，未对外部环境造成影响。
- 当前对 child model 可执行工具的安全检查仅在 `chat` 响应解析后拦截并触发 error 返回，由于本轮不需要执行任何 child tool，故当前尚未实现完整的多轮 `chat <-> tool` 子执行环路。

## 未完成
- **Task 3**: Wire forked skills into `AgentExecutionRunner`。
- **Task 4**: `ToolRegistry` catalog access helper。
- **Task 5**: Abort, timeout, and policy-audit hardening。

## 需要 Review Owner 判断的问题
- 无。
