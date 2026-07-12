# ChatGPT/Codex OAuth Task 4.3 Attempt 02 High Review

## 结论

需修改。Correction attempt 已实质关闭上一轮的纳秒 expiry、sequential pending 终结、retention 自动失效和全局 Registry monitor 四项原始缺陷，且 Task 4.2 client 回归、focused、backend full、OpenSpec strict、whitespace 与禁止依赖门禁均通过；五个审查文件的 SHA-256 也与实施报告一致并在间隔 3 秒的双采样中保持稳定。

但新的独立并发探针在该稳定 SHA 上复现三项未关闭的合同缺口：cancel/timeout winner 尚未原子发布可供 loser 返回的 recorded terminal outcome；sequential call 的已回答 correlation 发生冲突重试时错误返回 `BRIDGE_TURN_GONE`；单次 expiry sweep 仍会被一个阻塞 interrupt 串行卡住，延迟其他已到期 turn。Task 4.3 当前不能 PASS、不能勾选对应 checkbox，也不能启动 Task 4.4 实施。

## Review 范围

- [Task 4.3 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-brief.md)
- [上一轮 Task 4.3 Medium BLOCKED Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-blocked-review.md)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Provider adapter OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Backend gateway OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- 当前 worktree 的实现、测试、status、SHA、focused/full/OpenSpec/diff-check/禁止依赖证据，以及独立仓库外并发探针。

## 主要发现

### High 1：cancel/timeout loser 可观察到空终态结果

[CodexPendingTurnRegistry.java 第 143–145 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L143) 在 completion bridge 返回后，只要状态已被 cancel/timeout 抢占，就立即返回 `entry.cachedResult`。但 [cancel 第 175–190 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L175) 与 [expireEntry 第 238–252 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L238) 都先发布终态，再在锁外执行阻塞 `terminate`，最后才写 `cachedResult`。同一窗口内的 loser 或重复 cancel 会观察到 `CANCELLING/TIMED_OUT + null`。

独立 latch probe 强制 completion 与 cancellation 同时停在 bridge I/O，实际输出：

```text
cancelRaceLoserState=CANCELLING, result=null
cancel-race=FAIL: cancellation loser observed null instead of recorded terminal outcome
```

这违反 [provider-adapter cancellation race scenario](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md#L70) 的“losing operation receives the recorded terminal outcome”。现有 race test 只断言 mutation 数量和状态集合，未断言 loser 的非空、结构化、同一终态结果。

修正要求：终态 winner 必须原子建立一个安全的 recorded outcome，或让同一 entry 的 loser 等待该 outcome 完成；cancel、timeout、重复 cancel 与 completion loser 都不得返回空结果，也不得发出第二次 responder mutation。

### High 2：sequential 已回答 call 的冲突重试被错误分类为 gone

[CodexPendingTurnRegistry.java 第 121–129 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L121) 只识别完全一致的上一 submission replay；不一致时立即按当前 `entry.correlation` 执行 `requireSubmission`。当 call-1 已返回 call-2 pending 后，call-1 的不同 key/payload 重试因此与当前 call-2 correlation 不匹配，返回 `BRIDGE_TURN_GONE`，而不是 `BRIDGE_RESULT_CONFLICT`。

独立 sequential probe 实际输出：

```text
sequentialPriorConflict=BRIDGE_TURN_GONE
sequential-conflict=FAIL: conflicting retry of answered sequential call was not conflict
```

这不满足 [pending-turn idempotency requirement](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md#L56) 对 `(bridgeId, callId, idempotencyKey, payload)` 的冲突语义。当前实现已能缓存 call-1 的一致 replay，但没有在进入当前 call-2 correlation 校验前识别“同一已回答 call 的不一致重试”。

修正要求：对最近已回答 call 保留有界、安全的 replay/conflict 元数据；同 call 的 identical retry 返回缓存 next response，不同 key/payload 返回 conflict，只有未知/过期/错误 identity 或无关 correlation 才返回 gone。新增 sequential call-1 identical replay、call-1 key conflict、call-1 payload conflict、call-2 正常完成四组断言。

### High 3：expiry sweep 的 bridge I/O 仍按 entry 串行

[expireDue 第 194–197 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L194) 顺序遍历所有 entry，并同步调用 `expireEntry`；后者在 [第 249 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L249) 阻塞执行 exact-turn interrupt。虽然 bridge I/O 已移出 entry lock，单个 sweep 仍会停在第一个慢 interrupt，后续已过期 turn 无法开始终止；[register 第 101 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L101) 还会同步触发该 sweep，使新 turn 注册也可能被无关过期 turn 拖住。

独立 probe 同时放入两个已到期、terminate 阻塞的 turn；释放前只观察到一个 interrupt 启动：

```text
expiryInterruptsStartedBeforeRelease=1
expiry-isolation=FAIL: one blocked interrupt serialized expiry of an unrelated turn
```

这说明上一轮“跨 turn 隔离”只修复了全局 monitor，并未关闭 expiry dispatcher 层的 head-of-line blocking。真实 client interrupt 虽有 bounded request timeout，但一个慢 turn 仍会按数量累加拖延其他 deadline。

修正要求：先在短锁内原子声明所有 due entry 的 terminal winner，再以有界、隔离的方式执行各自 terminate；一个 bridge 的等待不得阻止其他 due entry 开始 exact interrupt，也不得阻塞无关 register/complete/cancel。测试必须使用 terminate 本身阻塞的 bridge，而不是由 terminate 释放 completion 的立即返回 fake。

## 已确认关闭的旧 finding

- 纳秒 `expiresAt` 已在 [normalizedExpiry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L314) 截断至毫秒，秒/毫秒合同测试通过。
- `PendingToolCall` continuation 已保持 `PENDING_TOOL` 并更新 correlation/deadline；terminal transition 不再缓存 pending raw arguments。
- retention 已在 register、complete、cancel、inspect/expiry 路径自动清理，正常访问超过 retention 返回 gone。
- Registry 已改为 concurrent map + entry 短锁，常规不同 turn complete/cancel 不再被一个 completion 的全局 monitor 阻塞。
- Client exact interrupt 会先在需要时发送固定 `success=false` responder，再对精确 thread/turn 发送 `turn/interrupt`；Task 4.2 既有独立 probe 与本轮 client focused 回归未发现退化。

上述关闭项不抵消三项新独立 probe failure。

## Fresh 验证

- Focused：`ContractsTest,CodexAppServerClientTest,CodexProcessSupervisorTest,CodexPendingTurnRegistryTest`，42/42，exit 0。
- Backend full：110/110，exit 0。
- OpenSpec strict：change valid，exit 0；PostHog 网络 flush warning 不影响本地 validation。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，`rg` exit 1，符合预期。
- 独立并发/顺序 probe：3/3 复现 failure；probe source 仅存在于系统临时目录并在取证后删除，未修改项目实现。
- SHA 双采样间隔 3 秒且与实施报告一致：
  - Registry：`6ca7cd8cbc851cab073047c7afde0be7daad00d6242d6eb300151a7ac9df1dc3`
  - Registry test：`7a1411c4a05f1ff0bb67ebee8ae3075f570c911d69dee019b3e24a9ea6297288`
  - Client：`183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
  - Client test：`55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`
  - Contracts：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`
- 双采样的 `git status --short` 一致；本 Review 窗口未发现实现文件外部漂移。

测试全绿不能覆盖独立 probe 已复现的合同缺口，因此不改变“需修改”结论。

## 最终建议

1. 保留当前稳定 SHA 作为下一 correction baseline，不回滚已关闭的四项旧 finding，也不重写 Task 4.2 canonicalization/responder 逻辑。
2. 在 Task 4.3 同一范围创建新的 correction attempt，先把本 Review 三个 probe 场景转为正式 RED，再最小修正 Registry 状态发布、sequential conflict 分类和 expiry 调度隔离。
3. 若 Client 不需要再改，重跑 Task 4.2 probe 作为回归即可；若 Client 再变更，必须重新执行完整 Task 4.2 独立 probe。
4. fresh 运行 Registry/Client focused、至少 20 次竞态循环、backend full、OpenSpec strict、diff-check、禁止依赖搜索与开始/结束 SHA/status 双采样。
5. 由新的独立 High 使用不同调度顺序验证 cancel/timeout loser、duplicate cancel、sequential conflict/replay 和两个阻塞 expiry turn；Medium 不得自行 PASS。

## 后续门禁

- OpenSpec：无需新增 proposal；三项修正仍属于已批准 [add-chatgpt-oauth-auth change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/) 的既有 idempotency、race、timeout 与 exact-turn lifecycle 合同。
- Superpowers：需要新的 Task 4.3 correction Brief/attempt，按 TDD RED→GREEN 后再次独立 High Review。
- Task 4.4：Task 4.3 High PASS 前不得实施。
- OpenSpec/dashboard：不得勾选 Task 4.3 对应 checkbox，不得把 dashboard 标记为 `verified`。
- 真实 OAuth/provider：仍属后续 qualification，需要单独授权；mock/fake 证据不替代真实资格验证。
- Git：本 Review 不授权 add、commit、push、reset、clean、archive。
- 本 Review 未修改项目规则、实现、OpenSpec、checkbox 或 dashboard；仅新增本 Review 文档。
