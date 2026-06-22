# README GitHub Readiness Review

## 结论

需修改：当前 `README.md` 有较强的产品化表达和架构感，但还不够适合作为 GitHub 首次公开发布首页。主要问题是存在事实不一致、能力表述过满、Quick Start 不够可复现、License 链接失效，以及缺少安装、配置、测试、项目状态、贡献与安全说明。建议先修正再发布。

## Review 范围

- `README.md`
- `package.json`
- `dev.sh`
- `agent-runtime/src/index.ts`
- `agent-runtime/src/server.ts`
- `backend/pom.xml`
- 根目录发布辅助文件：`.env.example`, `mcp.example.json`, `LICENSE` 状态

## 主要发现

### 🔴 bug: License badge 指向不存在的 `LICENSE`

- 位置：`README.md:5`
- 问题：README 展示 Apache 2.0 badge 并链接 `LICENSE`，但仓库根目录未发现 `LICENSE` 文件。
- 影响：GitHub 发布后 license 展示不完整，也可能影响开源合规判断。
- 修复：新增 `LICENSE` 文件，或删除/改正 badge。

### 🔴 bug: Java 版本写错

- 位置：`README.md:4`, `README.md:89`, `backend/pom.xml:20`
- 问题：README 写 Java 17 / JDK >=17，但 `backend/pom.xml` 使用 `<java.version>21</java.version>`。
- 修复：README 改为 Java 21，并同步 badge。

### 🔴 bug: API 端口写错

- 位置：`README.md:130-166`, `agent-runtime/src/index.ts:3`, `dev.sh:30-36`
- 问题：README API 示例使用 `localhost:3000`，实际 Agent Runtime 默认端口是 `3001`，前端是 `5173`，后端是 `8080`。
- 修复：API 示例统一改为 `http://localhost:3001`。

### 🔴 risk: README 宣称的 Skill Sandbox 安全能力与当前 review 结论不一致

- 位置：`README.md:54-58`
- 问题：README 使用“高安全物理擦除”“Path 穿越与 Symlink 防御”“默认剔除 default-agent 元工具暴露”等强表述；但当前 implementation review 已指出 `typecheck` 失败、`invoke_skill`/catalog/policy 契约和 shredder 安全边界仍需修正。
- 修复：发布前改为“实验性 / planned / under active development”，或等实现与 typecheck 全部通过后再保留强表述。

### 🟡 risk: Quick Start 不够可复现

- 位置：`README.md:94-124`
- 问题：直接运行 `./dev.sh` 前未说明 `pnpm install`、`.env`、`mcp.example.json`、Java/Maven 依赖准备。
- 建议顺序：
  1. `pnpm install`
  2. `cp .env.example .env`
  3. `cp mcp.example.json mcp.json`（可选）
  4. `./dev.sh`
  5. 打开 `http://localhost:5173`

### 🟡 risk: 缺少项目状态说明

- 问题：仓库当前仍有 active OpenSpec change、部分实现存在 typecheck 风险，但 README 像稳定企业级产品。
- 建议增加 `Project Status`：例如 `Early-stage / experimental runtime prototype`，说明哪些能力稳定、哪些仍在 OpenSpec 演进中。

### 🟡 risk: 缺少完整验证命令

- 位置：`README.md:102-123`
- 问题：只列 Agent Runtime typecheck/test，未列根级命令、frontend、shared-schema、backend、dashboard、OpenSpec。
- 建议补充：
  - `pnpm typecheck`
  - `pnpm test`
  - `mvn test -f backend/pom.xml`
  - `npx openspec validate --all --strict --no-interactive`
  - `pnpm dashboard:check`

### 🟡 risk: 缺少 GitHub 项目常见章节

建议补充：

- `Features` 与 `Architecture` 简短版
- `Prerequisites`
- `Installation`
- `Configuration`
- `Development`
- `Testing`
- `API Overview`
- `Project Structure`
- `Roadmap`
- `Security`
- `Contributing`
- `License`

### 🔵 nit: 语言风格偏营销，建议降低绝对化表达

- 示例：“企业级、高安全性、极限 Token 成本优化”“90%+ 命中率”“完美兼容”。
- 建议 GitHub README 更工程化：讲清楚“当前实现、约束、如何运行、如何验证、已知限制”。

## 建议 README 结构

```markdown
# OpenHarness

Short one-paragraph positioning.

## Project Status
Early-stage / experimental. What is stable vs in progress.

## Features
- TS Agent Runtime
- Java audit gateway
- Prompt/cache stability
- OpenSpec-driven development
- Runtime event stream and memory APIs

## Architecture
Diagram + concise explanation.

## Prerequisites
Node, pnpm, Java 21, Maven.

## Quick Start
pnpm install
cp .env.example .env
cp mcp.example.json mcp.json # optional
./dev.sh

## Configuration
Table of key env vars.

## API Examples
Use localhost:3001.

## Development
pnpm typecheck
pnpm test
mvn test -f backend/pom.xml
npx openspec validate --all --strict --no-interactive

## Project Layout

## Security Notes
No secrets in git; mcp.json local-only; runtime data ignored.

## Roadmap

## License
```

## 最终建议

- 发布前必须修正 License、Java 版本、端口、Quick Start 顺序。
- 对 Skill Sandbox 等尚未完全稳定的能力改成“实验性/进行中”，避免 GitHub 用户按生产级能力理解。
- README 应配合 `.env.example`、`mcp.example.json`、`LICENSE` 一起发布。

## 后续门禁

- README 修改后建议验证：
  - 链接文件存在：`LICENSE`, `.env.example`, `mcp.example.json`
  - 端口与 `dev.sh` / `agent-runtime/src/index.ts` 一致
  - 命令可执行或明确标注前置条件
