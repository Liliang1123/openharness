# OpenClacky Parity / OpenHarness Stage 0 Plan Coverage Review

## 结论

有风险。

当前 approved plan **没有覆盖 OpenClacky 的全部产品运行时能力**；这不是单纯遗漏，而是当前 plan 的目标边界不同。

[OpenHarness Stage 0 approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md) 的目标是把 Agent Runtime MVP 收口成单节点生产 v1：SQLite 持久化权威、重启恢复、私有服务安全、真实 Provider/Tool qualification、24 小时 soak。它没有承诺做 OpenClacky 的 CLI/Web/IM/Skill marketplace/idle compression/VirtualSkill/token-cost 产品体验 parity。

因此答案是：**如果问题是“当前 Stage 0 production closeout plan 是否覆盖 OpenClacky 所有 OpenHarness 未来需要的能力”，答案是否；还有不少没覆盖。若问题是“当前 plan 是否漏掉了它自己批准范围内必须做的生产硬化项”，目前未见明显漏项，反而明确排除了产品层 parity。**

## 文档类型 / 日志及版本

- 文档类型：Plan Coverage Review
- 日期：2026-07-09
- 被复核 plan：[OpenHarness Stage 0 approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- 对比基线：[OpenClacky / OpenHarness Runtime Comparison Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-openclacky-openharness-runtime-comparison-review.md)
- 当前 active change：[harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)
- 本轮性质：coverage review only；未修改 tasks、代码、Gate 状态、dashboard、archive。

## Review 范围

- [Project AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md)
- [OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- [OpenHarness Stage 0 approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [OpenHarness active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [OpenHarness proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [OpenHarness design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [OpenHarness Gate Status Reverification](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-gate-status-reverification-review.md)
- [OpenClacky / OpenHarness Runtime Comparison Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-openclacky-openharness-runtime-comparison-review.md)
- [OpenClacky repository](file:///Users/elvis/file/develop/opensource/openclacky)
- [OpenClacky README](file:///Users/elvis/file/develop/opensource/openclacky/README.md)
- [OpenClacky Agent](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/agent.rb)
- [OpenClacky Client](file:///Users/elvis/file/develop/opensource/openclacky/lib/clacky/client.rb)
- [OpenClacky MCP Architecture](file:///Users/elvis/file/develop/opensource/openclacky/docs/mcp-architecture.md)
- [OpenClacky Channel Architecture](file:///Users/elvis/file/develop/opensource/openclacky/docs/channel-architecture.md)
- [OpenClacky UI Architecture](file:///Users/elvis/file/develop/opensource/openclacky/docs/ui2-architecture.md)

## 主要发现

### Pass — 当前 plan 覆盖了生产硬化主线

| OpenHarness Stage 0 目标 | 当前 plan 覆盖情况 | 备注 |
|---|---|---|
| SQLite 单节点持久化权威 | 已覆盖 | Gate A、Stage 1 schema、repository、Unit of Work、crash matrix |
| durable/transient SSE wire contract | 已覆盖 | Shared schema、Frontend parser、Runtime event/replay |
| 重启恢复与审批失效 | 已覆盖 | `EXECUTION_INTERRUPTED`、pending approval invalidation、private service auth |
| Trace outbox / Java ingest dedup | 已覆盖 | durable outbox、retry、dead-letter、Java dedup |
| JSON import / quarantine / cutover | 已覆盖但 Gate B 未过 | fixture/local 完成不等于 production evidence |
| Provider qualification | 已覆盖范围为 OpenAI-compatible + Anthropic | fake/local 已推进；真实 credentials/endpoints 仍 Gate C pending |
| Java sandbox + MCP qualification | 已覆盖生产硬化视角 | 覆盖 stdio MCP、sandbox matrix、approval/failure/cancel/shutdown |
| Load baseline + formal soak | 已覆盖但 Gate D 未过 | short baseline local；formal 24h soak 未完成 |
| Operations runbook / closeout | 已覆盖 procedure/docs 方向 | 不授权 cutover/freeze/archive |

### Important — plan 只“部分覆盖”OpenClacky 运行时能力

| OpenClacky 能力 | 当前 OpenHarness plan 状态 | 缺口 |
|---|---|---|
| Provider 兼容 | 部分覆盖 | 只覆盖 OpenAI-compatible 与 Anthropic 生产资格；OpenClacky 的 Bedrock、OpenRouter、DeepSeek、Kimi、MiniMax、广义 BYOK 产品配置不在 plan 内 |
| MCP | 部分覆盖 | 覆盖真实 stdio MCP qualification 与 direct catalog merge；未覆盖 OpenClacky 的 MCP VirtualSkill、主上下文 schema 隔离、lazy startup、idle reaper 产品策略 |
| Skill / subagent | 部分覆盖 | Runtime 有 `invoke_skill` / subagent 形态；未覆盖 OpenClacky 的 Skill browse、自然语言创建、自进化、加密分发、marketplace/monetization |
| 缓存与压缩 | 部分覆盖 | 有 cache hints 与 Runtime auto-compress；未覆盖 OpenClacky 的 frozen system prompt、cache marker 策略、Insert-then-Compress、idle compression、成本 UI 指标 |
| Session 恢复 | 部分覆盖 | 覆盖 SQLite 稳定消息、legacy JSON import、event replay；未覆盖 OpenClacky 的本地 session fork、trash/export/download、chunk topic index、Time Machine 用户体验 |
| Tool 安全 | 部分覆盖 | 覆盖 Java sandbox/policy/approval；未覆盖 OpenClacky 的本地 PTY terminal session、safe rm、shell rewrite、write/edit preview 的完整产品 UX |
| Web UI | 部分覆盖 | OpenHarness 覆盖 schema/SSE/progress/trace 面；未覆盖 OpenClacky 内置 Web shell、session sidebar、settings、skill/channel management 产品面 |

### Important — plan 完全未覆盖的 OpenClacky 产品能力

这些能力若 OpenHarness 未来要对齐 OpenClacky，需要独立 OpenSpec change，不能直接塞进当前 Stage 0 closeout：

| 未覆盖能力 | 是否当前 Stage 0 必须补 | 理由 |
|---|---|---|
| CLI / Rich terminal UI | 否 | 当前 plan 是私有服务 Runtime，不是本地 CLI 产品 |
| IM Channel adapters | 否 | Channel adapter 属于产品入口与集成面，不属于单节点生产硬化 |
| Onboarding / license / brand skill / marketplace | 否 | 商业产品层能力，当前 OpenSpec 未定义 |
| Model configuration UI / BYOK UI | 否，且 plan 明确排除 | 当前 plan scope rule 排除 model configuration UI |
| Platform login / tenant administration | 否，且 plan 明确排除 | 当前只要求私有服务身份头与 bearer token |
| OpenClacky-style MCP VirtualSkill token isolation | 不是 Stage 0 必须项 | 这是运行时工具暴露哲学变化，会改变 tool visibility/cache semantics，需要新 proposal |
| Skill self-evolution | 不是 Stage 0 必须项 | 会改变 skill lifecycle、trust、persistence、review 边界，需要新 proposal |
| Idle-time compression / cache economics dashboard | 不是 Stage 0 必须项 | 涉及 cache behavior、cost reporting、session state，需要新 proposal |
| Local install / packaged desktop-like workflow | 否 | 当前 plan 不覆盖发行/安装/本地产品 shell |

### Critical — 不应把“未覆盖 parity”误读为当前 plan 缺陷

当前 Stage 0 plan 的自审明确写明：它覆盖的是已批准的 agent-runtime、agent-sse、shared-schema、message-history、long-term-memory、provider-adapter、mcp-tools、backend-gateway deltas；同时排除 platform login、model UI、session product work。

因此，未覆盖 OpenClacky 产品能力是**范围选择**，不是当前 production closeout 的失败。真正的当前 blocker 仍是：

1. Gate B 缺真实 production backup/import/quarantine/restore、pre-cutover restore/abort、post-cutover forward-fix、measured RPO/RTO。
2. Gate C 缺真实 Provider credentials/endpoints 的 production matrix。
3. Gate D 缺 formal 24h soak 与 promotion approval。
4. OpenSpec tasks 仍为 16/30，禁止 freeze/archive/parity Stage 1-9。

## 推荐拆分

### 先完成当前 Stage 0，不追加 parity

当前 active change 应继续保持生产 closeout 边界：Gate B → Gate C → Gate D → final verification → closeout。不要在 16/30 状态下加入 CLI、Channel、Skill marketplace、VirtualSkill 或 idle compression。

### Stage 0 完成后，建议另开 3 条 parity change

| 建议 change | 内容 | OpenSpec 必要性 |
|---|---|---|
| Runtime token/skill parity foundation | OpenClacky-style Skill/MCP schema isolation、VirtualSkill、lazy MCP、cache marker/idle compression 策略 | 必须，需要设计文档 |
| Product shell parity | CLI/Rich UI/Web shell/session UX/settings/skill management | 必须，用户可见产品行为 |
| Integration parity | IM channel adapter、BYOK provider UI、更多 Provider family、marketplace/brand skill | 必须，涉及入口、凭证、安全和商业/分发边界 |

## 最终建议

1. **不要修改当前 Stage 0 approved plan 来追 OpenClacky 全量 parity**。它会扩大 blast radius，并稀释 Gate B/C/D 的生产证据目标。
2. **当前只把 OpenClacky 作为后续 product/runtime parity 参照物**，不要作为 Stage 0 checkbox 新增项。
3. **若用户要求“OpenHarness 最终必须覆盖 OpenClacky 有的全部关键能力”**，应先写新的 OpenSpec proposal，把“关键能力”定义成可验收范围；至少拆成 runtime token/skill parity、product shell parity、integration parity 三块。
4. **当前最短路径**仍是补齐 Gate B 真实生产证据，而不是补 OpenClacky product features。

## 后续门禁

- OpenSpec proposal：本 review 不新增行为，不需要新 proposal；若实施任一未覆盖 parity 能力，必须新建并批准 OpenSpec change。
- Superpowers plan：本 review 不新增 [OpenHarness Superpowers plans directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/) 下执行计划。
- TDD / implementation：本轮未改代码、未改 tasks。
- Verification：只读 plan/spec/review inspection；未运行测试。
- 人工审批：Gate B/C/D 仍按原规则独立审批。
- 是否修改项目规则：否。
- 是否仍需 OpenSpec / 后续实施计划：是。当前 active change 仍 open；OpenClacky parity 需要后续独立 proposal 与实施计划。
