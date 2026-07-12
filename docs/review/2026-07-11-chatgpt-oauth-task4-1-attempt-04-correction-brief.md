# ChatGPT/Codex OAuth Task 4.1 Attempt 04 Correction Brief

## 项目与工作区

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness)
- 执行 worktree：[add-chatgpt-oauth-auth-task4](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4)
- 必读 Review：[Attempt 03 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-03-review.md)
- 必读规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/AGENTS.md)
- 批准合同：[OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- 执行计划：[Task 4 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)

## 任务目标

只修复 Task 4.1 中 TS/Java canonical number validator 的跨语言不一致。当前 TS 接受 `5e-324`、拒绝 `4.9e-324`；Java 判定相反。Java 必须与 TS 的 ECMAScript `JSON.stringify` canonical number 语义一致。

## 允许修改

- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Java contract tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- 只有在新增共享镜像向量确有必要时，才可修改 [shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)；不要改变 TS 已定义的 canonical 语义。

## 必须执行

1. TDD RED：加入镜像正负例，证明 TS 接受 `{"value":5e-324}`/拒绝 `{"value":4.9e-324}`，Java 修复前判定相反。
2. GREEN：使 Java 与 ECMAScript `JSON.stringify` number serialization 等价。不得同时接受两种拼写，不得跳过 number canonical validation。
3. 加入共享边界向量：最小 subnormal、最小 normal、`1e-7`/`1e-6`、`1e20`/`1e21`、最大 finite、代表性 rounding case；TS 与 Java 的 accept/reject 必须一致。
4. 保留 Attempt 03 已通过的深度 bound、Unicode、重复键、负零、溢出、UTC 和 cost 回归测试。
5. 回传完整 Report：actual modified files、RED/GREEN 原始结果、所有 fresh 命令 exit code、最终 `git status --short`、残余风险。

## 禁止事项

- 不推进 Task 4.2，不实现 client、pending registry、result/cancel controller 或 TS bridge。
- 不勾选 OpenSpec 3.4，不修改 dashboard，不归档 change。
- 不读取 OAuth credential，不执行真实 Provider 调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 不重写或删除 Attempt 02/03 已通过的修复与 Review 证据。

## Fresh 验证

- `pnpm --filter @openharness/shared-schema test`
- `pnpm typecheck`
- `mvn -o -f backend/pom.xml -Dtest=ContractsTest,ModelControllerTest test`
- `mvn -o -f backend/pom.xml test`
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`
- `git diff --check`

## 停止条件与期望输出

若无法在不放宽合同的前提下实现 ECMAScript number serialization，停止并报告 BLOCKED，不得自行改变 wire contract。最终输出使用 `DONE_WITH_CONCERNS` 或 `BLOCKED`，不得声明 Task 4.1 PASS；High 将重新读取 actual diff、fresh 重跑 critical 并增加独立跨语言 probe。
