# Java Service Token 生产接线计划

> 模式：OpenSpec 精简模式；适用 change：`harden-agent-runtime-single-node-production`

## 目标

修复 Java `AuthFilter` 硬编码 `dev-service-token` 与 production runbook 要求通过 `OPENHARNESS_SERVICE_TOKEN` 注入非默认 secret 的契约漂移，使 Runtime 与 Java 可使用同一可轮换 token，同时保留本地开发默认值与现有 401 taxonomy。

## 依据

- [AuthFilter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- [attempt 004 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-004.md)

## 边界

- 只修改 `AuthFilter` 与专用测试；
- token 从 Spring property `openharness.service-token` 或环境 `OPENHARNESS_SERVICE_TOKEN` 注入，未配置时仅保留既有本地默认 `dev-service-token`；
- 输入必须是非空、无空白、不得包含 `Bearer` 前缀的 raw token；
- authorization 比较使用 constant-time byte comparison；
- 不改变 endpoint、identity headers、401 status、errorClass 或 response schema；
- 不把 token 写入 log、trace、report、argv 或文档值。

## TDD 与验证

1. 新增专用测试：rotated token 通过、旧 dev token 被拒绝、缺 token 被拒绝、非法配置 fail startup。
2. 先观察旧构造器/硬编码行为 RED。
3. 实现最小 Spring constructor injection 与 constant-time comparison。
4. 运行 AuthFilter/BackendApi、Java full、Integration、OpenSpec、dashboard 与 diff check。
5. 更新 attempt 004 source hash，重新启动 Java，并用非默认本地 token完成 fresh `--validate-only`。

## 非目标

- OAuth/browser auth；
- 多 token overlap/rotation grace window；
- token persistence或管理 UI；
- 正式 Gate D promotion。
