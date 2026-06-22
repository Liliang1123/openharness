# Runtime Cache Stability Closeout

- 文档类型：Closeout / Implementation Record
- 日志及版本：2026-06-22 v1
- OpenSpec change：`add-runtime-cache-stability`
- Archive path：`openspec/changes/archive/2026-06-22-add-runtime-cache-stability/`

## 结论

通过。本次变更已按 OpenSpec proposal/design/spec delta 和 Superpowers implementation plan 完成 TDD 实施、全量验证、OpenSpec 归档与开发导航台同步。

## 背景

在大模型应用中，维持 Prompt Cache 命中率是降低计费成本与优化首字响应延迟（TTFT）的决定性工程手段。原 OpenHarness 实现由于 System Prompt 随请求变动、缺少 Session 级 Tools Schema 稳定控制、缓存标记策略简单粗暴，容易在大消息流、工具回滚、MCP 动态启停等场景下导致缓存全量失效。本改动落地策略化双缓冲机制、静态 System Prompt 与动态 session context 分离、Session 级工具目录锁定与动态安全撤权，从底层解决缓存前缀不稳定问题。

## 核心实现

### 1. 策略化双缓存标记算法

- 修改位置：`agent-runtime/src/cacheHints.ts`
- 引入了 `cacheStrategy`（支持 `off | single | double | adaptive`）。当启用 `adaptive` 或 `double` 策略时，算法会从后往前扫描两个 eligible 的消息节点打上缓存标记，即使发生了单步回滚，倒数第二条消息的 Warm Cache 依然能命中大模型，保证推理的平滑过渡。

### 2. System Prompt 字节级静止与 `[session context]` 注入

- 修改位置：`agent-runtime/src/contextBuilder.ts`, `agent-runtime/src/prompts/registry.ts`, `agent-runtime/src/agentLoop.ts`, `agent-runtime/src/agentExecutionRunner.ts`
- 移除了 System Prompt 中所有会发生改变的动态字段（如当前日期、工作路径、当前模型 ID 等），使全局 System Prompt 在会话生命周期内绝对静止。高频变化的日期与环境信息移入带 `systemInjected: true` 与 `transient: true` 标记的合成 user 消息（即 `[session context]`）中，在 `agentLoop.ts` 与服务实际入口 `agentExecutionRunner.ts` 的双主路径上于 prompt assembly 前进行动态追加。

### 3. 持久化过滤隔离

- 修改位置：`agent-runtime/src/jsonFileHistoryStore.ts`
- 为了避免跨天或重启后，历史持久化 JSON 文件中带有 transient 标记的旧 context 破坏缓存前缀，重构了 `save` 与 `loadSync`，使用 `toReplay` 过滤机制在历史消息反序列化与存盘时彻底剔除带有 `transient: true` 标记的临时消息。

### 4. 锁定 Tools Schema 与防范内存泄漏/测试污染

- 修改位置：`agent-runtime/src/toolRegistry.ts`
- 引入 Session 级别的静态工具目录锁定，将 `entries` 容器设为 static，规避 MCP 中途启停带来的可见性抖动。
- **内存防线**：限制 static `entries` 容量最大为 500 个活跃 Session，一旦超量触发 FIFO 淘汰，防范内存泄漏。
- **测试隔离**：为了避免 Vitest 在 Worker 串行执行时跨测试用例污染静态变量，当 `process.env.VITEST === "true"` 时切换为实例级 `localEntries` 容器进行隔离。
- **安全拦截**：在执行 execution 时，`beforeToolUse` 仍将最新的 tool list 和 parameters 提交给 Java 网关做 Policy 审计，确保安全撤权与管理员禁用能实时动态生效。

## 非目标

本次变更明确不包含：
- Provider Adapter alternating roles 门禁适配（本 change 收窄该部分并移至后续 change 统一处理）
- 原地同模型热压缩 (ITC)
- 子智能体分发器 (Subagent Dispatcher)

## 关键测试覆盖

新增/更新测试文件：
- `agent-runtime/test/cacheHints.test.ts`
- `agent-runtime/test/toolRegistryMerge.test.ts`
- `agent-runtime/test/historyLayering.test.ts`

覆盖场景：
- 策略化双缓存标记算法和 `adaptive` 阈值计算。
- 动态 `[session context]` 注入时机与 transient 过滤，测试 transient 消息在序列化反序列化中被擦除。
- 模拟测试环境下的多实例隔离，防范用例污染。
- 契约测试验证 `beforeToolUse` 对已撤权工具的拦截。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test`：通过，36 test files passed, 195 tests passed。
- `npx openspec validate add-runtime-cache-stability --strict --no-interactive`：通过。
- `npx openspec archive add-runtime-cache-stability --yes`：通过。
- `pnpm dashboard:check`：通过。

## OpenSpec 归档结果

- Archived change：`openspec/changes/archive/2026-06-22-add-runtime-cache-stability/`
- Updated current specs：
  - `openspec/specs/cache-hints/spec.md`
  - `openspec/specs/context-builder/spec.md`
  - `openspec/specs/prompt-registry/spec.md`
  - `openspec/specs/agent-runtime/spec.md`

## 开发导航台同步

- JSON SSOT：`docs/project-dashboard/development-log.json`
- Generated Markdown：`docs/project-dashboard/development-log.md`
- Generated HTML：`docs/project-dashboard/index.html`
