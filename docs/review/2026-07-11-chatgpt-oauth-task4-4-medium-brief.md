# ChatGPT/Codex OAuth Task 4.4 Medium Brief

## 状态

条件性待执行。只有 [Task 4.3 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-high-review.md) 明确 PASS、实现 SHA 稳定且无写入 Agent 后，才允许开始。本 Brief 不授权与 Task 4.3 并发实施。

## 目标

仅实现已批准计划的 Task 4.4：新增内部 service-authenticated Codex result/cancel HTTP boundary，将请求头和 payload 的精确身份/correlation 交给已通过的 `CodexPendingTurnRegistry`，返回同一 app-server turn 的 next pending、final 或 structured error；同时让 Codex `/api/v1/model/chat` 起始响应可以返回既有 `pendingTurn` contract。非 Codex provider 必须保持同步和兼容。

## 批准依据与必读文件

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [Backend gateway delta spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Provider adapter delta spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Task 4.2 PASS Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-2-attempt-04-high-review.md)
- [Task 4.3 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-medium-brief.md)
- [Task 4.3 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-high-review.md)
- [AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)

## 允许修改

- 新增 [CodexTurnController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/CodexTurnController.java)
- 新增 [CodexTurnControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/CodexTurnControllerTest.java)
- 最小修改 [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- 最小修改 [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)
- 如 Spring 装配确实需要，可只给已经通过的 `CodexPendingTurnRegistry` 增加无行为变化的 component wiring；任何状态机或语义修改必须停止并返回 Task 4.3 correction + High Review。
- 本 Brief 只读，不由实施 Agent 改写。

禁止修改 AuthFilter 的 token/header 规则、Contracts/shared schema、CodexAppServerClient、TS Runtime、ProviderRegistry/ModelRouter、OpenSpec、dashboard、项目规则和既有 Review。若发现 contract 缺失，返回 `BLOCKED`，不得在 Task 4.4 顺手扩展 schema。

## HTTP 合同与不变量

- Endpoint 固定为 `POST /api/v1/model/codex/turns/{bridgeId}/tool-result` 与 `POST /api/v1/model/codex/turns/{bridgeId}/cancel`。
- 继续使用现有 `AuthFilter`：`Authorization: Bearer dev-service-token` 及 `X-User-Id`、`X-Tenant-Id`、`X-Trace-Id`、`X-Request-Id` 必须存在；不得新增 OAuth/token 读取路径。
- result body 使用已锁定的 `CodexToolResultSubmission`；cancel body 使用 `CodexTurnCancelRequest`。Controller 不重新定义、放宽或复制 validator。
- path `bridgeId`、headers 与 body 的 request/conversation/thread/turn/call 必须由 Registry 做精确匹配。Controller 只提取、校验、委托和映射结果。
- missing/invalid service token 沿用现有 AuthFilter 结构化错误。跨 tenant/user/request/bridge/correlation 的响应必须 non-disclosing，且不得触发 app-server responder。
- identical result replay 返回缓存的下一 `ModelChatResponse` 并设置 `idempotentReplay=true`；conflict 映射 HTTP 409 + `BRIDGE_RESULT_CONFLICT`；gone/orphan/expired 映射 HTTP 410 + `BRIDGE_TURN_GONE` 或已批准的明确 expiry error。不得把这些情况映射为成功或 fallback。
- cancel 必须幂等且遵循 Registry 已判定的 winner；与 completion 竞争时不得写第二次 responder。
- 每个 continuation response 仍满足 exactly one of `message|pendingTurn|error`；不得返回 assistant stub、raw app-server frame 或 tool result。
- `/api/v1/model/chat` 只在 `openai-codex/*` 已有 adapter/registry wiring 能产生 pending 时透传既有 `pendingTurn`；不得在本切片实现 Task 5 Adapter。若生产 Codex start wiring 尚不存在，仅验证 Controller/response contract，不得伪造生产 route。
- 非 Codex provider、mock、compress、cost calculation 和现有 API-key route 行为保持不变。
- Controller/ModelController 不得注入或调用 `ToolExecutionService`、`PolicyService`、approval store、MCP、shell、ProcessBuilder 或 credential path。
- HTTP 错误、日志、trace 和 MVC failure message 不得包含 raw arguments、result content、bridge id、Authorization/OAuth-like canary 或 app-server error body。

## TDD 执行顺序

1. 启动前确认 Task 4.3 High Review PASS，记录 `git status --short` 与 Task 4.2/4.3 实现 SHA，等待 3 秒复算；漂移立即 `BLOCKED`。
2. 建立 fresh baseline：运行 `mvn -o -f backend/pom.xml -Dtest=ContractsTest,CodexAppServerClientTest,CodexPendingTurnRegistryTest,ModelControllerTest test` 和 backend full，均须 exit 0。
3. 新增 MVC RED tests，至少覆盖：valid result、valid cancel、missing/invalid token、missing required header、path/body bridge mismatch、tenant/user/request/correlation 逐项 mismatch、expired/gone、identical replay、conflict、cancel/complete winner、non-disclosing cross-identity、exactly-one response、secret canary、非 Codex regression。
4. RED 命令：`mvn -o -f backend/pom.xml -Dtest=CodexTurnControllerTest test`。必须因 endpoint/controller 缺失失败；AuthFilter/test fixture 错误不算有效 RED。
5. 实现最薄 Controller 与必要的 ModelController compatibility；不得实现 Task 4.5 TS Runtime、Task 5 Adapter 或真实 provider wiring。
6. GREEN focused：`mvn -o -f backend/pom.xml -Dtest=CodexTurnControllerTest,ModelControllerTest,CodexPendingTurnRegistryTest,CodexAppServerClientTest test`。
7. Auth/API regression：`mvn -o -f backend/pom.xml -Dtest=BackendApiTest,ModelControllerTest,CodexTurnControllerTest test`。
8. Fresh critical：`mvn -o -f backend/pom.xml test`、`npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`、`git diff --check`。
9. 负向依赖搜索：`rg -n "ToolExecutionService|PolicyService|Approval|approve|MCP|ProcessBuilder|credential|OAuth" backend/src/main/java/org/openharness/backend/api/CodexTurnController.java backend/src/main/java/org/openharness/backend/api/ModelController.java`；仅允许既有、与本切片无关的文本，任何新增执行/策略/凭据依赖均失败。
10. 完成后等待 3 秒复算实际修改文件 SHA；如发生外部漂移，停止并报告 `BLOCKED`。

## 必须输出的实施报告

以 `DONE_WITH_CONCERNS` 或 `BLOCKED` 开头，不得自行声明 Task 4.4 PASS。报告必须包含：Task 4.3 prerequisite SHA、actual diff、有效 RED、逐项 GREEN、HTTP status/error mapping、fresh full/OpenSpec/diff-check/负向搜索、最终 SHA、`git status --short`、并发稳定性和残余风险。

实现后需要新的独立 High Review，必须使用独立 MVC probe 或 MockMvc adversarial matrix 验证 AuthFilter、跨身份 non-disclosure、409 replay conflict、410 gone、cancel/result exactly-once 与非 Codex compatibility。建议 Review 落盘到 [Task 4.4 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-4-high-review.md)。

## 停止条件

- Task 4.3 未 PASS、SHA 漂移或仍有写入 Agent。
- Registry 缺少 Controller 所需语义，需要改状态机或协议 contract。
- 需要修改 shared schema、AuthFilter contract、TS Runtime、Provider Adapter/routing 或真实 Provider。
- 需要读取 credential、转发 OAuth、连接非本地端点或执行工具。
- cross-identity error 会泄漏 bridge 是否存在，或任何失败路径会响应 app-server。
- 无法证明 result/cancel/replay exactly-once 或非 Codex byte-contract compatibility。

## Git 与回滚边界

不执行 `git add`、`commit`、`push`、`reset`、`clean`、`checkout`、`archive`。不得覆盖既有 dirty worktree 制品。若需回滚，只能提出针对本 Brief 允许文件的 reviewed inverse patch，不得自行执行破坏性 Git 操作。
