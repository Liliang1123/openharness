# Codex Reasoning Effort Proposal Review

## 结论

通过。OpenSpec change `add-codex-reasoning-effort-config` 已把
`gpt-5.6-sol / high` 的 Local Trial 诉求收敛为 provider 级可选配置，
保持缺省 `medium`、OAuth secret boundary、显式 Codex route 和无 fallback
语义。proposal、design、tasks 和 provider-adapter spec delta 完整，strict
validation、dashboard check 与 whitespace check 均通过，可以提交用户审批；
尚未授权实施。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/tasks.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/specs/provider-adapter/spec.md)
- [current provider-adapter spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/specs/provider-adapter/spec.md)
- [archived Codex OAuth design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/archive/2026-07-12-add-chatgpt-oauth-auth/design.md)
- [current Codex app-server client](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [dashboard data source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json)
- [generated dashboard Markdown](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.md)
- [generated dashboard HTML](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/index.html)

## 主要发现

### High：现有 OpenHarness 调用不能满足 `high`

当前 Java Codex client 会传递请求模型，但在 app-server `turn/start` frame 中
固定发送 `effort: "medium"`。因此直接配置
`openai-codex/gpt-5.6-sol` 只能证明模型选择，不能证明 reasoning effort 为
`high`。该缺口属于 provider 配置契约和用户可见模型行为，OpenSpec 准入判断
正确。

### High：proposal 保持既有 OAuth 和 fallback 边界

设计只增加非敏感 provider 配置值。reasoning effort 不成为进程参数、credential
source、TS Runtime 请求字段或 Frontend 字段；Codex CLI 继续独占登录、刷新与
凭据存储。无效配置在启动前失败；模型不支持的安全值在请求时结构化失败，均不得
转到 API-key provider 或 mock。

### Medium：兼容性和作用域明确

- 省略新字段时仍使用 `medium`，匹配当前行为。
- 配置只对 `codex-app-server` provider 生效。
- 本轮不增加 per-request/per-agent 覆盖，不改变 shared schema 或 TS Runtime。
- 本轮不包含安装升级、Frontend、生产资格、归档、全仓回归或 24 小时 Gate。

### Medium：协议选择有本机证据

官方 Codex CLI 0.145.0 bundled catalog 显示 `gpt-5.6-sol` 支持
`low`、`medium`、`high`、`xhigh`、`max` 和 `ultra`。一次只读 ephemeral
真实探针明确报告 `model: gpt-5.6-sol`、`reasoning effort: high` 并返回固定
成功响应；未读取或输出 OAuth token。该证据只证明 Codex CLI 组合可用，不证明
OpenHarness 集成已经支持 `high`。

### Low：安全 identifier 与动态模型能力的取舍合理

proposal 使用 `[a-z][a-z0-9_-]{0,31}` 约束配置值，而不在 OpenHarness 冻结一份
可能过时的模型 effort 枚举。语法在启动期验证；语义支持由官方 app-server
判定，拒绝时 fail closed。后续实现 Review 必须验证该值只进入 JSON-RPC frame。

## 验证证据

- `openspec validate add-codex-reasoning-effort-config --strict --no-interactive`：
  PASS，exit 0；离线 PostHog telemetry flush warning 非阻塞。
- `openspec show add-codex-reasoning-effort-config --json --deltas-only`：
  PASS，识别 1 个 `provider-adapter` MODIFIED requirement 和 7 个 scenario。
- `pnpm dashboard:check`：PASS，生成产物为 current。
- `git diff --check`：PASS。
- proposal artifact placeholder scan：PASS，无 `TBD`、`TODO`、
  `PLACEHOLDER` 或 `REPLACE_ME`。
- 当前 dashboard：37 entries；本 change 状态为 `proposed`。

## 最终建议

1. 用户明确审批 change-id `add-codex-reasoning-effort-config` 的当前 proposal、
   design、tasks 和 spec delta。
2. 审批后再生成并 Preflight Review Superpowers implementation plan。
3. 实施使用 TDD，先证明缺省 `medium`、显式 `high`、非法配置、non-Codex
   拒绝、app-server 拒绝和无 fallback。
4. 代码 Review 通过后，才备份并配置用户本地 operator，重跑
   `doctor → up → status → chat → logs → down`。

## 后续门禁

- 当前 active OpenSpec change：`add-codex-reasoning-effort-config`。
- 当前允许状态：proposal review/approval。
- 当前禁止状态：实现代码、修改用户本地 provider 配置、生成实施计划、运行新的
  OpenHarness Codex chat、归档或声称完成。
- Superpowers implementation plan：需要，但只能在用户明确批准本 change 后生成。
- 项目规则：未修改。
