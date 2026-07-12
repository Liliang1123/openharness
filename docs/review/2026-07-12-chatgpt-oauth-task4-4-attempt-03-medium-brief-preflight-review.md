# Review Result: BLOCKED

## 结论

需修改（Preflight BLOCKED）。Attempt-03 已把 Registry production wiring 锁定为唯一、可测试且 fail-closed 的方案，Attempt-02 wiring blocker 已关闭；但 HTTP non-disclosure contract 与当前 Registry API 不可同时满足。Controller 无法安全区分 unknown/cross-identity 的 404 与 exact-owner gone 的 410，且本 Attempt 禁止修改 Registry，因此不得派发 Task 4.4。

## Review 范围

- [Attempt-03 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-03-medium-brief.md)
- [Attempt-02 Medium Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-02-medium-brief.md)
- [Attempt-02 Preflight](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-02-medium-brief-preflight-review.md)
- [Task 4.3 Attempt-05 High PASS](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task4-3-attempt-05-high-review.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/)
- [CodexPendingTurnRegistry.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexPendingTurnRegistry.java)
- [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)
- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/agent-runtime/src/agentExecutionRunner.ts)

审查覆盖批准依据、精确 allow/deny list、production wiring、HTTP mapping、identity non-disclosure、RED/GREEN、fresh gates、停止/回滚/Git 边界及 SHA 稳定性；不实施 Controller，不重复 Review Task 4.3。

## Wiring blocker 关闭证据

- 唯一 bean owner 固定为新增 Configuration 文件，禁止 Registry component/default constructor 与 Controller `new/@Bean`。
- Clock 固定为具名 singleton `codexPendingTurnClock = Clock.systemUTC()`，Registry 通过 qualifier 使用它。
- TTL 固定属性、默认值与 inclusive 范围：`openharness.codex.pending-turn.ttl=PT65M`，`PT1S..PT24H`。
- retention 固定属性、默认值与 inclusive 范围：`openharness.codex.pending-turn.retention=PT5M`，`PT1S..PT1H`。
- parse failure、零/负数及越界均在 Registry bean 创建/context startup 时 fail closed。
- 默认 TTL 65 分钟严格大于现有 TS approval 60 分钟和 execution 30 分钟；TS 文件保持只读。
- Configuration test 明确覆盖 defaults/override/bounds/invalid/singleton/UTC，同一 Registry bean wiring 也有 oracle。
- ModelController 不注入未使用 Registry；Task 5 Adapter 后续消费 singleton。

## 主要发现

### 高：现有 Registry API 无法支持不泄漏的 404/410 分类

`requireEntry(identity, bridgeId)` 在 entry 不存在或 identity 不匹配时抛出 `BRIDGE_TURN_GONE`；exact identity 在 expired/orphan/terminal unavailable 路径也抛出相同 code。Controller 只能看到同一异常，无法判断应该返回 404 还是 410。

使用公开 `inspect(bridgeId)` 也不能修复：该方法不接收 Identity，若据其结果区分状态，会向跨身份请求暴露 bridge 是否存在，并产生 check/use race。Controller 自建 shadow map、反射 Registry 或解析 exception message 同样越界且不可信。

解除条件：由 control-plane 选择并批准一种不改变状态机语义的身份感知 mapping contract，例如 Registry 提供原子、non-disclosing 的 controller-facing result classification，并把 Registry 及相应 tests 加入精确 allow-list；随后创建新 attempt 并重新 Preflight。若该接口改变已批准 API/安全契约，则先核对是否需要更新现有 OpenSpec/plan。

## 已确认完整的部分

- prerequisite 与五项 SHA 锁定；Task 4.3 不重审。
- wiring 方案、配置矩阵、context fail-closed、singleton 和 UTC Clock 已无实施者设计空间。
- allow-list 精确，ModelController 仅凭实际 compatibility RED 才可修改且禁止无用 Registry 注入。
- 401/404/409/410、replay/cancel exactly-once、redaction、非 Codex compatibility 均有明确目标 oracle。
- focused、client/supervisor、Auth/API、backend full、OpenSpec strict、diff-check 与禁止依赖门禁完整。
- 并发、SHA、contract、scope、credential/endpoint/Git 停止条件完整。

## SHA、status 与并发稳定性

写入前采样：

- Registry：`8da0af7ad85624809ca3f7bb1928b55352b239e74e5eba80cacba248855dde49`
- Registry test：`8f7ce7a2ccb42f4ba40e077aca5a623499813950e030ce66514644b5a8c08b04`
- Client：`183a96f29734c19a3f5d2464288bed9a0fcd89384a97196bf8f56a6c5f7d4e0a`
- Client test：`55b7c153814f0313340bf05b55aca06e201d43d309d65eda472d55231105ab6f`
- Contracts：`0ea085b93d97cb9fdf394d25844973cf49803e9d0c065b0a9648b635064dcdae`

写入后等待 3 秒完成复采，五项 SHA 与上述值完全一致。完整 `git status --short` 的既有 Task 4.1–4.3 条目未变化，本轮只新增：

```text
?? docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-03-medium-brief.md
?? docs/review/2026-07-12-chatgpt-oauth-task4-4-attempt-03-medium-brief-preflight-review.md
```

未观察到外部并发写入。两份新增文档的 no-index whitespace check 无诊断；命令 exit 1 仅表示 `/dev/null` 与新增文件存在内容差异，不是 whitespace failure。

## 最终建议

不提供 cohesive-medium 实施提示词。先批准 identity-aware、原子且 non-disclosing 的 Registry mapping contract及精确 allow-list，再生成下一 Attempt Brief 与独立 Preflight。

## 后续门禁

- OpenSpec：当前未修改；control-plane 应先判断新增 Registry classification API 是否仍属于现有 exact-identity/non-disclosure requirement 的内部实现，若超出则更新 active change 后再实施。
- Superpowers：沿用批准计划；下一 revision 必须 Preflight PASS，实施必须 TDD，完成后必须独立 High Review。
- OpenSpec checkbox、dashboard、项目规则、Task 4.3：均不修改。
