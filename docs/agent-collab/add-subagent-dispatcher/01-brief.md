# Antigravity CLI Brief: add-subagent-dispatcher Step 01

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

本轮只执行 Superpowers plan 的 **Task 1: SubagentDispatcher public contract and TDD tests**。
不要执行 Task 2 或后续任务。

## 4. 必读文件

- `AGENTS.md`
- `openspec/AGENTS.md`
- `docs/design/2026-06-22-codex-antigravity-collaboration-protocol.md`
- `docs/design/2026-06-22-codex-antigravity-operator-guide.md`
- `openspec/changes/add-subagent-dispatcher/proposal.md`
- `openspec/changes/add-subagent-dispatcher/design.md`
- `openspec/changes/add-subagent-dispatcher/tasks.md`
- `openspec/changes/add-subagent-dispatcher/specs/agent-loop/spec.md`
- `openspec/changes/add-subagent-dispatcher/specs/agent-runtime/spec.md`
- `docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md`

## 5. 本轮目标

创建 `SubagentDispatcher` 的最小公共契约和首个 TDD 测试，证明：

1. dispatcher 能从父 frozen catalog 派生 child tools；
2. child tools 会移除 skill metadata 中的 `forbidden_tools`；
3. child tools 会移除特权元工具 `invoke_skill`；
4. focused test 从 RED 到 GREEN。

## 6. 允许修改文件

本轮只允许创建 / 修改：

- `agent-runtime/test/subagentDispatcher.test.ts`
- `agent-runtime/src/subagent/dispatcher.ts`
- `docs/agent-collab/add-subagent-dispatcher/01-report.md`
- `docs/agent-collab/add-subagent-dispatcher/01-report-abort.md`（仅中断时）

## 7. 禁止修改文件

本轮禁止修改：

- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/src/types.ts`
- `openspec/**`
- `docs/project-dashboard/**`
- `AGENTS.md`
- `README.md`
- 任意与本轮 Task 1 无关的文件

## 8. 必须执行的步骤

严格按 `docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md` 中 Task 1 执行：

1. 创建 `agent-runtime/test/subagentDispatcher.test.ts`，写入 Task 1.1 的测试。
2. 运行：
   ```bash
   pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
   ```
   期望先失败，失败原因应为 dispatcher 模块不存在或功能未实现。
3. 创建 `agent-runtime/src/subagent/dispatcher.ts`，写入 Task 1.3 的最小实现。
4. 再运行：
   ```bash
   pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
   ```
   期望通过。

## 9. 验证命令

本轮必须至少执行：

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```

如果你认为需要额外执行 typecheck，可以执行：

```bash
pnpm --filter @openharness/agent-runtime typecheck
```

但不要因此扩大修改范围。

## 10. 完成后写 report

正常完成后，写入：

```text
docs/agent-collab/add-subagent-dispatcher/01-report.md
```

报告格式：

```markdown
# Agent Work Report: add-subagent-dispatcher Step 01

## 改动文件
- ...

## 实现摘要
- ...

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher`：passed / failed

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
docs/agent-collab/add-subagent-dispatcher/01-report-abort.md
```

必须中断的情况：

- 需要修改“允许修改文件”以外的文件；
- 测试失败但原因不清；
- 需要新增依赖；
- 需要修改 OpenSpec；
- 需要修改架构边界；
- 发现安全、权限、沙箱风险；
- 想执行 `git add`、`git commit` 或 `npx openspec archive`；
- 命令失败、环境缺依赖、权限不足。

abort report 格式：

```markdown
# Abort Report: add-subagent-dispatcher Step 01

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
