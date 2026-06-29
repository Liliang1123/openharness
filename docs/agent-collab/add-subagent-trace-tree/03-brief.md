# add-subagent-trace-tree Step 03 Brief

文档类型：Implementation Brief
日志及版本：2026-06-23 v1
执行角色：Antigravity CLI / TS Runtime dispatcher-runner integration

## 背景

OpenSpec change `add-subagent-trace-tree` 已获用户审批。
- Step 01 已完成 shared-schema Trace Tree 契约并通过 Codex Review。
- Step 02 已完成 `agent-runtime/src/traceTree.ts` helper 并通过 Codex Review。

当前只执行 Superpowers plan Task 3：TS Runtime Subagent Lifecycle Events and Java Trace Posting。

## 允许修改范围

只允许修改：
- `agent-runtime/src/subagent/dispatcher.ts`
- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/test/subagentDispatcher.test.ts`
- `agent-runtime/test/agentExecutionRunner.test.ts`

禁止修改：
- `packages/shared-schema/**`
- `agent-runtime/src/traceTree.ts`（Step 02 已完成，除非有编译阻塞且需报告说明）
- `agent-runtime/src/trace.ts`
- `backend/**`
- `frontend/**`
- `openspec/**`
- `docs/project-dashboard/**`
- 任何 git 操作（不要 `git add` / `git commit` / `git reset` / `git clean`）

## 需求来源

- Plan：`docs/superpowers/plans/2026-06-23-add-subagent-trace-tree.md` 的 `Task 3: TS Runtime Subagent Lifecycle Events and Java Trace Posting`
- OpenSpec delta：`openspec/changes/add-subagent-trace-tree/specs/agent-runtime/spec.md`
- Step 02 Review：`docs/review/2026-06-23-add-subagent-trace-tree-step-02-review.md`

## 目标

在 fork skill 子智能体执行路径中接入 trace-tree lifecycle events：
- `SubagentDispatcher` 发出 subagent start / model call / tool call / summary / terminal trace events。
- `AgentExecutionRunner` 把 dispatcher 发出的关键 trace events 同时写入本地 runtime event/trace 流并 best-effort post 到 Java `/api/v1/trace/events`。
- Java trace ingestion 失败必须非阻塞，不得导致 agent turn 失败。
- 不改变 subagent 权限降级、history 隔离、模型调用、工具执行或 error mapping 语义。

## 必须完成

1. 修改 `agent-runtime/src/subagent/dispatcher.ts`：
   - 扩展 `SubagentRunInput`，新增：
     - `stepIndex?: number`
     - `emitTrace?: (event: TraceEvent) => Promise<void>`
   - 使用 Step 02 helper：
     - `buildSubagentTraceAttributes`
     - `TRACE_SUBAGENT_START`
     - `TRACE_SUBAGENT_MODEL_CALL`
     - `TRACE_SUBAGENT_TOOL_CALL`
     - `TRACE_SUBAGENT_SUMMARY`
     - `TRACE_SUBAGENT_END`
   - 使用现有 `traceEvent()` 生成 `TraceEvent`。
   - 在子执行中发出：
     - start event
     - 每次 child model call 前的 model call event
     - 每次 child tool execute 前的 tool call event
     - successful summary event
     - all terminal return paths 的 end event
   - terminal event 必须带：
     - `terminalClass`（如 `SUBAGENT_TIMEOUT` / `SUBAGENT_ABORTED` / `SUBAGENT_POLICY_DENY` / `SUBAGENT_TOOL_ERROR` / `SUBAGENT_MODEL_ERROR`，成功可不带或使用明确成功分类）
     - `durationMs`
     - Java 返回的累计 `costUsdMicros`（有则带）
   - trace attributes 不得包含 child system prompt、skill content、raw tool output、provider credentials。

2. 修改 `agent-runtime/src/agentExecutionRunner.ts`：
   - 调用 `subagentDispatcher.run()` 时传入 `stepIndex`。
   - 传入 `emitTrace` 回调：
     - 先调用当前 runner 内部 `emit(event)`。
     - 再 best-effort 调用 `this.javaClient.postTrace(event, input.headers)`。
     - `postTrace` 失败只 `console.warn`，不得 throw。
     - warning 不得输出 `input.headers` / token / provider credential。

3. 修改测试：
   - `agent-runtime/test/subagentDispatcher.test.ts`
     - 增加测试：成功 subagent 会 emit `SUBAGENT_START` 与 `SUBAGENT_END`，attributes 包含 parent/child linkage、skillName、toolCallId、stepIndex。
     - 增加或扩展测试：error/timeout/policy deny terminal event 包含 terminalClass。
     - 断言 JSON.stringify(events) 不包含 skill content / prompt / raw tool output。
   - `agent-runtime/test/agentExecutionRunner.test.ts`
     - Fake JavaClient 记录 `traceEvents`。
     - 验证 fork skill 子执行会调用 `postTrace`，至少包含 `SUBAGENT_START` 与 `SUBAGENT_END`。
     - 验证 `postTrace` 抛错时，agent execution 仍按既有逻辑完成或按原 error mapping 终止，不能因为 trace ingestion 失败而失败。

4. 不要修改 docs / dashboard / OpenSpec tasks 状态；这些属于后续 closeout。

## 实现提示

可在 `SubagentDispatcher.run()` 内创建局部 helper：

```ts
const startedAt = Date.now();
const emitSubagentTrace = async (
  eventType: string,
  name: string,
  extra?: { terminalClass?: string; costUsdMicros?: number; status?: "ok" | "error" | "timeout" }
) => {
  if (!input.emitTrace) return;
  const durationMs = Date.now() - startedAt;
  await input.emitTrace(traceEvent({
    traceId: input.parent.traceId,
    requestId: input.parent.requestId,
    conversationId: input.parent.conversationId,
    userId: input.parent.userId,
    tenantId: input.parent.tenantId,
    eventType,
    name,
    status: extra?.status,
    attributes: buildSubagentTraceAttributes({
      executionId: input.parent.executionId,
      childExecutionId,
      childConversationId,
      skillName: input.skill.metadata.name,
      toolCallId: input.toolCallId,
      stepIndex: input.stepIndex,
      terminalClass: extra?.terminalClass,
      durationMs,
      costUsdMicros: extra?.costUsdMicros
    })
  }));
};
```

注意：
- 如果某个错误 return 在 `aggregatedCost` 定义前发生，不要引用未定义变量；可传 0 或不传 cost。
- 若 `emitTrace` 自身失败，建议让 caller 控制；runner 的 Java post failure 必须吞掉。
- 不要把 `systemMessage.content`、`input.skill.content`、`input.task`、tool result content 放入 attributes。

## 必跑验证

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
```

## 质量门禁

```bash
git diff --check -- agent-runtime/src/subagent/dispatcher.ts agent-runtime/src/agentExecutionRunner.ts agent-runtime/test/subagentDispatcher.test.ts agent-runtime/test/agentExecutionRunner.test.ts
```

## 执行报告

执行完成后生成：
- `docs/agent-collab/add-subagent-trace-tree/03-report.md`

报告需包含：
- 修改文件列表
- 验证命令与结果
- 是否偏离 Brief
- 剩余风险
