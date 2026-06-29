# add-subagent-trace-tree Step 03 Review

文档类型：Review
日志及版本：2026-06-23 v2

## 结论

通过。Antigravity CLI 已完成 subagent trace-tree lifecycle 与 runner best-effort Java trace posting 集成，并修复初审发现的 Promise reject terminal trace gap。当前 focused tests、typecheck 与 whitespace 门禁均通过，允许进入 Step 04。

## Review 范围

- [03 Brief](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-trace-tree/03-brief.md)
- [03 Report](file:///Users/elvis/file/develop/opensource/openharness/docs/agent-collab/add-subagent-trace-tree/03-report.md)
- [dispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/subagent/dispatcher.ts)
- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)
- [subagentDispatcher.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/subagentDispatcher.test.ts)
- [agentExecutionRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/agentExecutionRunner.test.ts)
- [OpenSpec agent-runtime delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-subagent-trace-tree/specs/agent-runtime/spec.md)

## 主要发现

### 已修复

1. 初审发现 `javaClient.chat()` 或 `javaClient.executeTool()` Promise reject 时缺少 terminal trace event。
2. Antigravity CLI 已补充：
   - child model call reject → emit `SUBAGENT_END`，`terminalClass: "SUBAGENT_MODEL_ERROR"`，返回 structured `SubagentRunResult`。
   - child tool execute reject → emit `SUBAGENT_END`，`terminalClass: "SUBAGENT_TOOL_ERROR"`，返回 structured `SubagentRunResult`。
   - 新增对应 `subagentDispatcher` 单测。

### 已通过项

1. `SubagentDispatcher` 已支持 `stepIndex` 与 `emitTrace` 入参。
2. 子执行路径已发出 start / model call / tool call / summary / end trace events。
3. 成功、abort、timeout、policy deny、tool parse/execute error、model reject、tool reject 路径均有 terminal trace 覆盖。
4. `AgentExecutionRunner` 已将 dispatcher trace event 写入当前 runtime emit 流，并 best-effort 调用 Java `postTrace`。
5. `postTrace` 抛错时不会导致 agent turn 失败，且 warning 不输出 headers/token。
6. 未修改 shared-schema、traceTree helper、backend、frontend、dashboard 或 OpenSpec 状态。

## 验证记录

```bash
git diff --check -- agent-runtime/src/subagent/dispatcher.ts agent-runtime/src/agentExecutionRunner.ts agent-runtime/test/subagentDispatcher.test.ts agent-runtime/test/agentExecutionRunner.test.ts
```

结果：通过，无输出。

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner
```

结果：通过，`subagentDispatcher.test.ts` 19 tests passed，`agentExecutionRunner.test.ts` 18 tests passed，总计 37 tests passed。

```bash
pnpm --filter @openharness/agent-runtime typecheck
```

结果：通过，`tsc --noEmit` 无报错。

## 剩余风险

- `postTrace` 当前仍是 await 的 best-effort 调用；若 Java trace ingestion 长时间挂起而非快速 reject，理论上可能增加执行延迟。该风险不阻塞 Step 03，因为本 Step 合同要求的是失败不导致 agent turn 失败；如需强制超时或 fire-and-forget，应另设 OpenSpec 或后续步骤明确。

## 最终建议

Step 03 批准完成。下一步进入 Step 04：Java Gateway trace ingestion preservation test。继续由 Codex 出 Brief，Antigravity CLI 实施，Codex Review。

## 后续门禁

Step 04 允许范围应限定在：
- `backend/src/test/java/org/openharness/backend/BackendApiTest.java`

不得在 Step 04 中改 TS Runtime、Frontend、dashboard 或 OpenSpec 归档状态。
