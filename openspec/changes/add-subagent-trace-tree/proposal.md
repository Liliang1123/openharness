# Change: Add Subagent Trace Tree

## Why
`add-subagent-dispatcher` 已让 fork skill 子智能体隔离执行，但当前可观测性仍停留在父级 summary 与局部 trace attributes：排查子执行成本、终止原因、Java Gateway 调用链时，需要人工拼接 `childExecutionId`、`childConversationId` 和后端 trace 日志。下一阶段需要把父子执行关系沉淀为标准 Trace Tree，使 TS Runtime、Java Gateway 与 Frontend Debug Panel 对同一棵执行树达成一致。

## What Changes
- 为子智能体 trace 事件定义稳定的父子关联字段：`executionId`、`parentExecutionId`、`childExecutionId`、`childConversationId`、`skillName`、`toolCallId` 与 `traceNodeKind`。
- TS Runtime 在 fork skill 子执行开始、模型调用、工具调用、summary/terminal 时产生可串联的 trace 事件，并把关键事件投递到 Java `/api/v1/trace/events`。
- Java Gateway 接收并保存父子执行关联属性，仍只负责 trace ingestion，不实现第二套 Agent Loop。
- Frontend Trace Debug Panel 将平铺 trace/debug JSON 组织为父子树视图，展示 subagent 节点、状态、耗时、cost 与终止原因。
- 补充 shared-schema 对 Trace Tree 属性的兼容性约束；新增字段保持可选，兼容已有 trace 事件。

## Impact
- Affected specs: `agent-runtime`, `backend-gateway`, `frontend-runtime`, `shared-schema`
- Affected code: `packages/shared-schema/src/index.ts`, `agent-runtime/src/trace.ts`, `agent-runtime/src/subagent/dispatcher.ts`, `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/src/javaClient.ts`, `backend/src/main/java/org/openharness/backend/service/TraceService.java`, `frontend/src/**`
- Affected tests: shared schema trace parsing tests, agent-runtime subagent trace tests, backend trace ingestion tests, frontend trace tree rendering tests
