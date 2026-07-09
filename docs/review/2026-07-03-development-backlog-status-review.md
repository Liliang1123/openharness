# OpenHarness 开发任务状态审计

## 结论

需修改：当前没有 active OpenSpec change，也没有已批准但尚未执行的实施计划。开发导航台中的 13 个 `partial` 条目均已存在归档 OpenSpec change，且对应 `tasks.md` 的任务全部勾选完成；这些条目主要是 dashboard 收口缺失，而不是 13 项仍待开发的功能。当前应先完成分支集成和 dashboard 历史状态修正，再选择新的产品能力创建 OpenSpec proposal。

## Review 范围

- [开发导航台数据源](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)
- [缺口分析与路线图](file:///Users/elvis/file/develop/opensource/openharness/docs/vision/openharness-gap-analysis-and-roadmap.md)
- [OpenSpec 归档目录](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/archive)
- [OpenSpec 当前规格目录](file:///Users/elvis/file/develop/opensource/openharness/openspec/specs)
- [Runtime Progress Panel 收口文档](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-29-add-runtime-progress-panel-closeout.md)
- [Runtime Progress Panel 实施计划](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-06-29-add-runtime-progress-panel.md)

## 主要发现

### 高：当前功能分支尚未进入 `main`

- 当前分支 `feat/runtime-progress-panel` 相对 `main` 多两个提交：`9d8b65b`（subagent trace tree）和 `1c38246`（runtime progress panel）。
- 两项功能均已完成 OpenSpec 归档和本地全量验证，但尚未进入 `main`。
- 本机 GitHub CLI 凭证已失效，无法确认远端 PR 状态或创建 PR；错误为 `The token in default is invalid`。

### 中：13 个 `partial` 条目状态陈旧

- 13 个条目都指向 `openspec/changes/archive/` 下的归档 change。
- 对应 `tasks.md` 中未发现未勾选任务；实现、测试、验证和归档步骤均已完成。
- 多数条目缺少 `closeout`、`currentSpecs` 或 dashboard 的 `archived` 状态，导致导航台把已完成历史误呈现为待推进工作。
- `implement-p0b-hookable/proposal.md` 仍保留“待实现”描述，但其归档任务清单已全部完成，属于历史 proposal 文案未同步，不应据此重新实施。

### 中：路线图已落后于当前代码状态

- 路线图仍把 multi-step loop、ContextBuilder、prompt registry、protocol tools、memory retrieval 等列为主要缺口。
- 这些能力已有对应归档 change 或后续实现，不能直接按旧路线图重新创建同名任务。
- 路线图仍可作为方向参考，但新的开发排序必须先对照 current specs、归档记录和当前代码重新做 gap analysis。

### 低：存在一个已验证但未归档的工具链条目

- `harden-project-dashboard-validation` 状态为 `verified`，且没有 OpenSpec change。
- 其剩余方向只有可选 CI 接入和非法数据 fixture 测试；如果继续实现 CI 行为变化，应先独立判断是否需要 OpenSpec，不应直接篡改原条目范围。

## 最终建议

1. 修复 GitHub CLI 认证后，确认或创建 `feat/runtime-progress-panel` 到 `main` 的 PR；合并前保留现有全量测试、typecheck、OpenSpec 与 dashboard 门禁。
2. 单独执行 dashboard 收口变更：逐项核对 13 个历史条目的 archivePath、currentSpecs、closeout 和验证证据，将符合规则的条目从 `partial` 修正为 `archived`，重新渲染 dashboard 并运行 `pnpm dashboard:check`。
3. 更新或替换 2026-05-25 路线图，基于当前 specs 与代码形成新的 gap analysis；不要把已归档能力继续列为未实现。
4. 下一项产品能力建议从以下候选中选择一个进入 Discovery/OpenSpec：Agent Definition SDK/UI、tenant budget/rate limit、向量记忆检索、真实 provider eval/CI。
5. 小型工程候选是将 `pnpm dashboard:check` 接入 CI 并增加非法 dashboard fixture 测试；该工作应与产品能力变更分开。

## 后续门禁

- 分支合并/PR：不需要新 OpenSpec，但需要恢复 GitHub 认证、检查远端 PR、通过 CI，并由用户确认合并方式。
- Dashboard 历史状态修正：不需要新 OpenSpec；属于已归档事实的文档/导航台修复，需要更新唯一数据源、重新渲染并执行 `pnpm dashboard:check`。
- 路线图更新：纯 review/vision 文档不需要 OpenSpec；若形成用户可见能力或运行时变更，必须先创建并批准 OpenSpec proposal。
- 新产品能力：需要 OpenSpec proposal，批准后再生成 Superpowers 实施计划并按 TDD 执行。
