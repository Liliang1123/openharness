# Codex Review: add-subagent-dispatcher Step 03

## 结论

通过：Antigravity CLI 的 Step 03 实现满足本轮 Brief 边界和 `ToolRegistry` helper 目标，可以进入 `AgentExecutionRunner` 接入步骤。

## Review 范围

- [Step 03 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/03-brief.md)
- [Step 03 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-dispatcher/03-report.md)
- [ToolRegistry 实现](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/toolRegistry.ts)
- [ToolRegistry 测试](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/toolRegistryMerge.test.ts)

## Code Facts

| 检查项 | 证据 |
|---|---|
| 只读 helper | `agent-runtime/src/toolRegistry.ts:130-134` 新增 `getCatalogTools()`，从当前 session frozen entry 读取 tools。 |
| 返回数组副本 | `agent-runtime/src/toolRegistry.ts:133` 返回 `[...entry.catalog.tools]`，避免调用方 `pop()` 污染 registry 内部数组。 |
| helper 测试 | `agent-runtime/test/toolRegistryMerge.test.ts:181-196` 验证返回 `invoke_skill` 且外部 `pop()` 不影响后续读取。 |
| 未改变 freeze 逻辑 | `agent-runtime/src/toolRegistry.ts:29-101` 既有 `getFrozenCatalog()` 逻辑未被重构，仅新增 helper。 |

## Positive Checks

- 本轮只修改 Brief 允许文件：`agent-runtime/src/toolRegistry.ts`、`agent-runtime/test/toolRegistryMerge.test.ts`、`docs/agent-collab/add-subagent-dispatcher/03-report.md`。
- 未接入 `AgentExecutionRunner`，没有越过 Step 03 边界。
- helper 不触发 catalog fetch，只读取已冻结 session entry；不存在新的网络/IO副作用。
- 对返回数组的突变防护已有测试覆盖。

## Negative Searches / Scope Drift

- 未发现本轮修改 `agent-runtime/src/agentExecutionRunner.ts`、`agent-runtime/src/subagent/dispatcher.ts`、`openspec/**` 或 shared schema。
- 无 `03-report-abort.md`，未声明中断。
- 未发现敏感词残留。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- toolRegistryMerge`：通过，8 tests passed。
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher toolRegistryMerge`：通过，12 tests passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过，`tsc --noEmit` 零错误。

## 非阻塞风险 / 下一步关注

1. `getCatalogTools()` 返回的是数组浅拷贝，单个 `ToolDefinition` 对象仍是同一引用。当前 runner 只会把 tools 传给 dispatcher 的 `deriveChildTools()` 过滤数组，不会改写 tool 对象，因此可接受。若后续有修改 tool 对象字段的需求，应再改为深拷贝或冻结对象。
2. 下一步接入 `AgentExecutionRunner` 时必须确保 forked skill 不进入 `pendingInjections`，否则会污染父 history。

## Next-step Permission

yes。允许进入下一步：`AgentExecutionRunner` forked skill wiring。
