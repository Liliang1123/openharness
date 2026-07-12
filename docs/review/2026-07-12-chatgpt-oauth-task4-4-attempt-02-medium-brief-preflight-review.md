# Review Result: BLOCKED

## 结论

需修改（Preflight BLOCKED）。Attempt-02 Brief 已关闭过期 prerequisite、不可表达的 path/body mismatch 和二选一 HTTP oracle，但批准材料仍不能唯一确定 Registry 的生产 Spring wiring。该缺口涉及 bean ownership、配置来源和生产默认值，不能交给 cohesive-medium 实施者自行设计；Task 4.4 继续禁止派发。

## Review 范围

- [Attempt-02 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-02-medium-brief.md)
- [前一 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-medium-brief-preflight-review.md)
- [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)
- [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/model/Contracts.java)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [AuthFilter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)

本 Review 仅评审 Brief 当前 revision 的批准依据、allow/deny list、生产 wiring、HTTP mapping、身份 non-disclosure、TDD/fresh gates、停止/回滚/Git 边界和 SHA 稳定性；不重复 Review Task 4.3，不实施 Task 4.4。

## 四项原 blocker 的关闭证据

1. **Prerequisite：已关闭。** Brief 只绑定 Attempt-05 High PASS，并显式记录 Registry、Registry test、Client、Client test、Contracts 五项 SHA。
2. **不可表达的 bridge mismatch：已关闭。** Brief 明确 body 无 `bridgeId`，禁止 schema 扩展和 path/body mismatch；替换为未知/跨身份 path bridge + correlation 攻击，统一 non-disclosing 且 responder call count 为 0。
3. **Registry production wiring：未关闭，阻塞。** Registry 构造需要 `Clock` 与两个 `Duration`；批准 design 仅要求 configurable bounded deadline/retention，批准 plan 未给 bean owner、配置键、默认值或 configuration allow-list。测试 fixture 的 30 秒/5 分钟不能作为生产授权。Brief 正确禁止 Medium Agent 自选，但因此仍不可执行。
4. **HTTP oracle：已关闭。** valid service auth 下 unknown/cross-identity/correlation mismatch 固定 HTTP 404 + `BRIDGE_TURN_NOT_FOUND`；exact owner gone 固定 410 + `BRIDGE_TURN_GONE`；conflict 固定 409；AuthFilter missing/invalid token 保持现有 401。

## 主要发现

### 高：缺少唯一且获批准的 Registry bean 装配合同

必须由 control-plane 在新的 Brief revision 中锁定 bean owner/scope、Clock 来源、pending TTL/retention 配置键与默认值、精确 production/test allow-list，以及证明 chat-start 与 continuation Controller 共用同一实例的 wiring test。若要新增公共配置字段或扩大批准计划文件范围，应先复核现有 OpenSpec/plan 是否足以授权；不能由 Medium Agent推断。

## 已确认完整的门禁

- 范围和禁止项保持 Task 4.4：不进入 Task 4.5、Task 5、真实 OAuth/provider。
- RED/GREEN 命令区分 endpoint/wiring 缺失与无效 fixture/编译 RED。
- fresh focused、Auth/supervisor regression、backend full、OpenSpec strict、diff-check、禁止依赖扫描均明确。
- identity non-disclosure、409/410、replay/cancel exactly-once、secret redaction、非 Codex compatibility 均有固定 oracle。
- SHA 漂移、外部并发写入、契约缺失、越界需求和 responder 无法证明 exactly-once 均是立即停止条件。
- Git 权限明确禁止 add/commit/push/reset/clean/checkout/archive，回滚只允许提出 reviewed inverse patch。

## SHA 与并发稳定性

写入本 Review 后再次等待 3 秒完成只读采样；与写入前样本一致：

- Registry：`8da0af7ad85624809ca3f7bb1928b55352b239e74e5eba80cacba248855dde49`
- Registry test：`8f7ce7a2ccb42f4ba40e077aca5a623499813950e030ce66514644b5a8c08b04`
- Client：`183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
- Client test：`55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`
- Contracts：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`

短时稳定只证明 Preflight 证据 revision 一致，不替代未来实施前后的 fresh stability gate。

`git status --short` 保持 Task 4.1–4.3 的预期 dirty 基线；本轮新增项只有以下两份文档：

```text
?? docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-02-medium-brief.md
?? docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-02-medium-brief-preflight-review.md
```

完整 status 仍包含既有 Task 4.1–4.3 的 Java/shared-schema modified/untracked 文件与历史 Review/OpenSpec/plan 文档；本轮未更改、清理或暂存它们。两次完整 status 的既有条目集合一致，第二次只按预期增加上述两份文档，未观察到外部并发写入。

## 最终建议

由 control-plane 先补充唯一 production wiring 决策，再新建 Attempt-03 Brief 并重跑独立 Preflight。当前不得向 Medium Agent 提供实施提示词或启动 Task 4.4。

## 后续门禁

- OpenSpec：当前不修改；若唯一 wiring 需要新增公共配置契约或超出已批准 plan，再决定是否更新现有 active change，未批准前保持 BLOCKED。
- Superpowers：沿用已批准计划；新 Brief 必须 fresh Preflight PASS，实施必须 TDD，完成后必须独立 High Review。
- Checkbox/dashboard/项目规则：不修改。
- Task 4.3：保持 Attempt-05 High PASS，不重复 Review。
