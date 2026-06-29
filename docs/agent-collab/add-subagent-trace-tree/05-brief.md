# add-subagent-trace-tree Step 05 Brief

## 目标

把 subagent trace-tree lifecycle events 从 TS Runtime 可靠地送入 SSE，并在 Frontend Debug Panel 中按父/子 execution 展示；旧事件继续显示平铺 JSON。

## 实现范围

- Runtime event contract 增加 `trace` kind。
- Runner 对每个 trace 只向 Java 上报一次，同时写入 `RuntimeEventStore` 供 SSE replay/live stream。
- Frontend 新增 `TraceTreePanel`，合并同一 child lifecycle，显示状态、耗时、成本和 terminal class。
- 缺少显式 parent agent node 时，根据 `parentExecutionId` 合成根节点。
- 无 trace-tree attributes 时保留原 SSE JSON fallback。

## 验证

```bash
pnpm --filter @openharness/shared-schema test -- schema
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
pnpm --filter @openharness/frontend test
pnpm --filter @openharness/frontend typecheck
```
