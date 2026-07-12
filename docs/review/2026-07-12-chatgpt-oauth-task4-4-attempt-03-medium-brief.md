# ChatGPT/Codex OAuth Task 4.4 Attempt-03 Medium Brief

## 状态

BLOCKED，禁止派发实施。control-plane 已唯一锁定 Registry production wiring，Attempt-02 的 wiring blocker 已关闭；但当前 Registry public API 无法在不泄漏存在性的前提下区分 unknown/cross-identity 与 exact-owner gone，因而无法同时满足固定 404 与 410 HTTP contract。该 API 缺口未获本 Brief allow-list 授权，必须先由 control-plane 修订边界并重新 Preflight。

## Prerequisite 与稳定基线

唯一 prerequisite 是 [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)。不得重新 Review 或修改 Task 4.3。

当前稳定 SHA-256：

- Registry：`8da0af7ad85624809ca3f7bb1928b55352b239e74e5eba80cacba248855dde49`
- Registry test：`8f7ce7a2ccb42f4ba40e077aca5a623499813950e030ce66514644b5a8c08b04`
- Client：`183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
- Client test：`55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`
- Contracts：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`

未来实施开始前必须等待至少 3 秒双采样五项 SHA 与 `git status --short`；漂移或外部写入立即 BLOCKED。

## 批准依据与必读文件

- [项目规则](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md)
- [OpenSpec 规则](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/AGENTS.md)
- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Attempt-02 Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-02-medium-brief.md)
- [Attempt-02 Preflight](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-02-medium-brief-preflight-review.md)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)
- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/agentExecutionRunner.ts)

## 目标与严格 allow-list

仅实现批准计划 Task 4.4 的 authenticated internal result/cancel HTTP boundary 与唯一 Registry production wiring。精确允许：

- 新增 [CodexTurnController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/CodexTurnController.java)
- 新增 [CodexTurnControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/CodexTurnControllerTest.java)
- 新增 [CodexPendingTurnConfiguration.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnConfiguration.java)
- 新增 [CodexPendingTurnConfigurationTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnConfigurationTest.java)
- 仅在实际 compatibility finding 已由 RED 证明时，最小修改 [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java) 与 [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)

不得修改 Registry、Contracts/shared schema、AuthFilter、Client、TS Runtime、ProviderRegistry/ModelRouter、OpenSpec、checkbox、dashboard、项目规则或历史 Review。不得为了“共享 Registry”向 ModelController 注入未使用依赖；现有 pending response compatibility 由现有测试保持，Task 5 Adapter 后续复用 singleton。

## 已锁定的 production wiring

[CodexPendingTurnConfiguration.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnConfiguration.java) 是唯一 bean owner，使用 Spring `@Configuration`：

1. 声明具名 singleton bean `codexPendingTurnClock`，值必须为 `Clock.systemUTC()`；Registry bean 参数通过同名 qualifier 注入，禁止依赖任意其他 Clock。
2. 声明唯一 singleton `CodexPendingTurnRegistry` bean，由配置类调用现有三参数 constructor；禁止 Registry `@Component`、默认构造器、Controller 内 `new` 或 `@Bean`。
3. `openharness.codex.pending-turn.ttl` 使用 ISO-8601 `Duration`，默认 `PT65M`，inclusive 合法范围 `PT1S..PT24H`。
4. `openharness.codex.pending-turn.retention` 使用 ISO-8601 `Duration`，默认 `PT5M`，inclusive 合法范围 `PT1S..PT1H`。
5. 采用 Spring 属性转换；无法解析、零、负数、低于下界或高于上界时，Registry bean 创建必须抛出不含属性原值/秘密的 `IllegalArgumentException`，Spring context 启动 fail closed。
6. 默认 TTL 65 分钟严格大于当前 TS approval 60 分钟（`3_600_000ms`）和 execution 30 分钟（`1_800_000ms`）。本切片不修改 TS deadline。
7. Configuration test 必须验证默认值、合法 override、四个 inclusive 边界、parse failure、零/负数、四个越界方向、唯一 Registry singleton、具名 Clock singleton 且 zone 为 UTC。
8. wiring test 必须证明 Controller 获得 context 中同一个 Registry bean；不得为测试增加第二个生产 Registry。

## HTTP contract 与当前阻塞

- Endpoint：`POST /api/v1/model/codex/turns/{bridgeId}/tool-result` 与 `POST /api/v1/model/codex/turns/{bridgeId}/cancel`。
- AuthFilter missing/invalid service token 或 required header：保持现有 HTTP 401 structured contract。
- valid service auth 下 unknown bridge、cross-identity 或 request/conversation/thread/turn/call mismatch：统一 HTTP 404 + `BRIDGE_TURN_NOT_FOUND`，message 不含 bridge/correlation/raw content，responder call count 为 0。
- exact identity/correlation 的 expired/orphan/gone：HTTP 410 + `BRIDGE_TURN_GONE`。
- conflict：HTTP 409 + `BRIDGE_RESULT_CONFLICT`；identical replay 返回 cached redacted response 且 `idempotentReplay=true`。
- cancel/result race 与 replay 必须保持 responder/terminate exactly-once。
- body 不含 `bridgeId`；禁止 path/body mismatch 或 schema 扩展。

当前 Registry 的 `requireEntry(...)` 对 absent bridge 和 identity mismatch 直接抛出与 exact-owner terminal/gone 相同的 `BridgeException("BRIDGE_TURN_GONE")`。Controller 看不到安全分类；无身份 `inspect(bridgeId)` 不能用于 HTTP mapping，因为它会把 bridge 存在性变成侧信道并存在 TOCTOU。由于 Registry 不在 allow-list，本 Attempt 无法合法实现上述 404/410 区分，必须 BLOCKED。

## TDD RED/GREEN（仅供解除 blocker 后的新 revision 继承）

1. 记录并双采样五项 SHA 与完整 status；不稳定立即停止。
2. Baseline：`mvn -o -f backend/pom.xml -Dtest=ContractsTest,CodexAppServerClientTest,CodexPendingTurnRegistryTest,ModelControllerTest test` 与 backend full，均须 exit 0。
3. Configuration RED：`mvn -o -f backend/pom.xml -Dtest=CodexPendingTurnConfigurationTest test`，必须因配置类/beans 缺失失败。
4. Controller RED：`mvn -o -f backend/pom.xml -Dtest=CodexTurnControllerTest test`，必须因 endpoints 缺失失败；fixture、AuthFilter setup、编译错误不算有效 RED。
5. RED matrix 覆盖 valid result/cancel、Auth 401、统一 404 + responder 0、410、409、identical replay、cancel/result exactly-once、secret redaction、exactly-one response、非 Codex compatibility、same singleton wiring。
6. GREEN focused：`mvn -o -f backend/pom.xml -Dtest=CodexPendingTurnConfigurationTest,CodexTurnControllerTest,ModelControllerTest,CodexPendingTurnRegistryTest,CodexAppServerClientTest test`。
7. Client + supervisor regression：`mvn -o -f backend/pom.xml -Dtest=CodexAppServerClientTest,CodexProcessSupervisorTest,CodexPendingTurnRegistryTest,CodexPendingTurnConfigurationTest,CodexTurnControllerTest test`。
8. Auth/API regression：`mvn -o -f backend/pom.xml -Dtest=BackendApiTest,ModelControllerTest,CodexTurnControllerTest test`。
9. Fresh backend full：`mvn -o -f backend/pom.xml test`。
10. Fresh gates：`npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`、`git diff --check`，以及禁止执行/approval/credential 依赖扫描。
11. 完成后重新双采样实际修改文件 SHA/status；任何漂移使证据 BLOCKED，禁止跨 revision 混用。

## 停止、回滚与 Git 边界

立即停止：当前 404/410 分类缺口未解决；SHA 漂移或外部并发写入；需要越过 allow-list；配置无法在 context startup fail closed；需要 schema/AuthFilter/TS/Adapter/OpenSpec 变更；身份泄漏；无法证明 exactly-once；出现 credential/OAuth/真实 endpoint/Java tool execution。

不得执行 `git add`、`commit`、`push`、`reset`、`clean`、`checkout` 或 `archive`，不得覆盖既有 dirty worktree。回滚只能提出 allow-list 内 reviewed inverse patch，不自行执行破坏性 Git 操作。

## 实施报告与后续 Review

仅在新 revision Preflight PASS 后派发 cohesive-medium。实施报告必须以 `DONE_WITH_CONCERNS` 或 `BLOCKED` 开头，包含 actual diff、有效 RED/GREEN、配置矩阵、HTTP matrix、responder counts、fresh gates、最终 SHA/status、并发稳定性与风险；不得自行 PASS。随后由不同实例执行独立 High Review 与对抗 MVC/context probe。
