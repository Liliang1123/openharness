# OpenHarness 开发导航台初版实现评审与 Codex 移交文档

文档类型：落盘评审与移交记录  
更新时间：2026-06-18  
评审人：Antigravity  

---

## 结论

**通过**：项目开发导航台（Project Dashboard）初版已完整在本地落地。数据结构通过 Ajv Schema 验证，HTML 渲染成功，且同步机制已与项目规则（`AGENTS.md`）整合。无阻塞问题，建议直接提交给 Codex 进行代码级和规则一致性审查。

---

## 1. 落地制品清单（物理路径）

所有文件均已写入项目物理目录：

1. **配置与元数据（SSOT 源）**
   - 唯一数据源：[`development-log.json`](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json) — 包含 22 条已归档变更记录。
   - Schema 约束：[`development-log.schema.json`](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.schema.json) — 限制数据随意漂移，约束日期格式为 `YYYY-MM-DD`。
2. **渲染与展现产物**
   - 渲染引擎：[`scripts/render-dashboard.mjs`](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/scripts/render-dashboard.mjs) — 零依赖的 Node.js 脚本，直接将 JSON 转为 MD 和 HTML。
   - 文本台账：[`development-log.md`](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.md) — 适合文本检索和 diff 审查。
   - 静态导航：[`index.html`](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/index.html) — 静态深色可视化页面，支持 Timeline, Feature Matrix, Bug 定位索引及 Next Queue。
3. **说明与规范约束**
   - 说明书：[`README.md`](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/README.md) — 写明渲染条件（Node.js >= 18）与维护约束。
   - 项目大模型规则：[`AGENTS.md`](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md) — 追加了 `proposed`/`verified`/`archived` 三节点强制同步与重新渲染机制。

---

## 2. 本地验证结果记录

### 2.1 Schema 合规性校验
在本地通过 `ajv-cli` 进行了严格的 schema 校验：
```bash
npx -y ajv-cli validate -s docs/project-dashboard/development-log.schema.json -d docs/project-dashboard/development-log.json
```
- **输出结果**：`docs/project-dashboard/development-log.json valid`
- **修改说明**：为了适配 `ajv` 对 meta-schema 的默认支持度，已将 `$schema` 降级为更通用的 `http://json-schema.org/draft-07/schema#`。

### 2.2 静态渲染测试
在本地执行：
```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
```
- **输出结果**：
  ```text
  ✅ Generated /Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.md
  ✅ Generated /Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/index.html
  📊 22 entries (5 archived, 17 partial)
  ```
- **渲染特征**：生成的 `index.html` 采用内嵌模板形式，不使用 `fetch()` 请求本地 JSON，完全避免了 `file://` 下的 CORS 报错风险，浏览器直接打开双击即可完美交互。

---

## 3. 请 Codex 重点评审的 4 个方向

请 Codex 在接手此增量修改时，审查以下逻辑或潜在问题：

### Q1: Schema 严格度与 Draft-07 的兼容性
- **审查重点**：将 schema 调整为 Draft-07 后，约束是否足够严格？例如 `entries` 级 `additionalProperties: false` 仍然生效，但请确认是否有一些属于 Draft-2020-12 的现代语法被遗漏。
- **数据回写校验**：在 `development-log.json` 中，由于 schema 规定 `superpowers.plan` 只能有一个 `plan` 字段（`additionalProperties: false`），对于在 partial backfill 中有 `additionalPlans` 历史数据的 change（如 `add-execution-lifecycle-and-stream-recovery`），已将首个计划设为 `plan`，多余的放入 `notes` 中。请确认此迁移决策是否妥当。

### Q2: 渲染脚本的 Edge Case 处理
- **审查重点**：[`render-dashboard.mjs`](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/scripts/render-dashboard.mjs) 中的数据转化与 HTML 字符串拼接是否健壮？例如，当某条 partial 数据缺少可选字段时（如没有 `openspec.specDeltas` 且无 `openspec.currentSpecs`），页面输出是否会退化为不雅观的 `—`，或者有无抛出未捕获异常的风险。

### Q3: 规则链闭环（`AGENTS.md`）
- **审查重点**：我们向 [`AGENTS.md`](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md) 追加了同步规则：
  > 当项目存在 `docs/project-dashboard/` 时，必须遵循 proposed / verified / archived 三节点更新 `development-log.json` 并执行渲染。
  请 Codex 检查这个定义，是否能防范在做新 spec 变更或 superpowers 阶段时，AI 遗忘同步的情况？是否需要更强制地整合到 openspec-superpower-change skill 中？

### Q4: 历史 Change 数据质量
- **审查重点**：
  - 详细录入的最近 5 个 Change 信息（`add-p5a-memory-and-eval` 到 `add-agent-definition-runtime-selection`）是否足够精准？
  - Partial 填充的 17 个历史 change 提取出的 `summary` 和 `archivePath` 路径是否存在拼写错误？
