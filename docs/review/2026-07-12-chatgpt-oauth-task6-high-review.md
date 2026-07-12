# ChatGPT OAuth Task 6 High Review

## 结论

通过。Task 6 的本地 operator control 已在不读取凭据、不运行真实 OAuth、
不透传官方 CLI 输出的边界内完成。实现只允许固定的 login/status/logout 命令，
OpenHarness 输出被限制为五个固定字段及封闭值域。Task 6 可以关闭；下一门禁是
Task 8 真实本地 OAuth smoke 的显式人工授权。

## Review 范围

- [CodexOperatorControl.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexOperatorControl.java)
- [CodexOperatorControlTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/test/java/org/openharness/backend/service/provider/CodexOperatorControlTest.java)
- [auth_contract.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/architecture/auth_contract.md)
- [dev_runbook.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/architecture/dev_runbook.md)
- [backend gateway delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)

## 主要发现

### High：无未关闭 finding

- delegation 仅能构造 `codex login`、`codex login status`、`codex logout`；
  action 不接受任意参数。
- 子进程 stdout/stderr 直接丢弃，异常文本不进入 operator output。
- 输出仅含 `providerId`、`readiness`、`processState`、`modelAvailability`、
  `needsLogin`；公开 status record 也强制固定 provider 与封闭状态词汇，不能作为
  任意字符串输出旁路。
- 进程执行有五分钟上限，超时先正常终止再强制终止；中断状态会恢复。
- 生产类没有 credential path、token parser、OAuth client、HTTP auth endpoint 或
  TS/Frontend forwarding 路径。

### Medium：平台限制已显式记录

- OpenHarness 丢弃 CLI 输出，因此需要终端设备码的 headless 环境应直接使用官方
  Codex CLI；这不会扩大 OpenHarness OAuth 边界。
- 真实支持版本需由 Task 8 evidence 固定；当前文档没有把未 qualification 的版本
  声明为兼容。

### Low：验证证据

- 初始 RED：focused test compile 因 `CodexOperatorControl` 缺失而失败，exit 1。
- review-hardening RED：6 tests 中 1 failure，任意 status 字符串未被拒绝，exit 1。
- focused GREEN：6/6，exit 0。
- backend full：146/146，exit 0。
- OpenSpec strict：valid，exit 0；仅有非门禁 PostHog 离线 warning。
- 生产 runner 用 `/usr/bin/true` 与 `/usr/bin/false` 代替 Codex executable 的独立
  本地探针均只输出五个白名单字段，exit 0；未调用真实 Codex。
- surefire reports、生产类与架构文档 canary scan 无匹配，`rg` exit 1。
- `git diff --check` 无输出，exit 0。

最终 SHA-256：

- implementation：`157628249300fa77dd3fff6a2ca1a3e9a4efbc7a0f0253ba3c72dfcd201f98b0`
- test：`14fa2107ca22674b348f03c2255db2019d9e52a662433f35aa06879a9fb48815`
- auth contract：`6fa57ef1a009169b1f234124c248f2982e5e5c13b46e37aa9ac73e93fabcd5c9`
- runbook：`e1360f1e2fcc5c025b89e64b31cb2bcf43ddff1372811bed06e42ab290fb12f9`

## 最终建议

关闭 Task 6。Task 8 前保持 operator command 未执行真实 Codex；取得显式授权后，
先记录官方 Codex 版本和非敏感环境指纹，再按 approved Task 8 rows 执行真实 smoke。
任何 token、credential 文件或官方 CLI 原始输出都不得写入证据或 Review。

## 后续门禁

- 不需要新增 OpenSpec proposal；本实现属于已批准 change 的 Task 6。
- 不需要新增 Superpowers plan；现有 approved plan 已覆盖。
- Task 8 必须获得用户明确授权后才能运行真实 login/status/app-server/provider 路径。
- Task 8 完成前不得勾满 23/23、不得把 dashboard 标为 verified、不得 archive。
- 本 Review 未修改项目规则。
