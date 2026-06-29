# add-subagent-trace-tree Step 02 Brief

文档类型：Implementation Brief
日志及版本：2026-06-23 v1
执行角色：Antigravity CLI / TS Runtime trace helper

## 背景

OpenSpec change `add-subagent-trace-tree` 已获用户审批。Step 01 已由 Antigravity CLI 完成 shared-schema Trace Tree 契约并经 Codex Review 通过。当前只执行 Superpowers plan Task 2：TS Runtime Trace Tree Helper。

## 允许修改范围

只允许修改 / 新增：
- `agent-runtime/src/traceTree.ts`
- `agent-runtime/src/trace.ts`（仅在确有必要时；优先不改）
- `agent-runtime/test/subagentDispatcher.test.ts`

禁止修改：
- `packages/shared-schema/**`
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/src/agentExecutionRunner.ts`
- `backend/**`
- `frontend/**`
- `openspec/**`
- `docs/project-dashboard/**`
- 任何 git 操作（不要 `git add` / `git commit` / `git reset` / `git clean`）

## 需求来源

- Plan：`docs/superpowers/plans/2026-06-23-add-subagent-trace-tree.md` 的 `Task 2: TS Runtime Trace Tree Helper`
- OpenSpec delta：`openspec/changes/add-subagent-trace-tree/specs/agent-runtime/spec.md`
- Step 01 Review：`docs/review/2026-06-23-add-subagent-trace-tree-step-01-review.md`

## 目标

新增 TS Runtime trace-tree helper，为后续 SubagentDispatcher/AgentExecutionRunner 集成提供稳定、类型化、脱敏的 trace-tree attributes 构建能力。本 Step 不接入 dispatcher/runner，不发实际 subagent lifecycle event。

## 必须完成

1. 创建 `agent-runtime/src/traceTree.ts`，导出：
   - `TRACE_SUBAGENT_START = "SUBAGENT_START"`
   - `TRACE_SUBAGENT_MODEL_CALL = "SUBAGENT_MODEL_CALL"`
   - `TRACE_SUBAGENT_TOOL_CALL = "SUBAGENT_TOOL_CALL"`
   - `TRACE_SUBAGENT_SUMMARY = "SUBAGENT_SUMMARY"`
   - `TRACE_SUBAGENT_END = "SUBAGENT_END"`
   - `SubagentTraceInput` interface
   - `buildSubagentTraceAttributes(input: SubagentTraceInput)`

2. `buildSubagentTraceAttributes()` 必须返回符合 `@openharness/shared-schema` 中 `TraceTreeAttributes` 的对象，字段包括：
   - `traceNodeKind: "subagent_execution"`
   - `executionId`
   - `parentExecutionId`（与父 `executionId` 相同）
   - `childExecutionId`
   - `childConversationId`
   - `skillName`
   - `toolCallId`
   - 可选 `stepIndex`
   - 可选 `terminalClass`
   - 可选 `durationMs`
   - 可选 `costUsdMicros`
   - 可选 `traceIngestionStatus`

3. helper 应去除值为 `undefined` 的可选字段，避免 trace attributes 里出现无意义字段。

4. 在 `agent-runtime/test/subagentDispatcher.test.ts` 增加 helper 级测试，覆盖：
   - `buildSubagentTraceAttributes()` 输出完整字段。
   - event name 常量稳定：`TRACE_SUBAGENT_START === "SUBAGENT_START"`、`TRACE_SUBAGENT_END === "SUBAGENT_END"`。
   - 序列化结果不包含类似 prompt 内容的无关字段；本 Step 不要把 skill content / task 加入 helper 输入或输出。

5. 不要修改 `SubagentDispatcher.run()` 或 `AgentExecutionRunner`，这些属于 Step 03。

## 建议实现片段

`agent-runtime/src/traceTree.ts` 可参考：

```ts
import type { TraceTreeAttributes } from "@openharness/shared-schema";

export const TRACE_SUBAGENT_START = "SUBAGENT_START";
export const TRACE_SUBAGENT_MODEL_CALL = "SUBAGENT_MODEL_CALL";
export const TRACE_SUBAGENT_TOOL_CALL = "SUBAGENT_TOOL_CALL";
export const TRACE_SUBAGENT_SUMMARY = "SUBAGENT_SUMMARY";
export const TRACE_SUBAGENT_END = "SUBAGENT_END";

export interface SubagentTraceInput {
  executionId: string;
  childExecutionId: string;
  childConversationId: string;
  skillName: string;
  toolCallId: string;
  stepIndex?: number;
  terminalClass?: string;
  durationMs?: number;
  costUsdMicros?: number;
  traceIngestionStatus?: "posted" | "failed" | "skipped";
}

export function buildSubagentTraceAttributes(input: SubagentTraceInput): TraceTreeAttributes {
  return withoutUndefined({
    traceNodeKind: "subagent_execution",
    executionId: input.executionId,
    parentExecutionId: input.executionId,
    childExecutionId: input.childExecutionId,
    childConversationId: input.childConversationId,
    skillName: input.skillName,
    toolCallId: input.toolCallId,
    stepIndex: input.stepIndex,
    terminalClass: input.terminalClass,
    durationMs: input.durationMs,
    costUsdMicros: input.costUsdMicros,
    traceIngestionStatus: input.traceIngestionStatus
  });
}

function withoutUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}
```

如需调整类型实现可以调整，但不要扩大功能范围。

## 必跑验证

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
pnpm --filter @openharness/agent-runtime typecheck
```

## 质量门禁

```bash
git diff --check -- agent-runtime/src/traceTree.ts agent-runtime/src/trace.ts agent-runtime/test/subagentDispatcher.test.ts
```

## 执行报告

执行完成后生成：
- `docs/agent-collab/add-subagent-trace-tree/02-report.md`

报告需包含：
- 修改文件列表
- 验证命令与结果
- 是否偏离 Brief
- 剩余风险
