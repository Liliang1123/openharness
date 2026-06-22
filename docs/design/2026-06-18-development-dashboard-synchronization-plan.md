# 通用开发导航台同步方案

文档类型：流程与可视化方案  
日志及版本：v2.1 / 2026-06-18 / merged v2 review: Node runtime, date pattern, handoff boundary

## 结论

通过：建议为所有使用 OpenSpec + Superpowers 流程的项目引入“开发导航台”，以项目内 `docs/project-dashboard/` 作为统一入口，记录功能点、spec、plan、源码、测试、验证、归档和下一步，便于后续 bug 定位和开发进度追踪。

v2 修订重点：

- `development-log.json` 是唯一可编辑数据源（Single Source of Truth）。
- `development-log.md` 和 `index.html` 由 JSON 生成，禁止直接编辑。
- 新增 `development-log.schema.json` 约束字段，避免数据漂移。
- 强制同步点从 6 个减少为 3 个：`proposed`、`verified`、`archived`。
- `index.html` 不依赖 `file:// fetch()`，采用静态生成或内嵌 JSON 数据。
- 历史 change 采用“关键详录 + 其余 partial backfill”策略。
- 增加验收条件和成功指标。

v2.1 补充：

- `render-dashboard.mjs` 运行环境建议为 Node.js >= 18，并在 README 中写明调用方式。
- JSON Schema 中 `date` / `updatedAt` 字段增加 `YYYY-MM-DD` pattern 约束。
- 补充 `docs/project-dashboard/` 与 `docs/handoffs/` 的职责边界。

## 背景

当前开发流程会产生多个分散制品：

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/design.md`
- `openspec/changes/<change-id>/tasks.md`
- `openspec/changes/<change-id>/specs/**/spec.md`
- `docs/superpowers/plans/*.md`
- `docs/design/*closeout.md`
- 源码入口、测试文件、验证命令记录

这些制品各自有价值，但缺少一个项目级索引。随着功能点增多，后续排查 bug 时会出现：

- 不知道某个能力最初由哪个 OpenSpec change 引入。
- 不知道对应的 Superpowers plan 在哪里。
- 不知道实现入口和测试入口。
- 不知道某个功能的非目标、风险和后续待办。
- 不知道当前项目下一步应该做什么。

因此需要一个通用的“开发导航台”，把每个功能点串成可视化、可检索、可维护的开发轨迹。

## Review 修订记录

本方案 v2 合并了外部 review 中的 7 个风险点：

| 风险点 | v2 处理 |
|---|---|
| 同步维护成本过高 | 强制同步点减少为 `proposed` / `verified` / `archived`。 |
| JSON/MD/HTML 缺少 Single Source of Truth | 明确 JSON 为唯一数据源，MD/HTML 生成。 |
| 无 JSON Schema 约束 | 新增 `development-log.schema.json`。 |
| skill 集成路径不具体 | 增加项目规则、全局 skill、`openspec-superpower-change` 三阶段集成路径。 |
| `file:// fetch()` CORS 风险 | HTML 采用静态生成或内嵌 JSON，不运行时 fetch。 |
| 历史 change 只录入部分 | 增加 partial backfill 策略。 |
| 缺验收条件和成功指标 | 增加验收条件与成功指标章节。 |
| README 缺少 Node.js 运行说明 | v2.1 增加 Node.js >= 18 和渲染脚本调用方式。 |
| date 字段约束过宽 | v2.1 增加 `^\d{4}-\d{2}-\d{2}$` pattern。 |
| 与 handoff 职责边界不清 | v2.1 增加 dashboard 与 `docs/handoffs/` 边界说明。 |

## 目标

### 核心目标

1. 每个项目内都有一个可视化导航页，可直接浏览。
2. 每个功能点都能追溯到：OpenSpec proposal、design、tasks、spec delta、current spec、Superpowers plan、closeout、代码入口、测试入口和验证记录。
3. 每次关键节点变化时，同步更新导航台。
4. 机制通用于所有使用 `openspec-superpower-change` 的项目，不绑定 OpenHarness。
5. 初期不引入复杂依赖，优先使用 JSON + 静态 HTML + 生成 Markdown。
6. 后续可演进为全局 skill 自动维护。

### 非目标

- 不改变 OpenSpec 语义。
- 不替代 `proposal.md`、`tasks.md`、Superpowers plan 或 closeout。
- 不引入前端框架或构建流程。
- 不修改业务代码。
- 不强制所有历史 change 信息一次性补全；缺失字段可标记为 `unknown` 或 `partial`。
- 不把 `development-log.md` 或 `index.html` 作为人工编辑的数据源。

## Single Source of Truth

`docs/project-dashboard/development-log.json` 是唯一可编辑数据源。

以下文件为生成产物：

```text
docs/project-dashboard/development-log.md
docs/project-dashboard/index.html
```

维护规则：

- 人工或 agent 只编辑 `development-log.json`。
- `development-log.md` 由 JSON 生成，便于文本阅读和 code review。
- `index.html` 由 JSON 生成，便于可视化浏览。
- 如果生成产物和 JSON 冲突，以 JSON 为准。
- 禁止只改 HTML 或 MD 而不更新 JSON。

## 推荐目录结构

每个项目内新增：

```text
docs/project-dashboard/
├── index.html
├── development-log.md
├── development-log.json
├── development-log.schema.json
├── README.md
└── scripts/
    └── render-dashboard.mjs
```

### 文件职责

| 文件 | 作用 |
|---|---|
| `development-log.json` | 唯一可编辑数据源。 |
| `development-log.schema.json` | 字段约束，防止结构漂移。 |
| `render-dashboard.mjs` | 从 JSON 生成 Markdown 和 HTML。 |
| `index.html` | 静态可视化入口，浏览器直接打开。 |
| `development-log.md` | 人类可读总台账，适合代码审查和文本搜索。 |
| `README.md` | 维护说明、字段规范、状态枚举和同步规则。 |

## 数据模型

### 顶层结构

```json
{
  "schemaVersion": 1,
  "project": {
    "name": "openharness",
    "root": ".",
    "updatedAt": "2026-06-18"
  },
  "entries": []
}
```

### 单条功能记录

```json
{
  "changeId": "add-agent-definition-runtime-selection",
  "title": "Agent Definition Runtime Selection",
  "status": "archived",
  "date": "2026-06-18",
  "type": "feature",
  "summary": "chat 请求支持可选 agentId，并按 Agent Definition promptRef 解析 system prompt",
  "tags": ["agent-definition", "prompt-registry", "agent-runtime"],
  "openspec": {
    "proposal": "openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/proposal.md",
    "design": "openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/design.md",
    "tasks": "openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/tasks.md",
    "specDeltas": [
      "openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/specs/agent-definition/spec.md",
      "openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/specs/prompt-registry/spec.md"
    ],
    "currentSpecs": [
      "openspec/specs/agent-definition/spec.md",
      "openspec/specs/prompt-registry/spec.md"
    ],
    "archivePath": "openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/"
  },
  "superpowers": {
    "plan": "docs/superpowers/plans/2026-06-18-add-agent-definition-runtime-selection.md"
  },
  "implementation": {
    "sourceFiles": [
      "agent-runtime/src/server.ts",
      "agent-runtime/src/agentExecutionRunner.ts",
      "agent-runtime/src/prompts/registry.ts"
    ],
    "testFiles": [
      "agent-runtime/test/agentRuntime.test.ts"
    ]
  },
  "verification": [
    {
      "command": "pnpm --filter @openharness/agent-runtime test -- agentRuntime",
      "result": "passed",
      "note": "13 tests passed"
    },
    {
      "command": "npx openspec validate --all --strict --no-interactive",
      "result": "passed",
      "note": "22 passed / 0 failed"
    }
  ],
  "closeout": "docs/design/2026-06-18-add-agent-definition-runtime-selection-closeout.md",
  "next": [
    "Agent Definition Tool Filtering 需要独立 OpenSpec change"
  ],
  "nonGoals": [
    "未实现 tools allow-list enforcement / filtering",
    "未实现 YAML",
    "未实现 SDK",
    "未实现 Frontend UI",
    "未实现 remote CRUD API",
    "未实现 hot reload",
    "未实现 tenant-scoped dynamic definitions"
  ],
  "notes": [
    "OpenSpec PostHog telemetry 网络错误为非阻塞噪声"
  ]
}
```

## JSON Schema 草案

`development-log.schema.json` 至少约束以下内容：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["schemaVersion", "project", "entries"],
  "properties": {
    "schemaVersion": { "type": "integer", "const": 1 },
    "project": {
      "type": "object",
      "required": ["name", "updatedAt"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "root": { "type": "string" },
        "updatedAt": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" }
      },
      "additionalProperties": false
    },
    "entries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["changeId", "title", "status", "date", "summary"],
        "properties": {
          "changeId": { "type": "string", "minLength": 1 },
          "title": { "type": "string", "minLength": 1 },
          "status": {
            "type": "string",
            "enum": ["proposed", "verified", "archived", "blocked", "superseded", "partial"]
          },
          "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
          "type": { "type": "string" },
          "summary": { "type": "string" },
          "tags": { "type": "array", "items": { "type": "string" } },
          "openspec": { "type": "object" },
          "superpowers": { "type": "object" },
          "implementation": { "type": "object" },
          "verification": { "type": "array" },
          "closeout": { "type": "string" },
          "next": { "type": "array", "items": { "type": "string" } },
          "nonGoals": { "type": "array", "items": { "type": "string" } },
          "notes": { "type": "array", "items": { "type": "string" } }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

实际实施时可根据项目需要扩展，但必须同步更新 schema，并保持 `additionalProperties: false`，防止字段随意漂移。

## 状态枚举

v2 建议只保留强制状态：

| 状态 | 含义 | 是否强制同步点 |
|---|---|---|
| `proposed` | 已创建 proposal / spec delta，待批准或待 plan。 | 是 |
| `verified` | 已实现并完成正式验证，待归档。 | 是 |
| `archived` | 已归档，spec 已进入当前真相。 | 是 |
| `blocked` | 阻塞，需要用户决策或外部条件。 | 条件性 |
| `superseded` | 被后续 change 替代。 | 条件性 |
| `partial` | 历史记录不完整，等待补齐。 | 历史 backfill 使用 |

说明：

- `approved`、`planned`、`implementing` 不作为强制状态，避免维护成本过高。
- 如项目确实需要实时看实施中状态，可放入 `notes` 或 `verification`，但不作为核心同步点。

## HTML 生成策略

### 原则

`index.html` 必须能直接用浏览器打开，不依赖本地 HTTP server。

避免以下方式：

```js
fetch('./development-log.json')
```

因为在 `file://` 场景下可能被 CORS 或浏览器安全策略阻止。

### 推荐方式

由 `render-dashboard.mjs` 生成完整静态 HTML：

```text
development-log.json -> render-dashboard.mjs -> index.html + development-log.md
```

可选实现：将 JSON 数据内嵌到 HTML：

```html
<script id="dashboard-data" type="application/json">
{ "schemaVersion": 1, "entries": [] }
</script>
```

或者直接生成纯 HTML 表格，不在浏览器端解析 JSON。

## HTML 可视化模块

`index.html` 建议包含以下模块。

### 1. Timeline

按日期展示功能演进：

```text
2026-06-18
- add-agent-definition-loader ✅ archived
- add-agent-definition-runtime-selection ✅ archived
```

### 2. Feature Matrix

展示功能点与制品链接：

| 功能点 | 状态 | Spec | Plan | Code | Tests | Closeout | Next |
|---|---|---|---|---|---|---|---|
| add-agent-definition-runtime-selection | archived | agent-definition / prompt-registry | plan | server / runner | agentRuntime.test | closeout | Tool Filtering |

### 3. Bug 定位索引

按 tag / module 聚合：

```text
Agent Definition
- add-agent-definition-loader
- add-agent-definition-runtime-selection

Eval
- add-p5a-memory-and-eval
- add-p5d-eval-cli
- add-p5e-eval-fixtures
```

### 4. Next Work Queue

展示推荐下一步和明确不建议范围：

```text
推荐下一步：
- Agent Definition Tool Filtering

暂不建议：
- YAML
- SDK
- Frontend UI
- remote CRUD
- hot reload
- tenant-scoped dynamic definitions
```

## 与 OpenSpec + Superpowers 的同步规则

v2 将强制同步点减少为 3 个。

### 1. `proposed` 同步点

触发条件：创建或显著更新以下文件后：

```text
openspec/changes/<change-id>/proposal.md
openspec/changes/<change-id>/design.md
openspec/changes/<change-id>/tasks.md
openspec/changes/<change-id>/specs/**/spec.md
```

同步内容：

- 新增或更新 `changeId` 记录。
- 状态设为 `proposed`。
- 记录 proposal、design、tasks、spec delta 路径。
- 记录受影响 current spec。
- 记录 summary、tags、nonGoals。
- 运行或准备运行 dashboard schema 校验。

### 2. `verified` 同步点

触发条件：实现完成且正式验证通过后，归档前。

同步内容：

- 状态设为 `verified`。
- 补充 plan 路径。
- 补充实际 source files 和 test files。
- 补充 verification commands 与结果。
- 补充环境限制说明，例如沙箱失败、授权重跑、telemetry 噪声。

### 3. `archived` 同步点

触发条件：执行归档并创建 closeout 后：

```text
npx openspec archive <change-id> --yes
```

同步内容：

- 状态设为 `archived`。
- 更新 OpenSpec 路径到 `openspec/changes/archive/YYYY-MM-DD-<change-id>/`。
- 补充 `archivePath`。
- 补充 current specs。
- 补充 closeout 路径。
- 补充 next / nonGoals / residual risks。
- 重新生成 `development-log.md` 和 `index.html`。

## 历史 change backfill 策略

历史记录不应只录入少数最近 change，也不应为了完整性编造未知信息。

建议策略：

1. 最近关键 change 详细记录，例如：
   - `add-p5a-memory-and-eval`
   - `add-p5d-eval-cli`
   - `add-p5e-eval-fixtures`
   - `add-agent-definition-loader`
   - `add-agent-definition-runtime-selection`
2. 其他 `openspec/changes/archive/**` 下的历史 change 自动生成 `partial` 记录。
3. `partial` 记录至少包含：
   - `changeId`
   - `status: "partial"`
   - `date`
   - `archivePath`
   - `proposal` / `design` / `tasks` 路径（如存在）
   - `specDeltas` 路径（如存在）
4. 不完整字段使用空数组、`unknown` 或省略可选字段，不得编造。
5. 后续排查某个历史 bug 时，再把对应 `partial` 记录补全为 `archived` 详细记录。

## 与 docs/handoffs/ 的职责边界

`docs/project-dashboard/` 和 `docs/handoffs/` 都服务于项目连续开发，但职责不同。

| 目录 | 职责 | 生命周期 | 内容粒度 |
|---|---|---|---|
| `docs/project-dashboard/` | 长期开发导航台和功能索引。记录稳定功能点、spec、plan、代码入口、测试入口、验证和归档。 | 长期维护，随项目演进持续更新。 | 以 OpenSpec change / 功能点为单位。 |
| `docs/handoffs/` | 单次会话或新窗口续跑交接包。记录当前上下文、未完成事项、环境状态和下一步启动指令。 | 短中期使用，主要服务上下文迁移。 | 以一次工作会话或续跑节点为单位。 |

规则：

- handoff 可以引用 dashboard 中的功能记录。
- dashboard 不替代 handoff；它不记录临时会话细节、后台进程状态或一次性上下文。
- handoff 不替代 dashboard；完成稳定功能演进后，必须回写 dashboard。
- bug 定位优先从 dashboard 找功能点和长期制品，再按需查看相关 handoff 了解当时会话上下文。

## Skill 集成路径

### 阶段 1：项目规则集成

在项目 `AGENTS.md` 中加入规则：

```text
当项目存在 docs/project-dashboard/ 时：
- 创建或更新 OpenSpec proposal/spec delta 后，必须更新 development-log.json 为 proposed。
- 实现并验证通过后，必须更新为 verified。
- archive + closeout 后，必须更新为 archived。
- 每次更新 JSON 后，必须运行 dashboard 渲染脚本，重新生成 development-log.md 和 index.html。
- 禁止直接编辑生成产物 development-log.md 和 index.html。
```

### 阶段 2：通用 skill 自动化

新增或更新一个通用 skill：

```text
development-dashboard
```

职责：

- 检查项目是否存在 `docs/project-dashboard/`。
- 不存在时可按用户要求初始化模板。
- 读取/更新 `development-log.json`。
- 校验 `development-log.schema.json`。
- 调用 `render-dashboard.mjs` 生成 Markdown 和 HTML。
- 在 OpenSpec proposal、verified、archive 三个节点提供固定同步动作。

### 阶段 3：`openspec-superpower-change` 联动

在 `openspec-superpower-change` 中增加规则：

```text
When creating/updating proposal, spec delta, implementation verification evidence,
archive, or closeout, update the project development dashboard if
`docs/project-dashboard/development-log.json` exists. Treat JSON as the only source
of truth and regenerate Markdown/HTML outputs.
```

该集成应是“存在则同步”，避免强制所有项目都必须使用 dashboard。

## README 运行说明要求

`docs/project-dashboard/README.md` 必须说明渲染脚本的运行环境和调用方式。

建议内容：

```text
## Render Dashboard

Requirements:
- Node.js >= 18

Command:
node docs/project-dashboard/scripts/render-dashboard.mjs

Notes:
- Edit development-log.json only.
- development-log.md and index.html are generated outputs.
- Do not use browser fetch() from index.html; the HTML is generated as a static file.
```

## 验收条件

开发导航台初版完成时，必须满足：

1. `docs/project-dashboard/development-log.json` 存在，并是唯一可编辑数据源。
2. `docs/project-dashboard/development-log.schema.json` 存在，并约束 `date` / `updatedAt` 为 `YYYY-MM-DD`。
3. `development-log.json` 能通过 schema 校验。
4. `docs/project-dashboard/development-log.md` 可由 JSON 生成。
5. `docs/project-dashboard/index.html` 可由 JSON 生成，且浏览器直接打开可查看内容。
6. `index.html` 不依赖 `fetch('./development-log.json')`。
7. 页面至少包含：Timeline、Feature Matrix、Bug 定位索引、Next Work Queue。
8. `openspec/changes/archive/**` 中每个 archived change 至少有一条 `partial` 或详细记录。
9. 最近关键 change 至少 5 条为详细记录。
10. `README.md` 写明 Node.js >= 18 和 `node docs/project-dashboard/scripts/render-dashboard.mjs` 调用方式。
11. 新建 OpenSpec proposal 后，dashboard 可出现 `proposed` 记录。
12. 验证通过后，dashboard 可更新为 `verified` 并记录验证命令。
13. 归档后，dashboard 可更新为 `archived` 并链接 archive path / current spec / closeout。

## 成功指标

初期成功指标：

- 新 agent 接手项目时，5 分钟内可通过 dashboard 找到最近功能点的 spec、plan、closeout、代码入口和测试入口。
- 排查某个功能 bug 时，能通过 feature/tag/module 在 dashboard 中定位相关 change。
- 每次 OpenSpec change 归档后，dashboard 中都有对应 `archived` 或 `partial` 记录。
- 连续 3 个新 change 后，dashboard 记录没有出现 JSON/MD/HTML 不一致。
- `development-log.json` 字段没有 schema 外漂移。

## 通用实施策略

建议分两层实施。

### 第一层：项目内模板

每个项目复制 `docs/project-dashboard/` 模板即可使用。

优点：

- 不依赖 Codex 全局环境。
- 任何 agent 都能维护。
- Git 仓库内可追踪。
- 可随项目演进持续沉淀。

### 第二层：全局 skill 增强

后续可新增或更新一个通用 skill：

```text
development-dashboard
```

职责：

- 检查项目是否存在 `docs/project-dashboard/`。
- 不存在时初始化模板。
- 每次 OpenSpec / Superpowers 关键节点变更后同步记录。
- 根据 `development-log.json` 重新生成 `index.html` 和 `development-log.md`。

## 给其他 agent 的实施指令

可直接转发给其他 agent：

```text
请为当前项目实现一个通用开发导航台。

目标：
- 在项目内新增 docs/project-dashboard/
- development-log.json 是唯一可编辑数据源
- development-log.md 和 index.html 必须由 JSON 生成，禁止直接手改
- 新增 development-log.schema.json 约束字段
- 新增 scripts/render-dashboard.mjs，从 JSON 生成 Markdown 和静态 HTML
- index.html 要能直接用浏览器打开，展示 Timeline、Feature Matrix、Bug 定位索引、Next Work Queue
- index.html 不要使用 fetch('./development-log.json')，避免 file:// CORS 问题
- 每个 OpenSpec change 记录 proposal/design/tasks/spec delta、Superpowers plan、源码入口、测试入口、验证结果、closeout、下一步建议
- 只强制三个同步点：proposed、verified、archived
- 初始记录从已有 openspec/changes/archive/、docs/superpowers/plans/、docs/design/*closeout.md 中提取
- 最近关键 change 做详细记录，其余 archived changes 生成 partial 记录
- 如果信息不完整，标记 unknown 或 partial，不要编造
- 不修改业务代码
- 不改变 OpenSpec 语义

验收：
- JSON 通过 schema 校验
- index.html 可直接打开
- archived changes 至少都有 partial 记录
- 最近关键 5 个 change 有详细记录
```

## OpenHarness 当前建议落地步骤

1. 新增 `docs/project-dashboard/README.md`。
2. 新增 `docs/project-dashboard/development-log.schema.json`。
3. 新增 `docs/project-dashboard/development-log.json`。
4. 新增 `docs/project-dashboard/scripts/render-dashboard.mjs`。
5. 生成 `docs/project-dashboard/development-log.md`。
6. 生成 `docs/project-dashboard/index.html`。
7. 初始录入最近关键已完成 change：
   - `add-p5a-memory-and-eval`
   - `add-p5d-eval-cli`
   - `add-p5e-eval-fixtures`
   - `add-agent-definition-loader`
   - `add-agent-definition-runtime-selection`
8. 对其他 archived changes 生成 `partial` 记录。
9. 更新项目 `AGENTS.md`，增加三节点同步规则。
10. 后续考虑抽象为全局 `development-dashboard` skill，并让 `openspec-superpower-change` 联动。

## 风险与注意事项

- 如果完全手工维护，仍可能出现记录滞后；v2 通过减少同步点和引入生成脚本降低风险。
- 如果 JSON schema 过宽，仍会漂移；建议 `additionalProperties: false`。
- 历史 change 信息可能不完整，不应编造；应标记 `partial` 或 `unknown`。
- 导航台是索引和观测入口，不是需求、设计、实施计划、handoff 或验收证据本身。
- 后续全局 skill 自动化应保持“存在则同步”，不要强制所有项目使用 dashboard。
