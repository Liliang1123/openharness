# Codex Reasoning Effort Implementation Plan Preflight Review

## 结论

通过。`add-codex-reasoning-effort-config` 已获得用户明确实施批准，计划覆盖批准后的最小 Java provider 边界、TDD RED/GREEN、用户本地备份与回滚、六命令 smoke、独立 Review 和最终验证；可进入实现，但不得扩大到 TS Runtime、Frontend、OAuth 凭据、正式 CLI 契约、归档、全仓回归或 24 小时 Gate。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/tasks.md)
- [Provider adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/specs/provider-adapter/spec.md)
- [Superpowers implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-28-add-codex-reasoning-effort-config.md)
- [ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java)
- [ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java)
- [CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- 三个同包 focused test 文件、[wrapper guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)、OpenSpec tasks、dashboard 数据源和生成产物。
- 用户本地同步目标仅限 [isolated source](file:///Users/elvis/.local/share/openharness/source) 与 [wrapper state](file:///Users/elvis/.local/state/openharness)。

## 主要发现

### 严重度：无阻塞

- OpenSpec strict validation exit `0`；PostHog DNS flush warning 不影响规范验证。
- 计划把 `reasoning-effort` 限制在 `codex-app-server` provider，缺省/空白解析为 `medium`，显式值使用 `[a-z][a-z0-9_-]{0,31}`，与批准设计一致。
- TDD 顺序明确：先加入无法编译的配置/协议测试并记录 RED，再最小实现并跑 focused GREEN。
- 兼容策略明确：既有两参数/三参数 `startTurn` 继续发送 `medium`；既有非 Codex provider 不要求新字段。
- OAuth 边界明确：不读取、复制、输出或持久化 Codex credential；配置值只进入 `turn/start.effort`，不进入进程参数。
- no-fallback 与 redaction 有专门 adapter 测试；语义上不支持的安全值由 app-server 拒绝并映射为既有结构化错误。
- 本地同步前要求按文件备份、哈希清单和停止状态；不允许广泛复制、清理或按进程名 kill。
- `logs` 的当前 trace 可见性被列为明确 acceptance；若仍缺失必须报告 FAIL，不得偷偷扩大实现范围。
- 计划没有实现占位符，没有 Git 提交/推送动作；命中的 Git 关键词全部是禁止事项或扫描表达式。

### 严重度：注意

- 实际服务调用依赖本机 Codex CLI 登录状态与 app-server 协议；focused fake tests 通过不等同真实 smoke 通过。
- `SPRING_APPLICATION_JSON` 的 provider 列表覆盖语义要求保留本地已有 provider 配置；写入前必须备份并以非秘密方式核验。
- 当前工作树已有本任务前置 proposal、review、handoff 和 dashboard 改动，实施工具必须保留这些文件，不得 reset/clean。

## 最终建议

按计划由 Codex CLI `gpt-5.6-sol`、reasoning effort `high` 执行仓库内 Task 2–4，当前窗口检查完整 diff、RED/GREEN 证据并修正偏差。仓库实现通过后，再由当前窗口执行用户本地备份、精确同步、配置和六命令 smoke，最后完成独立实现 Review 与 dashboard/tasks 对账。

## 后续门禁

- OpenSpec：本 change 已批准，可实施；保持 active，不归档。
- Superpowers：Plan Preflight 已通过，可使用 `executing-plans`。
- 测试：必须有真实 RED、focused GREEN、最终 fresh verification。
- 人工审批：本次实施已批准；若需要扩大到正式 CLI 契约、TS Runtime/Frontend、安装升级、凭据或新用户可见行为，必须停止并创建/更新 proposal 等待新的明确批准。

## 2026-07-28 启动失败后的修订 Preflight

### 结论

通过。首次本地 `up` 在 backend 启动前失败，证据显示现有 wrapper 执行 `mvn spring-boot:run` 时会编译测试，而隔离 source 中旧 `CodexAppServerAdapterTest.FakeSession` 仍实现三参数 `startTurn`。计划已修订为额外备份并同步这一份与接口签名耦合的测试文件；未改变生产契约、Runtime 行为、OAuth 边界、验证矩阵或 OpenSpec scope。

### 修订依据

- 失败日志：[backend.log](file:///Users/elvis/.local/state/openharness/logs/backend.log) 明确报告 `CodexAppServerAdapterTest.FakeSession` 未覆盖新的四参数抽象方法。
- 停止状态：失败后 backend `8080`、runtime `3001`、internal runtime `3101`、frontend `5173` 均关闭。
- 最小修正：仅同步 [CodexAppServerAdapterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerAdapterTest.java)，该文件已包含在 71/71 focused GREEN 中。
- 回滚：同生产文件一样先进入时间戳备份，随后可按 manifest 恢复。

### 修订后门禁

允许执行这一份测试文件的精确备份/同步，然后必须先跑隔离 source 的 Maven focused test，再重新执行六命令 smoke。任何新的失败继续走 systematic debugging，不得借此扩大到 wrapper 正式契约、全仓回归或新 OpenSpec 行为。
