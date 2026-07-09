# Agent Runtime Browser Smoke Harness Plan Review

## 结论

**有风险**：该方案提出的“完全旁路”设计原则在很大程度上规避了测试工具对主线 Agent Runtime 的直接污染，但 **Stage B (测试 profile browser tool fixture)** 的实现方式存在“隐形耦合”或“配置污染”风险。此外，方案中缺乏对“双重绿灯（Double-Green Gate）”发布门禁体系的具体约束。

---

## Review 范围

- 被评审方案：[Agent Runtime Browser Smoke Harness Plan](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-03-agent-runtime-browser-smoke-harness-final-plan.md)
- 对照设计与状态：
  - [Agent 浏览器控制工具技术栈调研报告](file:///Users/elvis/file/develop/opensource/openharness/docs/design/Agent%E5%8F%AF%E8%B0%83%E7%94%A8%E6%B5%8F%E8%A7%88%E5%99%A8%E6%8E%A7%E5%88%B6%E5%B7%A5%E5%85%B7%E6%8A%80%E6%9C%AF%E6%A0%88%E8%B0%83%E7%A0%94%E6%8A%A5%E5%91%8A.docx)
  - [既有 browser testing review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-03-agent-runtime-browser-testing-review.md)
  - [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
  - [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
  - [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

---

## 主要发现

### Critical

1. **Stage B 的“隐形耦合”风险（代码条件注册污染）**
   - 方案提出在“测试 profile 中暴露 browser tool”。如果该工具的 wrapper 代码和条件注册逻辑（例如 `if (profile == 'test') registerBrowserTool()`）被直接写入 `agent-runtime/src` 内部，将不可避免地向主线 Runtime 引入浏览器相关的第三方依赖（如 Playwright SDK 等），破坏了“不 import 内部模块、不污染主线 tool registry”的旁路初衷。
   - **规避建议**：必须严格限定该 browser tool 以**外部独立运行的 MCP Server** 形式存在。测试 profile 仅允许通过标准的外部 MCP 配置去注册它。主线 Runtime 应对其“无感知”。

2. **缺少“双重绿灯门禁（Double-Green Gate）”的优先级约定**
   - 虽然方案明确排除了 24 小时 soak、并发压力、SQLite crash matrix 等底层稳定性门禁，但未明确 browser smoke 在发布流程中的最终角色。一旦 browser smoke 运行成功且产出直观的录屏，团队极易忽略底层 API 级 crash reconciliation 和事务隔离测试的失败。
   - **规避建议**：必须确立 **Core-Stability Gate（API 级集成与压力测试）为硬性阻断门禁 (Blocking)**，而 **UI-E2E Browser Smoke 仅作为人工验收或非阻断（Non-blocking）CI 辅助参考**。

### Important

1. **CI 无 GUI 环境的依赖阻碍**
   - Stage A 采用 Playwright，在无 GUI 的 CI 环境（Docker）中需要安装大量底层的系统级依赖（apt packages 等）。如果该 smoke harness 成为合并流程的一部分，可能会因为 CI 节点环境缺失而引发虚警挂起。
   - **建议**：Stage A 必须支持 `local-headless` 的自包含容器环境运行，或者只在 Daily Build/Pre-release 阶段触发，而非每次 Commit 的 PR 门禁。

2. **Stage C 云端浏览器的安全与凭证风险**
   - 云浏览器（Browserbase/Steel 等）的引入不仅带来 token/SaaS 账单开销，更可能因测试中抓取前端会话导致租户凭证、敏感 Mock 数据等通过第三方服务流出，带来安全合规风险。

---

## 最终建议（对 Stage A/B/C 的修改建议）

### Stage A：独立 browser-smoke harness
- **修改建议**：在 `integration-tests/browser-smoke/` 下完全独立构建，且其 CI 执行策略默认为 **Non-blocking**。提供本地一键 headless 启动脚本（隔离于 Runtime 的 npm 依赖之外）。

### Stage B：测试 profile browser tool fixture
- **修改建议**：**坚决禁止在 Runtime 源码中进行任何硬编码的“测试 profile 工具注册”**。
- browser tool 必须打包为一个完全独立的外部 MCP Server。
- 运行时仅仅是在运行测试时，由集成测试脚本启动此 MCP 进程并将其 HTTP/SSE endpoint 通过现有的 MCP 动态配置机制注入到 Runtime 中。

### Stage C：可选远程浏览器扩展
- **修改建议**：在当前 Harden 阶段将其列为 **Non-Goal**。唯有在单节点 Runtime 稳定版发布后，针对更复杂的跨多端交互 Eval 才有评估必要，且必须先经过独立的数据隐私与安全架构评审。

---

## 后续门禁与 OpenSpec 必要性

1. **Stage A 及 纯 MCP 化 Stage B：不需要独立 OpenSpec change**
   - **理由**：若完全按“外部旁路 MCP Server”和“独立 integration-tests 目录”实施，整个测试套件没有修改 Runtime 的一行主线代码，不影响任何生产 API 契约和持久化结构。
   - **执行路径**：可以直接作为测试基础设施实施，只需将其实施任务关联至现有的 `harden-agent-runtime-single-node-production` 任务看板中，免去多余的提案审批流程。

2. **若 Stage B 需修改 Runtime 代码：必须合并进当前 OpenSpec**
   - **理由**：如果因特殊原因必须修改 Runtime 的 profile 读取、工具硬编码注册或引入了 playwright 编译依赖，这属于破坏性生产契约变更。
   - **执行路径**：必须在当前 active 的 `harden-agent-runtime-single-node-production/proposal.md` 中进行 spec delta 补充更新，不允许无案实施。

3. **Stage C（云端浏览器）：必须启动独立的 OpenSpec change**
   - **理由**：涉及外部 SaaS 连接、数据出境、敏感凭证注入、费用账单与安全隔离。

---

## 推荐下一步

1. **在本地创建测试基础设施目录**：
   - 建立目录：`integration-tests/browser-smoke/`。
2. **细化 Stage A 的集成测试脚本**：
   - 仅通过标准的 HTTP / SSE 客户端进行断言校验，完成 Happy path 的本地可行性验证。
3. **将该 Review 结论作为“通过并需修改 Stage B 架构”进行落盘归档**。
