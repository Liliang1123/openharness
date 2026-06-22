# add-subagent-dispatcher Step 01 Review

## 结论

通过：Step 01 满足 Antigravity Brief 与 Superpowers plan Task 1 的验收标准，可以进入 Step 02。当前仅代表 dispatcher 最小契约和 child catalog 降权派生通过，不代表完整 `add-subagent-dispatcher` 功能完成。

## Review 范围

- [Step 01 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/01-brief.md)
- [Step 01 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/01-report.md)
- [SubagentDispatcher 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [SubagentDispatcher 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-subagent-dispatcher/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-subagent-dispatcher/design.md)
- [Superpowers plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md)

## 主要发现

### P0 / 阻塞问题

未发现阻塞问题。

### P1 / 关键依据

1. **工具降权逻辑符合 Step 01 目标**
   - `agent-runtime/src/subagent/dispatcher.ts:84-87` 使用 `deriveChildTools()` 移除 `forbidden_tools` 和特权元工具 `invoke_skill`。
   - `agent-runtime/test/subagentDispatcher.test.ts:133-137` 覆盖保留 `read_file`、移除 `run_command`、移除 `invoke_skill`。

2. **子执行身份与隔离 conversation 基础已建立**
   - `agent-runtime/src/subagent/dispatcher.ts:40-42` 生成 `childExecutionId` 与 `childConversationId`。
   - 本阶段尚未接入真实 child history，符合 Step 01 最小契约范围。

3. **验证证据充分**
   - 已由 Antigravity 报告 RED/GREEN。
   - Codex 复跑 `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher` 通过。
   - Codex 复跑 `pnpm --filter @openharness/agent-runtime typecheck` 通过。

### P2 / 非阻塞风险

1. `agent-runtime/src/subagent/dispatcher.ts:50` 未提供 `subagent_model` 时当前使用空字符串。Step 02 应明确默认模型策略，避免空 model 进入 Java router。
2. `agent-runtime/src/subagent/dispatcher.ts:64-71` 使用 `as any` 扩展 `meta`。如果后续需要跨服务稳定传递 child attribution，应补 shared-schema 或只放入 trace/event metadata。
3. 当前还未实现子工具调用的 `beforeToolUse` 审计、abort/timeout 和 runner 接入；这些必须在后续 Step 完成并 review。

## 最终建议

- 允许进入 Step 02。
- Step 02 Brief 应重点要求：模型默认策略、Java-provided usage/cost 聚合、child forbidden tool-call 拒绝，以及不要提前接入 `AgentExecutionRunner`。

## 后续门禁

- Step 02 完成后仍需 Codex review `02-report.md` 和 `git diff`。
- 不得在 Step 02 期间修改 `AgentExecutionRunner`，除非 Codex 重新发 Brief。
- 整个 change 未完成前不得更新 `tasks.md` 为全完成，也不得归档 OpenSpec。
