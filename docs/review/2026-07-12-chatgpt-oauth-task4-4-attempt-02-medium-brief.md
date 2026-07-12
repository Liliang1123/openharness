# ChatGPT/Codex OAuth Task 4.4 Attempt-02 Medium Brief

## 状态

BLOCKED，禁止派发实施。本 Brief 已修正可由当前契约确定的 prerequisite、HTTP 与 RED/GREEN 边界，但批准材料尚未唯一确定 `CodexPendingTurnRegistry` 的生产 Spring bean owner、配置来源和默认值。该 control-plane 决策补齐并经新的 Preflight PASS 前，Medium Agent 不得开始 Task 4.4。

## Prerequisite 与稳定基线

唯一权威 prerequisite 是 [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)。历史 Task 4.3 Review 不得替代它，也不得重新 Review 或修改已 PASS 的 Task 4.3。

当前稳定 SHA-256：

- Registry：`8da0af7ad85624809ca3f7bb1928b55352b239e74e5eba80cacba248855dde49`
- Registry test：`8f7ce7a2ccb42f4ba40e077aca5a623499813950e030ce66514644b5a8c08b04`
- Client：`183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
- Client test：`55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`
- Contracts：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`

实施开始前必须间隔至少 3 秒双采样上述五项和 `git status --short`；任何漂移或外部写入立即 BLOCKED。

## 批准依据与必读文件

- [项目规则](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md)
- [OpenSpec 规则](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/AGENTS.md)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [Backend gateway delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Provider adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)

## 目标与范围

仅实现批准计划的 Task 4.4：新增 internal service-authenticated result/cancel Controller，将 headers、path `bridgeId` 和现有 body correlation 委托给同一个 Registry bean；把 Registry 结果映射为 next pending、final 或 structured error；仅做 `/api/v1/model/chat` 的既有 `pendingTurn` contract compatibility。不得实现 Task 4.5 TS bridge、Task 5 Adapter、真实 provider wiring 或任何 OAuth 行为。

## 生产 wiring：未获批准的唯一 blocker

当前事实：Registry 不是 Spring component，public constructor 需要 `Clock`、`pendingTtl` 与 `retention`。批准 design 只规定 pending deadline 可配置且 retention 有界；批准 plan 未指定 bean owner、属性名、默认值或额外 configuration 文件。Registry tests 使用的 30 秒与 5 分钟仅是测试 fixture，不是生产默认值授权。

因此本 Attempt 不授权下列任一选择：给 Registry 增加 `@Component`/默认构造器、由 Controller `new` Registry、在 Controller 内声明 `@Bean`、新增 configuration class、扩展 `ProviderProperties` 或把 fixture 数值当生产默认值。control-plane 必须先在已批准材料中补充唯一方案，至少锁定：

1. 唯一 bean owner 与 bean scope；
2. `Clock` 来源（生产必须是明确的 UTC/system clock bean 或构造来源）；
3. pending TTL 与 retention 的配置键、类型、校验、来源及生产默认值；
4. 只允许修改的精确 production/test 文件；
5. Controller 与 chat-start path 共享同一 Registry 实例的 wiring test。

若补充上述决定需要新增公共配置契约或扩大当前 OpenSpec/plan，先回 control-plane 复核；不得由 Medium Agent 设计。

## 预期允许文件（仅在 wiring 决策补齐并新 Preflight PASS 后生效）

- 新增 [CodexTurnController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/CodexTurnController.java)
- 新增 [CodexTurnControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/CodexTurnControllerTest.java)
- 最小修改 [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- 最小修改 [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)
- Registry wiring 所需 production/test 文件：当前未批准，必须由下一 revision 精确列出；在此之前不得修改 Registry 或新增装配文件。

禁止修改 Contracts/shared schema、AuthFilter contract、CodexAppServerClient、Registry 状态机语义、TS Runtime、ProviderRegistry/ModelRouter、OpenSpec、checkbox、dashboard、项目规则和历史 Review。

## HTTP mapping 与 non-disclosure

- Endpoint 固定为 `POST /api/v1/model/codex/turns/{bridgeId}/tool-result` 与 `POST /api/v1/model/codex/turns/{bridgeId}/cancel`。
- missing/invalid service token 或 required identity header 继续由现有 AuthFilter 返回 HTTP 401 及其现有 structured error；Controller 不改写。
- service auth/headers valid，但 path bridge 未知或属于其他身份，或 request/conversation/thread/turn/call 任一不匹配：统一 HTTP 404，统一 `BRIDGE_TURN_NOT_FOUND` structured error，message 不包含 bridge/correlation/raw content；responder call count 必须为 0。不得用 403/404 二选一。
- body contract 没有 `bridgeId`；禁止新增 body `bridgeId`，禁止 `path/body bridge mismatch` 测试。攻击测试改为未知/他人 path bridge 搭配已知或伪造 correlation，均命中上述统一 404 oracle。
- exact identity/correlation 的 expired/orphan/gone：HTTP 410 + `BRIDGE_TURN_GONE`。
- conflicting replay：HTTP 409 + `BRIDGE_RESULT_CONFLICT`。
- identical replay：返回缓存的 redacted continuation，`idempotentReplay=true`，responder 总调用次数仍为 1。
- cancel 与 completion 竞争：Registry winner 生效，loser 获 recorded terminal outcome，app-server responder/terminate 不得发生第二次调用。
- 所有 continuation response 仍满足 exactly one of `message|pendingTurn|error`。

## TDD RED/GREEN（仅供下一 revision 继承）

1. 记录 start `git status --short` 和五项 SHA，等待至少 3 秒复算；不稳定立即 BLOCKED。
2. Baseline：`mvn -o -f backend/pom.xml -Dtest=ContractsTest,CodexAppServerClientTest,CodexPendingTurnRegistryTest,ModelControllerTest test` 与 `mvn -o -f backend/pom.xml test`，均须 exit 0。
3. MVC RED 覆盖 endpoint absent、valid result/cancel、AuthFilter 401、未知/跨身份/逐项 correlation mismatch 统一 404 + call count 0、gone 410、conflict 409、replay/cancel exactly-once、secret redaction、exactly-one response、非 Codex compatibility，以及同一 Registry bean wiring。
4. RED：`mvn -o -f backend/pom.xml -Dtest=CodexTurnControllerTest test`，必须因 endpoint/controller/明确 wiring 缺失失败；fixture、编译泛型或 AuthFilter setup 错误不算有效 RED。
5. GREEN focused：`mvn -o -f backend/pom.xml -Dtest=CodexTurnControllerTest,ModelControllerTest,CodexPendingTurnRegistryTest,CodexAppServerClientTest test`。
6. Auth/supervisor regression：`mvn -o -f backend/pom.xml -Dtest=BackendApiTest,ModelControllerTest,CodexTurnControllerTest,CodexProcessSupervisorTest test`。
7. Fresh backend full：`mvn -o -f backend/pom.xml test`。
8. Fresh gates：`npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`、`git diff --check`。
9. 禁止依赖门禁：`rg -n "ToolExecutionService|PolicyService|Approval|approve|MCP|ProcessBuilder|credential|OAuth" backend/src/main/java/org/openharness/backend/api/CodexTurnController.java backend/src/main/java/org/openharness/backend/api/ModelController.java`；任何本切片新增执行、策略、凭据依赖均失败。
10. 完成后复跑 SHA/status 双采样；漂移或外部写入立即 BLOCKED，证据不得跨 revision 混用。

## 停止、回滚与 Git 边界

立即停止：SHA 漂移/外部并发写入；wiring 决策仍缺失；需要修改 schema/AuthFilter/Registry 状态机/TS/Adapter/OpenSpec；身份错误会泄露存在性；无法证明 responder exactly-once；出现 credential/OAuth/真实 endpoint/Java tool execution。

不执行 `git add`、`commit`、`push`、`reset`、`clean`、`checkout`、`archive`。不得覆盖既有 dirty worktree。回滚只允许提出 allow-list 内的 reviewed inverse patch，不自行执行破坏性 Git 操作。

## 实施与 Review 输出门禁

只有本 Brief 的后续 revision 获独立 control-plane-high Preflight PASS 后才可派发 cohesive-medium 实施。实施报告以 `DONE_WITH_CONCERNS` 或 `BLOCKED` 开头，不得自行 PASS；须包含 actual diff、有效 RED/GREEN、HTTP matrix、responder counts、fresh gates、最终 SHA/status、并发稳定性与残余风险。随后必须由不同实例执行独立 High Review 与对抗 MVC probe。
