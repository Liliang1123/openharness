# Project Dashboard Hardening Closeout

- 文档类型：设计/实现收尾记录
- 日志及版本：2026-06-18 初版

## 背景

本次变更基于 `docs/review/2026-06-18-1622-project-dashboard-review.md` 的审查结论，对 `docs/project-dashboard/` 开发导航台做最小必要加固，不改造成跨项目模板。

## 核心逻辑

- `development-log.schema.json` 继续作为 Draft-07 结构约束，收紧字段类型、状态枚举、路径、数组唯一性和 archived/proposed/verified 条件必填。
- `render-dashboard.mjs` 在生成前执行无第三方依赖的语义校验，补齐 Draft-07 不便表达的约束：`changeId` 唯一性、真实日历日期、未知字段、状态语义必填等。
- 渲染脚本新增 `--check` 模式，用于提交前检查生成产物是否与 `development-log.json` 同步。
- `package.json` 新增 `dashboard:render` 与 `dashboard:check`，让后续 AI/人工有统一入口。
- 补齐 `add-p5d-eval-cli` 与 `add-p5a-memory-and-eval` 的 closeout 文档和 JSON 引用，使 archived 记录满足闭环规则。

## 主要结论

- 本次是 dashboard 现有工具链加固，不涉及 OpenHarness 业务运行时、API、前端用户行为或安全策略变更，因此未创建 OpenSpec change。
- 后续若要把 dashboard 抽象成跨项目模板或接入 CI，应另起 OpenSpec 或明确实施计划。

## 待办

- 可选：后续将 `pnpm dashboard:check` 接入 CI。
- 可选：后续增加独立 fixture 测试，覆盖非法日期、重复 `changeId`、archived 缺 closeout、生成产物过期等失败场景。
