# ChatGPT/Codex OAuth Task 4.1 Attempt 05 Correction Brief

## 项目与必读材料

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness)
- 执行 worktree：[add-chatgpt-oauth-auth-task4](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4)
- 必读 Review：[Attempt 04 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-04-review.md)
- 必读规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/AGENTS.md)
- 批准合同：[OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- 执行计划：[Task 4 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)

## 任务目标

只修复 Task 4.1 Java canonical number serialization 的剩余低位 subnormal 漂移。不得继续用逐个 double special case 修补；Java 必须使用完整、可验证的 ECMAScript `JSON.stringify` / RFC 8785 compatible number serialization。

## 必须执行

1. TDD RED：至少加入 `±1e-323`、`±5e-323`、`±6e-323`、`±7e-323`、`±8e-323`、`±9e-323` 的 TS/Java mirror 正例，复现 Java 当前拒绝。
2. GREEN：替换 `BigDecimal.valueOf` 加 `Double.MIN_VALUE` 特判方案。采用完整且有来源依据的 ECMAScript-compatible double-to-string 算法；若引入依赖，Report 必须说明版本、许可证、供应链与为何适合 strict wire contract。
3. 正式 corpus：保留低位正负 subnormal 连续区间、Brief 固定边界向量和确定性随机 bit-pattern 样本。TS 以 `JSON.stringify` 生成 canonical token，Java 必须全部接受；非 canonical twin 必须继续拒绝。
4. 保留并重跑所有深度、Unicode、重复键、负零、溢出、UTC、record bounds 与 cost regression 测试。
5. 回传完整 Report：actual modified files、RED/GREEN 原始结果、corpus 数量与 rejected 数、依赖/算法依据、全部 fresh 命令 exit code、最终 `git status --short`、残余风险。

## 允许修改

- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Java contract tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)，仅用于 mirror corpus/向量，不改变 TS canonical 语义。
- 若选择经审查的 Java 依赖，只允许修改 [Backend Maven configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/pom.xml)，并必须在 Report 中单独列出。

## 禁止事项

- 不推进 Task 4.2，不实现 client、pending registry、result/cancel controller 或 TS bridge。
- 不接受多个等价数值拼写，不跳过 Java number canonical validation。
- 不勾 OpenSpec 3.4，不修改 dashboard，不归档 change。
- 不读取 OAuth credential，不执行真实 Provider 调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 不删除或重写 Attempt 02–04 Review 与已通过的回归测试。

## Fresh 验证与停止条件

运行 shared-schema、全仓 typecheck、Java focused/full、OpenSpec strict、`git diff --check`，并报告 corpus 总数及 Java rejected=0。若无法在不放宽 wire contract 的前提下获得完整算法，返回 BLOCKED，不得增加零散 special case。最终输出使用 `DONE_WITH_CONCERNS` 或 `BLOCKED`；不得自行声明 Task 4.1 PASS，High 将重新读取 actual diff 并独立生成更广 corpus。
