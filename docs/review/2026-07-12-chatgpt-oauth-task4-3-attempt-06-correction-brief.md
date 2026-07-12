# ChatGPT/Codex OAuth Task 4.3 Attempt-06 Correction Brief

## 状态

已授权执行。该切片只补齐 Task 4.4 所需的 identity-aware、原子且 non-disclosing 的 Registry 错误分类，不改变 pending-turn 状态机、responder exactly-once、replay、timeout、cancel 或 retention 语义。

## 批准依据

- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [Backend gateway delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)
- [Task 4.4 Attempt-03 Preflight BLOCKED](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-03-medium-brief-preflight-review.md)

## 允许修改

- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java)
- 本 Brief 与对应 Review 文档。

禁止修改 Client、Contracts、Controller、TS Runtime、shared schema、OpenSpec、checkbox、dashboard、项目规则或 Task 4.4 实现文件。

## 锁定设计

1. 不新增公开 `inspect`、`classify` 或无身份查询 API。
2. `complete(...)` 与 `cancel(...)` 保持唯一 identity-aware mutation boundary。
3. Registry lookup 对不存在的 bridge 或 identity mismatch 抛出 `BridgeException("BRIDGE_TURN_NOT_FOUND")`；两者对调用者完全同形，且不泄露记录状态。
4. identity 精确匹配后，retention 内的 expired、orphaned、failed 或其他不可继续状态仍抛出 `BRIDGE_TURN_GONE`。
5. cross-identity 对 active 或 terminal record 均只能得到 `BRIDGE_TURN_NOT_FOUND`，且 complete/terminate responder call count 为 0。
6. terminal retention 清理后记录不存在，任何调用统一得到 `BRIDGE_TURN_NOT_FOUND`；不得保留额外身份索引来延长可观察生命周期。
7. `BridgeException` message 继续固定脱敏，不包含 bridge、identity、correlation 或 raw content。

## TDD 与验证

1. RED tests：unknown bridge、cross-identity active、cross-identity terminal 均为 `BRIDGE_TURN_NOT_FOUND`；exact-owner expired/orphaned/failed 为 `BRIDGE_TURN_GONE`；所有拒绝路径 responder mutation 为 0。
2. RED 必须在现有实现返回 `BRIDGE_TURN_GONE` 时失败。
3. 最小 GREEN：只调整 Registry 内 identity-aware lookup/error factory，不新增旁路查询。
4. Focused：`mvn -o -f backend/pom.xml -Dtest=CodexPendingTurnRegistryTest,CodexAppServerClientTest test`。
5. Critical：`mvn -o -f backend/pom.xml -Dtest=ContractsTest,CodexAppServerClientTest,CodexProcessSupervisorTest,CodexPendingTurnRegistryTest test`。
6. Fresh full：`mvn -o -f backend/pom.xml test`。
7. `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`、`git diff --check`，并执行禁止旁路查询/敏感依赖搜索。
8. 修改前后双采样 SHA/status；发现外部漂移立即停止。

## 停止条件

- 需要改变 Registry 状态转换、retention 生命周期、public request schema 或 AuthFilter contract。
- 需要无身份查询、Controller 预检查或额外持久身份索引。
- cross-identity 可区分 active/terminal/unknown，或拒绝路径发生 responder mutation。
- 发现并发外部写入。

## 后续门禁

本切片 GREEN 后必须形成独立 Review 结论。只有 Review PASS 才能修订 Task 4.4 Brief 并重新 Preflight。
