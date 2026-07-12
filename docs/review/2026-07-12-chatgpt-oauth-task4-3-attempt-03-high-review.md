# ChatGPT/Codex OAuth Task 4.3 Attempt-03 High Review

## 结论

需修改。Attempt-03 已关闭上一轮的正常返回型 cancel/timeout loser、sequential replay/conflict 与多 due-turn expiry 启动隔离问题；focused、backend full、OpenSpec strict、whitespace 和禁止依赖门禁也均通过，五个审查 SHA 与实施报告一致。

但在同一稳定 SHA 上，新的仓库外并发探针复现一项 High 竞态缺陷和两个同源的空终态路径：当 cancel 已获胜而并发 completion 随后从 bridge I/O 抛错时，completion loser 绕过共享 terminal future，返回 `BRIDGE_TURN_GONE`；此外 FAILED 与 ORPHANED 终态会发布 completed-null future，使后续 cancel 返回 `RegistryResult` 且 `turnResult=null`。因此 recorded terminal outcome 尚未形成全路径不变量，Task 4.3 不能 PASS、不能勾选 checkbox，也不能开始 Task 4.4 实施。

## Review 范围

- [项目工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/)
- [Task 4.3 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-brief.md)
- [Attempt-02 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-02-high-review.md)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Provider adapter OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Backend gateway OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)

审查为只读实现审计；除本 Review 文档外未修改项目文件。独立探针只在系统临时目录编译运行，结束后已清理其源码和 class 文件。

## 主要发现

### High 1：bridge completion 抛错时，cancel winner 的 loser 未收到 recorded outcome

[complete 的 bridge 异常分支](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L137) 在 `bridge.complete(...)` 抛出后，只在 entry 仍为 `ACTIVE` 时记录 FAILED，随后无条件抛出 `BRIDGE_TURN_GONE`。它没有像正常返回分支那样检查 cancel/timeout 是否已将状态改为 `CANCELLING` 或 `TIMED_OUT`，也没有等待对应 `terminalOutcome`。

独立 latch probe 的顺序为：completion 进入 bridge I/O；cancel 获得 terminal winner 并进入阻塞 terminate；completion 释放后抛错。实际输出：

```text
completion-failure-after-cancel=BridgeException(BRIDGE_TURN_GONE)
completion-failure-after-cancel=FAIL: loser did not receive recorded terminal outcome
```

这仍违反 [cancellation race scenario](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md#L70) 对“losing operation receives the recorded terminal outcome”的要求。现有正式测试只覆盖 bridge completion 正常返回后发现 cancel/timeout 已获胜，没有覆盖 bridge completion 抛错的同一竞态分支。

修正要求：bridge completion 的正常返回和异常返回必须汇合到同一 winner/loser 判定。若 cancel/timeout 已获胜，completion loser 必须等待并返回同一非空、结构化 recorded outcome；只有 completion 自己在 `ACTIVE` 状态下成为 FAILED winner 时，才发布确定的安全失败结果或按合同 fail closed。任何分支都不得再次 mutation responder。

### High 2：FAILED 与 ORPHANED 发布 completed-null terminal future

[terminal helper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L348) 允许 `result=null` 并创建 `CompletableFuture.completedFuture(null)`；[completion failure](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L140) 与 [orphanAll](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L236) 都会进入该路径。随后 [cancel 的 recorded 分支](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L193) 会把 null 包装成成功返回的 `RegistryResult`。

独立 probe 实际输出：

```text
failed-terminal-cancel=FAILED/null
failed-terminal-cancel=FAIL: public RegistryResult contains null terminal outcome
orphan-cancel=ORPHANED/null, mutations=0
orphan-cancel=FAIL: public RegistryResult contains null orphan outcome
```

FAILED/ORPHANED 可以选择返回结构化、安全的 `ErrorTurn`，也可以让后续 mutation 统一返回 `BRIDGE_TURN_GONE`；不能返回一个表面成功但 payload 为 null 的 `RegistryResult`。这会给 Task 4.4 controller 留下不完整 union，并破坏“final/pending/error 恰好一种”的既有合同。

修正要求：建立 terminal outcome 非空不变量，或明确区分“可重放终态”和“gone/orphaned 不可重放终态”；`terminal(...)` 不得再用 null 同时表达失败、orphan 和无缓存。新增 FAILED 后 cancel、ORPHANED 后 cancel、FAILED/ORPHANED 后 complete 的精确断言，并确认异常消息不包含 canary。

### 已确认关闭

- cancel/timeout winner 在 bridge completion 正常返回路径中会通过共享 future 给 loser 和重复 cancel 返回同一个非空对象。
- 最近已回答 sequential call 的 identical replay、key conflict、payload conflict 均在当前 call correlation 校验前处理，当前 call 仍能完成。
- expiry sweep 先声明全部 due entry，再启动相互隔离的虚拟线程；两个阻塞 terminate 均可在释放前进入，无关 register/complete 保持响应。
- 纳秒 expiry 规范化、retention 自动清理、entry 级短锁、exact client interrupt 与 Task 4.2 SHAs 保持不变。

### 非阻塞风险

- 当前 expiry 为每个 due entry 启动一个虚拟线程，尚无显式并发上限。该风险在本次探针中未复现为功能错误，但正式接线前应由后续容量/生命周期门禁确认最大 active pending 数或 bounded dispatcher 策略。
- shared terminal future 的等待时长依赖真实 client interrupt 的 request timeout；当前 fake peer 不能替代真实 app-server qualification。

## 验证证据

- 初始五文件 SHA-256 与实施报告完全一致：Registry `253a8cb06672e07e570e288780d759a961a66e15df394722ae580b0efbdab8dc`；Registry test `78f0fd006b19a836973f5253ed9b4c589d28e63a59d6e380f7812d45e03c440e`；Client `183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`；Client test `55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`；Contracts `0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`。
- Fresh focused：46/46 PASS，exit 0。
- Fresh backend full：114/114 PASS，exit 0。
- OpenSpec strict：change valid，exit 0；PostHog 网络 flush warning 为非门禁 telemetry warning。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，exit 1，符合预期。
- 仓库外独立 probe：0/3，exit 1；复现上述一个竞态缺陷和两个空终态路径。

## 最终建议

1. 保留 Attempt-03 对正常返回型 winner/loser、sequential replay/conflict 和 expiry 隔离的修正。
2. 在同一 Task 4.3 范围启动 Attempt-04 correction，先将本 Review 三个 probe 场景转成正式 RED。
3. 统一 completion 正常/异常退出的 winner/loser 收口，并为 FAILED/ORPHANED 定义非空结构化结果或明确 gone 语义；禁止 completed-null future。
4. Fresh 运行 Registry 与 Client focused、20 次竞态、critical、backend full、OpenSpec strict、whitespace、禁止依赖、SHA/status 双采样。
5. 再由新的独立 High 使用不同调度验证：cancel/timeout winner + completion 正常返回、completion 抛错、duplicate cancel、FAILED/ORPHANED 后 mutation、sequential call 与多 due-turn expiry。

## 后续门禁

- OpenSpec：无需新增 proposal；修正仍属于已批准 [add-chatgpt-oauth-auth change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/) 的既有 race、orphan、structured error 与 exact-turn lifecycle 合同。
- Superpowers：需要新的 Task 4.3 Attempt-04 correction，按 TDD RED→GREEN 后再次独立 High Review。
- Task 4.4：Task 4.3 High PASS 前不得实施。
- OpenSpec/dashboard：不得勾选 Task 4.3 checkbox，不得将 dashboard 标为 `verified`。
- 项目规则：本 Review 未修改项目规则。
