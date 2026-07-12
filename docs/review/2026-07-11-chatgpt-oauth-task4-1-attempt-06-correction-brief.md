# ChatGPT/Codex OAuth Task 4.1 Attempt 06 Correction Brief

## 项目与必读材料

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness)
- 执行 worktree：[add-chatgpt-oauth-auth-task4](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4)
- 必读 Review：[Attempt 05 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-1-attempt-05-review.md)
- 必读规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/AGENTS.md)
- 批准合同：[OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth)
- 执行计划：[Task 4 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)

## 任务目标

只修复 Task 4.1 中固定依赖 `java-json-canonicalization:1.1` 对 raw double bits `0x00000000000007e8` / `0x80000000000007e8` 的 ECMAScript serialization 漂移，并消除 Java 正式 corpus 的自引用 oracle。不得推进 Task 4.2。

## 必须执行

1. TDD RED：加入 `1e-320` 与 `-1e-320` 的 TS/Java 正例，证明 TS 接受而现 Java 拒绝；同时保留同值非 canonical spelling 的拒绝断言。
2. GREEN：采用经独立 corpus 验证的完整 ECMAScript/RFC 8785 double-to-string 实现。不得添加 `0x7e8`、`1e-320` 或其他逐值 special case；不得放宽 canonical equality。
3. 非自引用正式测试：Java 不得调用 production formatter 生成自己的 canonical token。创建由 ECMAScript `JSON.stringify` 生成并可审计的共享 oracle fixture，或采用等价的独立 oracle 流程；TS 与 Java 必须实际消费同一组 token/期望，而非仅断言相同样本数量。
4. Corpus 至少覆盖正负低位 subnormal、确定性随机 finite/nonzero bit patterns、指数阈值与全部既有固定向量；报告 canonical checked/rejected 与 twin checked/accepted。
5. 若替换、升级或 fork 依赖，报告精确版本或 source pin、许可证、JAR/POM 或 source hash、生产 transitive、干净 CI 获取路径与选择依据；禁止在无 pin 情况下依赖上游分支。
6. 保留并重跑深度、Unicode、重复键、负零、溢出、UTC、record bounds 与 cost regression。
7. 回传 actual modified files、RED/GREEN 原始结果、fresh 命令 exit code、最终 `git status --short` 与残余风险。

## 允许修改

- [Backend Maven configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/pom.xml)，仅限 formatter 依赖修正。
- [Java contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Java contract tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/model/ContractsTest.java)
- [Shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/test/schema.test.ts)，仅用于 mirror corpus/向量。
- 新增最小共享 oracle fixture 时，只能放在对应 test resources 目录，并在 Report 中列出精确路径与生成方式。

## 禁止事项

- 不推进 Task 4.2，不实现 client、pending registry、result/cancel controller 或 TS bridge。
- 不添加逐值 special case，不接受多个等价数值拼写，不跳过 Java number validation。
- 不以被测 formatter 生成 Java 测试期望，不以“两端样本数量相同”替代 token 一致性。
- 不勾 OpenSpec 3.4，不修改 dashboard，不归档 change。
- 不读取 OAuth credential，不执行真实 Provider 调用。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 不删除或重写 Attempt 02–05 Review 与已通过的回归测试。

## Fresh 验证与停止条件

运行 shared-schema、全仓 typecheck、Java focused/full、OpenSpec strict、依赖树与 `git diff --check`。提交给 High 的 corpus 报告必须为 canonical rejected=0、non-canonical accepted=0；若完整算法仍无法通过，不得以 special case 收口，返回 BLOCKED。最终输出使用 `DONE_WITH_CONCERNS` 或 `BLOCKED`，不得自行声明 Task 4.1 PASS。
