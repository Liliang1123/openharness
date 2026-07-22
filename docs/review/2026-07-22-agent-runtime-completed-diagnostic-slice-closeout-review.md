# Agent Runtime 已完成诊断切片归档与提交收口 Review

## 结论

有风险：Task 3–5 的 Gate D performance diagnostic-only 实现、测试、实施计划与 Review 证据已完成并通过 fresh 验证，可以作为独立完成切片精确提交并推送至 GitHub 功能分支；但 active OpenSpec change `harden-agent-runtime-single-node-production` 仍为 `24/31`，正式 Gate D、生产证据审计、全量生产资格、契约冻结和最终 closeout 尚未完成，因此本轮不得执行 OpenSpec archive，也不得把 Dashboard 从 `proposed` 提升为 `verified` 或 `archived`。

Task 6 / Gate R1 resume-004 的终局仍是 `需修改 / BLOCKED`，仅证明 observer `snapshot-failure`，没有 performance conclusion。未入 Git 的 SQLite、日志、PID、profile 与 partial report 已迁移出 worktree 并保留；不得把关闭 worktree 等同于 OpenSpec 完成。

## Review 范围

### 项目规则与状态

- [项目 AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)
- [OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- [active change proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [active change design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [active change tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Dashboard 数据源](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)
- [工程不变量](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/engineering-invariants.md)

### 已完成 diagnostic-only 实现与测试

- [package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- [gateDPerformanceDiagnosticCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)
- [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)
- [runtimeStorage.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/runtimeStorage.test.ts)

### 计划与 Review 证据链

- [可执行实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)
- [计划 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)
- [Task 3 strict Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-task3-diagnostic-runner-quality-review.md)
- [Task 4 strict Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-task4-diagnostic-cli-quality-review.md)
- [Task 5 implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md)
- [resume-004 execution Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-004-review.md)
- [resume-004 independent Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-22-agent-runtime-gate-r1-resume-004-independent-review.md)
- [resume-004 final closeout Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-22-agent-runtime-gate-r1-resume-004-final-closeout-review.md)
- [Agent Review reconciliation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-22-agent-runtime-gate-r1-resume-004-agent-review-reconciliation-review.md)
- [用户验收 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-22-agent-runtime-gate-r1-resume-004-user-acceptance-review.md)

### 本地未入 Git 证据

- [Gate D / Gate R1 evidence 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/)

## 主要发现

### Critical — 0

无。

### Important — 1：active OpenSpec 不满足 archive 条件

[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 仍有 7 项未完成：4.2、4.3、4.5、4.6、5.2、5.3、5.4。正式 Gate D attempt 002 已因 `admissionP95Ms` 持续越过固定 100ms 阈值而 fail closed；Gate R1 resume-004 又在 pre-run observer 阶段因 exit 45 `snapshot-failure` 阻断，三个固定 30 分钟 variants 没有执行。因此既不存在 production qualification PASS，也不存在归档所需的最终 closeout。

影响：执行 `openspec archive`、提升 Dashboard 状态、合并 main 或创建发布 tag 都会形成错误的完成声明。本轮只能提交已经完成且独立验证通过的 diagnostic-only 切片与如实的 BLOCKED 证据链。

### Important — 2：worktree 删除会销毁未入 Git 的本地证据

当前未入 Git 的 Gate D / Gate R1 evidence 约 2.18 GB，包含约 1.84 GB 的 attempt-002 SQLite、约 241 MB 的 partial Gate R1 SQLite、被 `.gitignore` 忽略的 Java logs，以及 PID、profile、partial report 和 lock。GitHub 普通 Git 不能接收这些大文件；直接强制删除 worktree 会不可逆地移除本地失败诊断输入。

影响：这些未入 Git/ignored evidence 已迁移到 worktree 之外的本地保留目录，并记录最终位置。迁移不构成 Gate PASS、性能分析或 Git 归档；不得复用为新的正式 runId。

同卷 rename/move 保留了受保护 attempt-002 SQLite 的 device、inode、size 和 mtime，但更新了 ctime：原 tuple `16777232:165257457:1835978752:1784167299:1784167299`，迁移后为 `16777232:165257457:1835978752:1784167299:1784699200`。因此迁移件只能作为历史诊断保留，不能继续满足先前 strict identity binding，也不能在没有新计划、新 binding 和新审批时复用。

### Warning — 1：Git baseline 只能证明当前切片相对 HEAD 的变化

基线 HEAD 为 `cccd964a723a0606178c1863f6701c8483be6f8e`。当前源码、测试、计划和 Review 在同一 dirty worktree 中形成；对于既有 untracked Review 的完整历史因果归属，Git 只能在本次精确暂存后证明所提交 snapshot 与相对 HEAD 的差异，不能回溯证明每份历史 untracked artifact 的创建链。该限制必须保留为 Warning，不得伪装为全历史 PASS。

## 验证记录

在实际 worktree fresh 执行：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @openharness/agent-runtime test` | PASS；75 files，615/615 tests |
| `pnpm --filter @openharness/agent-runtime typecheck` | PASS；exit 0 |
| `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` | PASS |
| `npx openspec validate --all --strict --no-interactive` | PASS；23/23 |
| `pnpm dashboard:check` | PASS；36 entries，generated outputs current |
| `git diff --check` | PASS |

## GitHub 与本地证据保留结果

- 已完成 diagnostic-only 切片提交并推送至 GitHub 功能分支，commit 为 `da86e08177593be4eaa4df2ef68892301abcd094`。
- 远端 `add-openclacky-runtime-parity-roadmap` 已机械复核指向同一 commit。
- 16 个未入 Git evidence 文件共 `2176696701` bytes，已迁移至 [本地 evidence 保留目录](file:///Users/elvis/file/develop/opensource/openharness-evidence/add-openclacky-runtime-parity-roadmap/2026-07-22-gate-d-gate-r1/)。
- 保留目录的状态、identity 变化与复用边界记录在 [MANIFEST.md](file:///Users/elvis/file/develop/opensource/openharness-evidence/add-openclacky-runtime-parity-roadmap/2026-07-22-gate-d-gate-r1/MANIFEST.md)。

未执行正式 Gate D、observer retry、第五次 resume、三个 30 分钟 variants、performance repair、OpenSpec archive、Dashboard 状态提升、main merge 或 release tag。未从 partial SQLite 推断性能趋势。

## 最终建议

1. 精确暂存并提交 11 个 diagnostic-only source/test 文件、获批实施计划和完整 Review 证据链；明确排除所有 SQLite、logs、PID、profile、partial report 与 locks。
2. 使用中文分段式提交信息将完成切片推送到现有 GitHub 功能分支；提交前执行 staged diff、文件大小、敏感信息和 whitespace 复核。
3. 未入 Git evidence 已迁移到 worktree 之外的本地保留目录并记录 identity 变化；复核源 worktree 不再包含需保留的 untracked/ignored evidence 后，关闭对应 worktree。
4. 保持 active OpenSpec 与 Dashboard `proposed`；未来从远端功能分支重建新 worktree 后，先修复 admission 性能退化并完成新的准入与定向回归，再申请新的 Gate D runId 和审批。

## 项目学习收口

本轮未发现需要提升为全局工程不变量的新候选。既有项目规则已经覆盖“证据先于完成声明”“OpenSpec 未完成不得归档”“Review 结论必须落盘”和“Dashboard 状态随门禁同步”；本次差异属于特定 Gate R1 执行/证据状态，不新增 [工程不变量](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/engineering-invariants.md)，也不新增 learning candidate。

## 后续门禁

- **OpenSpec：** 继续使用 active `harden-agent-runtime-single-node-production`；本轮不得归档，也无需为 diagnostic-only closeout 新建 change。
- **Superpowers：** 已完成切片按现有获批计划收口；任何 performance repair、正式 Gate D 或 workload/threshold/persistence 语义变化都必须重新经过相应计划与审批门禁。
- **Dashboard：** 保持 `proposed`，无需修改或重新渲染数据源；`dashboard:check` 已确认生成产物当前有效。
- **GitHub：** 只允许推送完成切片到功能分支；本 Review 不宣布 merge main、release 或 production qualification。
- **worktree：** 只有在本地 evidence 迁移并核对完成后才允许关闭。
- **项目规则：** 未修改。
