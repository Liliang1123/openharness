# ChatGPT/Codex OAuth Task 4.3 Attempt-05 High Review

## 结论

通过。Task 4.3 Attempt-05 在稳定 SHA 上关闭了 Attempt-04 的 orphan/in-flight completion 正常返回竞态；独立对抗 probe 覆盖 orphan 正常与异常返回、cancel winner 与 throwing completion、sequential replay/conflict，以及八个同时到期且阻塞的 terminate fan-out，全部通过。Fresh focused、backend full、OpenSpec strict、whitespace 与禁止依赖门禁均通过，未发现新的阻塞 finding。

Task 4.3 可以关闭并协调对应 OpenSpec checkbox；Task 4.4 可以进入其独立 Brief/Preflight 门禁。本结论仅覆盖 Task 4.3 Registry，不代表 Task 4.4–4.5、真实 OAuth 或真实 Codex app-server qualification 已完成。

## Review 范围

- [Task 4.3 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-brief.md)
- [Attempt-04 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-04-high-review.md)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Provider adapter OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)

除本 Review 文档外未修改项目文件；独立 probe 的临时源码和 class 已清理。

## 主要发现

无阻塞 finding。

### 已关闭的关键路径

- completion 正常与异常返回都通过 null-safe `recordedTerminal(...)` 收口。
- cancel/timeout winner 存在 future 时，completion loser 返回同一非空 recorded outcome。
- ORPHANED/FAILED 没有可重放 future 时统一返回 `BRIDGE_TURN_GONE`，不再 join null 或泄漏裸异常。
- duplicate cancel 保持单次 terminate 和同一 cached outcome。
- sequential call 的 identical replay、key/payload conflict 与下一 call completion 保持正确。
- expiry sweep 先声明 due entries，再隔离启动 terminate；八个阻塞 terminate 均在释放前开始。
- responder exactly-once、retention、redaction、identity/correlation binding 和 restart orphan fail-closed 未见回归。

### 接受的后续资格风险

- recorded future 的实际等待上限依赖真实 Client request timeout；真实 app-server 时序属于后续 provider qualification，不阻塞 Task 4.3 内存 Registry 验收。
- 每个 due entry 使用一个虚拟线程；本次八路阻塞 probe 已验证功能隔离，生产容量上限仍应在后续生命周期/负载 qualification 中确认，不作为本切片未关闭 finding。

## 验证证据

- 最终 SHA-256 间隔三秒双采样一致：Registry `8da0af7ad85624809ca3f7bb1928b55352b239e74e5eba80cacba248855dde49`；Registry test `8f7ce7a2ccb42f4ba40e077aca5a623499813950e030ce66514644b5a8c08b04`；Client `183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`；Client test `55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`；Contracts `0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`。
- `git status --short` 双采样一致；未观察到外部写入漂移。
- Fresh critical focused：51/51 PASS，exit 0。
- Fresh backend full：119/119 PASS，exit 0。
- OpenSpec strict：valid，exit 0；PostHog 网络 warning 为非门禁 telemetry warning。
- `git diff --check`：无输出，exit 0。
- 禁止依赖搜索：无匹配，exit 1，符合预期。
- 独立 probe：4/4 PASS，exit 0；子矩阵为 orphan 2/2、cancel/throw race、sequential、expiry fan-out 8/8。

## 最终建议

1. 以本 Review 作为 Task 4.3 当前权威 PASS 结论，历史 Attempt-02 至 Attempt-04 Review 仅保留为修正时间线。
2. 协调 [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/tasks.md) 中对应 Task 4.3/Registry checkbox；该机械状态更新应由工作流所有者执行并复核，不在本只读 Review 中修改。
3. 下一步先审查现有 [Task 4.4 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-4-medium-brief.md) 是否仍基于当前 Task 4.3 SHA 和接口，再按其 Preflight 门禁实施。

## 后续门禁

- OpenSpec：无需新增 proposal；继续使用已批准 [add-chatgpt-oauth-auth change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)。
- Superpowers：Task 4.3 无需新 correction plan；Task 4.4 仍需当前 Brief 的 Preflight PASS、TDD 实施与新的独立 Review。
- Dashboard：整体 change 尚未完成，不在本 Review 中标记 `verified`。
- 项目规则：未修改。
