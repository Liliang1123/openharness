# Gate B Production Environment Preflight Review

## 结论

需修改：用户已授权继续按建议推进 Gate B，但当前会话尚未获得可唯一定位的生产迁移环境与数据 owner 输入。现有仓库只包含 fixture/local rehearsal 和生产 runbook，不包含 production JSON source、SQLite target、backup target、维护窗口、RPO/RTO 基准或 evidence acceptance owner。因此 Gate B 保持 `pending_production_evidence`，禁止第一笔真实生产 SQLite write、cutover promotion、Stage 0 task 2.6/2.7 勾选和 dashboard 状态提升。

本结论不是要求调用 Codex CLI。Gate B 是 production data migration / restore evidence gate，Codex app-server/OAuth provider 路径不能替代生产 backup、import、quarantine、restore 和 measured RPO/RTO。

## Review 范围

- [Integration worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- [Stage 0 active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/)
- [Stage 0 tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)
- [Gate B local evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/stage1-gate-b.md)
- [Task 8 local rehearsal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/task8-json-import-restore-rehearsal.md)
- [Previous Gate B blocked review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-gate-b-production-evidence-blocked-review.md)
- [Integration baseline closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-stage0-gate-b-integration-baseline-closeout-review.md)

## 主要发现

### Blocker — 没有生产数据与目标路径

当前会话没有提供 production JSON source 的绝对路径、数据一致性时间点、SQLite target 的绝对路径或 backup target。环境变量名称审计也未发现 `OPENHARNESS`、`AGENT_RUNTIME`、`SQLITE`、`DATABASE`、`PRODUCTION`、`STAGE0`、`GATE_B`、`JSON`、`BACKUP`、`RPO` 或 `RTO` 前缀的迁移输入。不得猜测开发目录、fixture 或用户主目录中的任意文件是生产数据。

### Blocker — 没有维护窗口与 abort owner

Gate B 要求在 first SQLite write 前验证 pre-cutover restore/abort，并在 first write 后切换为 forward-fix-only。当前没有维护窗口、允许的停机范围、cutover acceptance owner、abort decision owner 或证据接收人，无法安全决定何时停止旧 Runtime、何时允许写入或何时中止。

### Blocker — 没有可测量的 RPO/RTO 输入

现有 fixture rehearsal 不能证明生产数据的一致性时间点、backup RPO 或 restore RTO。当前没有 RPO 目标、RTO 目标、计时起点/终点或恢复验证 oracle，因此不能生成 production-grade measurement。

### Pass — 工程入口和门禁边界已存在

现有 Stage 0 plan、JSON importer、migration/crash tests、runbook 与 local rehearsal 已定义 backup hash、idempotent import、secret-safe quarantine、restore rehearsal 和 forward-fix marker 的工程基础。缺口是生产环境输入与真实执行证据，不是新增 Codex CLI 调用或新增 Runtime parity 代码。

## 最终建议

1. 由生产数据 owner 提供 production JSON source、SQLite target 和 backup directory 的完整绝对路径；不要提供业务内容或 secret 到会话，只提供路径与授权边界。
2. 明确维护窗口、允许停机范围、pre-cutover abort owner、post-write forward-fix owner，以及谁对 quarantine decision 和最终 evidence bundle 签字。
3. 明确 backup RPO 与 restore RTO 目标，以及恢复成功的可观察 oracle，例如记录数、稳定 hash、SQLite integrity check 和 Runtime readiness。
4. 输入齐全后先生成只读 backup/hash preflight；在 evidence bundle Review PASS 和再次确认前，仍不执行 first production SQLite write。

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；不新增 change，不创建 parity proposal。
- Superpowers：继续使用现有 Stage 0 final plan 的 Task 8 strict evidence gate；无需新 implementation plan。
- 测试：本轮仅做只读环境 preflight，没有运行迁移测试，也没有产生生产证据。
- 人工审批：用户已授权继续准备 Gate B，但真实环境定位、cutover/abort 决策和 evidence acceptance 尚未具备，不能视为 first-write promotion approval。
- Dashboard/tasks：本轮不得更新状态或勾选 2.6/2.7。
- 项目规则：未修改。
