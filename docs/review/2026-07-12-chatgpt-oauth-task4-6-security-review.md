# ChatGPT/Codex OAuth Task 4.6 Security and Slice Review

## 结论

通过。Task 4.1–4.5 的当前稳定实现通过跨 shared-schema、Java 与 TS Runtime 的安全负向矩阵及全量回归；Task 4.6 发现并关闭了 continuation DTO 静默接受 synthetic OAuth 字段的 strict-body 缺口。Task 4 切片整体可进入 Task 5 ProviderAdapter wiring，但本结论不等同于真实 OAuth/provider qualification。

## Review 范围

- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/packages/shared-schema/src/index.ts)
- [Contracts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [Codex process supervisor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java)
- [Codex app-server client](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [Pending-turn registry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [Pending-turn configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnConfiguration.java)
- [Continuation controller](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/CodexTurnController.java)
- [Java client](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/javaClient.ts)
- [TS runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/agentExecutionRunner.ts)
- [Approval store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/approvalStore.ts)
- [Continuation security tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/CodexTurnControllerTest.java)
- [TS pending-turn tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/test/codexPendingTurn.test.ts)
- Task 4.1–4.5 已落盘的各次 High Review，尤其 [Task 4.4 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-04-high-review.md) 与 [Task 4.5 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-5-high-review.md)。

## 主要发现

### 已关闭 Medium finding：unknown OAuth fields 被静默接受

安全探针向 result endpoint 注入 `accessToken`、`refreshToken` 与 result canary。RED 观察为 Controller 10 tests 中 1 failure：请求返回 HTTP 200 且执行 bridge mutation，说明 Spring 默认 ObjectMapper 忽略未知字段，与共享 strict schema 不一致。

修复在 result/cancel DTO 上增加 fail-closed `@JsonAnySetter`，只抛固定 `unknown field is not allowed`，不包含字段名或值。GREEN 覆盖 result 与 cancel synthetic OAuth fields、invalid Authorization 以及 malformed JSON：全部 HTTP 400/401、零 responder mutation、响应不回显 Authorization/OAuth/result/bridge canary。

### 安全所有权与负向依赖

- Java client/registry/controller 对 `ToolExecutionService`、`PolicyService`、`executeTool`、`approve` 搜索无匹配。
- 同一 Java 范围对 shell、MCP、credential path、access/refresh token、Codex home 搜索无匹配。
- 生产 source/resources/fixtures 对本轮 Authorization/OAuth/arguments/result canary 搜索无匹配。
- TS transport result 可送往 authenticated Java continuation，但 bridge id、raw arguments、result content、approval token 与 Authorization 不进入 history/runtime events/approval JSON persistence。
- malformed/auth/correlation/write/HTTP continuation failures使用固定结构化错误；cancel failure不覆盖原错误。

### Fresh verification

- Shared schema：58/58，exit 0。
- Java backend full：133/133，exit 0。
- Agent Runtime full：64 files、317/317，exit 0。
- Root typecheck：shared schema、agent runtime、frontend 全部 exit 0。
- OpenSpec strict：valid，exit 0；仅有非门禁 PostHog 离线 flush warning。
- `git diff --check`：无输出，exit 0。
- 三项禁止依赖/生产 canary 搜索：无匹配，`rg` exit 1。
- Task 4.5 独立临时 adversarial probe：1 test、8 assertions PASS，临时项目文件已删除。

### 稳定 SHA-256

间隔三秒双采样一致：

- Contracts：`de4c60a42d6d32770213b5bfe92e2f942331c414a08ef370e619c631e4a9dbf1`
- Controller test：`a55bc503044a1c5b563797ecc81fb09d59f41a2128a987cf684f5ce855e8e284`
- App-server client：`183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
- Registry：`2f332252b06d33d22d37e34024bee93fc3171859e8961f2ec405b5e918f76632`
- Controller：`e7ce5c9607b89a16d7a4ae7c73ea2c51cc54584cbc8117fc10bad5ead3e8515f`
- Java client：`391c9a97339b35347d39b4d77723b7907e88642d302235cfdfba2f4cc079e098`
- TS runner：`b28c9e434604e82ff758b90ffc801318cff1e479771456852a9ea53fd071e6a8`
- Approval store：`0a7d17928d0e53602e03ec07b5007279366bd5fdd24908e8ad8de49468100bd8`
- TS pending test：`4f4f24ce254e4e34044638c77ce25926b9cfd96cbe302d1b9ee70a34e163831b`

## 最终建议

接受 Task 4 切片并进入 Task 5。Task 5 只负责 ProviderAdapter/routing/status error wiring，不得重开 Java tool execution、读取 OAuth credential 或修改已通过的 pending-turn ownership。任何真实 login/provider call 继续保留到 Task 8 人工授权门禁。

## 后续门禁

- 无需新增 OpenSpec proposal；继续执行当前已批准 change。
- Task 5 必须 TDD、fresh verification 与独立 Review PASS 后才能进入 Task 7。
- 当前不更新 OpenSpec checkbox 或 dashboard verified；统一留到后续 23/23 对账与最终 verification。
- 未修改项目规则，未执行 Git add/commit/push/reset/clean/archive。
