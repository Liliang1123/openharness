# ChatGPT/Codex OAuth Task 4.3 Attempt-04 High Review

## 结论

需修改。Attempt-04 已关闭 throwing completion 与 cancel/timeout winner 的 recorded-outcome 竞态，并使 FAILED/ORPHANED 后的新 mutation 统一 fail closed；fresh focused、backend full、OpenSpec strict、whitespace 和禁止依赖门禁均通过。

但是新的独立 restart/orphan probe 在报告所列稳定 SHA 上复现一项 High 缺陷：`orphanAll()` 在正常 completion bridge I/O 进行中把 `terminalOutcome` 设为 null；bridge 随后正常返回时，completion loser 无条件调用 `winnerOutcome.join()`，泄漏裸 `NullPointerException`。Task 4.3 因此不能 PASS、不能勾选 checkbox，也不能开始 Task 4.4。

## Review 范围

- [Attempt-03 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-03-high-review.md)
- [Task 4.3 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-brief.md)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Provider adapter OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)

除本 Review 文档外未修改项目文件；仓库外 probe 的源码与 class 已清理。

## 主要发现

### High：orphanAll 与正常 completion 返回竞态泄漏 NullPointerException

[orphanAll](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L244) 对 `ACTIVE` entry 调用 `unavailableTerminal(...)`，将 `terminalOutcome` 清为 null。[complete 正常返回的 loser 分支](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L154) 捕获到 `ORPHANED` 状态和 null future 后，最终在 [返回收口](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L182) 无条件执行 `winnerOutcome.join()`。

独立 latch probe 顺序：completion 进入 bridge I/O；执行 `orphanAll()`；释放 bridge 并正常返回。实际输出：

```text
orphan-during-completion=NullPointerException:Cannot invoke "java.util.concurrent.CompletableFuture.join()" because "winnerOutcome" is null
orphan-during-completion=FAIL: expected structured gone
```

这违反 restart orphan 必须 fail closed 为 `BRIDGE_TURN_GONE` 且不得泄漏内部异常的合同。现有正式测试只覆盖 orphan 后再发起 mutation，没有覆盖 orphan 与已经 ACTIVE 的正常 completion I/O 竞态。

修正要求：正常返回和异常返回必须使用同一个 unavailable-terminal 收口。若 loser 观察到 `ORPHANED`/`FAILED` 且没有可重放 terminal future，应抛结构化 `BRIDGE_TURN_GONE`，绝不能 join null；若观察到 cancel/timeout winner，则继续等待并返回其非空 future。新增 orphan 与正常返回、异常返回 completion 的两种调度测试，并确认无第二次 responder mutation和无 canary 泄漏。

### 已确认关闭

- cancel winner 后 throwing completion loser 返回同一个 `ErrorTurn`。
- FAILED/ORPHANED 后 cancel 和 complete 均返回 `BRIDGE_TURN_GONE`。
- Attempt-03 已关闭的 sequential replay/conflict、duplicate cancel 和多 due-turn expiry 隔离未见回归。

## 验证证据

- 五个 SHA 与报告一致：Registry `84dec2248ff9baea16a49ca1c4472a44c0f347371109ee973bfcba7eb51e3fb8`；Registry test `73dc3ada2c683aa2bf4de5e05759a591799bca6daa51657c898bc9a804ce02f1`；Client `183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`；Client test `55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`；Contracts `0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`。
- Fresh critical focused：49/49 PASS，exit 0。
- Fresh backend full：117/117 PASS，exit 0。
- OpenSpec strict：valid，exit 0；仅有非门禁 PostHog warning。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，exit 1，符合预期。
- 独立 probe：2/3 行为通过，restart/orphan 竞态失败，进程 exit 1。

## 最终建议

保留 Attempt-04 已关闭路径，在同一 Task 4.3 范围进行最小 Attempt-05 correction：先将 orphan 与 in-flight completion 的正常/异常返回写成 RED，再统一 completion loser 收口。修复后 fresh 重跑 Registry/Client focused、20 次 race、critical、backend full、OpenSpec、静态门禁和 SHA/status 双采样，并由新的独立 High 复核。

## 后续门禁

- OpenSpec：无需新增 proposal；属于已批准 [add-chatgpt-oauth-auth change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/) 的 restart orphan 与 structured fail-closed 合同。
- Superpowers：需要 Attempt-05 TDD correction 和新的独立 High Review；无需新建实施计划。
- Task 4.4、checkbox、dashboard：Task 4.3 High PASS 前保持不变。
- 项目规则：未修改。
