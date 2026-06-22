# CONTEXT.md — Domain Glossary

> 本文件是项目领域术语表。仅记录已确认的术语定义，不含实现细节、任务列表或临时笔记。

## Runtime Layers

| Term | Definition |
|------|-----------|
| **Frontend** | React/Vite 交互层。只调 TS Runtime，不直接调 Java Backend。负责输入、流式展示、Trace 可视化、Approval UI。 |
| **Agent Runtime** (TS Runtime) | TypeScript Fastify 服务。Agent Harness Owner。拥有 Agent loop、MessageHistory、ToolRegistry、beforeToolUse hook、ask_user、streaming、step trace。 |
| **Backend** (Java Backend) | Spring Boot 服务。Enterprise Gateway Owner。拥有 Model Gateway、Provider Adapter、Tool Catalog、Tool Execution、Policy、Auth、Idempotency、Trace Ingestion。 |

## Agent Loop Concepts

| Term | Definition |
|------|-----------|
| **Agent Definition** | TS Runtime 拥有的声明式 agent 配置。描述一个 agent 的 `agentId`、`promptRef`、允许工具列表与可选 model hint，用于后续按 agent 选择 prompt 和工具范围。 |
| **Agent Definition Loader** | TS Runtime 启动时读取项目本地 `agent-runtime/agents/` 定义文件并做 schema 校验的组件。v0 只处理本地 JSON 文件，不提供远程 API、UI、热加载或 SDK。 |
| **Agent Definition Runtime Selection** | TS Runtime 在单次 chat 请求中按可选 `agentId` 选择已加载 Agent Definition，并用该定义的 `promptRef` 解析本轮 system prompt；不代表工具 allow-list enforcement、YAML、SDK、UI 或远程管理能力。 |
| **Agent Definition Tool Filtering** | TS Runtime 按 selected Agent Definition 的 `tools` 列表过滤本轮 model-visible tools，并阻止不在定义范围内的 tool call 继续进入 policy/execute；不改变 Java policy、Java catalog 或 MCP server 配置。 |
| **Agent Definition Observability** | TS Runtime 将 selected Agent Definition 的 `agentId`、`promptRef` 和工具过滤摘要写入 model request metadata 与 TS trace attribution，便于审计和排障；不改变模型可见消息、Java router、Java policy 或工具目录。 |
| **Agent Definition Model Selection** | TS Runtime 将 selected Agent Definition 的可选 `model` 作为本轮 `ModelChatRequest.model` 逻辑模型 id 转发给 Java Backend；Java 仍拥有 model router、provider adapter、fallback 与凭据。 |
| **Agent Loop** | TS Runtime 中的核心循环：接收用户消息 → 调模型 → 执行工具 → 再调模型 → 返回最终答案。Java 不得拥有第二套 Agent Loop。 |
| **ExecutionId** | TS Runtime 为一次 agent turn 生成的唯一 ID。用于关联 active execution、abort、approval、session events 与 terminal state。 |
| **ExecutionState** | 单次 execution 的运行态快照，包含 `executionId`、conversation/tenant、`running` / `waiting_approval` / terminal 状态、时间戳、`endReason` 与 abort signal。 |
| **RuntimeEventStore** | TS Runtime 的短期事件日志。保存 `SessionEvent`，支持按 cursor replay 和 live subscribe；不作为模型上下文输入。 |
| **SessionEvent** | 面向 SSE replay 的 conversation 事件。每条事件携带 `eventId`、`executionId`、`conversationId`、`traceId`、`requestId`、`createdAt`、`kind` 与 `data`。 |
| **ApprovalStore** | Pending approval 的持久化 store，按 `(executionId, toolCallId)` 记录审批请求并唤醒等待中的 runner。 |
| **RuntimeTerminalError** | 非正常 execution 终止分类。当前包括 `MODEL_ERROR`、`TOOL_ERROR`、`POLICY_DENY`、`APPROVAL_TIMEOUT`、`EXECUTION_TIMEOUT`、`STEP_BUDGET_EXHAUSTED`、`EVENT_REPLAY_GAP`、`EXECUTION_ABORTED`、`EMPTY_MODEL_RESPONSE`。 |
| **Step** | Agent Loop 中一次 model 调用加上其触发的工具批次（tool batch）的执行单元。每个 step 有唯一递增的 `stepIndex`。 |
| **StepBudget** | 单次 `run()` 允许的最大 step 数，防止无限循环。默认值 25，可通过请求参数 `stepBudget` 或环境变量 `AGENT_STEP_BUDGET` 覆盖。 |
| **StopReason** | Agent Loop 退出原因。正常终止为 `FINAL_ANSWER`；非正常终止使用 `RuntimeTerminalError`。 |
| **HistoryStore** | 消息历史存储接口。实现有 InMemoryHistoryStore 和 JsonFileHistoryStore。 |
| **MessageHistory** | 一个 conversation 的完整消息序列。由 TS Runtime 独占管理，Java 不得缓存或修改。 |
| **ContextBuilder** | TS Runtime 在每次 model call 前构建模型输入视图的组件。它从 stable history 中按显式 layer 选择消息，不修改 HistoryStore。 |
| **Context Layer** | ContextBuilder 的输入选择层。当前确认的 layer 是 `compressed_summary` 和 `recent_messages`；后续可扩展环境快照、相关工具结果或长期记忆。 |
| **Model Context Budget** | 单次 model call 允许进入模型输入视图的估算 token 上限。当前由 `MODEL_CONTEXT_BUDGET_TOKENS` 配置，默认 8000。 |
| **ToolRegistry** | TS Runtime 中管理可用工具的注册表。每次 conversation 冻结 catalog 版本。 |
| **Subagent** | 由父 Agent 在单次工具调用内启动的隔离子智能体。用于处理 `fork_agent: true` 的 Skill 任务；子执行拥有独立 history / trace attribution，父 conversation 只接收最终 summary tool result。 |
| **SubagentDispatcher** | TS Runtime 内负责启动、约束和汇总 Subagent 的组件。它从父 frozen catalog 派生并降级子工具目录，传播父执行 abort / timeout，并汇总 Java 返回的 usage/cost。 |
| **Child Execution Identity** | 子智能体执行的审计身份。与父 `executionId`、`tenantId`、`conversationId`、`toolCallId` 和 skill name 关联，用于 trace attribution；不代表新的顶层用户会话锁。 |
| **Subagent Tool Downgrade** | 子智能体工具权限只能从父执行继承后减少，不能升级。运行时必须移除 Skill `forbidden_tools` 和默认特权元工具，并继续对每个子工具调用执行 `beforeToolUse`。 |
| **Protocol Tool** | Harness 级标准工具。通过 Java catalog 暴露并走 `/api/v1/tools/execute`，用于跨 agent 复用的文件读取、搜索和命令执行等基础能力。 |
| **Tool Workspace** | Protocol Tool 可访问的本地根目录。路径必须 containment 在该目录内，防止读取或执行超出授权范围的文件。 |
| **Output Cap** | Protocol Tool 输出大小上限。超出上限时返回截断标记，避免大结果污染 history 或模型上下文。 |
| **beforeToolUse** | Hook 机制。工具执行前调 Java Policy 评估，决定 ALLOW / DENY / REQUIRE_APPROVAL。 |
| **ask_user** | 当 policy 要求人工审批时，暂停执行等待用户 approve / reject / revise。 |
| **Tool Result Provenance** | 工具结果的信任来源分类。当前只允许 `trusted` / `untrusted`；TS Runtime 用它决定模型可见包裹和后续 policy context。 |
| **Untrusted Tool Output** | 来自外部或未被 Java Enterprise Gateway 直接信任的工具数据。必须作为数据而非指令展示给模型。 |
| **Injection Guard** | TS Runtime + Java Policy 的联合防护：TS 标记并包裹 untrusted tool output，Java 在 untrusted context 后对 sensitive/destructive 工具升级为 REQUIRE_APPROVAL。 |

## Model & Provider

| Term | Definition |
|------|-----------|
| **Provider Adapter** | Java 端适配不同 LLM 提供商（Anthropic、OpenAI-compatible）的抽象层。TS Runtime 不持有 provider API key。 |
| **Model Router** | Java 端根据 `openharness.model-router` 配置把请求 `model` 解析为具体 provider adapter 的服务。未命中显式 route 时使用配置的 default provider，不允许 TS Runtime 或 Frontend 持有 provider key 或直接选择 provider credential。 |
| **Provider Pricing** | Java 端 provider 配置中的可选价格表。按 provider + model 记录 input/output token 的 USD micros / M tokens 单价，用于计算 `costUsdMicros`；缺失价格不阻断模型响应。 |
| **costUsdMicros** | 单次模型响应的估算成本，单位为 USD micros。Java Backend 在 `ModelChatResponse.usage` 中填充，TS Runtime 只透传给 Frontend，不重新计算。 |
| **Mock Model** | 确定性 mock 模型网关，用于测试。通过 `X-Mock-Fixture` header 或 model="mock" 触发。 |
| **Cache Hints** | TS Runtime 计算的缓存提示，告知 provider adapter 哪些 message 前缀可缓存以节省 token。 |
| **PromptRegistry** | TS Runtime 的提示词资产注册表。按 `promptId@version` 解析 system prompt，Java 不得追加或改写 prompt。 |
| **Prompt Template** | 可版本化提示词资产，包含 `promptId`、`version`、`role` 与 `content`。当前只落地 system prompt。 |
| **Prompt Version** | 单次 model call 使用的提示词版本标识，写入 `ModelChatRequest.meta.promptVersion` 供审计和回滚。 |
| **MemoryStore** | TS Runtime 拥有的长期记忆存储接口。按 tenant/user 隔离保存可审计的 memory fact，不替代 MessageHistory，也不由 Java Backend 写入。 |
| **MemoryFact** | 一条可复用长期记忆事实。包含 `memoryId`、tenant/user scope、`content`、`tags`、`createdAt`、`updatedAt`，用于后续 context layer 或离线评测。 |
| **Memory Management API** | TS Runtime 暴露给 operator/dev 的长期记忆管理入口。按请求 header scope 操作 MemoryFact，用于显式 list/search/upsert/delete，不做自动记忆抽取，也不让 Java Backend 写 memory facts。 |
| **Memory Retrieval Layer** | ContextBuilder 的可选输入层。按当前 tenant/user scope 从 MemoryStore 检索相关 MemoryFact，以 system context message 形式加入模型输入视图，并计入 context budget。 |
| **EvalCase** | 离线评测用例。描述一次可重放 agent turn 的输入、scope 与期望结果，不代表真实用户 session。 |
| **EvalReplayHarness** | TS Runtime 的离线评测执行器。用受控 HistoryStore、RuntimeEventStore 和 JavaClient 重放 EvalCase，输出 pass/fail、answer、stopReason 与事件摘要。 |
| **Eval CLI** | TS Runtime 的本地离线评测命令入口。读取 EvalCase JSON/JSONL 文件，逐条调用 EvalReplayHarness，输出机器可读 JSONL 结果和汇总退出码；不代表 frontend 流程、远程服务或生产调度器。 |
| **Eval Fixture** | 项目内用于本地回归的 EvalCase 文件。内容必须是确定性、低成本、可由 mock/deterministic runner 验证的离线用例，不代表生产 benchmark 或真实 provider 评测集。 |

## Persistence & Compression

| Term | Definition |
|------|-----------|
| **JsonFileHistoryStore** | 将 conversation history 持久化为 `data/sessions/{tenantId}/{conversationId}.json` 的实现。 |
| **Compression** | 当 history token 数超过阈值时，将旧消息压缩为 summary，归档原始消息为 chunk MD 文件。 |
| **Chunk** | 被压缩归档的旧消息文件，格式为 `{conversationId}-chunk-{N}.md`。 |
| **estimateTokens** | Token 估算函数。ASCII ÷ 4 + CJK ÷ 1.5。 |
| **shouldCompress** | 判断是否需要压缩的函数。比较 estimateTokens 结果与阈值。 |

## Policy & Security

| Term | Definition |
|------|-----------|
| **Policy** | Java 端的工具执行策略。Prompt 中的 policy 是 hint，hook 中的 policy 是 law。 |
| **Catalog Version / Hash** | 工具目录的版本标识。同一 conversation 内不得静默切换。 |
| **Idempotency** | 工具执行幂等性。基于 `(tenantId, idempotencyKey)` 24h 内去重。 |
| **Service Token** | 服务间认证 token (`Bearer dev-service-token`)。所有 Java API 调用必须携带。 |

## Trace & Observability

| Term | Definition |
|------|-----------|
| **TraceEvent** | 结构化追踪事件。包含 traceId、spanId、eventType 等。TS Runtime 和 Java Backend 都产生。 |
| **X-Trace-Id / X-Request-Id** | 必须在所有服务间调用中透传的追踪标识。 |

## Views

| Term | Definition |
|------|-----------|
| **toApi** | 消息视图：剥离 internal fields（requestId、conversationId 等）后发给 Java model gateway。 |
| **toReplay** | 消息视图：跳过 transient 消息，用于持久化恢复。 |

## Session Management

| Term | Definition |
|------|-----------|
| **Session** | 一个 conversation 的持久化实例。物理上是 `data/sessions/{tenantId}/{conversationId}.json` 文件。逻辑上等同于 conversation。 |
| **Session List** | 某个 tenant 下所有 session 的索引视图。包含 conversationId、title（首条 user message 摘要）、updatedAt。 |
| **Active Session** | Frontend 当前展示和交互的 session。同一时刻只能有一个 active session。 |
| **Session Title** | Session 的展示标题。取首条 user message 的前 30 字符；空 session 显示 "New conversation"。 |

## MCP (Model Context Protocol)

| Term | Definition |
|------|-----------|
| **MCP** | Model Context Protocol — 一个开放协议，让 LLM 应用通过标准化方式访问外部工具/资源服务器。 |
| **MCP Server** | 实现 MCP 协议的进程或服务。提供 tools / resources / prompts。在 OpenHarness 中只关注 tools。 |
| **MCP Client** | 调用 MCP Server 的客户端。在 OpenHarness 中由 TS Runtime 持有（不在 Java 端）。 |
| **MCP Tool** | MCP Server 暴露的工具。区别于 catalog tool（Java 注册的内置工具）。 |
| **stdio Transport** | MCP 通信方式之一：通过子进程的 stdin/stdout JSON-RPC。用于本地工具。 |
| **HTTP Transport** | MCP 通信方式之一：通过 HTTP + SSE。用于远程 MCP server。 |
| **Tool Source** | 工具的来源标记。值为 `catalog`（Java）或 `mcp:{server-name}`。用于路由执行和 policy 评估。 |
| **MCP_DEFAULT** | Java PolicyService 对 MCP 来源工具的默认决策来源标记。当 `source` 以 `mcp:` 开头且不在 `mcpAllowList` 中时，返回 `REQUIRE_APPROVAL`，source 为 `MCP_DEFAULT`。 |
| **mcpAllowList** | PolicyContext 上的可选白名单。每项可匹配工具名（如 `"safe_tool"`）或完整 server source（如 `"mcp:trusted-server"`），命中则将 MCP 工具降级回 ALLOW。配置入口保留给后续 change。 |
| **MCP Registry** | TS Runtime 内的 MCP server 注册表。从 `mcp.json` 加载，启动时连接 server，拉取 tool 列表。 |
