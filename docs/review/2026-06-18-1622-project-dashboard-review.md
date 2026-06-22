# Project Dashboard Implementation Review

- 文档类型：Review 记录
- 日志及版本：2026-06-18 16:22 初版

## Review 范围

- `docs/project-dashboard/development-log.schema.json`
- `docs/project-dashboard/scripts/render-dashboard.mjs`
- `docs/project-dashboard/development-log.json`
- `docs/project-dashboard/development-log.md`
- `docs/project-dashboard/index.html`
- `docs/project-dashboard/README.md`
- `AGENTS.md` dashboard 同步规则

## 验证记录

- `node docs/project-dashboard/scripts/render-dashboard.mjs`：通过，生成 `development-log.md` 与 `index.html`。
- 使用本地 `node_modules/.pnpm/ajv@8.20.0` 按 Draft-07 schema 编译校验：通过。
- 路径存在性检查：检查 `proposal/design/tasks/specDeltas/currentSpecs/archivePath/superpowers.plan/sourceFiles/testFiles/closeout` 共 198 个路径，缺失 0 个。
- 数据计数：实际为 23 entries，其中 6 archived、17 partial；与“22 个 change / 5 detailed + 17 partial”的口径不一致。

## 主要发现

1. Schema 已通过 `additionalProperties: false` 控制字段漂移，但语义严格度不足：未约束唯一 `changeId`、状态条件字段、路径格式、空字符串、verification result 枚举和真实日期。
2. 渲染脚本对当前 partial 数据可正常渲染，但自身不做 schema 校验；若未先校验 JSON，`entries` 缺失、非字符串字段、错误数组类型会直接运行时报错。
3. `AGENTS.md` 已建立三节点同步规则，但属于软约束；缺少 CI / pre-commit / npm script 门禁，不能保证后续 AI 或人工一定维护 dashboard。
4. `development-log.json` 的路径存在性检查通过；但实际数据口径是 23/6/17，且 `add-p5d-eval-cli` 与 `add-p5a-memory-and-eval` 为 archived 但 `closeout: null`，不满足 archived 同步规则中的 closeout 要求。

## Q1-Q4 结论

- Q1：有风险。Schema 防字段漂移合格，但没有达到“完美防范”语义漂移。
- Q2：有风险。当前数据可渲染；不完整 partial 的可选字段为空数组或缺省时安全，但脚本依赖外部 schema 校验。
- Q3：有风险。规则链有说明闭环，没有自动化门禁闭环。
- Q4：有风险。所有登记路径均存在；但数量口径与 archived closeout 规则存在偏差。

## 建议下一步

1. 给 schema 增加 `uniqueItemProperties` 替代方案或自定义校验脚本，确保 `changeId` 唯一。
2. 用 Draft-07 `if/then` 增加 `archived`、`verified`、`proposed` 的条件必填规则。
3. 在渲染脚本开始处内置 schema 校验，失败时打印 JSON pointer 并退出非 0。
4. 增加 `pnpm dashboard:validate` 与 `pnpm dashboard:render`，后续接入 CI 或提交前检查。
5. 修正数据口径；为 archived 但缺少 closeout 的条目补齐 closeout 或降级为 partial。
