# ChatGPT/Codex OAuth Task 4.4 Attempt-04 Medium Brief

## 状态

已授权执行。Task 4.3 Attempt-06 已提供 identity-aware non-disclosing Registry error classification；production wiring、HTTP oracle、sequential pending envelope、文件范围和验证门禁均在本 Brief 唯一锁定。

## Prerequisite

- [Task 4.3 Attempt-06 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-06-high-review.md)
- Registry SHA：`2ea865ea6b80ae2509da3e400e0d91668bee87e6b78031486cf5b7178aa8b52e`
- Registry test SHA：`a90250df521f7025657e4040ca0dc0fb7fba6ad16bf51f1b4ad4cb4bee8c61cb`
- Client SHA：`183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
- Client test SHA：`55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`
- Contracts SHA：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`

## 批准依据

- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Attempt-03 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-03-medium-brief.md)

## 允许修改

- 新增 [CodexTurnController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/CodexTurnController.java)
- 新增 [CodexTurnControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/CodexTurnControllerTest.java)
- 新增 [CodexPendingTurnConfiguration.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnConfiguration.java)
- 新增 [CodexPendingTurnConfigurationTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnConfigurationTest.java)
- 最小修改 [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java) 与 [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)，仅让 `RegistryResult` 原子携带 sequential `PendingCodexTurn`。
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java) 与 [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java) 只在有效 RED 证明 compatibility 缺失时修改；不得注入未使用 Registry。

禁止修改 Contracts/shared schema、AuthFilter、Client、TS Runtime、ProviderRegistry/ModelRouter、OpenSpec、checkbox、dashboard、项目规则或历史 Review。

## Production wiring

- 唯一 `@Configuration(proxyBeanMethods = false)` owner。
- 具名 singleton `codexPendingTurnClock = Clock.systemUTC()`。
- 唯一 singleton Registry bean，通过 qualifier 使用上述 Clock。
- `openharness.codex.pending-turn.ttl`：ISO-8601，默认 `PT65M`，inclusive `PT1S..PT24H`。
- `openharness.codex.pending-turn.retention`：ISO-8601，默认 `PT5M`，inclusive `PT1S..PT1H`。
- 配置类从 Spring `Environment` 读取文本并显式 `Duration.parse`；parse/range failure 抛出不携带原值或 cause 的固定脱敏 `IllegalArgumentException`，context fail closed。
- 默认 TTL 高于 TS approval 60 分钟及 execution 30 分钟。

## RegistryResult 原子 envelope

- `RegistryResult` 增加 nullable `PendingCodexTurn pendingTurn`。
- sequential completion 在同一 entry lock 内更新 correlation/expiry 后，用当前 `bridgeId`、next call 字段及 exact `expiresAt` 构造 envelope。
- identical replay 返回相同 cached next pending envelope 并设置 `idempotentReplay=true`。
- final/error/cancel/terminal outcome 的 `pendingTurn` 必须为 null。
- 不新增 `inspect` 调用、第二次 lookup、schema 或状态转换。

## HTTP contract

- `POST /api/v1/model/codex/turns/{bridgeId}/tool-result`。
- `POST /api/v1/model/codex/turns/{bridgeId}/cancel`。
- AuthFilter 继续处理 token/required headers 401。
- Controller 从 `X-Tenant-Id`、`X-User-Id`、`X-Request-Id` 与 body conversation 构造 Registry Identity；body request/correlation 仍由 Registry 精确校验。
- `BRIDGE_TURN_NOT_FOUND` → 404；`BRIDGE_TURN_GONE` → 410；`BRIDGE_RESULT_CONFLICT` → 409。错误 message 固定脱敏。
- 有效 mutation 返回 HTTP 200 `ModelChatResponse`，exactly one of message/pendingTurn/error。
- FinalTurn → assistant message、reasoning block、usage；PendingToolCall → RegistryResult 的 pending envelope；ErrorTurn → structured response error。`rawProvider` 固定 `codex-app-server`。
- replay 原样传播 `idempotentReplay`；拒绝路径不得调用 responder。

## TDD 与验证

1. 启动前双采样 prerequisite SHA/status；漂移停止。
2. Configuration RED、Registry sequential envelope RED、Controller endpoint RED；必须因缺失能力失败。
3. GREEN focused：Configuration、Controller、ModelController、Registry、Client tests。
4. Client/supervisor 与 Auth/API regression。
5. Fresh backend full、OpenSpec strict、`git diff --check`、禁止 Java tool/policy/approval/shell/MCP/credential/OAuth 依赖搜索。
6. 独立 MockMvc/context adversarial probe；完成后双采样 SHA/status。

## 停止条件

- 需要修改 shared schema、AuthFilter contract、Registry 状态机、TS Runtime、Adapter 或真实 Provider。
- 需要 Controller-side `inspect`/existence precheck、第二个 Registry 或未使用 ModelController 注入。
- 配置异常泄漏原始值；身份错误泄漏 bridge 状态；无法证明 exactly-once。
- 发现并发外部写入。

## 后续门禁

实施报告不得自行 PASS；fresh verification 后必须形成独立 Task 4.4 High Review。PASS 前不得进入 Task 4.5。
