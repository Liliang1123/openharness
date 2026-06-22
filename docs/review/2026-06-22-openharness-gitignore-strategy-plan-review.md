# OpenHarness Gitignore Strategy Plan Review

## 结论

有风险：方案方向整体合理，依赖、构建产物、运行时数据和密钥隔离的主线正确；但 `/docs/handoffs/` 全量忽略与本项目既有 handoff 落盘规则存在协作边界风险，`mcp.json` 也应从共享配置改为本地配置 + example 模板模式。此外，当前实际 `.gitignore` 尚未包含方案中的 `/docs/handoffs/`，方案与落地状态不一致。

## Review 范围

- `docs/design/2026-06-22-openharness-gitignore-strategy-plan.md`
- `.gitignore`
- `mcp.json`
- `docs/handoffs/`、`docs/design/`、`docs/review/`、`docs/superpowers/plans/` 目录策略

## 主要发现

### 🟡 risk: `/docs/handoffs/` 全量 ignore 会削弱跨机器/异步交接

- 位置：`docs/design/2026-06-22-openharness-gitignore-strategy-plan.md:115-120`
- 问题：本项目 AGENTS 规则要求新窗口交接包落在 `docs/handoffs/` 并维护 `latest.md`；若全量忽略，该制品只适合同一台机器本地续跑，跨机器、远程分支、PR review 时会断代。
- 建议：不要简单全量忽略。推荐二选一：
  1. 保留 `docs/handoffs/` 可追踪，但要求合入主线前清理或 squash；
  2. 采用分层策略：忽略 `docs/handoffs/latest.md` 和 `docs/handoffs/local/`，允许重要交接包进入 `docs/handoffs/archive/` 或 `docs/review/`。

### 🔴 security: `mcp.json` 应改为本地文件，仓库保留 `mcp.example.json`

- 位置：`docs/design/2026-06-22-openharness-gitignore-strategy-plan.md:130-131`, `mcp.json:1-8`
- 问题：当前 `mcp.json` 内容暂未含密钥，但 MCP 配置天然容易包含本机绝对路径、token、私有命令或内网地址。
- 建议：将 `mcp.json` 加入 `.gitignore`，新增可提交的 `mcp.example.json`。若已有 tracked `mcp.json`，需要 `git rm --cached mcp.json` 后保留本地文件。

### 🟡 risk: 方案与当前 `.gitignore` 落地不一致

- 位置：`.gitignore:42-53`
- 问题：当前 `.gitignore` 已覆盖 runtime data 和 secrets，但没有 `/docs/handoffs/`，也没有 `mcp.json` / `!mcp.example.json`。
- 建议：方案批准后同步修改 `.gitignore`，并在 review 文档中标明“方案态”还是“已落地态”。

### 🟡 risk: `.env` 规则建议覆盖更多变体

- 位置：`.gitignore:46-53`
- 问题：已有 `.env.local` 等规则，但未覆盖 `.env.*.local`、子目录 `.env`、`.envrc`。
- 建议：补充：
  - `.env*`
  - `!.env.example`
  - `**/.env*`
  - `!**/.env.example`
  - `.envrc`

### 🟢 pass: Java / Node 构建产物覆盖基本足够

- `**/target/` 足以覆盖 Maven 多模块构建产物。
- 不建议忽略 `.mvn/wrapper/maven-wrapper.jar`、`mvnw`、`mvnw.cmd`；这些通常应提交以保证构建可复现。
- 可选忽略 `.mvn/timing.properties`、`.mvn/.cache/` 等本地缓存，但不要一刀切忽略 `.mvn/`。

## Review Gate Questions 回答

### 1. 是否应忽略 `/docs/handoffs/`？

有风险。若团队只在同一台机器上新窗口续跑，全量忽略可接受；但只要存在跨机器、远程分支、PR 异步交接，就不建议全量忽略。

推荐策略：

```gitignore
/docs/handoffs/latest.md
/docs/handoffs/local/
```

同时约定重要交接包放入可追踪路径，例如：

```text
docs/handoffs/archive/
docs/review/
```

### 2. 是否应将 `mcp.json` 改为 `mcp.example.json`？

通过，建议改。`mcp.json` 应视作本地敏感配置文件；仓库只提交 `mcp.example.json`。

建议规则：

```gitignore
/mcp.json
!/mcp.example.json
```

### 3. `**/target/` 是否足够？是否忽略 `.mvn/`？

`**/target/` 足够覆盖 Maven 多模块编译产物。不要忽略整个 `.mvn/`，否则可能误伤 Maven Wrapper 配置。只按需忽略 `.mvn` 下本地缓存。

## 最终建议

- 方案可继续推进，但先调整 handoff 与 mcp 策略。
- `.gitignore` 建议分为：构建产物、运行时数据、密钥、本地 MCP、AI 本地临时交接。
- 不要忽略 `docs/design/`、`docs/review/`、`docs/superpowers/plans/`。
- 对 `docs/handoffs/` 采用“本地 latest/local 忽略，重要 archive 可追踪”的折中策略。

## 后续门禁

- 本改动属于仓库治理与安全配置调整，不需要 OpenSpec change。
- 若实施 `.gitignore` 修改，建议验证：
  - `git status --ignored -s`
  - `git check-ignore -v mcp.json docs/handoffs/latest.md agent-runtime/data/sessions/example.json`
  - 确认 `mcp.example.json`、`.env.example` 不被忽略。
