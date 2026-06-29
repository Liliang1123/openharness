# Design: Add Subagent Trace Tree

## Context
Subagent 已经具备隔离执行、权限降级、abort/timeout 传播与 cost 聚合。但现有 trace 只在父事件 attributes 中记录部分 child metadata，无法直接在 Java trace ingestion 或 Frontend Debug Panel 中还原父子树。该变更聚焦可观测性闭环，不改变子智能体执行隔离与权限模型。

## Goals / Non-Goals
- Goals:
  - 让父 Agent 与 Subagent 形成可机器解析的 trace tree。
  - TS Runtime 对子执行关键生命周期发出结构化 trace 事件。
  - Java Gateway 保存 trace tree 相关属性并保持服务间 trace id 透传。
  - Frontend Debug Panel 展示父子树、状态、耗时、cost 与错误分类。
- Non-Goals:
  - 不新增公开子 Agent API、SDK 或远程管理能力。
  - 不引入容器化或进程级 sandbox。
  - 不让 Java Backend 实现 Agent Loop 或重算 provider cost。
  - 不改变已有 `TraceEvent` 顶层字段的必填性，避免破坏历史事件。

## Decisions
- Decision: Trace Tree 关系使用 `TraceEvent.attributes` 中的稳定字段表达，而不是立即新增必填顶层字段。
  - Rationale: `TraceEvent` 已跨 TS/Java/Frontend 使用；新增必填顶层字段会影响历史事件和后端 DTO 兼容性。
- Decision: `traceNodeKind` 取值先限定为 `agent_execution`、`subagent_execution`、`model_call`、`tool_call`、`summary`。
  - Rationale: 足够覆盖父子树视图和排障路径，后续可增量扩展。
- Decision: `parentExecutionId` 指向父 Agent execution，`childExecutionId` 标识子执行；span 层级继续由 `parentSpanId` 表示事件内局部调用关系。
  - Rationale: execution tree 与 span tree 不是同一层级，避免复用 `parentSpanId` 造成语义混乱。
- Decision: Java Gateway 只校验和保存 trace 事件，不根据 trace tree 反向驱动运行时。
  - Rationale: 保持 TS Runtime 为 Agent Harness Owner，Java 仍是 Enterprise Gateway Owner。
- Decision: Frontend 从响应 trace/debug 数据和可用事件中 best-effort 构建树；缺失新字段时回退为平铺 JSON。
  - Rationale: 保持向后兼容，不阻塞旧会话展示。

## Risks / Trade-offs
- Trace attributes 不是强类型顶层字段 → 通过 shared-schema tests 和 helper 类型约束降低漂移风险。
- 子执行事件量增加 → 仅记录生命周期和边界事件，不记录子 prompt 原文或敏感 tool output。
- Frontend tree 与后端持久 trace 可能短期来源不同 → 统一字段命名，并用集成测试校验关键字段。

## Migration Plan
1. 扩展 shared-schema 中 TraceEvent attributes 的约定与测试，不破坏旧事件。
2. TS Runtime 增加 trace helper 与 subagent lifecycle trace emission。
3. TS Runtime 将关键 trace 事件投递 Java Gateway trace ingestion，保留本地响应 debug。
4. Java Backend 补充 trace ingestion 测试，验证 subagent tree attributes 被保存且不记录敏感 token。
5. Frontend Debug Panel 增加 trace tree rendering 与旧事件 fallback。
