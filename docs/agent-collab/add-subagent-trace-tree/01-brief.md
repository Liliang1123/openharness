# add-subagent-trace-tree Step 01 Brief

文档类型：Implementation Brief
日志及版本：2026-06-23 v1
执行角色：Subagent worker / shared-schema contract

## 背景

OpenSpec change `add-subagent-trace-tree` 已获用户审批。当前只执行 Superpowers plan Task 1：Shared Schema Trace Tree Contract。不要实现 TS Runtime dispatcher、Java Backend、Frontend 或 dashboard verified 收尾。

## 允许修改范围

只允许修改：
- `packages/shared-schema/src/index.ts`
- `packages/shared-schema/test/schema.test.ts`

禁止修改：
- `agent-runtime/**`
- `backend/**`
- `frontend/**`
- `openspec/**`
- `docs/project-dashboard/**`
- 任何 git 操作（不要 `git add` / `git commit` / `git reset` / `git clean`）

## 需求来源

- Plan：`docs/superpowers/plans/2026-06-23-add-subagent-trace-tree.md`
- OpenSpec delta：`openspec/changes/add-subagent-trace-tree/specs/shared-schema/spec.md`

## 目标

让 trace-tree attributes 成为 shared-schema 中可显式解析和复用的契约，同时保持历史 `TraceEvent` 兼容。

## 必须完成

1. 在 `packages/shared-schema/test/schema.test.ts` 增加测试：
   - `TraceEventSchema` 可解析带 `attributes.traceNodeKind = "subagent_execution"` 的事件。
   - `TraceTreeAttributesSchema.parse(parsed.attributes)` 能保留：
     - `traceNodeKind`
     - `executionId`
     - `parentExecutionId`
     - `childExecutionId`
     - `childConversationId`
     - `skillName`
     - `toolCallId`
   - 历史 `TraceEvent` 不带 `attributes` 仍然 parse 成功。

2. 在 `packages/shared-schema/src/index.ts` 增加并导出：
   - `TraceNodeKindSchema`
   - `TraceNodeKind`
   - `TraceTreeAttributesSchema`
   - `TraceTreeAttributes`

3. `TraceTreeAttributesSchema` 至少支持：
   - `traceNodeKind`: enum `agent_execution | subagent_execution | model_call | tool_call | summary`
   - `executionId?: string`
   - `parentExecutionId?: string`
   - `childExecutionId?: string`
   - `childConversationId?: string`
   - `skillName?: string`
   - `toolCallId?: string`
   - `stepIndex?: nonnegative integer`
   - `terminalClass?: string`
   - `durationMs?: nonnegative number`
   - `costUsdMicros?: nonnegative integer`
   - `traceIngestionStatus?: posted | failed | skipped`
   - 使用 `.passthrough()` 保留未来扩展字段。

4. 保持 `TraceEventSchema.attributes` 为 `z.record(z.unknown()).optional()`；不要改成强制 trace-tree shape。

## 必跑验证

```bash
pnpm --filter @openharness/shared-schema test -- schema
```

## 期望结果

- 测试通过。
- 只出现上述两个文件的 diff。
- 最终回复包含：
  - 修改文件列表
  - 测试命令和结果
  - 是否有偏离 brief 的地方
