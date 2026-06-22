<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Project Review Rules

本项目的 review、方案评审、架构评审和实施计划评审必须遵循以下落盘规则：

## Review Artifact Location

- 所有重要 review 结论必须落盘到 `docs/review/`。
- 文件名使用 `YYYY-MM-DD-<topic>-review.md` 或 `YYYY-MM-DD-<topic>-final-plan.md`。
- 仅口头回复不足以完成 review，除非用户明确要求“不落盘”。

## Review Artifact Content

Review 文档至少包含：

- `结论`：使用 `通过`、`有风险` 或 `需修改` 开头。
- `Review 范围`：列出被评审的文件、方案、代码或文档。
- `主要发现`：按严重度列出问题、风险和依据。
- `最终建议`：给出可执行的修正方向或最终方案。
- `后续门禁`：说明是否需要 OpenSpec proposal、Superpowers plan、测试或人工审批。

## Plan And Proposal Boundaries

- 未经 OpenSpec 批准的方案不得放入 `docs/superpowers/plans/` 作为可执行计划。
- `docs/superpowers/plans/` 只保存已批准或明确可执行的单次实施计划。
- 待评审方案、review 后方案、架构建议和执行前参考材料应放入 `docs/review/` 或 `docs/vision/`。
- 涉及新增能力、API 契约、架构边界、运行时语义、持久化语义、安全策略或用户可见行为变化时，必须先创建 OpenSpec change 并获批，之后再生成 `docs/superpowers/plans/` 下的实施计划。

## Review Closeout

完成 review 后，最终回复必须说明：

- 落盘文件路径。
- 是否修改了项目规则。
- 是否仍需 OpenSpec 或后续实施计划。

# New Window Handoff Rules

当用户要求“新开窗口继续”“生成 handoff”“上下文太重”“交接包”“总结当前任务背景并给新窗口继续”时，必须在项目内生成续跑交接包，避免新窗口重复执行已完成任务。

## Handoff Artifact Location

- 目录固定为 `docs/handoffs/`。
- 时间戳文件格式为 `docs/handoffs/YYYY-MM-DD-HHMM-<topic>.md`。
- 同步更新 `docs/handoffs/latest.md`。
- 不需要同时写入全局 `/Users/elvis/.codex/handoffs/`，除非用户明确要求全局副本。

## Handoff Artifact Content

交接包至少包含：

- `背景`：项目路径、当前目标、关键约束。
- `已完成`：已归档 OpenSpec change、已完成实现、已跑验证。
- `当前状态`：active change、archived changes、spec 状态、服务/端口状态。
- `未完成 / 下一步`：明确未完成节点，不得把已完成任务写成待办。
- `建议下一步`：给出推荐方向、不建议方向和原因。
- `涉及文件`：列出 specs、plans、tasks、docs、source、tests 的精确路径。
- `验证记录`：命令和已观察到的 pass/fail 结果。
- `风险 / 注意事项`：非阻塞 warning、环境限制、不要重复执行事项。
- `给新窗口的启动指令`：说明新窗口从哪个节点继续、先读哪些文件、不要重复哪些任务。

## Handoff Closeout

生成 handoff 后，最终回复必须说明：

- 时间戳 handoff 文件路径。
- `latest.md` 路径。
- 当前是否仍有 active OpenSpec change。
- 推荐新窗口优先继续的下一项任务。
- 同类“新开窗口继续 / 交接 / 上下文太重”场景，最终回复必须额外提供一段可直接复制到新窗口的任务提示词，内容应包含项目路径、必读文件、不要重复的已完成任务、推荐下一步以及必须遵守的 OpenSpec / Superpowers 执行门禁。

# Development Dashboard Sync Rules

当项目存在 `docs/project-dashboard/` 时，AI 助手在开发过程中必须遵循以下规则维护开发导航台：

## Single Source of Truth
- `docs/project-dashboard/development-log.json` 是唯一可编辑的数据源。
- `docs/project-dashboard/development-log.md` 和 `docs/project-dashboard/index.html` 是生成产物，绝对禁止直接编辑。

## 强制同步节点与触发条件
1. **`proposed` 同步点**：
   - 触发条件：创建或显著更新 OpenSpec proposal、design、tasks 或 spec delta 后。
   - 同步内容：在 `development-log.json` 中新增或更新对应 `changeId`，状态设为 `proposed`，记录 summary、tags、openspec 制品路径等。
2. **`verified` 同步点**：
   - 触发条件：实现完成且本地正式验证通过（但尚未归档）后。
   - 同步内容：状态设为 `verified`，补充 superpowers plan 路径、源文件和测试文件列表、验证命令及结果。
3. **`archived` 同步点**：
   - 触发条件：执行 `npx openspec archive <change-id> --yes` 归档并创建 closeout 文档后。
   - 同步内容：状态设为 `archived`，更新 openspec 路径为 `openspec/changes/archive/YYYY-MM-DD-<change-id>/`，补充 `archivePath`、`closeout` 路径和 `next` / `nonGoals`。

## 重新渲染
- 每次更新 `development-log.json` 后，必须在本地运行以下命令重新生成 MD 和 HTML 产物：
  ```bash
  node docs/project-dashboard/scripts/render-dashboard.mjs
  ```
- 提交前必须运行 `pnpm dashboard:check`，确保 `development-log.json` 通过脚本内置校验且生成产物未过期。
- `development-log.schema.json` 用于 Draft-07 结构校验；`render-dashboard.mjs` 负责补充 `changeId` 唯一性、真实日期、状态条件必填等语义校验。
