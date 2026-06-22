# add-subagent-dispatcher Implementation Review

## 结论

通过。`add-subagent-dispatcher` 变更的隔离子智能体分发器已实现 TDD 和核心用例，全量单元测试与类型检查通过，OpenSpec 与 Dashboard 验证无误。代码在本地逻辑上具备合并和归档前置状态。

## Review 范围

- 新增模块：
  - [dispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts) - 子智能体分发器核心实现，负责隔离执行、降权、特权工具过滤、非对象参数拦截、耗时与费用聚合统计等。
- 核心修改：
  - [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts) - 在 `invoke_skill` 拦截点集成 `SubagentDispatcher`，对接 child 执行环境。
- 新增与修改测试：
  - [subagentDispatcher.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts) - 对 `SubagentDispatcher` 的特权工具过滤、安全降权（deny-by-default）、参数校验、Abort/Timeout 传导、费用聚合进行隔离测试。
  - [agentExecutionRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/agentExecutionRunner.test.ts) - 补齐 `fork_agent: true` 回归用例，验证父智能体 History 仅记录 summary tool result 等集成效果。
- 规范与工程清单：
  - [add-subagent-dispatcher (Change spec)](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-subagent-dispatcher)
  - [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-subagent-dispatcher/tasks.md)
  - [development-log.json](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)

## 主要实现摘要

1. **子上下文安全防护与特权过滤**
   - 实现 child allowed-tools 目录派生，对 forbidden tools（如 `define_subagent`）进行降权过滤。
   - `beforeToolUse` 拦截在 child 中默认拒绝所有未明确在 child 授权工具清单中的 tool calls（deny-by-default）。
   - 内置特权过滤：过滤 `invoke_skill` 这一特权元工具。对于其他如 `mcp/*`、`invoke_subagent`、`define_subagent` 等工具，当前主要通过父级 catalog 过滤和 skill 中配置 `forbidden_tools` 进行限制。
   - 拦截并处理不合法的 parameters（必须为 object-only，拒绝 primitive/array/null），在 dispatch 前抛出 `SUBAGENT_TOOL_ERROR` 错误以实现 fail-closed。

2. **生命周期与控制传导**
   - 引入 AbortSignal 联动，父智能体被 Abort 时子智能体自动传导取消。
   - 支持超时控制，在 `fork_agent` 阶段子智能体设定 execution timeout，超时后强制 race 并抛出 `SUBAGENT_TIMEOUT` 错误进行中止。

3. **归因与审计数据聚合**
   - 追踪并累加子执行模型产生的 `usage.costUsdMicros`，并在父级 trace metadata 中记录为 `subagentCostUsdMicros`（注：当前实现暂不聚合 token counts，若未来需要更细粒度归因，可另行通过扩展 runtime 机制实现）。
   - 隔离子执行历史：在父 history 中仅写入 child 执行后的 `summary` 作为 ToolResult，不写入中间交互消息，子 Agent 的执行通过派生的 `childConversationId` 调用后端服务。

## 验证证据

本轮所有强制验证命令执行结果：

1. **单测套件通过**：
   ```bash
   pnpm --filter @openharness/agent-runtime test
   ```
   - 结果：40 个测试文件，219 个测试全部通过 (GREEN)。
2. **TypeScript 编译检查**：
   ```bash
   pnpm --filter @openharness/agent-runtime typecheck
   ```
   - 结果：`tsc --noEmit` 成功，零错误退出。
3. **OpenSpec 静态校验**：
   ```bash
   npx openspec validate add-subagent-dispatcher --strict --no-interactive
   ```
   - 结果：Change 'add-subagent-dispatcher' is valid.
4. **开发导航台校验**：
   ```bash
   node docs/project-dashboard/scripts/render-dashboard.mjs
   pnpm dashboard:check
   ```
   - 结果：日志渲染完成，`dashboard:check` 验证输出处于最新状态。

## 剩余风险

- **并发子进程控制与 Promise 状态**：虽然在单进程内测试了 Abort 与 Timeout 传导，但在实际复杂多线程/高并发环境下可能会出现极短暂的取消 race window。另外，当前超时的 `withTimeout` 逻辑在 race 超时后并不会在底层主动中断/取消已经在执行的原始异步 Promise（但它会正确向调用方抛出 `SUBAGENT_TIMEOUT` 错误）。
- **Java Gateway 联调**：当前测试均使用 FakeJava 进行打桩验证，尚未在真实部署 of Java gateway 下进行网关侧 Policy 合规性验证。这作为非阻塞风险，待后续联调时确认。

## 归档前门禁

根据 Brief 的核心约束，本轮代码不得由 AI 直接提交（禁止 `git add/commit`）。用户批准后，应在本地环境执行以下归档流程：

1. 用户人工复审 [implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md) 与 [closeout.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-06-22-add-subagent-dispatcher-closeout.md)。
2. 在本地手动执行 `npx openspec archive add-subagent-dispatcher --yes` 完成 OpenSpec 归档并将 proposed 转换为 archived spec。
3. 重新跑 `npx openspec validate --strict --no-interactive` 确认规格有效性。
4. （必要时）手动更新 `docs/project-dashboard/development-log.json` 中该 change 的状态为 `archived`，并重新跑 `node docs/project-dashboard/scripts/render-dashboard.mjs` 以及 `pnpm dashboard:check`。
5. 运行 `git status` 确认修改文件列表。
6. 按文件范围精确使用 `git add <paths>` 进行文件暂存（请勿直接使用 `git add .`）。
7. 运行 `git commit -m "feat(subagent): archive add-subagent-dispatcher change"` 提交代码。
