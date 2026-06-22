# openharness — 开发导航台

> 自动生成，请勿直接编辑。数据源：`development-log.json`  
> 最后更新：2026-06-22

## Timeline

### 2026-06-22

- 📦 archived **add-subagent-dispatcher** — 为 fork_agent 技能新增隔离子智能体分发器。子执行使用独立 history/trace attribution，父 Agent 只接收 summary tool result，并强制执行 forbidden_tools 降权、特权元工具过滤、abort/timeout 传播与 usage/cost 归因。
- 📦 archived **add-skill-invocation-sandbox** — 实现自进化技能（Skill）执行沙箱。包含 YAML 元数据解析器、`invoke_skill` 拦截与延迟注入引擎、兼容 Alternating Roles 门禁适配以及商业敏感脚本的 best-effort 物理碎纸销毁机制。
- 📦 archived **add-runtime-cache-stability** — 重构运行时缓存机制以优化 Prompt Cache 命中率并防范资源泄漏。引入策略化双缓存断点、System Prompt 字节级静止与 [session context] 动态注入，并对 Tools Schema 锁定进行内存上限 FIFO 淘汰控制及持久化 transient 隔离。

### 2026-06-18

- 📦 archived **add-agent-definition-model-selection** — 让 selected Agent Definition 的可选 model 成为本轮 Java ModelChatRequest.model 逻辑模型 id；TS Runtime 不持有 provider credentials，也不复制 Java model-router 配置或校验 route 存在性。
- ✅ verified **harden-project-dashboard-validation** — 加固开发导航台 schema 与渲染脚本，新增内置语义校验、生成产物 check 模式、package scripts，并补齐 archived 记录 closeout 闭环。
- 📦 archived **add-agent-definition-observability** — 为 selected Agent Definition 增加 model request metadata 与 TS trace attribution，记录 agentId、promptRef、工具过滤模式和工具名称摘要，便于排查 prompt/tool-filtering 问题。
- 📦 archived **add-agent-definition-tool-filtering** — 让 selected Agent Definition.tools 过滤本轮 model-visible tools，并在模型返回不在定义范围内的 tool call 时于 beforeToolUse/execute 前 fail closed。
- 📦 archived **add-agent-definition-runtime-selection** — 让 sync/stream chat 请求通过可选 agentId 选择已加载的 Agent Definition，将选中定义的 promptRef 传递给 PromptRegistry 驱动 system prompt 解析，未知 agentId 返回 400 拒绝，未知 promptRef 在 Java model call 前 fail closed。
- 📦 archived **add-agent-definition-loader** — 为 TS Runtime 添加本地 JSON Agent Definition Loader，定义 AgentDefinitionSchema 共享契约（agentId、promptRef、tools、model），从 agent-runtime/agents/ 读取 JSON 定义文件，支持 default fallback 和 fail-closed 校验。
- 📦 archived **add-p5e-eval-fixtures** — 为 Eval CLI 添加 canonical deterministic fixture 文件和 smoke script，通过 --mock-answer 模式实现本地 deterministic 验证，不依赖 Java Backend、Frontend 或真实 provider。

### 2026-06-05

- 📦 archived **add-p5d-eval-cli** — 为 TS Runtime 添加本地 Eval CLI，支持从 JSON array 或 JSONL 文件读取 EvalCase fixtures，通过 EvalReplayHarness 顺序 replay，输出 per-case JSONL 结果和 summary，退出码映射 pass/fail 状态。
- 📦 archived **add-p5a-memory-and-eval** — 为 TS Runtime 添加租户/用户隔离的长期记忆存储原语（MemoryStore）和离线 eval replay harness，通过共享 Zod schema 定义 MemoryFact 和 EvalCase 契约，支持 literal search、JSON 持久化、deterministic replay pass/fail 判定。
- 📦 archived **add-p5c-memory-management-api** — P5a/P5b established scoped memory storage and deterministic memory retrieval, but memory facts can only be exercised through internal store APIs and tests. Add an explicit TS Runtime API under /api/v1/memory/facts to list, search, upsert, and delete scoped memory facts.
- ⚠️ partial **add-p5b-memory-context-retrieval** — P5a added scoped long-term memory storage and eval replay, but online agent turns still cannot read memory facts. Add a deterministic memory retrieval layer in the Agent Runtime context builder.
- ⚠️ partial **add-p4c-tool-protocol** — OpenHarness tool catalog currently exposes business tools only. Add a tool protocol classification to shared ToolDefinition, add Java catalog entries for read_file, search, and run_command with bounded output and workspace path containment.
- ⚠️ partial **add-p4b-prompt-registry** — Agent Runtime currently sends conversation messages without a versioned system prompt owned by the harness. Add a TS Runtime prompt registry with versioned prompt templates.
- 📦 archived **add-p4a-context-builder** — Model calls currently use the full stable conversation history and only apply cache hints after that selection. Add an Agent Runtime ContextBuilder that constructs model-call messages from explicit layers with configurable token budget.
- 📦 archived **add-p3d-injection-guard** — Tool results are currently serialized directly into model-visible role:tool messages. Add tool result provenance, boundary wrapping, and policy escalation for untrusted tool output.
- 📦 archived **add-p3b-cost-and-router** — 当前 Java ModelGatewayController 对所有请求使用硬编码的单一 provider。新增 ModelRouter 配置段支持按 model 名称映射 to provider，填充 costUsdMicros 字段以支持 per-tenant 计费和预算告警。

### 2026-06-04

- ⚠️ partial **add-execution-lifecycle-and-stream-recovery** — 当前 Agent Runtime SSE 路径在多个稳定性维度上存在 gap，根因是 HTTP 连接生命周期与 agent execution 生命周期被错误耦合。解决断线恢复、审批不可恢复、HistoryStore 污染、同会话并发未定义、terminal 错误不可观测等 6 类问题。

### 2026-05-25

- ⚠️ partial **add-p3c-policy-mcp-aware** — P2a 集成 MCP 后引入安全 gap：Java PolicyService 对未知工具默认返回 ALLOW，MCP 工具因不在 Java catalog 中永远落入默认放行分支。让 evaluatePolicy 接受工具来源信号，针对 MCP 来源工具改变默认决策为 REQUIRE_APPROVAL。
- ⚠️ partial **add-p3a-multi-step-loop** — 当前 AgentLoop.run() 与 AgentStreamLoop.stream() 都写死成两步形状，与 Claude Code 式多轮工具循环不兼容。将固定序列替换为 while 循环，支持多步 model→policy→tools→回灌直到 model 不再产生 toolCalls 或 budget 耗尽。
- ⚠️ partial **add-p2c-auto-compress** — Agent loop 在每次 final answer 后自动检查 token 阈值并触发压缩，补全 P1b 的最后一环。
- ⚠️ partial **add-p2b-session-list** — 为 Frontend 增加多会话管理：列出 / 切换 / 删除 / 新建 session。
- ⚠️ partial **add-p2a-mcp** — 让 TS Agent Runtime 通过 MCP (Model Context Protocol) 集成外部工具服务器，扩展可用工具集而不增加 Java backend 的工具注册负担。
- ⚠️ partial **add-p1b-persistence** — P0a/P0b 的 MessageHistory 是纯内存的，进程重启即丢失。生产环境需要持久化以支持长会话、多实例部署和故障恢复。同时引入 Insert-then-Compress 策略在后台压缩历史。
- ⚠️ partial **add-p1a-provider-adapter** — P0b 使用 SenseNova 硬编码调用。P1a 需要正式的 provider adapter 抽象，支持多 provider 切换（OpenAI-compatible / Anthropic），实现 cache hints 跨边界协议，并在 trace 中落地 cost/token 字段。
- ⚠️ partial **implement-p0b-hookable** — P0a 已验证双运行时边界和同步 agent loop。P0b 需要把 beforeToolUse hook、policy evaluate、SSE 流式、ask_user 审批流接上，使 harness 具备真正的不可绕过安全能力。
- ⚠️ partial **implement-p0a-skeleton** — OpenHarness needs a runnable first slice that proves the frozen architecture boundary across Frontend, TypeScript Agent Runtime, Java Spring Boot Backend, and shared contracts. Establish the monorepo skeleton and deterministic mock behavior.

## Feature Matrix

| 功能点 | 状态 | Spec | Plan | Code | Tests | Closeout |
|---|---|---|---|---|---|---|
| add-subagent-dispatcher | 📦 archived | agent-loop, agent-runtime | [plan](docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md) | 3 files | 3 files | [closeout](docs/design/2026-06-22-add-subagent-dispatcher-closeout.md) |
| add-skill-invocation-sandbox | 📦 archived | agent-loop, provider-adapter | [plan](docs/superpowers/plans/2026-06-22-add-skill-invocation-sandbox.md) | 7 files | 5 files | [closeout](docs/design/2026-06-22-add-skill-invocation-sandbox-closeout.md) |
| add-runtime-cache-stability | 📦 archived | cache-hints, context-builder, prompt-registry, agent-runtime | [plan](docs/superpowers/plans/2026-06-22-add-runtime-cache-stability.md) | 7 files | 3 files | [closeout](docs/design/2026-06-22-add-runtime-cache-stability-closeout.md) |
| add-agent-definition-model-selection | 📦 archived | agent-definition | [plan](docs/superpowers/plans/2026-06-18-add-agent-definition-model-selection.md) | 1 files | 1 files | [closeout](docs/design/2026-06-18-add-agent-definition-model-selection-closeout.md) |
| harden-project-dashboard-validation | ✅ verified | — | — | 9 files | — | [closeout](docs/design/2026-06-18-project-dashboard-hardening.md) |
| add-agent-definition-observability | 📦 archived | agent-definition, agent-runtime, shared-schema | [plan](docs/superpowers/plans/2026-06-18-add-agent-definition-observability.md) | 3 files | 2 files | [closeout](docs/design/2026-06-18-add-agent-definition-observability-closeout.md) |
| add-agent-definition-tool-filtering | 📦 archived | agent-definition, mcp-tools | [plan](docs/superpowers/plans/2026-06-18-add-agent-definition-tool-filtering.md) | 1 files | 1 files | [closeout](docs/design/2026-06-18-add-agent-definition-tool-filtering-closeout.md) |
| add-agent-definition-runtime-selection | 📦 archived | agent-definition, prompt-registry | [plan](docs/superpowers/plans/2026-06-18-add-agent-definition-runtime-selection.md) | 5 files | 1 files | [closeout](docs/design/2026-06-18-add-agent-definition-runtime-selection-closeout.md) |
| add-agent-definition-loader | 📦 archived | agent-definition | [plan](docs/superpowers/plans/2026-06-18-add-agent-definition-loader.md) | 4 files | 3 files | [closeout](docs/design/2026-06-18-add-agent-definition-loader-closeout.md) |
| add-p5e-eval-fixtures | 📦 archived | eval-replay | [plan](docs/superpowers/plans/2026-06-05-add-p5e-eval-fixtures.md) | 3 files | 1 files | [closeout](docs/design/2026-06-18-add-p5e-eval-fixtures-closeout.md) |
| add-p5d-eval-cli | 📦 archived | eval-replay | [plan](docs/superpowers/plans/2026-06-05-add-p5d-eval-cli.md) | 2 files | 1 files | [closeout](docs/design/2026-06-05-add-p5d-eval-cli-closeout.md) |
| add-p5a-memory-and-eval | 📦 archived | eval-replay, long-term-memory, shared-schema | [plan](docs/superpowers/plans/2026-06-05-add-p5a-memory-and-eval.md) | 3 files | 3 files | [closeout](docs/design/2026-06-05-add-p5a-memory-and-eval-closeout.md) |
| add-p5c-memory-management-api | 📦 archived | long-term-memory, shared-schema | [plan](docs/superpowers/plans/2026-06-05-add-p5c-memory-management-api.md) | 3 files | 2 files | [closeout](docs/design/2026-06-05-add-p5c-memory-management-api-closeout.md) |
| add-p5b-memory-context-retrieval | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-06-05-add-p5b-memory-context-retrieval.md) | — | — | — |
| add-p4c-tool-protocol | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-06-05-add-p4c-tool-protocol.md) | — | — | — |
| add-p4b-prompt-registry | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-06-05-add-p4b-prompt-registry.md) | — | — | — |
| add-p4a-context-builder | 📦 archived | agent-runtime, context-builder, shared-schema | [plan](docs/superpowers/plans/2026-06-05-add-p4a-context-builder.md) | 4 files | 3 files | [closeout](docs/design/2026-06-05-add-p4a-context-builder-closeout.md) |
| add-p3d-injection-guard | 📦 archived | agent-runtime, policy-evaluate, shared-schema | [plan](docs/superpowers/plans/2026-06-05-add-p3d-injection-guard.md) | 6 files | 4 files | [closeout](docs/design/2026-06-05-add-p3d-injection-guard-closeout.md) |
| add-p3b-cost-and-router | 📦 archived | provider-adapter | [plan](docs/superpowers/plans/2026-06-05-add-p3b-cost-and-router.md) | 6 files | 3 files | [closeout](docs/design/2026-06-05-add-p3b-cost-and-router-closeout.md) |
| add-execution-lifecycle-and-stream-recovery | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-25-add-execution-lifecycle-and-stream-recovery-phase-1.md) | — | — | — |
| add-p3c-policy-mcp-aware | ⚠️ partial | — | — | — | — | — |
| add-p3a-multi-step-loop | ⚠️ partial | — | — | — | — | — |
| add-p2c-auto-compress | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-25-add-p2c-auto-compress.md) | — | — | — |
| add-p2b-session-list | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-25-add-p2b-session-list.md) | — | — | — |
| add-p2a-mcp | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-25-add-p2a-mcp.md) | — | — | — |
| add-p1b-persistence | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-22-add-p1b-persistence.md) | — | — | — |
| add-p1a-provider-adapter | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-20-add-p1a-provider-adapter.md) | — | — | — |
| implement-p0b-hookable | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-20-implement-p0b-hookable.md) | — | — | — |
| implement-p0a-skeleton | ⚠️ partial | — | [plan](docs/superpowers/plans/2026-05-20-implement-p0a-skeleton.md) | — | — | — |

## Bug 定位索引（按 Tag）

### agent-definition

- 📦 archived add-agent-definition-model-selection
- 📦 archived add-agent-definition-observability
- 📦 archived add-agent-definition-tool-filtering
- 📦 archived add-agent-definition-runtime-selection
- 📦 archived add-agent-definition-loader

### agent-loader

- 📦 archived add-agent-definition-loader

### agent-loop

- ⚠️ partial add-p3a-multi-step-loop

### agent-runtime

- 📦 archived add-runtime-cache-stability
- 📦 archived add-agent-definition-model-selection
- 📦 archived add-agent-definition-observability
- 📦 archived add-agent-definition-tool-filtering
- 📦 archived add-agent-definition-runtime-selection
- 📦 archived add-agent-definition-loader
- 📦 archived add-p5e-eval-fixtures
- 📦 archived add-p5d-eval-cli
- 📦 archived add-p5a-memory-and-eval
- 📦 archived add-p5c-memory-management-api
- ⚠️ partial add-p5b-memory-context-retrieval
- ⚠️ partial add-p4b-prompt-registry
- 📦 archived add-p4a-context-builder
- 📦 archived add-p3d-injection-guard
- ⚠️ partial add-execution-lifecycle-and-stream-recovery
- ⚠️ partial add-p3a-multi-step-loop
- ⚠️ partial add-p2c-auto-compress
- ⚠️ partial add-p2b-session-list
- ⚠️ partial add-p2a-mcp
- ⚠️ partial add-p1b-persistence
- ⚠️ partial add-p1a-provider-adapter
- ⚠️ partial implement-p0b-hookable
- ⚠️ partial implement-p0a-skeleton

### api

- 📦 archived add-p5c-memory-management-api

### architecture

- ⚠️ partial implement-p0a-skeleton

### ask-user

- ⚠️ partial implement-p0b-hookable

### auto-compress

- ⚠️ partial add-p2c-auto-compress

### backend

- ⚠️ partial add-p4c-tool-protocol
- 📦 archived add-p3b-cost-and-router
- ⚠️ partial add-p3c-policy-mcp-aware
- ⚠️ partial add-p1a-provider-adapter
- ⚠️ partial implement-p0b-hookable
- ⚠️ partial implement-p0a-skeleton

### cache-hints

- ⚠️ partial add-p1a-provider-adapter

### cache-stability

- 📦 archived add-runtime-cache-stability

### context-builder

- ⚠️ partial add-p5b-memory-context-retrieval
- 📦 archived add-p4a-context-builder

### context-compression

- ⚠️ partial add-p2c-auto-compress
- ⚠️ partial add-p1b-persistence

### context-retrieval

- ⚠️ partial add-p5b-memory-context-retrieval

### cost

- 📦 archived add-p3b-cost-and-router

### cost-attribution

- 📦 archived add-subagent-dispatcher

### deferred-injection

- 📦 archived add-skill-invocation-sandbox

### dispatcher

- 📦 archived add-subagent-dispatcher

### eval-cli

- 📦 archived add-p5e-eval-fixtures
- 📦 archived add-p5d-eval-cli

### eval-fixtures

- 📦 archived add-p5e-eval-fixtures

### eval-replay

- 📦 archived add-p5e-eval-fixtures
- 📦 archived add-p5d-eval-cli
- 📦 archived add-p5a-memory-and-eval

### execution-lifecycle

- ⚠️ partial add-execution-lifecycle-and-stream-recovery

### frontend

- ⚠️ partial add-p2b-session-list
- ⚠️ partial implement-p0a-skeleton

### hookable

- ⚠️ partial implement-p0b-hookable

### injection-guard

- 📦 archived add-p3d-injection-guard

### isolation

- 📦 archived add-subagent-dispatcher

### long-term-memory

- 📦 archived add-p5a-memory-and-eval
- 📦 archived add-p5c-memory-management-api
- ⚠️ partial add-p5b-memory-context-retrieval

### mcp

- ⚠️ partial add-p3c-policy-mcp-aware
- ⚠️ partial add-p2a-mcp

### mcp-tools

- 📦 archived add-agent-definition-tool-filtering

### memory

- ⚠️ partial add-p5b-memory-context-retrieval

### memory-management

- 📦 archived add-p5c-memory-management-api

### memory-store

- 📦 archived add-p5a-memory-and-eval

### message-history

- ⚠️ partial add-p1b-persistence

### model-router

- 📦 archived add-agent-definition-model-selection
- 📦 archived add-p3b-cost-and-router

### model-selection

- 📦 archived add-agent-definition-model-selection

### monorepo

- ⚠️ partial implement-p0a-skeleton

### multi-step

- ⚠️ partial add-p3a-multi-step-loop

### observability

- 📦 archived add-agent-definition-observability

### p0

- ⚠️ partial implement-p0b-hookable
- ⚠️ partial implement-p0a-skeleton

### p1

- ⚠️ partial add-p1b-persistence
- ⚠️ partial add-p1a-provider-adapter

### p2

- ⚠️ partial add-p2c-auto-compress
- ⚠️ partial add-p2b-session-list
- ⚠️ partial add-p2a-mcp

### p3

- 📦 archived add-p3d-injection-guard
- 📦 archived add-p3b-cost-and-router
- ⚠️ partial add-p3c-policy-mcp-aware
- ⚠️ partial add-p3a-multi-step-loop

### p4

- ⚠️ partial add-p4c-tool-protocol
- ⚠️ partial add-p4b-prompt-registry
- 📦 archived add-p4a-context-builder

### p5

- 📦 archived add-p5c-memory-management-api
- ⚠️ partial add-p5b-memory-context-retrieval

### persistence

- ⚠️ partial add-p1b-persistence

### policy

- 📦 archived add-p3d-injection-guard
- ⚠️ partial add-p3c-policy-mcp-aware
- ⚠️ partial implement-p0b-hookable

### project-dashboard

- ✅ verified harden-project-dashboard-validation

### prompt-cache

- 📦 archived add-runtime-cache-stability

### prompt-registry

- 📦 archived add-agent-definition-runtime-selection
- ⚠️ partial add-p4b-prompt-registry

### provider-adapter

- 📦 archived add-p3b-cost-and-router
- ⚠️ partial add-p1a-provider-adapter

### renderer

- ✅ verified harden-project-dashboard-validation

### runtime-selection

- 📦 archived add-agent-definition-runtime-selection

### sandbox

- 📦 archived add-skill-invocation-sandbox

### schema

- ✅ verified harden-project-dashboard-validation

### security

- 📦 archived add-p3d-injection-guard
- ⚠️ partial add-p3c-policy-mcp-aware
- ⚠️ partial implement-p0b-hookable

### session-context

- 📦 archived add-runtime-cache-stability

### session-management

- ⚠️ partial add-p2b-session-list

### shared-schema

- 📦 archived add-agent-definition-observability
- 📦 archived add-agent-definition-loader
- 📦 archived add-p5a-memory-and-eval
- 📦 archived add-p5c-memory-management-api
- ⚠️ partial add-p4c-tool-protocol
- ⚠️ partial add-p4b-prompt-registry
- 📦 archived add-p4a-context-builder
- 📦 archived add-p3d-injection-guard
- ⚠️ partial implement-p0a-skeleton

### shredder

- 📦 archived add-skill-invocation-sandbox

### skeleton

- ⚠️ partial implement-p0a-skeleton

### skills

- 📦 archived add-subagent-dispatcher
- 📦 archived add-skill-invocation-sandbox

### sse

- ⚠️ partial add-execution-lifecycle-and-stream-recovery
- ⚠️ partial implement-p0b-hookable

### stability

- ⚠️ partial add-execution-lifecycle-and-stream-recovery

### stream-recovery

- ⚠️ partial add-execution-lifecycle-and-stream-recovery

### subagent

- 📦 archived add-subagent-dispatcher

### tool-catalog

- ⚠️ partial add-p4c-tool-protocol

### tool-filtering

- 📦 archived add-agent-definition-tool-filtering

### tool-integration

- ⚠️ partial add-p2a-mcp

### tool-protocol

- ⚠️ partial add-p4c-tool-protocol

### tool-registry

- 📦 archived add-agent-definition-tool-filtering

### tooling

- ✅ verified harden-project-dashboard-validation

### trace

- 📦 archived add-agent-definition-observability

### validation

- ✅ verified harden-project-dashboard-validation

## Next Work Queue

### 推荐下一步

- 真实 Java Gateway 联调与 trace tree 视图优化 _(from add-subagent-dispatcher)_
- 按独立 OpenSpec 评估子智能体系统级隔离能力 _(from add-subagent-dispatcher)_
- 如需更细粒度成本归因，扩展 token usage 聚合契约 _(from add-subagent-dispatcher)_
- 隔离子智能体分发器实施 (add-subagent-dispatcher) _(from add-skill-invocation-sandbox)_
- 原地同模型热压缩 (ITC) 实施 (add-internal-context-compression) _(from add-skill-invocation-sandbox)_
- 自进化技能（Skill）执行沙箱实施 (add-skill-invocation-sandbox) _(from add-runtime-cache-stability)_
- 隔离子智能体（Subagent）分发器实施 (add-subagent-dispatcher) _(from add-runtime-cache-stability)_
- 原地同模型热压缩 (ITC) 实施 (add-internal-context-compression) _(from add-runtime-cache-stability)_
- No active work remains for model selection _(from add-agent-definition-model-selection)_
- Future SDK/UI/YAML/CRUD/hot reload/tenant dynamic definitions require separate OpenSpec changes _(from add-agent-definition-model-selection)_
- Optionally wire pnpm dashboard:check into CI _(from harden-project-dashboard-validation)_
- Optionally add fixture tests for invalid dashboard data cases _(from harden-project-dashboard-validation)_
- Frontend display for selected agent / tool filtering summary (separate OpenSpec change) _(from add-agent-definition-observability)_
- AgentDefinition.model provider/model routing (separate OpenSpec change) _(from add-agent-definition-observability)_
- YAML support _(from add-agent-definition-observability)_
- SDK _(from add-agent-definition-observability)_
- remote CRUD _(from add-agent-definition-observability)_
- hot reload _(from add-agent-definition-observability)_
- tenant-scoped dynamic definitions _(from add-agent-definition-observability)_
- audit metadata/trace attributes for selected tool list (separate OpenSpec change) _(from add-agent-definition-tool-filtering)_
- YAML support _(from add-agent-definition-tool-filtering)_
- SDK _(from add-agent-definition-tool-filtering)_
- Frontend UI _(from add-agent-definition-tool-filtering)_
- remote CRUD _(from add-agent-definition-tool-filtering)_
- hot reload _(from add-agent-definition-tool-filtering)_
- tenant-scoped dynamic definitions _(from add-agent-definition-tool-filtering)_
- tools allow-list enforcement via ToolRegistry filtering (new OpenSpec change) _(from add-agent-definition-runtime-selection)_
- YAML support _(from add-agent-definition-runtime-selection)_
- SDK _(from add-agent-definition-runtime-selection)_
- UI _(from add-agent-definition-runtime-selection)_
- remote CRUD _(from add-agent-definition-runtime-selection)_
- hot reload _(from add-agent-definition-runtime-selection)_
- tenant-scoped dynamic definitions _(from add-agent-definition-runtime-selection)_
- tools allow-list enforcement via ToolRegistry/PolicyContext (new OpenSpec change) _(from add-agent-definition-loader)_
- YAML support _(from add-agent-definition-loader)_
- SDK package _(from add-agent-definition-loader)_
- Agent Definition API/UI _(from add-agent-definition-loader)_
- tenant-scoped dynamic definitions _(from add-agent-definition-loader)_
- CI pipeline wiring _(from add-p5e-eval-fixtures)_
- production benchmark _(from add-p5e-eval-fixtures)_
- dashboard _(from add-p5e-eval-fixtures)_
- real-provider eval _(from add-p5e-eval-fixtures)_
- eval fixtures and smoke script (P5e) _(from add-p5d-eval-cli)_
- CI pipeline wiring _(from add-p5d-eval-cli)_
- real-provider evals with credentials/cost controls _(from add-p5d-eval-cli)_
- vector database retrieval _(from add-p5a-memory-and-eval)_
- online memory injection into ContextBuilder _(from add-p5a-memory-and-eval)_
- memory context retrieval (P5b) _(from add-p5a-memory-and-eval)_
- memory management API (P5c) _(from add-p5a-memory-and-eval)_
- Online memory context building and retrieval (P5b) _(from add-p5c-memory-management-api)_
- Embedding and vector search integrations _(from add-p5c-memory-management-api)_
- Vector search engine retrieval integration _(from add-p4a-context-builder)_
- Online memory retrieval and injection (P5b) _(from add-p4a-context-builder)_
- Audit metadata/trace attributes for injection guard state _(from add-p3d-injection-guard)_
- Add dynamic MCP-tool permission configurations _(from add-p3d-injection-guard)_
- Operator budgets and daily rate limits enforcement _(from add-p3b-cost-and-router)_
- Logical intent based logical routing mappings _(from add-p3b-cost-and-router)_

### 暂不建议

- 容器化或进程级沙箱隔离 _(from add-subagent-dispatcher)_
- 公开外联子 Agent API 或 UI _(from add-subagent-dispatcher)_
- TS Runtime 接管 provider credential 或 Java model router _(from add-subagent-dispatcher)_
- 子智能体分发器 (Subagent Dispatcher)，已移至 add-subagent-dispatcher _(from add-skill-invocation-sandbox)_
- 公开子 Agent API / SDK / UI _(from add-skill-invocation-sandbox)_
- 容器级或系统级沙箱隔离 _(from add-skill-invocation-sandbox)_
- Provider Adapter alternating roles 门禁适配（本 change 收窄移至后续 change） _(from add-runtime-cache-stability)_
- 原地同模型热压缩 (ITC) _(from add-runtime-cache-stability)_
- 子智能体分发器 (Subagent Dispatcher) _(from add-runtime-cache-stability)_
- Java model router implementation changes _(from add-agent-definition-model-selection)_
- Provider credential handling in TS Runtime or Frontend _(from add-agent-definition-model-selection)_
- TS-side Java route existence validation _(from add-agent-definition-model-selection)_
- SDK changes _(from add-agent-definition-model-selection)_
- Frontend UI _(from add-agent-definition-model-selection)_
- YAML support _(from add-agent-definition-model-selection)_
- Remote CRUD APIs _(from add-agent-definition-model-selection)_
- Hot reload _(from add-agent-definition-model-selection)_
- Tenant-scoped dynamic definitions _(from add-agent-definition-model-selection)_
- Cross-project dashboard template extraction _(from harden-project-dashboard-validation)_
- Business runtime behavior changes _(from harden-project-dashboard-validation)_
- CI workflow changes _(from harden-project-dashboard-validation)_
- YAML support _(from add-agent-definition-observability)_
- SDK changes _(from add-agent-definition-observability)_
- Frontend UI _(from add-agent-definition-observability)_
- Remote CRUD APIs _(from add-agent-definition-observability)_
- Hot reload _(from add-agent-definition-observability)_
- Tenant-scoped dynamic definitions _(from add-agent-definition-observability)_
- Java model router or AgentDefinition.model enforcement _(from add-agent-definition-observability)_
- Java policy changes _(from add-agent-definition-observability)_
- Java Tool Catalog changes _(from add-agent-definition-observability)_
- Model-visible message changes _(from add-agent-definition-observability)_
- Java policy changes _(from add-agent-definition-tool-filtering)_
- Java Tool Catalog changes _(from add-agent-definition-tool-filtering)_
- MCP server configuration or mcpAllowList changes _(from add-agent-definition-tool-filtering)_
- YAML support _(from add-agent-definition-tool-filtering)_
- SDK changes _(from add-agent-definition-tool-filtering)_
- Frontend UI _(from add-agent-definition-tool-filtering)_
- Remote CRUD APIs _(from add-agent-definition-tool-filtering)_
- Hot reload _(from add-agent-definition-tool-filtering)_
- Tenant-scoped dynamic definitions _(from add-agent-definition-tool-filtering)_
- Java model router or AgentDefinition.model enforcement _(from add-agent-definition-tool-filtering)_
- Tool allow-list enforcement / filtering _(from add-agent-definition-runtime-selection)_
- YAML support _(from add-agent-definition-runtime-selection)_
- SDK changes _(from add-agent-definition-runtime-selection)_
- Frontend UI _(from add-agent-definition-runtime-selection)_
- Remote CRUD APIs _(from add-agent-definition-runtime-selection)_
- Hot reload _(from add-agent-definition-runtime-selection)_
- Tenant-scoped dynamic definitions _(from add-agent-definition-runtime-selection)_
- Java model router changes or model hint enforcement _(from add-agent-definition-runtime-selection)_
- YAML support _(from add-agent-definition-loader)_
- SDK package _(from add-agent-definition-loader)_
- Frontend UI _(from add-agent-definition-loader)_
- Remote CRUD APIs _(from add-agent-definition-loader)_
- Hot reload _(from add-agent-definition-loader)_
- Tenant-scoped dynamic definitions _(from add-agent-definition-loader)_
- CI workflow files _(from add-p5e-eval-fixtures)_
- dashboards _(from add-p5e-eval-fixtures)_
- production benchmark datasets _(from add-p5e-eval-fixtures)_
- fixture auto-discovery _(from add-p5e-eval-fixtures)_
- real-provider evals _(from add-p5e-eval-fixtures)_
- frontend eval UI _(from add-p5d-eval-cli)_
- remote eval service _(from add-p5d-eval-cli)_
- production scheduler _(from add-p5d-eval-cli)_
- benchmark dashboard _(from add-p5d-eval-cli)_
- automatic fixture discovery _(from add-p5d-eval-cli)_
- persistent eval history _(from add-p5d-eval-cli)_
- vector database retrieval _(from add-p5a-memory-and-eval)_
- online memory injection into ContextBuilder _(from add-p5a-memory-and-eval)_
- frontend UI _(from add-p5a-memory-and-eval)_
- production eval service _(from add-p5a-memory-and-eval)_
- embeddings _(from add-p5a-memory-and-eval)_
- automatic memory extraction _(from add-p5a-memory-and-eval)_
- LLM autonomous memory extraction _(from add-p5c-memory-management-api)_
- Frontend management UI implementation _(from add-p5c-memory-management-api)_
- Java Backend storage sync/write access _(from add-p5c-memory-management-api)_
- Auto-compress chunk archive logic refactoring _(from add-p4a-context-builder)_
- Cache-hits matcher algorithm modifications _(from add-p4a-context-builder)_
- Prompt-injection neural classifier integration _(from add-p3d-injection-guard)_
- Certificate-based multi-tier trust registries _(from add-p3d-injection-guard)_
- Frontend approval visual enhancements _(from add-p3d-injection-guard)_
- Java ModelRouter dynamic config hot reload _(from add-p3b-cost-and-router)_
- TS Runtime direct model routing configurations _(from add-p3b-cost-and-router)_
