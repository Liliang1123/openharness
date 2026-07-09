# Agent Runtime Browser Smoke Harness Plan

## 结论

通过：采纳外部 review 后，建议采用“完全旁路”的 browser smoke harness。它可以使用 dev-browser 作为本地浏览器运行环境，Playwright 作为确定性断言与控制层，但不得并入主线 Agent Runtime，不得成为主线 tool catalog、storage、agent loop 或 24 小时 soak 的组成部分。

该方案适合作为 release-stage E2E 冒烟验收和 Agent 可调用浏览器能力的独立验证入口；不适合作为 Runtime 事务、崩溃恢复、并发隔离和 soak 的核心门禁。Stage B 必须采用外部 MCP Server 注入，不得在 Runtime 源码中新增测试 profile 工具注册逻辑。

## Review 范围

- [Agent 浏览器控制工具技术栈调研报告](file:///Users/elvis/file/develop/opensource/openharness/docs/design/Agent%E5%8F%AF%E8%B0%83%E7%94%A8%E6%B5%8F%E8%A7%88%E5%99%A8%E6%8E%A7%E5%88%B6%E5%B7%A5%E5%85%B7%E6%8A%80%E6%9C%AF%E6%A0%88%E8%B0%83%E7%A0%94%E6%8A%A5%E5%91%8A.docx)
- [既有 browser testing review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-03-agent-runtime-browser-testing-review.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [外部方案 review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-03-agent-runtime-browser-smoke-harness-review.md)
- 用户确认的边界：browser smoke 实现与主线 Agent Runtime 完全分开，不塞进主线 Runtime。

## 背景

当前 `harden-agent-runtime-single-node-production` change 的目标是把 Agent Runtime 收敛成单节点生产级基础：SQLite 持久化权威、确定性 restart reconciliation、真实 provider/tool qualification、20 并发、10,000 conversations 和 24 小时 deterministic soak。

这些门禁关注的是 Runtime 内部状态、事务、SSE durable event、MCP/Java tool 协议、跨租户隔离、恢复和资源稳定性。浏览器自动化位于系统最外层，适合验证用户路径与真实交互，但不能精确注入 SQLite commit 崩溃、进程重启中断、WAL/low-disk、SSE cursor watermark、MCP child crash 等底层边界。

因此 browser smoke harness 应作为独立测试产品存在：它通过 Runtime 的公开 HTTP/SSE/API 做黑盒验收，不 import `agent-runtime` 内部模块，不修改主线 tool registry，不影响生产 profile。

## 方案

### 1. 目录与依赖边界

建议新增独立工作区或独立目录，例如：

```text
integration-tests/browser-smoke/
```

该目录可以拥有自己的 package、Playwright 配置、dev-browser 启动脚本和 artifact 输出目录。主线 `agent-runtime` 不依赖该目录；主线构建、单测、集成测试和 soak 默认不加载 browser smoke 依赖。

### 2. 技术选型

第一阶段建议：

- dev-browser：负责本地浏览器运行环境和调试体验。
- Playwright：负责确定性页面操作、等待策略、断言、截图、video、console/network artifact。
- HTTP/SSE client：负责调用 Runtime 公开 API、监听 durable events、校验执行状态。
- deterministic mock provider：负责稳定触发固定 agent/tool 行为，避免 LLM 随机性污染冒烟测试。

暂不建议第一阶段使用 Browserbase、Steel、Hyperbrowser 等云浏览器作为默认底座。它们适合后续生产级浏览器任务平台或远程 CI 扩展，不适合作为当前本地验收 harness 的默认复杂度。

### 3. Runtime 交互边界

browser smoke harness 只能通过以下方式与主线交互：

- 调用 Runtime 公开 HTTP API 创建 conversation / execution。
- 监听 Runtime SSE live/replay endpoint。
- 读取公开响应中的 execution status、approval state、runtime events。
- 使用前端页面或测试页面观察用户可见结果。

禁止：

- import `agent-runtime/src` 内部模块。
- 复用或修改 Runtime 内部 store、runner、tool registry。
- 把 browser tool 默认注册进生产 tool catalog。
- 让 browser harness 写入 Runtime 私有 storage。
- 用 browser harness 替代 crash、concurrency、soak、SQLite migration 门禁。

### 4. 两层测试模型

第一层是 E2E Browser Smoke：

- 验证前端或测试页面能触发 Runtime execution。
- 验证 SSE 进度、approval pending、approval decision、final answer、error state 的用户可见行为。
- 验证浏览器侧 artifact 能定位失败：screenshot、video、console、network、trace。

第二层是 Agent Browser Tool Fixture：

- 只以外部 MCP Server 形式存在。
- 测试脚本负责启动 browser MCP 进程，并通过现有 MCP 配置机制注入 Runtime。
- 使用固定 mock provider 触发明确 tool call。
- tool implementation 可以在独立 MCP 进程内包装 dev-browser/Playwright。
- 验证 `tool_call -> browser action -> tool_result -> runtime event -> final answer` 的完整链路。
- 不进入生产 profile，不影响默认 tool catalog。
- 不得在 `agent-runtime/src` 中硬编码 `test` profile、browser tool 注册逻辑或 Playwright 依赖。

### 5. Double-Green Gate

发布判断必须同时区分两类绿灯：

- Core-Stability Gate：API/SSE integration、SQLite crash matrix、restart reconciliation、cursor/replay、tenant isolation、provider/tool qualification、20 concurrent executions 和 24-hour soak。该门禁是 Blocking。任何失败均阻止 Runtime v1 promotion。
- Browser-Smoke Gate：dev-browser/Playwright E2E smoke、外部 browser MCP tool fixture、截图/video/trace artifact。该门禁默认 Non-blocking；可作为 release-stage 人工验收证据，但不得覆盖或抵消 Core-Stability Gate 的失败。

Browser smoke PASS 只能说明最外层用户路径可用，不能推导 Runtime durable state、恢复、并发或安全边界已经合格。

### 6. 建议冒烟用例

最小用例集：

- Happy path：创建 execution，收到 live SSE，最终输出成功结果。
- Approval path：进入 waiting approval，提交 approval decision，继续执行并终结。
- Browser action path：固定 tool call 打开本地测试页面，点击按钮，抽取页面状态，返回 tool result。
- Failure path：浏览器 action 超时或元素不存在，Runtime 产生可解释 error event。
- Reconnect path：执行中断开 SSE，再从 durable cursor replay，前端/客户端不丢 committed event。

明确不纳入 browser smoke：

- 24 小时 soak。
- 20 concurrent executions 的主压力门禁。
- SQLite crash matrix。
- low-disk/WAL checkpoint。
- MCP server crash isolation 的核心覆盖。
- provider token/cost 精确对账。

## 主要发现

### Critical

1. **必须保持完全旁路**
   - 一旦 browser harness 被接入主线 Runtime tool registry 或内部 storage，它就会扩大生产契约，影响 active hardening change 的边界，并引入浏览器依赖导致 Runtime 发布风险上升。
   - Stage B 必须通过外部 MCP Server 完成，禁止在 Runtime 源码里添加测试 profile 工具注册分支。

2. **不能替代底层 release gate**
   - 浏览器测试无法提供确定性的 SQLite transaction、restart reconciliation、SSE durable cursor、cross-tenant IDOR 和 24 小时 soak 证据。它只能补充外层用户路径证据。
   - 必须执行 Double-Green Gate：Core-Stability Gate 为 Blocking，Browser-Smoke Gate 默认为 Non-blocking。

### Important

1. **dev-browser 适合第一阶段**
   - 它本地可控、成本低、调试快，适合做独立 smoke harness。Playwright 应作为断言层，减少 MCP snapshot、LLM planning 和视觉模型带来的不确定性。

2. **Stage A 不应默认阻塞 PR**
   - Playwright 在无 GUI CI 环境中可能需要额外系统依赖。Stage A 应优先支持 local-headless、daily build 或 pre-release 运行，默认不作为每个 PR 的硬阻塞门禁。

3. **云浏览器应延后**
   - Browserbase/Steel/Hyperbrowser 等适合后续远程运行、会话隔离、录屏、账号/代理/验证码等生产化需求。当前过早引入会增加成本、网络和合规变量。

4. **LLM 不应主导 smoke oracle**
   - 冒烟测试的 oracle 应由确定性断言和固定 fixtures 决定。真实 LLM/browser agent 可作为资格矩阵扩展，但不应成为最小 smoke 的稳定性前提。

### Minor

1. **artifact 输出需要独立保留策略**
   - 浏览器 video、trace 和 screenshot 容量较大，应按失败保留、成功短期保留或本地手动清理策略处理，避免污染主线 Runtime artifact。

## 最终建议

推荐采用如下 staged 方案：

1. **Stage A：独立 browser-smoke harness**
   - 建独立目录和 package。
   - 使用 dev-browser + Playwright。
   - 黑盒调用 Runtime HTTP/SSE。
   - 覆盖最小 happy path、approval、failure、reconnect。
   - CI 策略默认 Non-blocking，可在 daily build 或 pre-release 阶段运行。

2. **Stage B：外部 MCP browser tool fixture**
   - browser tool 打包为完全独立的外部 MCP Server。
   - 测试脚本启动该 MCP 进程，并通过现有 MCP 配置机制注入 Runtime。
   - 使用 mock provider 触发固定 tool call。
   - 验证 Agent 调用浏览器工具的完整事件链路。
   - 禁止在 Runtime 源码中硬编码测试 profile、tool 注册或 Playwright 依赖。

3. **Stage C：可选远程浏览器扩展**
   - 当前 single-node production hardening 阶段列为 Non-Goal。
   - 只有在本地 harness 稳定并完成 Runtime v1 promotion 后，再评估 Browserbase/Steel/Hyperbrowser。
   - 该阶段必须独立 proposal 或独立 design review，因为会引入外部 SaaS、凭证、录屏、数据保留和成本问题。

## 后续门禁

- **OpenSpec**：纯 Stage A 以及纯外部 MCP 化 Stage B 不需要独立 OpenSpec change，前提是完全不修改 Runtime 源码、生产配置、tool registry、持久化语义或公开 API。若 Stage B 需要修改 Runtime profile、工具注册逻辑或引入 Playwright 编译依赖，则必须合并进当前 active OpenSpec 或创建新 proposal。Stage C 必须创建独立 OpenSpec change。
- **Superpowers plan**：若实施仅限旁路测试基础设施，可在 review 通过后生成 compact implementation plan；若触碰 Runtime 契约，必须先完成 OpenSpec 批准，再生成 staged implementation plan。
- **测试门禁**：browser smoke 只作为 release-stage E2E smoke 或非阻塞 CI step；Runtime core gate 仍以 API/SSE integration、crash matrix、security、soak 为准。
- **人工审批**：Stage C 引入云浏览器前必须人工审批供应商、费用、数据保留、凭证隔离和 artifact 策略。
