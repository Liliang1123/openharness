# Task 4.3 Medium BLOCKED Report Review

## 结论

需修改。实施 Agent 在发现范围外文件消失后停止写入，符合 [Task 4.3 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-brief.md) 的并发停止条件；因此其 `BLOCKED` 流程判断成立，当前不得进入 Task 4.3 High Review，也不得启动 Task 4.4。

但恢复条件不能仅是“确认外部写入停止并重跑测试”。独立审计在当前稳定 SHA 上复现了三项 High 行为缺陷，并确认一项 High 并发/可取消性缺口。即使并发门禁解除，当前实现仍不能判定 `DONE_WITH_CONCERNS` 或送交 PASS 审查；必须先进入新的 Task 4.3 correction attempt，完成 RED→GREEN 后再进行独立 High Review。

## Review 范围

- [Task 4.3 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-brief.md)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [OpenSpec provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- 实施 Agent 提供的 RED/GREEN、race、full、OpenSpec、diff-check、SHA 与并发阻塞报告。
- 仓库外只读 probe；probe 仅编译到系统临时目录，未修改项目文件。

## 主要发现

### High 1：生产时钟精度可使 `register` 直接失败

[CodexPendingTurnRegistry.java 第 86–91 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L86) 直接对 `Clock.instant().plus(...)` 使用 `ISO_INSTANT`。常见的 `Clock.systemUTC()` 会产生纳秒精度字符串，而 [Contracts.java 第 218–227 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java#L218) 只允许秒或三位毫秒。

独立 probe 使用 `Clock.systemUTC()` 调用 `register`，实际得到 `IllegalArgumentException: expiresAt must use UTC seconds or milliseconds`。现有测试仅使用整秒固定时钟，未覆盖生产精度。

修正要求：在 Registry 边界按共享合同规范化为秒或毫秒精度，并新增非零纳秒、毫秒和秒边界测试。

### High 2：sequential pending 被错误终结，并把下一调用的 raw arguments 缓存进终态

[CodexPendingTurnRegistry.java 第 111–118 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L111) 对 `TurnBridge.complete(...)` 返回的所有 `TurnResult` 都无条件写为 `COMPLETED`、缓存结果并清空 bridge。若 app-server 在同一 turn 返回第二个 `PendingToolCall`，正确状态应回到 `PENDING_TOOL`，而不是完成。

独立 probe 让 bridge 返回第二个 pending call，实际输出：`registryState=COMPLETED, nextCall=call-2, cachedRawArguments={"secret":"NEXT-CANARY"}`。这同时违反 sequential tool call 状态机和“终态不得保留 raw arguments”的安全边界。

修正要求：显式分派 `PendingToolCall`、`FinalTurn`、`ErrorTurn`；下一 pending 必须更新 correlation/responder 所有权并保持同一 turn 可继续，终态缓存不得包含 `PendingToolCall.argumentsRaw`。新增 sequential two-call 与 canary retention RED 测试。

### High 3：terminal retention 到期不会在正常访问路径生效

[CodexPendingTurnRegistry.java 第 147–153 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L147) 只有显式调用 `purgeExpiredTerminal()` 才删除过期终态；[requireEntry 第 174–178 行](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L174) 不执行 purge，也不检查 `retainedUntil`。

独立 probe 在完成后推进时钟超过 retention、未调用显式 purge，再提交相同结果，实际仍返回 `state=COMPLETED, idempotentReplay=true`。因此缓存窗口并非由 Registry 自身强制有界。

修正要求：所有公开访问/注册路径先清理到期终态，或提供由本切片证明已接线的确定性调度器；新增“无需测试手工 purge，超过 retention 必须 `BRIDGE_TURN_GONE`”的 RED 测试。

### High 4：全局 monitor 包裹阻塞式 bridge 调用，timeout/cancel 无法抢占

`complete` 与 `cancel` 均为对象级 `synchronized`，且分别在锁内调用 bridge（[complete 调用点](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L94)、[cancel 调用点](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java#L127)）。真实 `resumeToolCall` 可等待 app-server continuation；当一个 turn 阻塞时，其他 turn 的 complete、cancel、expire 与 purge 都无法进入，且同一 turn 的 cancel 不能抢占已开始的 complete。

现有 race test 的 fake bridge 立即返回，只证明锁串行化后 mutation 次数为 1，没有证明阻塞 continuation 下的精确 cancel/timeout。现有 [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java) 也没有可审计的 exact-turn interrupt 公共边界。

修正要求：状态预留与 bridge I/O 分离，按 entry/turn 而不是全 Registry 串行化；用 latch/barrier 构造不会立即返回的 bridge，证明其他 turn 不被阻塞，并证明 timeout/cancel 会失败 outstanding responder 后中断精确 turn。若 Client 边界不足，按 Medium Brief 授权最小扩展并重跑 Task 4.2 独立 probe。

### Blocker：并发文件消失的报告合理，但当前无法独立回溯

实施 Agent 报告开始时存在 [Task 4.3–4.6 preflight review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-to-4-6-preflight-review.md)，最终状态中消失。当前文件不存在，且不是 Git 已跟踪文件，仓库历史无法独立证明其此前内容或删除主体。因此该报告足以触发执行窗口的 fail-safe `BLOCKED`，但不能作为实现正确性的证据，也不能仅靠聊天确认关闭。

本 Review 对五个实现/基线文件进行间隔 3 秒的双 SHA 采样，结果一致；这只证明本 Review 短窗口稳定，不证明外部写入方永久停止。

## Fresh 验证

- Focused：Contracts + Client + Supervisor + Registry，36/36，exit 0。
- Backend full：104/104，exit 0。
- OpenSpec strict：change valid，exit 0；PostHog 离线 warning 非校验失败。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，`rg` exit 1，符合预期。
- 独立 sequential/retention/clock probe：复现上述三项 High finding。
- SHA 双采样一致：
  - Registry：`4694bc04603c3656a0fa26fd397ad0d6d407387f5af7c17a7a7a50258c0fd93b`
  - Registry test：`a91c0152359b1931b399cf5b90d2c71370ee644c2c4988966a547bc50f7952d0`
  - Client：`112cbf17166197cd2b47d315888544a45ff7b3daa01fa05664936f58a2ea42e3`
  - Client test：`436efebf5b4dab729513f48e40c7c2cfd339b22d3a9f489cc64f05d297acbb63`
  - Contracts：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`

测试全绿不能覆盖独立 probe 已复现的合同缺口，因此不改变“需修改”结论。

## 最终建议

1. 保留当前两个 Task 4.3 文件作为 correction baseline，不回滚 Task 4.2 已通过制品。
2. 先由外部执行者确认停止，并以当前 SHA 重新建立独占写入窗口。
3. 在同一 Task 4.3 correction attempt 中先新增四组 RED：纳秒 expiresAt、sequential pending/canary、retention 自动失效、阻塞 bridge 下跨 turn 与 cancel/timeout。
4. 最小修正 Registry；只有确实缺少 exact-turn interrupt 时才按 Brief 修改 Client，并完整重跑 Task 4.2 probe。
5. 完成 fresh focused、20 次 race、backend full、OpenSpec strict、diff-check、负向搜索及开始/结束 SHA 双采样后，输出新的 `DONE_WITH_CONCERNS`。
6. 再发起新的独立 Task 4.3 High Review；不得复用本次 probe 作为唯一独立证据。

## 后续门禁

- 不需要新增 OpenSpec proposal：修正内容仍在已批准 [add-chatgpt-oauth-auth change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/) 与既有计划范围内。
- 需要新的 Task 4.3 correction Brief/attempt 和独立 High Review。
- Task 4.3 High Review PASS 前，Task 4.4 Brief 不得执行。
- 当前不得勾选 OpenSpec Task 3.5，不得把 dashboard 标记为 `verified`。
- 本 Review 未修改项目规则、实现、OpenSpec、checkbox 或 dashboard；未执行 Git 写操作。
