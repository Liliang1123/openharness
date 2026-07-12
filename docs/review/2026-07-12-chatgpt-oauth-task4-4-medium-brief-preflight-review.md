# Review Result: BLOCKED

## 结论

BLOCKED。Task 4.4 Medium Brief 的总体范围、TDD 顺序、安全边界、停止条件和 fresh gates 方向正确，且当前 Task 4.3 核心实现 SHA 与 Attempt-05 High PASS 记录一致。但 Brief 仍绑定一个不存在的历史 High Review，并包含当前 wire contract 无法表达的 `path/body bridge mismatch` RED 要求；同时未锁定 Registry 的生产 Spring wiring 方式及允许修改文件。这三项会迫使 Medium Agent 自行决定契约或越界，因此不授权开始实施。

## Review 范围

- [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)
- [Task 4.4 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-4-medium-brief.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)

本次只读审查上述证据；除本 Review 文档外，未修改实现、OpenSpec、checkbox、dashboard 或项目规则，未运行 Task 4.4 实施或 Git 写操作。

## 主要发现

### 高：Prerequisite Review 引用过期且目标不存在

Brief 的“状态”和“必读文件”仍指向 [2026-07-11 Task 4.3 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-3-high-review.md)，该文件当前不存在。当前权威 prerequisite 是 [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)。Preflight 不能依赖无法读取的历史占位符，否则执行 Agent 无法证明启动条件成立。

修正要求：将两处 prerequisite 链接替换为 Attempt-05 High PASS，并在 Brief 内显式锁定至少 Registry、Registry test、Client、Client test、Contracts 的当前 SHA-256。

### 高：RED 矩阵要求了 contract 中不存在的 body `bridgeId`

Brief 要求覆盖 `path/body bridge mismatch`，但当前 `CodexToolResultSubmission` 和 `CodexTurnCancelRequest` 都不包含 `bridgeId`；`bridgeId` 只存在 path 与 Registry key 中。在“禁止修改 Contracts/shared schema”边界下，该 RED 无法合法实现。

修正要求：删除 `path/body bridge mismatch`，改为可表达的“未知/他人 `bridgeId` 与已知 exact identity/correlation 组合均 non-disclosing，且 responder call count 为 0”。不得为满足测试而扩展 schema。

### 高：Registry 的生产装配权限与配置未闭合

Registry 当前不是 Spring component，其 public constructor 需要 `Clock`、pending TTL 和 retention `Duration`。Brief 只允许“如 Spring 装配确实需要”对 Registry 做无行为变化的 component wiring，但没有指定 bean owner、配置来源/默认值，也没有允许修改一个装配类。单纯加 `@Component` 不能消除两个同类型 `Duration` 的注入歧义，且由 Controller 自行 new Registry 会破坏共享状态边界。

修正要求：Brief 必须指定已批准的唯一生产 bean 装配方式、TTL/retention 来源与允许修改的精确文件；若这需要新配置 contract，则仍应 `BLOCKED` 并回到已批准计划/OpenSpec 范围核对，不由 Medium Agent 自行设计。

### 中：HTTP non-disclosure 状态码未锁定为单一 oracle

计划的 Task 4.4 RED 描述为 non-disclosing `404/403`，Brief 对 cross-identity 只规定 non-disclosing，未指定究竟是 404 还是 403；同时它又明确锁定 conflict 409 和 gone 410。对抗测试不应允许两个成功 oracle。

修正要求：对 valid-but-cross-identity/未知 bridge 锁定一个统一 HTTP status 和统一、无资源存在性泄漏的 structured error；保留 AuthFilter missing/invalid token 的现有 401 contract。

## 已确认完整的部分

- 范围清晰：限于 Task 4.4 Controller/HTTP boundary 与最小 ModelController compatibility，明确禁止 Task 4.5 TS bridge、Task 5 Adapter 和真实 Provider wiring。
- 权限与安全边界充足：禁止 OAuth/credential 读取、真实端点、Java tool execution/approval、schema 扩展与破坏性 Git 操作。
- TDD 骨架完整：先 baseline，再 endpoint-missing 有效 RED，随后 focused GREEN、Auth/API regression、backend full、OpenSpec strict、diff-check、负向依赖扫描。
- 停止条件覆盖契约缺失、Registry 语义修改、身份泄漏、responder exactly-once 无法证明、凭据/外呼与越界修改。
- 实施报告和独立 High Review 门禁完整；Medium Agent 不得自行声明 PASS。

## 基线证据

对下列文件做了间隔 3 秒的两次只读 SHA-256 采样，结果一致：

- Registry: `8da0af7ad85624809ca3f7bb1928b55352b239e74e5eba80cacba248855dde49`
- Registry test: `8f7ce7a2ccb42f4ba40e077aca5a623499813950e030ce66514644b5a8c08b04`
- Client: `183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
- Client test: `55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`
- Contracts: `0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`
- ModelController: `d490e56bcc2e94a2bce08a19f773224a58ec8227c5a8116e74ce820e8a79ce19`

这些值与 Attempt-05 Review 中的前五项一致，但短时稳定采样不替代实施开始前和完成后的 fresh stability gate。当前 worktree 为预期 dirty 状态；本 Review 不将既有 Task 4.1–4.3 制品误判为 Task 4.4 diff。

## 最终建议

1. 仅修订 [Task 4.4 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-11-chatgpt-oauth-task4-4-medium-brief.md) 中的上述四项，不实施 Controller。
2. 修订后以新的 attempt/revision 重做 Preflight Review；只有新 Review 结论为 `PASS` 才能向 Medium Agent 发送实施提示词。
3. 保留现有 baseline/focused/full/OpenSpec/diff-check/负向扫描与独立 MVC 对抗门禁，无需为本次 Brief 修订新建 OpenSpec proposal 或 Superpowers plan。

## 后续门禁

- OpenSpec：无需新 proposal；继续使用已批准的 [add-chatgpt-oauth-auth change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)。
- Superpowers：无需新实施计划；Brief 修订后必须 fresh Preflight PASS，实施时必须 TDD，完成后必须独立 High Review。
- 本次 `BLOCKED` 不评审 Task 4.3，不撤销其 Attempt-05 High PASS。
- Dashboard/checkbox：不修改。
- 项目规则：未修改。
