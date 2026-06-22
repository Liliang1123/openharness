# Project Dashboard — 开发导航台

本目录是项目的统一开发导航台入口，记录每个 OpenSpec change 从 proposal 到 archive 的完整轨迹。

## 核心规则

- **`development-log.json` 是唯一可编辑数据源（Single Source of Truth）。**
- `development-log.md` 和 `index.html` 是生成产物，禁止直接编辑。
- 每次更新 JSON 后，必须运行渲染脚本重新生成 MD 和 HTML。

## 目录结构

```text
docs/project-dashboard/
├── index.html                        # 静态可视化入口（生成产物）
├── development-log.md                # 人类可读总台账（生成产物）
├── development-log.json              # 唯一可编辑数据源
├── development-log.schema.json       # JSON Schema 约束
├── README.md                         # 本文件
└── scripts/
    └── render-dashboard.mjs          # 渲染脚本
```

## Render Dashboard

Requirements:
- Node.js >= 18

Command:
```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
```

Check generated outputs without rewriting:
```bash
pnpm dashboard:check
```

Notes:
- Edit `development-log.json` only.
- `development-log.md` and `index.html` are generated outputs.
- Do not use browser `fetch()` from `index.html`; the HTML is generated as a static file.
- The render script validates `development-log.json` before generating outputs and fails fast on schema/semantic drift.

## 状态枚举

| 状态 | 含义 | 强制同步点 |
|---|---|---|
| `proposed` | 已创建 proposal / spec delta | 是 |
| `verified` | 实现并验证通过，待归档 | 是 |
| `archived` | 已归档，spec 进入当前真相 | 是 |
| `blocked` | 阻塞，需用户决策 | 条件性 |
| `superseded` | 被后续 change 替代 | 条件性 |
| `partial` | 历史记录不完整，待补齐 | 历史 backfill |

## 同步规则

仅在以下 3 个关键节点强制同步 dashboard：

1. **`proposed`**：创建或更新 OpenSpec proposal / spec delta 后。
2. **`verified`**：实现完成且正式验证通过后。
3. **`archived`**：执行 `npx openspec archive` 并创建 closeout 后。

## 与 docs/handoffs/ 的职责边界

- **dashboard**：长期开发导航台，以 OpenSpec change / 功能点为单位，持续维护。
- **handoffs**：单次会话或续跑交接包，以工作会话为单位，短中期使用。
- handoff 可以引用 dashboard 中的功能记录。
- 完成稳定功能演进后，必须回写 dashboard。

## 数据模型

详见 `development-log.schema.json`。每条记录的必填字段：

- `changeId`：OpenSpec change ID
- `title`：功能标题
- `status`：状态枚举值
- `date`：YYYY-MM-DD 格式
- `summary`：一句话摘要
