# Stage 0 / Gate B Overlap 与 Integration Audit Review

## 结论

有风险：Gate B runner 的已评审实现切片具备独立 commit/push 条件；Stage 0 已有三组稳定成果被提交到当前 integration 候选分支，但 Stage 0 dirty worktree 的剩余内容不能整体提交或机械覆盖。当前仍没有单一最终 Git/OpenSpec 事实源：integration 候选 `8dab892aa8f9747b05f77a804e1e18f81c2f9f33` 包含治理、24h preflight、Anthropic Gate C defer 与 dashboard 同步，却不包含 OAuth 完成提交 `26f4ebb68de83468b5ee068fbbb7596e07c89014`；Stage 0 与 Gate B 都仍从旧基线 `9b3b404d2ae33de7808a6a3120d44fc717203a1c` 承载未提交内容。

本轮不得归档 `harden-agent-runtime-single-node-production`，不得创建 Runtime parity OpenSpec、更新 parity dashboard、生成 parity Superpowers implementation plan 或实施 parity 代码。

## Review 范围

- [Stage 0 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/)
- [Gate B worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/)
- [Integration / parity intake worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- [Stage 0 tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [24h local soak closeout Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-11-agent-runtime-formal-24h-local-soak-closeout-review.md)
- [Gate B evidence audit](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/review/2026-07-11-gate-b-real-provider-evidence-review.md)
- [Gate B Attempt-05 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-05-review.md)
- [Runtime parity backlog plan Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-openclacky-runtime-parity-development-backlog-final-plan-review.md)

## Git / OpenSpec 事实源审计

| 视图 | HEAD | 状态 | 稳定性结论 |
| --- | --- | --- | --- |
| Stage 0 | `9b3b404d2ae33de7808a6a3120d44fc717203a1c` | dirty；15 个 tracked 修改并有多组 untracked source/evidence/review/OpenSpec 文件 | 不能整体提交；需按已评审业务切片拆分 |
| Gate B | `9b3b404d2ae33de7808a6a3120d44fc717203a1c` | dirty；5 个 tracked 修改、10 个 runner/test 文件及 11 个 review/brief 文件未跟踪 | Attempt-05 correction 无 High/Medium finding，fresh gates 后可独立提交 |
| integration 候选 | `8dab892aa8f9747b05f77a804e1e18f81c2f9f33` | clean，跟踪 `origin/add-openclacky-runtime-parity-roadmap` | 可作为审计入口，不是最终事实源 |
| OAuth 完成线 | `26f4ebb68de83468b5ee068fbbb7596e07c89014` | 已推送到 `origin/add-chatgpt-oauth-auth-task4` | 已完成；禁止重复 qualification、23/23 对账或 archive |

`9b3b404..8dab892` 共 6 个提交；integration 候选已包含以下稳定提交：

1. `0d18152559bedb65e4241eff90ba62b4d5285af7`：Codex OAuth 前置与操作控制。
2. `7d2421cb1817986d2cb6b722a9126ab8f8a99a1f`：24 小时基线 preflight 能力。
3. `e4647474ff735b6fe18b730c001db1ccdda58e62`：Anthropic Gate C defer 契约。
4. `0ece2d49f43c82ef3a107a81594e86738d1c7a56`：OAuth / Gate C dashboard 同步。
5. `98d52c849b6067283b5439e6699173c66dee68b2`：worktree 协作治理。
6. `8dab892aa8f9747b05f77a804e1e18f81c2f9f33`：当前交接与 intake Review。

OAuth 完成提交 `26f4ebb68de83468b5ee068fbbb7596e07c89014` 与 `8dab892` 从共同祖先分叉，尚未进入 integration 候选；因此该分支中的旧 OAuth active 视图不得用于状态判断。

## Overlap Matrix

| 文件 | Stage 0 owner / 内容 | Gate B owner / 内容 | 冲突处理 |
| --- | --- | --- | --- |
| [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java) | Stage 0 formal OpenAI-compatible / reasoning / timeout 资格矩阵回归 | Gate B production-boundary、parser capture 与攻击回归 | 两侧均为有效新增，必须在 integration 基线上语义合并并重跑 backend 全量；禁止选边覆盖 |
| [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md) | Stage 0 Step/Task evidence、Gate C/Gate D 与 local soak 状态 | Gate B real-provider runner Step 8–16 与修正门禁 | 以时间线和门禁语义逐段合并；Gate B concern、Stage 0 production blockers 均须保留 |

除上述两项外，当前 dirty path 集合没有直接路径重叠；但 Provider qualification、OpenSpec task 状态和 dashboard 在语义上仍相互依赖，不能据此宣称可无审查合并。

## 可提交稳定切片与顺序

### PASS — 已存在稳定 SHA

1. `7d2421c`：Stage 0 24h preflight harness；已在 integration 候选及远端分支持久化。
2. `e464747`：Anthropic Gate C defer；对应 Stage 0 worktree 中 proposal/design/spec/tasks 与 approval-alignment Review 内容和 integration blob 一致。
3. `0ece2d4`：对应 dashboard 同步；已在 integration 候选持久化，但最终 integration 后仍需 `pnpm dashboard:check`。
4. `26f4ebb`：OAuth 完成线；远端独立可恢复，不得重做。

### PASS — 本轮应提交

Gate B real-provider qualification runner + Attempt-05 correction：Review 结论为 correction 无 High/Medium finding，overall 保持 `DONE_WITH_CONCERNS`；提交只持久化 runner、安全边界、测试和审计制品，不代表真实 Provider qualification PASS，不勾 OpenSpec 3.1/3.2，不修改 dashboard。

本轮已完成：精确暂存 26 个已复核文件，提交并推送 `7fc5ef731b5af300789d211867f86378107ea010` 到 `origin/gate-b-real-provider-closeout`；`git ls-remote` 返回同一 SHA，worktree clean。该 worktree 仍承载未完成的 production issuer 正向 qualification / Gate C 工作，保留不删除。

### BLOCKED — 不可整体提交

Stage 0 dirty worktree 仍混合 formal matrix、Gate C 证据、local soak、runbook、OpenSpec task 更新、dashboard 生成物和多轮协作制品。恢复条件是按 Review 对应的完整业务切片建立精确文件清单，确认报告均已脱敏且 provenance 可继承，逐切片 fresh verify 后提交；尤其不能把本地 24h database/sampler 报告提升为 Gate D，也不能把未获授权真实 Provider/生产迁移证据写成 PASS。

## Fresh Gates

### Gate B runner stable slice

- 显式 unset `OPENAI_COMPATIBLE_API_KEY` 与 `ANTHROPIC_API_KEY` 的 focused Maven：`40/40` PASS。
- 同样显式 unset credential 的 backend full：`78/78` PASS。
- shared-schema：`49/49` PASS；typecheck PASS。
- Runtime qualification：`5/5` PASS；typecheck PASS。
- `DO_NOT_TRACK=1 npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS。
- `git diff --check`：PASS。
- 沙箱内第一次 focused Maven 的 11 个错误全部发生于 `127.0.0.1` fixture bind 被系统拒绝；沙箱外同一测试全集 `40/40` PASS，不属于实现失败。

### Integration fresh gate（合并后执行）

1. 核验 local / remote SHA 与 ancestry，确保 OAuth、Stage 0 稳定提交和 Gate B commit 均可从 integration HEAD 到达。
2. `openspec list` 与 `harden-agent-runtime-single-node-production` task count，确认 OAuth 不再 active、Stage 0 未误归档。
3. backend full、shared-schema test/typecheck、Runtime qualification 与相关 Stage 0 focused tests。
4. `DO_NOT_TRACK=1 npx openspec validate --strict --no-interactive`。
5. 若 dashboard 数据源发生合并，重新 render 后运行 `pnpm dashboard:check`。
6. `git diff --check`，并复核无 secret、临时报告或凭据落盘。

## 主要发现

### 阻塞 — 尚无最终单一事实源

`8dab892` 不含 OAuth 完成提交；Stage 0 与 Gate B 新成果仍分别停留在旧基线 dirty worktree。任何直接在 parity worktree 开始实现都会继承错误的 OAuth/OpenSpec 视图。

### 高风险 — 两个直接重叠文件不能机械选边

测试文件两侧覆盖不同的安全/资格回归；final plan 两侧记录不同但同时有效的门禁历史。覆盖任一侧都会丢证据或降低门禁。

### 高风险 — 完成切片与生产资格必须分开

Gate B runner 可以作为实现切片提交，但真实 Provider production issuer 尚无正向授权证据；Stage 0 24h 证据只能保持 `local_verified`。提交不等于 promotion、qualification 或 archive。

## 最终建议

1. Gate B runner 稳定切片已提交、推送并核验远端 SHA。
2. 对 Stage 0 剩余 dirty 内容按既有 Review 切片，不做 wholesale commit；已经在 `7d2421c`、`e464747`、`0ece2d4` 持久化的内容不得重复提交。
3. 在干净 integration 分支上依次整合 OAuth `26f4ebb`、Stage 0 未重复稳定切片和 Gate B `7fc5ef7`；两个 overlap 文件逐段 Review。
4. integration fresh gates 全绿后，才把该 HEAD 作为单一 Git/OpenSpec 事实源继续关闭 Stage 0。
5. 保留 Stage 0 与 Gate B worktree，直到各自任务整体完成、远端可恢复且 worktree clean；本轮不删除。

## 后续门禁

- OpenSpec：继续使用 active `harden-agent-runtime-single-node-production`；本轮不创建 parity proposal，不 archive。
- Superpowers：本轮不生成 parity implementation plan；后续 integration conflict resolution 需 focused verification 与独立 Review。
- 人工审批：真实 Provider endpoint/model/cost、credential、生产迁移、Gate D 和 production promotion 均仍需分别明确授权。
- 项目规则：本轮未修改。
