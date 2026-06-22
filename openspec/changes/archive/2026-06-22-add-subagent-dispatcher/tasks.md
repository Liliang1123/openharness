## 1. Spec Deltas 与设计审查
- [x] 1.1 编写 `agent-loop` 增量需求，规定 fork 技能的子智能体分发、权限降级、summary 返回与父 history 隔离
- [x] 1.2 编写 `agent-runtime` 增量需求，规定子执行身份、取消/超时传播、usage/cost 归因与模型逻辑 id 转发
- [x] 1.3 评审并更新 `docs/design/2026-06-22-add-subagent-dispatcher-design.md`

## 2. TDD 与核心实现
- [x] 2.1 编写 `agent-runtime/test/subagentDispatcher.test.ts`，先覆盖工具降权、forbidden tools、特权元工具过滤与 summary 返回
- [x] 2.2 编写 `agent-runtime/test/agentExecutionRunner.test.ts` 回归，覆盖 `fork_agent: true` 不走 pending injection 且父 history 只保留 summary tool result
- [x] 2.3 新增 `agent-runtime/src/subagent/dispatcher.ts`，实现隔离子执行上下文、工具目录派生与 summary生成
- [x] 2.4 修改 `agent-runtime/src/agentExecutionRunner.ts`，在 `invoke_skill` 分支接入 `SubagentDispatcher`
- [x] 2.5 补充 abort/timeout 传播与 usage/cost 聚合逻辑，确保 TS Runtime 不重新计算 provider cost

## 3. 验证与收尾
- [x] 3.1 运行 `pnpm --filter @openharness/agent-runtime test`
- [x] 3.2 运行 `pnpm --filter @openharness/agent-runtime typecheck`
- [x] 3.3 运行 `npx openspec validate add-subagent-dispatcher --strict --no-interactive`
- [x] 3.4 更新 dashboard verified 状态并按项目规则生成后续 closeout / handoff
