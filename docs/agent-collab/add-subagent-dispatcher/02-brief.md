# Antigravity CLI Brief: add-subagent-dispatcher Step 02

> [!IMPORTANT]
> 本文件是 Antigravity CLI 的唯一执行边界。
> 禁止扩大 scope。
> 禁止 `git add` / `git commit`。
> 禁止 `npx openspec archive`。
> 禁止批量格式化、import 排序或重排无关代码。
> 遇到 Brief 未覆盖的问题、测试失败原因不清、需要新增依赖、需要改 OpenSpec 或架构边界时，必须停止并写 abort report。

## 1. 项目路径

```text
/Users/elvis/file/develop/opensource/openharness
```

## 2. 当前 change

```text
add-subagent-dispatcher
```

## 3. 你的角色

你是 Antigravity CLI Implementer Agent。

本轮只执行 Superpowers plan 的 **Task 2: Dispatcher child model, policy, and usage behavior**。
不要执行 Task 3 或后续任务，不要接入 `AgentExecutionRunner`。

## 4. 必读文件

- `AGENTS.md`
- `openspec/AGENTS.md`
- `docs/design/2026-06-22-codex-antigravity-collaboration-protocol.md`
- `docs/design/2026-06-22-codex-antigravity-operator-guide.md`
- `docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md`
- `docs/agent-collab/add-subagent-dispatcher/01-review.md`
- `docs/review/2026-06-22-add-subagent-dispatcher-step-01-review.md`
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`

## 5. 本轮目标

在不接入父 runner 的前提下，增强 `SubagentDispatcher` 的 child model / usage / child tool-call 行为：

1. `subagent_model` 必须作为逻辑模型 id 转发给 Java model request；
2. Java 返回的 `usage.costUsdMicros` 必须透传到 dispatcher result，不做 TS 端价格计算；
3. 如果 child model 尝试调用已从 child catalog 移除的工具（例如 `run_command`），dispatcher 必须返回 `SUBAGENT_POLICY_DENY`，且不得执行 Java tool；
4. 修复 Step 01 非阻塞风险：未提供 `subagent_model` 时不要使用空字符串，默认使用 `default`；
5. 尽量移除或收窄 `meta as any`，如果 TypeScript 类型不允许扩展 child attribution，本轮可以保留 `cacheEnabled` 标准字段，并把 attribution 保持在 dispatcher result / 后续 trace 里，不要扩大 shared-schema。

## 6. 允许修改文件

本轮只允许创建 / 修改：

- `agent-runtime/test/subagentDispatcher.test.ts`
- `agent-runtime/src/subagent/dispatcher.ts`
- `docs/agent-collab/add-subagent-dispatcher/02-report.md`
- `docs/agent-collab/add-subagent-dispatcher/02-report-abort.md`（仅中断时）

## 7. 禁止修改文件

本轮禁止修改：

- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/src/types.ts`
- `packages/shared-schema/**`
- `openspec/**`
- `docs/project-dashboard/**`
- `AGENTS.md`
- `README.md`
- 任意与本轮 Task 2 无关的文件

## 8. 必须执行的步骤

请严格执行以下步骤：

1. 在 `agent-runtime/test/subagentDispatcher.test.ts` 中新增测试：`forwards subagent_model as logical model id and returns Java-provided cost`。
   - 断言 `javaClient.chatRequests[0].model === "cheap-worker"`。
   - 断言 `result.usage?.costUsdMicros === 7`。
2. 新增测试：`defaults child model to default when subagent_model is absent`。
   - 断言未提供 `subagent_model` 时 `javaClient.chatRequests[0].model === "default"`。
3. 新增测试：`rejects child attempts to call tools removed from the child catalog`。
   - 让 fake child model 首轮返回 tool call `run_command`。
   - skill metadata 设置 `forbidden_tools: ["run_command"]`。
   - 断言 result 为 `status: "error"`。
   - 断言 `errorClass === "SUBAGENT_POLICY_DENY"`。
   - 断言 `javaClient.executedTools` 长度为 0。
4. 修改 `agent-runtime/src/subagent/dispatcher.ts`：
   - `model` 使用 `input.skill.metadata.subagent_model ?? "default"`。
   - child model 返回 toolCalls 时，先检查是否都在 child tools allow set；不在则返回 `SUBAGENT_POLICY_DENY`。
   - 保持 usage 只从 Java response 透传。
   - 不要执行任何 child tool（真正 child allowed tool execution 留给后续 step / brief）。
5. 尽量将 `meta` 改成只包含 shared schema 已允许字段，例如：
   ```ts
   meta: { cacheEnabled: false }
   ```
   如果需要 child attribution，请保留在 `SubagentRunResult` 或后续 trace 设计中，不要在本轮改 shared schema。

## 9. 验证命令

本轮必须执行：

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
pnpm --filter @openharness/agent-runtime typecheck
```

## 10. 完成后写 report

正常完成后，写入：

```text
docs/agent-collab/add-subagent-dispatcher/02-report.md
```

报告格式：

```markdown
# Agent Work Report: add-subagent-dispatcher Step 02

## 改动文件
- ...

## 实现摘要
- ...

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：passed / failed
- `pnpm --filter @openharness/agent-runtime typecheck`：passed / failed

## RED/GREEN 证据
- RED：...
- GREEN：...

## 已知风险
- ...

## 未完成
- ...

## 需要 Review Owner 判断的问题
- ...
```

## 11. 中断协议

如果遇到以下任一情况，停止执行并写：

```text
docs/agent-collab/add-subagent-dispatcher/02-report-abort.md
```

必须中断的情况：

- 需要修改“允许修改文件”以外的文件；
- 需要改 `packages/shared-schema/**` 才能完成；
- 需要接入 `AgentExecutionRunner`；
- 测试失败但原因不清；
- 需要新增依赖；
- 需要修改 OpenSpec；
- 发现安全、权限、沙箱风险；
- 想执行 `git add`、`git commit` 或 `npx openspec archive`；
- 命令失败、环境缺依赖、权限不足。

abort report 格式：

```markdown
# Abort Report: add-subagent-dispatcher Step 02

## 中断结论
需修改：当前任务无法在 Brief 边界内安全继续。

## 中断原因
- ...

## 已执行操作
- ...

## 错误日志
```text
...
```

## 当前工作区状态
- ...

## 需要 Codex 判断的问题
- ...
```
