# Add Subagent Dispatcher Closeout

文档类型：Closeout / Implementation Record  
日志及版本：2026-06-22 v2  
状态：已归档 / archived in commit `4d34d60`  

## 结论

通过。`add-subagent-dispatcher` 已完成设计、TDD 单元测试与核心运行逻辑实现，通过全量单元测试与类型检查，并已完成 OpenSpec 归档与提交（`4d34d60 feat(subagent): archive add-subagent-dispatcher`）。

## 背景

在自进化技能执行中，主 Agent 会通过 `invoke_skill` 派生子 Agent 去执行特定子任务。此前没有隔离的子智能体分发器，子 Agent 执行时直接使用主 Agent 的执行上下文，导致历史记录（history）混杂、特权管理混乱（子智能体可能会调用特权管理命令或其它不允许的元工具）、超时和取消控制无法联动，并且其计算费用（cost）与模型 tokens 无法准确归因至主任务。

本轮变更设计并实现了 `SubagentDispatcher`，确保子智能体在隔离的上下文中执行，具备父子历史隔离、限定的允许工具集，强制执行内置特权元工具过滤及 object-only 参数校验，并在退出时将统计费用与最终 summary 归并反馈给主 Agent。

## 核心设计与逻辑

1. **执行上下文与工具集隔离**：
   - 子智能体与父历史隔离，父级历史中只记录 child 最终产生的 `summary` tool result 而不记录 child 的中间交互消息。子 Agent 的执行通过派生的 `childConversationId` 调用后端服务。
   - 子智能体的工具集（allowedTools）在父级允许工具集的基础上求交集，并排除 forbidden tools 字段。
   - `beforeToolUse` 拦截策略在子智能体执行上下文中被赋予 `deny-by-default` 特性，即所有不在允许清单中的工具调用默认拒绝。

2. **特权防御与 fail-closed 拦截**：
   - 内置特权过滤：过滤 `invoke_skill` 这一特权元工具。对于其他如 `mcp/*`、`invoke_subagent`、`define_subagent` 等工具，当前主要通过父级 catalog 过滤和 skill 的 `forbidden_tools` 配置来限制。
   - 参数校验：检查模型输出的 `argumentsRaw` 序列化结构，严格限制参数必须为 key-value 对的对象，拒绝 null、array、primitive 等，不合规直接触发 fail-closed 抛出 `SUBAGENT_TOOL_ERROR` 错误。

3. **生命周期联动**：
   - 父级 `AbortSignal` 自动传导至子 `AbortSignal`。
   - 子执行引入超时机制 `withTimeout`，在指定时间内未完成则抛出 `SUBAGENT_TIMEOUT` 错误进行异常中止（注：超时赛跑并不会强制取消底层正在运行的原始异步 Promise，属于已知非阻塞风险）。

4. **度量归因与 Summary 反馈**：
   - 累加统计子执行产生的 `usage.costUsdMicros` 费用，合并归并到父 trace 实体元数据中并记为 `subagentCostUsdMicros`（注：当前实现暂不累加 tokens 字段，未来若有细粒度 Token 归因需求可另行扩展 runtime usage 契约类型）。
   - 最终执行结束后生成包含执行步骤与产物的 `summary` 文本，作为 `tool_result` 返回给父级历史记录。

## 规格与计划

- OpenSpec 归档目录：[2026-06-22-add-subagent-dispatcher](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/archive/2026-06-22-add-subagent-dispatcher)
- 关联规格文件：
  - [agent-loop spec.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/specs/agent-loop/spec.md)
  - [agent-runtime spec.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/specs/agent-runtime/spec.md)
- Superpowers 实施方案：[2026-06-22-add-subagent-dispatcher.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md)
- 项目开发导航台：[development-log.json](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)

## 非目标

本变更明确排除以下非目标：
- 容器化、沙箱化等系统级强进程隔离（本变更只聚焦运行时逻辑隔离）。
- 公开暴露外联子 Agent API / UI 界面。
- Java Gateway 网关策略的物理改造。

## TDD 与验证记录

- **TDD RED & GREEN 流程**：
  - 先编写测试用例集 [subagentDispatcher.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts) 覆盖了非法参数拦截、特权工具阻断、超时和取消联动以及费用累加等功能。
  - 完成 [dispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts) 核心实现，测试成功从 RED 转换为 GREEN。
- **回归与全量验证**：
  - 单包测试 `pnpm --filter @openharness/agent-runtime test`：通过（219/219 tests passed）。
  - 类型检查 `pnpm --filter @openharness/agent-runtime typecheck`：通过（tsc zero errors）。
  - 规格校验 `npx openspec validate add-subagent-dispatcher --strict --no-interactive`：归档前通过（Change is valid）。
  - 归档命令 `npx openspec archive add-subagent-dispatcher --yes`：通过，生成归档目录 `openspec/changes/archive/2026-06-22-add-subagent-dispatcher/`。
  - 归档后全量规格校验 `npx openspec validate --all --strict --no-interactive`：通过（22 passed, 0 failed）。
  - 导航台 check `pnpm dashboard:check`：通过（Dashboard current）。

## 后续演进建议

1. 随着子智能体应用场景的复杂化，未来可在独立 OpenSpec 中支持基于不同网络隔离级别（如轻量容器沙箱）的子智能体执行器。
2. 细化子执行的历史记录展示，在调试工具（Trace View）中提供树形父子追踪视图。
