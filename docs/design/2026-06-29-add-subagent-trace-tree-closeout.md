# Add Subagent Trace Tree Closeout

文档类型：Closeout / Implementation Record
日志及版本：2026-06-29 v1
状态：verified / pending OpenSpec archive

## 结论

通过。fork skill 子智能体的执行关系已形成 shared schema、TS Runtime、Java ingestion 和 Frontend Debug Panel 的端到端 Trace Tree 闭环。

## 核心实现

- shared schema 定义可选 Trace Tree attributes，并保持旧 `TraceEvent` 兼容；Runtime Event 新增 `trace` kind 支持 SSE replay。
- `SubagentDispatcher` 发出 start、model、tool、summary 和 terminal lifecycle trace，包含父子 execution、耗时、cost 与 terminal classification，不记录 prompt、skill content 或 raw tool output。
- `AgentExecutionRunner` 将每个 trace 单次 best-effort 投递 Java，同时写入 `RuntimeEventStore` 供 SSE live/replay；trace ingestion 失败不终止 agent turn。
- Java Gateway 原样保存 trace attributes，保持 ingestion-only 边界。
- Frontend 合并同一 child lifecycle 并挂到 parent execution 下，显示状态、耗时、cost 和 terminal class；旧事件回退平铺 JSON。

## 验证证据

- `pnpm --filter @openharness/shared-schema test`：35 passed。
- `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner`：37 passed。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `mvn -f backend/pom.xml test`：27 passed。
- `pnpm --filter @openharness/frontend test`：13 passed。
- `pnpm --filter @openharness/frontend typecheck`：通过。
- `npx openspec validate add-subagent-trace-tree --strict --no-interactive`：exit 0，change valid；PostHog flush 网络告警不影响结果。

## 剩余风险

- Mockito 当前依赖 Byte Buddy 动态 agent；沙箱内 JVM self-attach 会失败，未来 JDK 也将收紧动态加载。该构建告警不影响本变更行为，但应在独立构建治理任务中处理。
- `withTimeout` 仍是 Promise race，不会硬取消底层 Java 请求；本变更只负责正确记录 timeout classification。
- OpenSpec 尚未归档；归档应在集成或部署确认后单独执行。
