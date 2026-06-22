# Change: Add Runtime Cache Stability

## Why
在大模型应用中，维持 Prompt Cache 命中率是降低计费成本与优化首字响应延迟（TTFT）的决定性工程手段。原 OpenHarness 实现由于 System Prompt 随请求变动、缺少 Session 级 Tools Schema 稳定控制、缓存标记策略简单粗暴，容易在大消息流、工具回滚、MCP 动态启停等场景下导致缓存全量失效。本改动落地策略化双缓冲机制、静态 System Prompt 与动态 session context 分离、Session 级工具目录锁定与动态安全撤权，从底层解决缓存前缀不稳定问题。

## What Changes
- **策略化 Cache Hints**：在 `cacheHints.ts` 引入缓存策略 `cacheStrategy = off | single | double | adaptive`。当启用 `adaptive` 或 `double` 时，采用滚动双缓冲（Rolling Double Buffer）算法标记最后两条 eligible 消息，提供单步回滚容错能力。
- **Session 级 Tools Schema 锁定与安全撤权动态化**：会话初始化时冻结 Tools Schema 供前端及大模型可见性（Visibility）使用，防止 MCP 抖动破坏缓存。但在 execution 拦截层（`beforeToolUse`）中安全权限撤销与管理员禁用仍实时生效。
- **System Prompt 字符级静止与 `[session context]` 注入**：移除 System Prompt 中的动态字段，保持头部绝对静止。高频变化的日期时间、工作路径、当前模型 ID 等移入带 `systemInjected: true` 与 `transient: true` 标记的合成 user 消息中进行延迟追加。


## Impact
- Affected specs: `cache-hints`, `context-builder`, `prompt-registry`, `agent-runtime`
- Affected code: `agentLoop.ts`, `contextBuilder.ts`, `cacheHints.ts`, `toolRegistry.ts`, `prompts/registry.ts`
