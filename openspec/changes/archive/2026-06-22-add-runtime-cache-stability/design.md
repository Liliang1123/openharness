# Design: Runtime Cache Stability

## Context
Prompt Caching 是各大 LLM 提供商（如 Anthropic, OpenAI）针对超长上下文计费进行的革命性优化。为了达到 90%+ 的 Caching 命中率，前缀必须保持完全字节级一致。但在 Agent 复杂的交互和回滚中，经常会遇到以下破坏缓存一致性的场景：
1. 流中断、工具失败、Ctrl-C 回滚导致的最后消息截断；
2. MCP 工具在后台的增删导致 tools schema 不断变动；
3. System Prompt 中携带了动态的日期、模型名或工作目录。

## Goals / Non-Goals
- **Goals**:
  - 实现策略化双缓存断点（Rolling Double Buffer），提供单步回退命中机制；
  - 稳定 System Prompt，动态信息通过外部 user message 以 `[session context]` 异步注入；
  - 锁定 Session 生命周期的 Tools Schema 缓存，防范可见性抖动，同时保留网关层对工具执行和权限撤销的动态拦截。
- **Non-Goals**:
  - 本 Change 暂不实现原地同模型热压缩（ITC）或子智能体分发器，这些属于后续 OpenSpec 变更范畴。

## Decisions

### 1. 策略化双缓存标记算法
在 `cacheHints.ts` 中重构 `computeCacheHints`：
* 新增配置/配置字段 `cacheStrategy`。
* 过滤 `systemInjected`, `transient`, `compressionInstruction` 消息。
* 如果策略是 `double` 或满足 `adaptive` 阈值，从后往前查找两个 eligible 的消息，计算它们在 selected messages 中自尾部起算的 `messageIndexFromTail` 值作为双缓冲点。

### 2. Tools Schema 的 Session 级冻结、安全实时决策分离与内存泄漏控制
* 在 `toolRegistry.ts` 中引入 Session 工具锁定，将 `entries` 容器设为 static。为了防范长生命周期服务中 Session 累计导致的内存常驻，引入了 500 个活跃 Session 的最大限制保护，超过限制则自动 FIFO 淘汰最旧缓存条目。
* **安全性保证**：在执行 execution 时，`beforeToolUse` 仍将最新的 tool list 和 parameters 提交给 Java 网关做 Policy 审计。如果管理员撤销了权限，在 Java Gateway 端或 TS 拦截器仍会直接返回 `POLICY_DENY`，从而同时兼顾缓存稳定与执行的动态合规安全。

### 3. System Prompt 字节级静止与 [session context] 注入
* 在 `contextBuilder.ts` 和 `prompts/registry.ts` 中提取动态字段。
* `prompts/registry.ts` 暴露 `injectSessionContextIfNeeded` 注入公共方法。
* **双主路径同步注入**：在 `agentLoop.ts` 或者是实际服务主入口 `agentExecutionRunner.ts` 的运行主路径中，均在追加用户 message 前调用注入方法。
* **持久化隔离**：`[session context]` 带有 `transient: true` 标记，为了避免跨天或重启后从 JSON 历史文件中读出旧 context 导致污染，在 `JsonFileHistoryStore.ts` 的 `save` 与 `loadSync` 中明确在持久化与反序列化时过滤掉带有 `transient` 标志的消息。

## Risks / Trade-offs
- **QPS 成本权衡**：双 Marker 缓存标记增加了一次 cache write 写入动作的开销。对于超短会话可能不划算。我们通过 `cacheStrategy` 配置化以及 `adaptive` 的阈值判断来抵御此风险。
- **MCP 服务动态发现延迟**：中途启停的 MCP 工具对当前正处于运行期的 session 变不可见。我们视其为可接受的体验摩擦（与主流设计一致），用户可通过新建会话重新加载。
- **Provider Capability Gate 收窄**：由于各大模型提供商在 alternating roles 以及 message structures 的适配极为繁杂且涉及沙箱模型对齐，本 Change 将此门禁相关任务收窄，移至后续 Skill 引擎与沙箱对齐 OpenSpec 变更中执行，不在底座阶段做过多复杂封装。

## Migration Plan
- 对 `cacheHints.ts`, `contextBuilder.ts`, `toolRegistry.ts`, `registry.ts`, `jsonFileHistoryStore.ts` 进行局部重构。
- 对 `agentLoop.ts` 与 `agentExecutionRunner.ts` 进行注入点时序挂载，并完成全覆盖单元测试。

