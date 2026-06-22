# OpenHarness Git 忽略策略与代码库纯净性设计方案 (Gitignore Strategy Plan)

> 状态：方案评审中 (Proposed)  
> 版本：v1.0  
> 日志与日期：2026-06-22  
> 目的：为 OpenHarness Monorepo 仓定制严密、安全的 Git 忽略策略（Gitignore Strategy），在确保多语言编译产物、本地调试会话、密钥隐私得到物理隔离的前提下，协调 AI 开发工作流（Superpowers/OpenSpec）的物理落盘要求与 Git 提交纯净性，阻断临时“交接垃圾”污染主仓库。

---

## 1. 背景 (Background)

OpenHarness 作为一个企业级 AI Agent 运行时平台，其技术栈具备典型的**多语言、多框架和 Monorepo 复合结构**：
1. **高效执行层（TS 运行时）**：基于 Node.js、Fastify、TypeScript、Zod 以及 pnpm workspaces。
2. **安全网关层（Java 审计服务）**：基于 Java 21、Spring Boot、Maven。
3. **前端台层（React Dashboard）**：基于 React、Vite。
4. **AI 原生研发设施**：使用 OpenSpec 驱动变更，并通过 Superpowers 写入实施 Plan（`docs/superpowers/plans/`），并在跨窗口开发时生成任务交接记录（`docs/handoffs/`）。

这种复杂的混合架构在本地运行和编译时会产生大量的临时缓存、测试用例的持久化会话（Session Data）、IDE 配置文件以及 AI 协作的临时脚手架文件。如果缺乏一致的 Git 忽略策略，极易导致敏感密钥外泄、编译产物冲突以及 Git 历史被垃圾文件填满。

---

## 2. 设计出发点与核心原则 (Motives & Core Principles)

为保障面向公众开源/企业内部落地时的绝对安全与代码库纯净，本方案确立以下四个核心原则：

### 原则一：源码级纯净（Source-only Integrity）
- Git 仓库应当是“即克隆即运行”的源码集合。任何可以通过 `pnpm install`、`mvn compile`、`vite build` 等构建命令重现的第三方依赖、中间产物、编译字节码，必须 100% 物理隔离。

### 原则二：特权与隐私绝对安全（Zero Secret Leakage）
- 本地调试产生的 `.env` 文件、SSL 证书私钥（`*.pem`, `*.key`）以及本地 MCP 配置文件中可能包含的主机敏感路径、API Key，必须通过严密的通配符规则予以拦截，从根源上杜绝密钥泄露和提权后门入库。

### 原则三：运行时会话数据隔离（Runtime Data Sandboxing）
- Agent 运行时在本地测试和并发会话中，会在 `agent-runtime/data/sessions/` 目录下生成包含用户对话、工具执行输出的 JSON 历史存储。这些数据可能含有敏感业务信息且变化频繁，必须物理忽略，不得随代码库提交。

### 原则四：协调 AI 物理落盘与 Handoff 噪音（Handoff Isolation）
- **核心规约保留**：根据 *Superpowers 物理落地规范*，大模型执行特性的实施计划（`docs/superpowers/plans/`）及系统核心对齐方案（`docs/design/` / `docs/review/`）必须进行版本控制，确保演进历史有迹可循。
- **临时脚手架隔离**：在跨开发窗口交接时产生的 `docs/handoffs/` 下的临时文件（如 `latest.md`、`2026-06-xx-handoff-next.md`），因其仅具备单次会话级时效，在开发完成后即成为无效垃圾，必须予以物理忽略，防止污染 master 提交线。

---

## 3. 详细实施方案 (Implementation Details)

基于上述考量，OpenHarness 根目录下的 `.gitignore` 规则分类设计如下：

### 3.1 依赖管理隔离 (Dependencies)
```text
**/node_modules/
.pnpm-store/
```
* **考量**：禁用各子项目的 `node_modules` 提交，同时排除 pnpm monorepo 全局硬链接存储库 `.pnpm-store/`。

### 3.2 编译与构建产物隔离 (Build Outputs)
```text
dist/
**/dist/
build/
**/build/
target/
**/target/
coverage/
**/coverage/
.turbo/
.next/
out/
.vite/
.eslintcache
.vitest-cache/
*.tsbuildinfo
```
* **考量**：
  - 覆盖前端 Vite 与 TS 运行时的构建目录 (`dist/`, `build/`)、Java Maven 编译目录 (`target/`)。
  - 忽略单测覆盖率产物 (`coverage/`) 与 Turbo 缓存。
  - 排除 IDE 校验及编译增量缓存 (`.eslintcache`, `.vitest-cache/`, `*.tsbuildinfo`)，防范不同开发机之间的校验文件打架。

### 3.3 IDE、系统及语言专属缓存 (IDEs & Editors)
```text
.idea/
.vscode/
*.suo
*.ntvs*
*.njsproj
*.sln
*.swp
.DS_Store
**/.DS_Store
*.class
.factorypath
```
* **考量**：
  - 屏蔽 IntelliJ IDEA (`.idea/`)、VS Code (`.vscode/`)、Visual Studio 解决方案配置以及 Vim 缓存文件 (`*.swp`)。
  - 强力排除 macOS 文件属性缓存 `.DS_Store`（使用 `**/.DS_Store` 进行多层级穿透拦截）。
  - 拦截 Java 编译出的临时类文件 (`*.class`) 及 APT 配置 `.factorypath`。

### 3.4 运行时与调试会话沙箱 (Runtime & Sessions)
```text
/agent-runtime/data/
**/data/sessions/
```
* **考量**：
  - 强隔离 `/agent-runtime/data/` 目录，防止开发人员将测试生成的会话持久化数据及 Fact 记忆库上传。
  - `**/data/sessions/` 提供了多层通配符安全防线，即便开发人员在其他临时路径调试启动，也能精准拦截。

### 3.5 敏感配置与密钥屏蔽 (Secrets)
```text
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
*.pem
*.key
```
* **考量**：彻底拦截多环境配置的 `.env` 环境变量文件以及 SSL 证书、API 通信私钥，保证安全性。

### 3.6 临时 AI 交接隔离 (AI Handoffs)
```text
/docs/handoffs/latest.md
/docs/handoffs/local/
```
* **考量**：
  - 仅忽略本地游标文件 `latest.md` 和本地临时交接目录 `local/`，避免单次窗口切换产生的高频噪音污染 Git。
  - 不全量忽略 `/docs/handoffs/`，保留必要的跨机器、跨 Agent、远程分支交接能力；重要交接包可按需保留在可追踪路径中。

### 3.7 本地 MCP 配置隔离 (Local MCP Config)
```text
/mcp.json
!/mcp.example.json
```
* **考量**：
  - `mcp.json` 可能包含本机绝对路径、私有命令、内网地址或密钥，发布到 GitHub 前必须视为本地敏感配置。
  - 仓库只保留 `mcp.example.json` 作为模板，开发者复制为本地 `mcp.json` 后自行修改。

---

## 4. 评审建议与门控问题 (Review Gate Questions)

请其他评审 Agent 在 Review 本 Ignore 策略方案时，重点评估以下维度，并给出 `通过` / `有风险` / `需修改` 的明确结论：

1. **Handoff 本地交接的可用性边界**：
   - 最终策略不全量忽略 `/docs/handoffs/`，仅忽略 `latest.md` 与 `local/`，兼顾本地降噪和跨机器交接。
2. **MCP 与外部服务的泄露防线**：
   - 最终策略将 `mcp.json` 加入 ignore，并新增 `mcp.example.json` 作为可提交模板。
3. **Java 后端的多模块适配**：
   - 目前的 `**/target/` 规则是否已足够覆盖 Spring Boot 在多子模块（如有）下的所有构建产物？是否需要增加关于 `.mvn/` 或是 `wrapper` 等本地缓存的过滤？
