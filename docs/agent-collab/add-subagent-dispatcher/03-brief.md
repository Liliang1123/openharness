# Antigravity CLI Brief: add-subagent-dispatcher Step 03

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

本轮只执行 `ToolRegistry catalog access helper`，即 Superpowers plan 中的 **Task 4**。

说明：虽然 plan 中 Task 3 写在 Task 4 前，但 `AgentExecutionRunner` 接入需要先读取父 frozen catalog 的 tools。因此本轮先做 Task 4，降低后续 runner wiring 的耦合风险。

## 4. 必读文件

- `AGENTS.md`
- `openspec/AGENTS.md`
- `docs/design/2026-06-22-codex-antigravity-collaboration-protocol.md`
- `docs/design/2026-06-22-codex-antigravity-operator-guide.md`
- `docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md`
- `docs/agent-collab/add-subagent-dispatcher/02-review.md`
- `docs/review/2026-06-22-add-subagent-dispatcher-step-02-review.md`
- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/test/toolRegistryMerge.test.ts`

## 5. 本轮目标

新增 `ToolRegistry.getCatalogTools(tenantId, conversationId)` 只读 helper，为后续 `AgentExecutionRunner` 将父 frozen catalog tools 传给 `SubagentDispatcher` 做准备。

验收标准：

1. helper 返回当前 conversation frozen catalog 的 tools；
2. helper 返回数组副本，外部修改返回数组不得污染 registry 内部 frozen catalog；
3. helper 不改变现有 catalog freeze、MCP merge、`invoke_skill` 注入逻辑；
4. focused tests 和 typecheck 通过。

## 6. 允许修改文件

本轮只允许创建 / 修改：

- `agent-runtime/src/toolRegistry.ts`
- `agent-runtime/test/toolRegistryMerge.test.ts`
- `docs/agent-collab/add-subagent-dispatcher/03-report.md`
- `docs/agent-collab/add-subagent-dispatcher/03-report-abort.md`（仅中断时）

## 7. 禁止修改文件

本轮禁止修改：

- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`
- `agent-runtime/src/types.ts`
- `packages/shared-schema/**`
- `openspec/**`
- `docs/project-dashboard/**`
- `AGENTS.md`
- `README.md`
- 任意与本轮 Task 4 无关的文件

## 8. 必须执行的步骤

1. 阅读现有 `agent-runtime/src/toolRegistry.ts` 与 `agent-runtime/test/toolRegistryMerge.test.ts`。
2. 在 `agent-runtime/test/toolRegistryMerge.test.ts` 添加测试，验证：
   - `getFrozenCatalog()` 后，`getCatalogTools()` 返回 tools；
   - 返回 tools 包含 `invoke_skill`（在 Vitest 下如需启用 skills，请按现有测试风格设置 `OPENHARNESS_SKILLS_ENABLED=true`）；
   - 对返回数组执行 `pop()` 不影响下一次 `getCatalogTools()` 的返回结果。
3. 运行 focused test，先确认 RED：
   ```bash
   pnpm --filter @openharness/agent-runtime test -- toolRegistryMerge
   ```
4. 在 `ToolRegistry` 中新增：
   ```ts
   getCatalogTools(tenantId: string, conversationId: string): ToolDefinition[] {
     const key = `${tenantId}:${conversationId}`;
     const entry = this.getEntriesMap().get(key);
     return entry ? [...entry.catalog.tools] : [];
   }
   ```
5. 再运行：
   ```bash
   pnpm --filter @openharness/agent-runtime test -- toolRegistryMerge
   pnpm --filter @openharness/agent-runtime typecheck
   ```

## 9. 验证命令

本轮必须执行：

```bash
pnpm --filter @openharness/agent-runtime test -- toolRegistryMerge
pnpm --filter @openharness/agent-runtime typecheck
```

可选执行：

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge
```

## 10. 完成后写 report

正常完成后，写入：

```text
docs/agent-collab/add-subagent-dispatcher/03-report.md
```

报告格式：

```markdown
# Agent Work Report: add-subagent-dispatcher Step 03

## 改动文件
- ...

## 实现摘要
- ...

## 验证命令
- `pnpm --filter @openharness/agent-runtime test -- toolRegistryMerge`：passed / failed
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
docs/agent-collab/add-subagent-dispatcher/03-report-abort.md
```

必须中断的情况：

- 需要修改“允许修改文件”以外的文件；
- 需要接入 `AgentExecutionRunner`；
- 需要修改 OpenSpec 或 shared schema；
- 测试失败但原因不清；
- 需要新增依赖；
- 发现安全、权限、沙箱风险；
- 想执行 `git add`、`git commit` 或 `npx openspec archive`；
- 命令失败、环境缺依赖、权限不足。
