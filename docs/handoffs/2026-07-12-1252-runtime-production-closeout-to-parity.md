# New Window Handoff: Runtime Production Closeout → OpenClacky Parity Intake

## 使用方式

新窗口只读取本 handoff 与下面列出的最小必读文件。不要遍历历史 OAuth Review，不要重新执行已完成的 OAuth qualification，不要直接开始 parity 实现。

## 背景

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness/)
- 当前入口 worktree：[OpenClacky parity roadmap worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 当前入口分支：`add-openclacky-runtime-parity-roadmap`
- 当前入口 HEAD：`98d52c849b6067283b5439e6699173c66dee68b2`
- 当前目标：先建立单一、可继承的 Git/OpenSpec 事实源，收口 single-node production 前置，再进入 spec-only `add-openclacky-runtime-parity-roadmap`。
- 核心门禁：parity backlog 明确要求先归档 `harden-agent-runtime-single-node-production`；在此之前只允许 integration audit 与 docs-only discovery，不允许 parity 功能实现。

## 已完成

- [x] ChatGPT/Codex OAuth Task 2–8、真实本机 app-server qualification、OpenSpec 23/23、final Review、dashboard archived 与 archive 全部完成。
- [x] OAuth 成果已 commit/push：[26f4ebb](https://github.com/Liliang1123/openharness/commit/26f4ebb68de83468b5ee068fbbb7596e07c89014)，远端分支 `origin/add-chatgpt-oauth-auth-task4`。
- [x] OAuth 完成 worktree 已删除；不得再从旧 worktree 路径读取。
- [x] OAuth commit 前 fresh verification：Backend 149/149、shared-schema 58/58、Runtime 317/317、Frontend 24/24、integration 17/17、typecheck、OpenSpec 23/23、dashboard check 全部 PASS。
- [x] Runtime parity 隔离 worktree 已创建；原始基线验证：Backend 81/81、shared-schema 49/49、Runtime 314/314、Frontend 24/24、integration 17/17、typecheck PASS。
- [x] 24 小时 local database/sampler supporting baseline 已完成并保持 `local_verified`，不能冒充 production Gate D。

## 当前状态

### Git / worktree

- OAuth branch：`add-chatgpt-oauth-auth-task4`，远端、本地均指向 `26f4ebb68de83468b5ee068fbbb7596e07c89014`，无 worktree。
- Parity worktree：HEAD `98d52c8`，尚未整合 OAuth commit；其 `openspec list` 仍显示旧 OAuth 13/23 active，属于过期视图，不可作为状态结论。
- Stage 0 worktree：[stage0-runtime-production-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)；HEAD `9b3b404`，存在大量已审计但未提交的实现、证据、Review 与 OpenSpec 修改。
- Gate B worktree：[gate-b-real-provider-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)；HEAD `9b3b404`，存在真实 Provider qualification runner 及 Attempt-05 correction 的未提交内容。
- Stage 0 与 Gate B 均修改 provider qualification/plan 范围，禁止直接互相覆盖或批量复制。

### OpenSpec

- Stage 0 worktree 的 `harden-agent-runtime-single-node-production` 当前实际为 12 项 checked、19 项 unchecked，共 31 项。
- Gate B 仍为 `pending_production_evidence`。
- OpenAI-compatible Task 3.1 尚无获授权的 private production endpoint 正向 qualification。
- Anthropic Task 3.2 已按 approved change 标记为 post-Gate-C deferred；不能用 OAuth/Codex evidence 代替。
- Production Gate D Task 4.2/4.3 尚未执行真实 20-concurrency、60/20/15/5 workload 与 TS-only restarts。
- Dashboard 不能标记 verified，OpenSpec 不能 archive。
- Parity OpenSpec proposal 尚未创建。

### 服务 / 权限

- 当前没有要求保持运行的项目服务。
- Task 8 对本机官方 Codex 登录态的授权只覆盖已完成的 Codex qualification，不扩展为 OpenAI-compatible、Anthropic、生产数据迁移或 Gate D 权限。
- 不得读取、显示或落盘任何 credential/token。

## 未完成 / 下一步

- [ ] 对 Stage 0 与 Gate B 两个 dirty worktree 做只读 overlap/integration audit，明确每个文件的 owner、Review 状态、稳定 SHA 与可独立提交切片。
- [ ] 对已经 Review 可接受且 fresh gates 通过的切片，使用精确暂存、详细中文分段 commit、push；禁止 `git add .`。
- [ ] 不删除仍承载未完成 Gate B/Gate C/Gate D 工作的 worktree；只清理已经 commit/push 且不再需要的完成 worktree。
- [ ] 建立包含治理 commit `98d52c8`、OAuth commit `26f4ebb` 与 Stage 0/Gate B 稳定提交的单一 integration baseline；冲突必须逐文件 Review，禁止盲 merge/覆盖。
- [ ] 在集成基线上重新运行 `openspec list`、task count、关键测试和 dashboard check，消除旧 OAuth active 视图。
- [ ] 继续关闭 `harden-agent-runtime-single-node-production`；任何真实 Provider、生产迁移或 Gate D 执行都先取得对应的明确授权。
- [ ] 只有 Stage 0 archive 且 dashboard archived 后，才修订 parity backlog 输入并创建 spec-only `add-openclacky-runtime-parity-roadmap` proposal。
- [ ] Roadmap proposal 独立 Review PASS 前，不生成 Superpowers implementation plan，不写 parity 代码。

## 建议下一步

- 建议先做：Stage 0 / Gate B overlap 与 commit-readiness 审计，输出一份落盘 Review，并给出明确 commit 顺序。
- 随后：逐个 stable slice fresh verify → commit → push；再创建统一 integration baseline。
- 不建议：直接在 parity worktree merge 两个 dirty worktree、重跑 OAuth、复制 qualification evidence、提前勾 OpenSpec、提前同步 dashboard。
- 原因：当前有三个不同 Git/OpenSpec 视图；直接实施会继续产生重复判断、冲突和证据失真。

## 最小必读文件

- [项目 AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md)
- [OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/AGENTS.md)
- [本 handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/handoffs/2026-07-12-1252-runtime-production-closeout-to-parity.md)
- [Parity intake Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-openclacky-runtime-parity-worktree-intake-review.md)
- [Stage 0 tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Stage 0 approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [24h local soak closeout Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-agent-runtime-formal-24h-local-soak-closeout-review.md)
- [Gate B evidence audit](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-gate-b-real-provider-evidence-review.md)
- [Real Provider runner Attempt-05 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-05-review.md)
- [Parity backlog final plan](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-openclacky-runtime-parity-development-backlog-final-plan.md)
- [Parity backlog plan Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-openclacky-runtime-parity-development-backlog-final-plan-review.md)

不要预读其他历史 Review；只有上述文件明确引用且当前任务确实需要时再打开。

## 验证记录

- OAuth commit/push：`26f4ebb68de83468b5ee068fbbb7596e07c89014`，远端 SHA 已核验一致。
- OAuth final gates：Backend 149/149；shared-schema 58/58；Runtime 317/317；Frontend 24/24；integration 17/17；OpenSpec 23/23。
- Parity baseline：Backend 81/81；shared-schema 49/49；Runtime 314/314；Frontend 24/24；integration 17/17。
- Stage 0 local soak Review：`local_verified` supporting evidence；明确不能关闭 production Gate D。
- Gate B runner Attempt-05：correction 无 High/Medium finding，但 overall 仍为 `DONE_WITH_CONCERNS`，不能关闭 Task 3.1/3.2。
- OpenSpec PostHog offline flush warning 为非门禁 warning。

## 风险 / 注意事项

- 三个 worktree 基于不同 commit 且有重叠 dirty files；并发写入或机械复制会破坏证据链。
- Stage 0 task count 的 parity 旧视图与 Stage 0 dirty worktree不同；以重新集成后的单一基线为最终事实源。
- 现有 24h report 只证明 seeded database/sampler，不证明真实并发 Runtime workload、工具副作用或 TS process restart。
- 真实 Provider runner 的 private production issuer 尚无获授权正向证据。
- OAuth 已完成；任何把 OAuth 再写为 active 或重新 qualification 的动作都应停止。
- Commit/push 后仍须核验远端 SHA；完成 worktree 清理前必须确认 clean 且远端已有可恢复 commit。

## 给新窗口的启动指令

先执行 Stage 0 / Gate B integration audit，不实施 parity。读取本 handoff 和“最小必读文件”，随后：

1. 分别在 Stage 0 与 Gate B worktree 记录 `git status --short`、HEAD、稳定 SHA、Review 结论与测试证据。
2. 建立重叠文件矩阵，判断哪些切片已可 commit/push，哪些仍因生产授权或证据 BLOCKED。
3. 将重要审计结论落盘到 [Review 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/)；结论必须使用“通过 / 有风险 / 需修改”开头。
4. 对可提交切片 fresh verify，精确暂存并使用详细中文分段 commit；push 后核验远端 SHA。
5. 在形成单一 integration baseline 前，不修改 parity OpenSpec、不实现 parity、不更新 dashboard。
6. 遇到真实 Provider、生产迁移、Gate D 或任何 credential 使用，停止并向用户请求对应明确授权。

期望首轮输出：

- `PASS`：给出 overlap matrix、稳定切片、commit 顺序与 fresh gate。
- `BLOCKED`：给出具体文件、缺失证据/授权和恢复条件。
- 无论结果如何，必须给出落盘 Review 的完整绝对 Markdown 链接；不得只口头汇报。
