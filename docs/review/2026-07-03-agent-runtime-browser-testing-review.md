# Agent Runtime Browser Testing Scheme Review

## 结论

有风险：该方案作为“最外层 E2E 端到端冒烟与前端交互功能验收”非常合适，但若作为“整个测试环境的唯一或核心手段”，会对单节点生产级别验收带来重大风险。它无法替代底层的并发、崩溃注入和 24 小时 soak 压力测试。

## Review 范围

### 待评审方案与技术调研

- [技术栈调研报告](file:///Users/elvis/file/develop/opensource/openharness/docs/design/Agent%E5%8F%AF%E8%B0%83%E7%94%A8%E6%B5%8F%E8%A7%88%E5%99%A8%E6%8E%A7%E5%88%B6%E5%B7%A5%E5%85%B7%E6%8A%80%E6%9C%AF%E6%A0%88%E8%B0%83%E7%A0%94%E6%8A%A5%E5%91%8A.docx)
- 用户提出的“基于 dev-browser 编写冒烟测试用例，直接调用浏览器测试 Agent 运行时功能与边界”设计构想

### 对照实现与现行契约

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Agent Runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Critical

1. **测试不确定性（Flakiness）对严格 Release Gate 的冲击**
   - 浏览器自动化测试（哪怕基于成熟的 Playwright）极易受到网络波动、DOM 渲染时延、前端打包延迟的影响，产生偶发性失败。作为生产 hardening change，我们需要的是 100% 可重复、确定性的 fail-closed 门禁。直接以浏览器测试作为核心边界测试，会导致 CI 频繁误报。
2. **无法覆盖低层 SQLite 事务边界与崩溃注入（Crash-injection）**
   - 浏览器操作位于最外层 UI，完全无法精确控制或注入服务端底层的异常场景（如在 SQLite 提交 runtime event 的瞬间杀掉 TS Runtime 进程，以验证重启后的 reconciliation 状态）。这会导致 `harden-agent-runtime` 核心的“崩溃恢复”和“原子事务”能力得不到真实覆盖。

### Important

1. **24 小时 Soak 与 20 并发下的高昂资源/网络开销**
   - 直接驱动浏览器执行 24 小时 soak测试或 20 并发压力测试，会消耗巨量的 CPU、内存，并带来庞大的网络流量。如果使用外部 SaaS 浏览器云（如 Browserbase/Steel），会带来极高的费用成本；如果本地 headless 跑，极易由于内存泄露、僵尸 Chrome 进程导致单节点物理机直接死机。
2. **CI 环境兼容性与 Headless 运行限制**
   - 浏览器驱动在无 GUI 的 CI 环境中，需要安装海量的系统级动态链接库。如果缺乏精细的 Docker 隔离，测试用例极易因为环境依赖不一致而在 CI 上直接挂掉。
3. **定位错配（边界测试不应依赖前端 UI）**
   - 本次 harden 变动的主要 Affected Areas 在于 `agent-runtime/src`、SQLite 数据层、Java Gateway 的 Provider/MCP 认证逻辑。前端界面甚至在这个 proposed change 的 non-goal 中。如果通过调用浏览器测试，实际上在对无关的前端 UI 组件进行强绑定测试，容易因前端 UI 细微调整而导致后端运行时测试中断。

### Minor

1. **调研报告中关于 MCP 与 Playwright 的技术权衡**
   - 调研报告第 5.1/5.3 节结论正确：Playwright 确实是目前最好的底座，但复杂页面的 MCP snapshot 会吃掉巨额的 token 成本。若在测试中频繁调用真实 MCP 网页操作，会导致测试用例的 LLM token 费用飙升。

## 最终建议

1. **测试分层策略 (Testing Pyramids)**：
   - 将浏览器测试（dev-browser）严格定位为**最外层 E2E 功能冒烟验收（E2E Smoke Gate）**，覆盖主干 happy paths 和基本的前端交互（如审批等待、SSE 进度事件渲染）。
   - **底层边界与硬核测试（并发隔离、SQL 锁竞态、Crash Reconciliation）** 必须使用纯 API 集成测试（基于 HTTP/SSE 协议的客户端脚本，直接请求服务端 API，配合服务端暴露的 crash hook）。
2. **24 小时 Soak 测试排他性**：
   - 严禁在 24 小时 soak 和并发压力测试中驱动真实浏览器。这两项测试应当使用轻量级的虚拟 Workload 脚本（Mock-client 模拟大量 HTTP / SSE 连接与真实的 LLM provider API）。
3. **本地化与 Headless 封装**：
   - 必须保证其能够纯本地（Local Headless）运行，且在脚本中配置合理的重试机制以容忍偶发性的 UI 渲染延迟。
4. **不要在 Single-Node 验收阶段让浏览器测试阻塞服务端逻辑发布**：
   - 可以将 dev-browser 做成一个非阻塞（non-blocking）的 CI step，或者只在 Stage 3 最终 release 时作为人工验收 gate 运行，避免拖慢日常的 TDD 节奏。

## 后续门禁

- **方案状态**：有风险，需作为非核心测试补充。
- **实施计划影响**：在重新修订后的 OpenSpec 实施计划中，必须明确区分 **“API-level Integration/Crash Test”** 与 **“E2E Browser Smoke Test”**，不得将后者作为 SQLite 事务和崩溃恢复的验证手段。
