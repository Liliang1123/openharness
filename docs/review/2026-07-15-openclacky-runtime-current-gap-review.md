# OpenHarness Runtime 对齐 OpenClacky 当前差距复核

## 结论

有风险：截至 2026-07-15，OpenHarness Agent Runtime 的单节点生产 v1 主体能力已经成形，Stage 1 / Gate B 已闭环，但 active OpenSpec change 仍为 `19/31`，剩余 12 项集中在真实 Provider Gate C、正式 24 小时 Gate D、全量验证、合同冻结与归档。因此，当前最优先事项仍是完成 Runtime v1 生产收口，而不是直接进入 OpenClacky 全功能 parity 实现。

若把问题限定为“Runtime 核心能力对齐 OpenClacky”，OpenHarness 主要还缺六组能力：

1. MCP stable-schema Broker、VirtualSkill、lazy startup 与 idle reaper；
2. Insert-then-Compress、一致的 frozen prompt/cache marker、idle compression 与缓存成本可观测性；
3. 企业级 Tool Worker/Sandbox 执行域，以及 write/edit/diff、glob/grep、PTY shell、trash、web/browser、todo/feedback、media 等工具；
4. Provider/BYOK 配置、模型切换与 fallback/circuit-breaker/capability registry，以及 fake tool-call/参数/截断恢复；
5. Session Registry v2、fork/trash/export、Time Machine/snapshot/rollback；
6. Skill 创建、版本、安装、反思/演进、Extension 与 Control Plane 治理。

CLI/Rich terminal UI、完整 Web Console、IM Channels、Scheduler、Desktop installer、Marketplace 等属于产品壳与生态 parity，不应误判为当前 Runtime v1 的发布阻塞项。

## Review 范围

### OpenHarness 当前事实

- [OpenHarness parity worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap)
- [active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Gate B reconciliation review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-stage0-gate-b-total-reconciliation-review.md)
- [Gate C Zhipu real-runner report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json)
- [Gate C real-runner blocked review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-zhipu-openai-compatible-real-runner-attempt-01-blocked-review.md)
- [formal soak runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [OpenHarness tool registry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/toolRegistry.ts)
- [OpenHarness MCP registry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/mcpRegistry.ts)
- [OpenHarness cache hints](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/cacheHints.ts)
- [OpenHarness compression](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/compression.ts)
- [OpenHarness subagent dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/subagent/dispatcher.ts)
- [OpenHarness Java tool catalog](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/CatalogService.java)
- [OpenHarness frontend](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/frontend/src)
- [development dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

### OpenClacky 对标基线

- [OpenClacky repository](file:///Users/elvis/file/develop/opensource/openclacky)
- [OpenClacky README](file:///Users/elvis/file/develop/opensource/openclacky/README.md)
- [OpenClacky Agent components](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/agent)
- [OpenClacky MCP components](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/mcp)
- [OpenClacky tools](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/tools)
- [OpenClacky server components](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/server)
- [OpenClacky extensions](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/extension)
- [OpenClacky parsers](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/default_parsers)
- [既有 Runtime comparison review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-openclacky-openharness-runtime-comparison-review.md)
- [既有 parity coverage review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-openclacky-parity-plan-coverage-review.md)
- [修订后的 parity development backlog](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-openclacky-runtime-parity-development-backlog-final-plan.md)

OpenClacky 对比使用已提交的 `main` HEAD `1d0b08b5177bd249c8d46d6b4e97ec68d9e0af0b`（2026-07-09）。其工作区现有 [.clackyrules](file:///Users/elvis/file/develop/opensource/openclacky/.clackyrules) 修改和未跟踪的 [requirement](file:///Users/elvis/file/develop/opensource/openclacky/requirement) 未纳入基线。

## 主要发现

### P0 — 当前 Runtime v1 还差的 12 项

`npx openspec list` 的现场结果为 `harden-agent-runtime-single-node-production 19/31 tasks`。剩余项不是 12 个互相独立的新功能，可归并为六个收口包：

| 收口包 | 对应 task | 当前状态与缺口 |
| --- | --- | --- |
| Gate C：OpenAI-compatible 真实资格验证 | 3.1、3.5 | 最新 production report 共 13 个 required rows：sync、stream、usage、cost、redaction 5 PASS；single/multi-step tool call、structured arguments、reasoning、503 retry、timeout、cancellation、terminal error 8 BLOCKED。阻塞原因是没有获授权的 provider-backed fixture/capability，不是已观察到的 FAIL。只有证据暴露真实合同缺口时才进入 3.5 修复。 |
| Anthropic 后置资格验证 | 3.2 | 明确 deferred / post-Gate-C；缺 Anthropic credential 不得阻塞 Gate C，也不得因 OpenAI-compatible PASS 而宣称 Anthropic 已生产合格。 |
| Gate C strict security/integration | 3.6 | Java sandbox 与 MCP 已完成真实/本地固定矩阵，但必须等 Gate C required OpenAI-compatible rows 闭合后再过 Stage 2 总门。 |
| Gate D 正式 24 小时生产负载 | 4.2、4.3 | 仍需真实运行 20 concurrent executions、10,000 conversations、60/20/15/5 workload、30 秒采样，并在第 2/12/22 小时做 TS Runtime restart；现有 24 小时 local database/sampler baseline 不能替代。还需证明零跨租户泄漏、Runtime 重复副作用、存储损坏、事件乱序和无界资源增长。 |
| 发布冻结 | 4.5、4.6 | 仍需全量 TypeScript、Java、integration、OpenSpec、dashboard、security 与 production qualification；随后冻结 Runtime v1 service/persistence contracts。 |
| Closeout | 5.1–5.4 | 按证据核对 task、dashboard `verified`、review/closeout、archive，再把 dashboard 更新为 `archived`。当前 dashboard 仍为 `proposed`。 |

因此，近期“还差什么”的最短答案是：**Gate C 的 8 个 required blocked rows、Gate C 总门、Gate D 真跑与不变量验证、全量门禁、合同冻结、closeout/archive。**

### P1 — 对齐 OpenClacky 的核心 Runtime 能力差距

| 能力域 | OpenHarness 当前已有 | 对齐 OpenClacky 仍缺 | 判断 |
| --- | --- | --- | --- |
| 持久化与恢复 | SQLite 单一 authority、WAL/UoW、租户/用户/会话作用域、execution/approval/event/memory、replay/reconcile/outbox、Gate B 实证 | Session fork、trash/export/download、topic index、snapshot/rollback/Time Machine | OpenHarness 生产控制面更强；补产品会话能力，不应改回文件会话权威。 |
| Provider Runtime | OpenAI-compatible 与 Anthropic adapter、usage/cost、reasoning、retry/timeout/cancel/redaction qualification harness | BYOK/模型配置面、运行中切模、provider capability registry、健康探测、fallback/circuit breaker、Bedrock 兼容；fake tool-call、arguments/truncation/context-overflow 恢复 | 先完成 Gate C，再独立 OpenSpec 扩展；不得把“支持兼容 API”误报为完整 Provider parity。 |
| MCP | real stdio lifecycle、catalog merge、approval/failure isolation/cancel/shutdown qualification | stable model-visible schema、VirtualSkill/token isolation、按需启动、idle reaper、集中 policy/secret/health/audit broker | 当前 MCP tools 直接合并进 frozen catalog，工具量和 schema 会进入主上下文；这是最高优先级架构差距之一。 |
| Compression/cache | token threshold compression、chunk archive、double/adaptive cache hints | Insert-then-Compress 的一致语义、frozen prompt/cache markers、idle auto-compression/prewarm、cache hit/input-output/cache-write accounting 与 UI | 已有组件但语义未达 parity；应先修一致性，再加 idle/cost UI。 |
| Tool execution domain | Java sandbox、policy、approval、idempotency、timeout/cancel、trace；基础 `read_file`、`search`、allow-listed `run_command` | 独立高风险 Worker、artifact/preview/diff/rollback；write/edit、glob/grep、PTY persistent/background shell、safe-rm/trash、web search/fetch、browser、todo/feedback、media | 这是最大“任务完成能力”缺口；必须先建企业执行域，再扩工具，不能把高风险工具塞进 Runtime 主进程。 |
| Skill/Subagent | `invoke_skill`、Skill loader/shredder/capability、隔离 subagent、policy 与成本聚合/trace | browse/install/version/permission/signature/index，自然语言创建、reflection/self-evolution、受控 extensions/hooks、marketplace/distribution | 基础调度已具备，缺生命周期与治理；self-evolution 必须有审批和版本边界。 |
| Cost/telemetry | model/subagent `costUsdMicros`、trace/progress、qualification cost oracle | session/cache/compression/tool/media 全链路归属、成本面板、cache economics | 有底层字段，无完整经济性闭环。 |

### P2 — 产品壳与生态差距

这些能力在 OpenClacky 已有实现或明确产品入口，但不属于当前 Runtime v1 closeout：

- Product CLI 与 Rich terminal UI；OpenHarness 当前仅有 eval replay CLI，不是交互式产品 CLI。
- Web Console v2：settings、provider/model、MCP、Skill、artifact、session fork/Time Machine；OpenHarness 前端目前主要是 session list、approval、runtime progress 与 trace tree。
- IM Channel adapters：Feishu、WeCom、DingTalk、Discord、Telegram、Weixin。
- Scheduler/cron 与 channel-triggered tasks。
- Extension packaging、panels/hooks/agents/skills 容器与 marketplace。
- PDF/DOCX/XLSX/PPTX/OCR 等默认解析器，以及 image/video/audio/STT 工具。
- Desktop installer、onboarding、brand/license/creator monetization。

其中 installer、brand/license、billing/monetization、像素级 UI 复制可以继续作为明确 non-goals；核心目标应是“企业化任务语义兼容”，不是逐文件复制 OpenClacky。

### 已经领先或不应重做的部分

对齐不等于重写。以下 OpenHarness 能力应作为约束保留：

- SQLite 事务型生命周期 authority、startup reconciliation、outbox、RPO/RTO 与证据门禁；
- tenant/user/conversation 隔离、private-service auth、IDOR 防护；
- detached execution、durable SSE replay、terminal schema、approval persistence；
- Java Gateway / Tool sandbox / MCP / Provider 分层与固定 qualification matrix；
- OpenSpec、dashboard、production evidence、contract freeze 的治理链。

OpenClacky 更成熟的是本地产品体验、工具面、缓存经济、Skill/渠道生态；OpenHarness 更强的是服务型生产控制面。正确对齐方式是在 OpenHarness 边界上实现等价任务能力，而不是移植 OpenClacky 的单进程、本地会话或扩展 patch 模型。

## 最终建议

1. 先完成 active change：Gate C required rows → Gate C strict gate → Gate D formal 24h → full gates → contract freeze → closeout/archive。
2. active change 归档后，创建并审批 `add-openclacky-runtime-parity-roadmap`，把“核心 Runtime parity”和“产品生态 parity”拆成不同资格轨。
3. 首批架构 change 建议并行设计、分开审批：
   - `fix-context-compression-insert-then-compress`；
   - `refactor-mcp-stable-schema-broker`。
4. 随后建立 `add-enterprise-tool-execution-domain`，再分批补 file/search/edit、shell/trash、web/browser/media、todo/feedback。
5. 第二批补 Provider config/fallback/recovery、Session Registry/Time Machine、Skill/Extension/Control Plane。
6. 最后补 CLI/Web Console/Channels/Scheduler，并运行独立 parity certification；不要用单个“大而全” change 一次实施。

## 后续门禁

| 项 | 结论 |
| --- | --- |
| 本 review 是否创建新 OpenSpec | 否；本轮是只读差距复核与结论落盘。 |
| 当前是否已有 active OpenSpec change | 是，`harden-agent-runtime-single-node-production`，状态 `proposed`，19/31。 |
| parity 实现是否需要 OpenSpec | 是；新增能力、架构、运行时语义、安全策略、UI 与渠道行为均必须先 proposal 并获批。 |
| 是否现在生成 Superpowers 实施计划 | 否；先归档 active change并批准 parity roadmap，对应 change 批准后再各自生成。 |
| 是否需要真实 Provider / 生产审批 | 是；Gate C required fixture、Gate D start 和 post-result promotion 均使用独立审批与真实证据。 |
| 是否修改项目规则 | 否。 |
| 是否修改 Runtime、tasks 或 dashboard | 否。 |

## 验证记录

- `npx openspec list`：现场观察 active change 为 `19/31 tasks`。
- 对 [active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 逐项核对：19 checked、12 unchecked。
- 对 [Gate C Zhipu real-runner report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json) 结构化统计：13 required rows，5 PASS、8 BLOCKED、0 FAIL，overall `blocked`。
- 检查 [OpenHarness Java tool catalog](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/CatalogService.java)、[OpenHarness tool registry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/toolRegistry.ts)、[OpenHarness MCP registry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/mcpRegistry.ts)、[OpenHarness cache hints](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/cacheHints.ts) 与 [OpenHarness compression](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/compression.ts)，确认当前实现边界。
- 检查 OpenClacky committed HEAD、[OpenClacky README](file:///Users/elvis/file/develop/opensource/openclacky/README.md) 与 [OpenClacky source tree](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky)，确认对标能力仍存在；排除其工作区未提交内容。
- 本轮未运行代码测试：无源码、配置、OpenSpec task 或 dashboard 变更；验证范围为只读事实核对与 review artifact 格式/链接检查。
