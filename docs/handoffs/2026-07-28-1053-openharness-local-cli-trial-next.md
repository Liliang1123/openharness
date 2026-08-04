# New Window Handoff: OpenHarness Local CLI 试用与反馈闭环

## 使用方式

把本文件路径和文末“给新窗口的启动指令”复制到新的 Codex 窗口。新窗口必须从干净 `main` 试用工作树继续，不要从当前旧功能分支重新执行已经归档的 Runtime 工作。

## 背景

- 项目主目录：[OpenHarness 主项目目录（保留用户未跟踪文件）](file:///Users/elvis/file/develop/opensource/openharness)
- 新窗口工作入口：[干净 main 本地试用工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial)
- 当前目标：先把已经合并的完整单机 Agent Runtime 作为 `Local Trial Ready` 版本通过 CLI 高频试用，收集可复现反馈，再按小切片持续打磨；前端后续另行使用 Apple 开源毛玻璃风格相关 skill 设计。
- 当前产品边界：仓库已有可运行的 Runtime stack，但尚未发布正式可安装的 `openharness` 产品 CLI。下一阶段优先安装并验证“用户本地 operator wrapper”，不得把它宣称为稳定公共 CLI 契约。
- 关键治理入口：[项目 AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/AGENTS.md)、[领域术语 CONTEXT.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/CONTEXT.md)。

## 已完成

- [x] `harden-agent-runtime-single-node-production` 已按用户批准的 `Local Trial Ready` 边界完成实现、验证、Project Learning Closeout 和归档。
- [x] Dedicated SQLite Worker、P0/P1/P2 有界语义命令队列、生产存储接线、reconciliation、outbox、heartbeat、shutdown 与 fail-closed 语义已落地。
- [x] 成熟数据库 Attempt004b 已完成 20/20 样本：admission p95 中位数 44.723ms，replay p95 中位数 71.492ms，相对冻结基线改善 75.529%，Worker unavailable/queue-full 为零。
- [x] 2026-07-27 收口验证已通过：Shared Schema 60、Agent Runtime 683、Frontend 24、Integration 17、Java 213；TypeScript typecheck、OpenSpec strict、Dashboard、diff checks 均通过。
- [x] OpenSpec 已归档至 [Runtime OpenSpec archive](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production)；任务清单 35/35 已闭合。
- [x] Dashboard 已同步为 `archived`，且明确保持 `Local Trial Ready ≠ Production Verified`。
- [x] 变更已提交并 fast-forward 合并到本地 `main`，提交为 `421a5ab4a0574ba885b4770753da59193297529a`（`feat(runtime): 收口本地试用运行时`）。
- [x] 已移除完成态功能 worktree；保留一个干净 `main` 试用工作树和一个含用户未跟踪文件的旧主工作树。
- [x] 已形成 [OpenHarness Local CLI Wrapper Guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)。

## 当前状态

- Active OpenSpec change：无。2026-07-28 在干净 `main` 工作树执行 `npx openspec list`，结果为 `No active changes found.`。
- Archived change：[2026-07-27 Runtime archive](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production)。
- Specs：干净 `main` 当前有 22 个 capability specs；Runtime 归档 delta 已合入 current specs。
- Git：干净 `main` 工作树当前基于 `421a5ab`，相对 `origin/main` ahead 27；尚未 push。
- 旧主工作树：[主项目目录](file:///Users/elvis/file/develop/opensource/openharness) 仍在 `feat/runtime-progress-panel` / `98d52c`，包含大量用户未跟踪材料。不得在那里执行 reset、clean、归档或合并，也不要用该分支的 `openspec list` 判断最新状态。
- 服务/端口：2026-07-28 检查 `8080`、`3001`、`5173` 均为 `CLOSED`；当前没有启动本地 OpenHarness stack。
- CLI：正式产品 CLI 尚不存在；推荐 wrapper 也尚未在用户目录实际安装。
- 本 handoff：新增在干净 `main` 工作树，尚未获得单独 commit/push 授权。

## 未完成 / 下一步

- [ ] 在不修改旧主工作树的前提下，把本地 operator wrapper 安装到用户目录。
- [ ] 实现并验证 `openharness doctor|up|status|logs|chat|down` 六个命令。
- [ ] 用 wrapper 完成一次完整 smoke：`doctor → up → status → chat → logs → down`，记录每一步实际结果与日志位置。
- [ ] 用户开始真实 CLI 试用；只收集可复现的工作流问题、期望与实际结果、最小复现、日志/trace 标识。
- [ ] 对每条反馈先做 Gate 0 分类：恢复既有 spec 的局部缺陷可走 Direct Change；新增命令契约、安装/升级机制、配置/凭据语义或用户可见 Runtime 行为必须新建 OpenSpec proposal 并等待批准。
- [ ] CLI 使用反馈稳定后，再决定是否创建“正式产品 CLI”独立 OpenSpec change。
- [ ] Runtime/CLI 打磨达到用户预期后，再单独进入 Apple 毛玻璃风格前端阶段；不得把前端设计混入当前 CLI 试用切片。

## 续跑 Plan

### Phase 0 — 保护现场与基线确认

- [ ] 只在 [干净 main 本地试用工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial) 和用户本地安装目录操作。
- [ ] 读取本 handoff、[CLI wrapper guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)、[README](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/README.md)。
- [ ] 核对 `main` HEAD、工作树状态、端口占用和依赖；不要重复全仓回归或 24 小时 Gate。
- 完成门槛：确认源工作树干净、三个端口无冲突、依赖与配置可供本地启动。

### Phase 1 — 安装本地 CLI wrapper

- [ ] 隔离 source：[用户本地 OpenHarness source](file:///Users/elvis/.local/share/openharness/source)。
- [ ] 可执行入口：[openharness wrapper](file:///Users/elvis/.local/bin/openharness)。
- [ ] PID、状态和日志目录：[OpenHarness user state](file:///Users/elvis/.local/state/openharness)。
- [ ] `doctor` 检查 Git、Node.js、pnpm、Java、Maven、curl、依赖、配置和端口。
- [ ] `up/down` 仅管理 wrapper 自己记录的 supervisor/PID tree；禁止按进程名广泛 kill。
- [ ] `status/logs` 不输出 token、`.env` 或凭据。
- [ ] `chat` 使用仓库当前 Runtime API、`X-User-Id`、`X-Tenant-Id`、生成的 request/trace ID 和安全本地默认值。
- 完成门槛：六个命令可发现，重复执行具有明确、可预期且安全的状态行为。

### Phase 2 — 本地 smoke 与交付

- [ ] 依次运行 `openharness doctor`、`openharness up`、`openharness status`。
- [ ] 运行 `openharness chat "你好，请介绍一下当前 OpenHarness Runtime"`，确认收到实际 Runtime 响应。
- [ ] 检查 `openharness logs runtime`，确认可追踪本轮请求且不泄露秘密。
- [ ] 运行 `openharness down`，确认只停止 wrapper-owned 进程并清理自身 PID 文件。
- [ ] 再运行 `openharness status`，确认三个服务均已停止。
- 完成门槛：把命令、PASS/FAIL、端口、日志位置、已知 warning 和回滚方式写入新的 review；若本阶段修改仓库文件，按项目规则落盘到 [docs/review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review)。

### Phase 3 — 试用反馈小闭环

- [ ] 每个问题先复现、定位现有 spec/代码事实，再决定 Direct Change 或 OpenSpec。
- [ ] 行为 bug 使用 TDD：RED → 最小修复 → GREEN → 相关回归 → Review。
- [ ] 新功能/正式 CLI 契约先 proposal、严格校验、用户批准，再生成可执行 Superpowers plan。
- [ ] 每个完成切片记录验证证据；不要因一次 smoke 通过而宣称 `Production Verified`。
- 完成门槛：用户确认当前切片的实际使用体验改善，且无未解决 FAIL/BLOCKED。

### Phase 4 — 后续产品化决策

- [ ] 若用户需要正式可分发 CLI：独立定义安装、升级、版本、shell completion、配置、凭据和兼容性契约。
- [ ] 若进入前端：独立 OpenSpec + 设计评审，随后使用 Apple 开源毛玻璃前端风格相关 skill；保持 Frontend → TS Runtime → Java Backend 的既有所有权边界。
- 完成门槛：仅在新 proposal 获批准后实施，不复用已归档 Runtime change。

## 建议下一步

- 建议先做：完成 Phase 0–2，把 wrapper 真正安装并跑通一次端到端 CLI smoke，然后把可复制的日常命令交给用户开始使用。
- 不建议现在做：重复 Attempt005/24 小时 Gate、重新打开已归档 Runtime change、直接开发正式产品 CLI、提前进入前端视觉实现。
- 原因：当前目标是尽快获得真实 CLI 使用反馈；正式 CLI 与前端都会引入新的用户可见契约，应由反馈驱动并分别通过 OpenSpec。

## 涉及文件

### 治理与交接

- [项目 AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/AGENTS.md)
- [OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/AGENTS.md)
- [CONTEXT.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/CONTEXT.md)
- [本 handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/2026-07-28-1053-openharness-local-cli-trial-next.md)
- [latest handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/latest.md)

### OpenSpec、Plan 与 Closeout

- [Archived proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production/proposal.md)
- [Archived design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production/design.md)
- [Archived tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/archive/2026-07-27-harden-agent-runtime-single-node-production/tasks.md)
- [Current Agent Runtime spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/specs/agent-runtime/spec.md)
- [Archive/merge/local CLI plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-27-agent-runtime-archive-merge-local-cli.md)
- [Local Trial archive closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-27-agent-runtime-local-trial-archive-closeout.md)
- [Local Trial readiness decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-27-agent-runtime-local-trial-readiness-decision-review.md)
- [Dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json)

### CLI 与启动入口

- [Local CLI wrapper guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)
- [项目 README](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/README.md)
- [本地全栈启动脚本](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/dev.sh)
- [Agent Runtime README](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/README.md)

### Source

- [Agent Runtime source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src)
- [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts)
- [Production Runtime context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/storage/productionRuntimeContext.ts)
- [SQLite Worker client](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/storage/runtimeStorageWorkerClient.ts)
- [SQLite Worker kernel](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts)
- [Java Backend source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src)
- [Frontend source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src)

### Tests

- [Agent Runtime tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test)
- [Worker protocol tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/runtimeStorageWorkerProtocol.test.ts)
- [Worker client tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/runtimeStorageWorkerClient.test.ts)
- [Worker crash tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/runtimeStorageWorkerCrash.test.ts)
- [Production lifecycle tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionServerLifecycle.test.ts)
- [Java Backend tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test)
- [P0A integration test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/integration-tests/test/p0a.integration.test.ts)

## 验证记录

- `pnpm --filter @openharness/agent-runtime test`：2026-07-27 收口记录 PASS，683 tests。
- `P0A_BACKEND_PORT=18081 pnpm test && pnpm typecheck && mvn -f` [Java Backend pom.xml](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/pom.xml) `test`：2026-07-27 fresh workspace 记录 PASS；TypeScript 60 + 683 + 24 + 17，Java 213。
- `npx openspec validate --all --strict --no-interactive && pnpm dashboard:check && git diff --check`：2026-07-27 归档收口记录 PASS。
- `npx openspec list`：2026-07-28 在干净 `main` 运行，结果 `No active changes found.`。
- `npx openspec list --specs`：2026-07-28 在干净 `main` 运行，列出 22 个 capability specs。
- 端口检查：2026-07-28，`8080`、`3001`、`5173` 均未监听。
- 当前 handoff 只新增文档，未重复运行全仓测试和 24 小时 Gate。

## 风险 / 注意事项

- `Local Trial Ready` 不是 `Production Verified`。Attempt005 状态保持 `deferred_by_user`；无 `approval.json`、active `preflight.json`、journal、partial report、final report 或正式 workload。
- 不得复用 Attempt005 或历史 runId。未来若恢复 Production Verified，必须新建 OpenSpec change、runId、no-overwrite packet、active preflight、start approval 和 promotion approval。
- 干净 `main` 比 `origin/main` ahead 27；未获得新 push 授权，不得推送。
- 旧主工作树包含用户未跟踪文件，严禁 `git reset`、`git clean`、批量删除或覆盖。
- 已有部分历史 Review 的绝对链接仍指向已删除的旧功能 worktree；实际同名文件请从 [干净 main 本地试用工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial) 读取，不要重建旧 worktree。
- wrapper 必须隔离安装，禁止打印 OAuth token、API key、service token 或 `.env` 内容；禁止 broad process kill。
- 未发生代码变更前，不需要重复全量回归；如安装/smoke 暴露异常，先走 systematic debugging，再决定是否修改。
- 正式 CLI 与前端均是后续独立能力；未经 OpenSpec 批准不得实施其公共契约或用户可见行为。

## 给新窗口的启动指令

继续 OpenHarness Local CLI 试用闭环。项目最新执行入口是 [干净 main 本地试用工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial)，先完整阅读 [本 handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/handoffs/2026-07-28-1053-openharness-local-cli-trial-next.md)、[项目 AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/AGENTS.md)、[CLI wrapper guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md) 和 [Runtime archive closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-27-agent-runtime-local-trial-archive-closeout.md)。

从“续跑 Plan”的 Phase 0 开始，优先把用户本地 `openharness` operator wrapper 安装并完成 `doctor → up → status → chat → logs → down` 端到端 smoke。不要重复 Runtime 实现、OpenSpec 归档、合并、全仓回归或 24 小时 Gate；不要修改 [旧主工作树](file:///Users/elvis/file/develop/opensource/openharness)，不要 reset/clean/push/commit，不要声称 Production Verified，不要提前开发前端。

任何仓库文件或行为变更前必须先按 `openspec-superpower-change` 做 Gate 0：局部恢复既有 spec 可走 Direct Change；正式 CLI 契约、安装/升级、配置/凭据、Runtime 用户可见行为或前端能力必须新建 OpenSpec proposal，严格验证并等待用户批准，批准后再生成 Superpowers implementation plan，按 TDD、验证、Review 和 completion contract 闭环。若本轮产生重要 review，按项目规则落盘到 [docs/review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review)。

期望输出：先报告基线与 Gate 0，再执行当前获授权范围；最终给出六个 CLI 命令逐项 PASS/FAIL、服务/端口、日志位置、变更文件、验证证据、残余风险、是否需要新 OpenSpec，以及用户可直接开始日常使用的最短命令流程。
