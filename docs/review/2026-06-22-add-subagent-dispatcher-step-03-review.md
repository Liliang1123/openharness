# add-subagent-dispatcher Step 03 Review

## 结论

通过：Step 03 满足 Antigravity Brief 的验收标准。`ToolRegistry.getCatalogTools()` 已作为只读 helper 可供后续 runner 接入使用，本阶段未发现阻塞问题。

## Review 范围

- [Step 03 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/03-brief.md)
- [Step 03 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/03-report.md)
- [ToolRegistry 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/toolRegistry.ts)
- [ToolRegistry 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/toolRegistryMerge.test.ts)
- [Superpowers plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md)

## 主要发现

### P0 / 阻塞问题

未发现阻塞问题。

### P1 / 关键依据

1. **只读 helper 行为正确**
   - `agent-runtime/src/toolRegistry.ts:130-134` 新增 `getCatalogTools()`。
   - 该方法只读取已缓存 frozen entry，不触发 catalog 重新加载。

2. **返回数组副本，避免数组级污染**
   - `agent-runtime/src/toolRegistry.ts:133` 使用 `[...entry.catalog.tools]`。
   - `agent-runtime/test/toolRegistryMerge.test.ts:189-192` 覆盖 `pop()` 后再次读取仍包含 `invoke_skill`。

3. **未扩大 scope**
   - 未修改 `AgentExecutionRunner`、OpenSpec、shared schema 或 dashboard。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- toolRegistryMerge`：通过，8 tests passed。
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge`：通过，12 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。

## 非阻塞风险

- helper 当前是数组浅拷贝，不是 `ToolDefinition` 深拷贝。对后续 dispatcher 只读过滤足够；若未来调用方需要改写 tool 对象，需升级为深拷贝或冻结。

## 最终建议

- 允许进入 `AgentExecutionRunner` 接入步骤。
- 下一步必须重点验证：forked skill 不进入 pending injection，父 history 不包含 child-only instructions，父工具结果只包含 summary。

## 后续门禁

- 下一步仍不得改 OpenSpec / dashboard / shared schema。
- runner 接入完成后必须复跑 `agentExecutionRunner`、`subagentDispatcher`、`toolRegistryMerge` 与 typecheck。
