# Zhipu OpenAI-Compatible Real Runner Attempt 01 Review

## 结论

有风险（Gate C BLOCKED）：经用户 exact authorization，真实 Zhipu `glm-4-flash` qualification已通过 private production main执行一次且未重试。Report writer生成固定 13 行、`track=production`、overall `result=blocked` 的 immutable report；runner按 contract exit 3。Sync、stream、usage、cost、redaction 5 行 PASS；single-tool-call、multi-step-tool-call、structured-arguments、reasoning、503-retry、timeout、cancellation、terminal-error 8 行 BLOCKED，OpenSpec 3.1和Gate C不得关闭。

真实执行安全边界通过：credential原文与通用 secret pattern扫描 clean，fixed canary扫描 clean，report mode为 `0600`，目标未覆盖，临时 log已删除。Report SHA-256为 `46083ae59a285d3d656cd9df2ca35ca9a8cd708e333535460d5e2497dc15b2c2`。

## Review 范围

- [Attempt 01 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-zhipu-openai-compatible-real-runner-attempt-01-preflight-review.md)
- [Earlier authorization-blocked Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-zhipu-openai-compatible-real-runner-attempt-01-blocked-review.md)
- [Runner Step 8–16 reconciliation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-real-provider-runner-step8-16-reconciliation-review.md)
- [Immutable real-provider report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json)
- [Production runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Fixed matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

## 主要发现

### Critical — Gate C required-row veto正确生效

| Row | Result | 真实观测 / blocker |
| --- | --- | --- |
| sync | PASS | Provider HTTP 200，OpenAI Chat Completions capture存在 |
| stream | PASS | Provider HTTP 200，正式 SSE parser/capture链通过 |
| single-tool-call | BLOCKED | provider-backed qualification fixture未授权 |
| multi-step-tool-call | BLOCKED | provider-backed qualification fixture未授权 |
| structured-arguments | BLOCKED | provider-backed qualification fixture未授权 |
| reasoning | BLOCKED | reasoning-capable fixture/model oracle未授权 |
| usage | PASS | 18 prompt / 64 completion tokens，raw/adapter usage相等 |
| cost | PASS | 18 prompt / 64 completion tokens，0 USD micros，raw/adapter usage相等 |
| 503-retry | BLOCKED | 无同一真实 endpoint的owner-authorized provider-backed fault injection |
| timeout | BLOCKED | provider-backed timeout fixture未授权 |
| cancellation | BLOCKED | provider-backed in-flight cancellation fixture未授权 |
| terminal-error | BLOCKED | provider-backed terminal-error fixture未授权 |
| redaction | PASS | HTTP 200，22 prompt / 30 completion tokens，closeout/secret scan clean |

8 个 required blocked row使 overall `blocked`，符合 required-row veto；没有 missing、duplicate、reordered或 fail row。不得用既有 fake/loopback或旧临时 matrix PASS替代这些真实 rows。

### Pass — private production issuer concern关闭

Attempt 05遗留的“未通过 private production main完成正向端到端” concern已由本次真实入口执行关闭。Report环境指纹只记录 `endpointHost=open.bigmodel.cn`与 `model=glm-4-flash`；协议固定为 `openai-chat-completions`；13个 request hash均为64位 SHA-256。

### Pass — budget、usage与redaction

- Max output固定64；实际 PASS rows均未超过64 completion tokens。
- 定价输入为0/0 USD micros per million tokens，所有 row cost为0，低于1000 USD micros hard budget。
- Usage/cost rows的 `oracle.rawAdapterUsageEqual=true`。
- Exact credential、credential变量名、raw bearer/`sk-` pattern和fixed canary均未出现在 report；临时 stdout/stderr log只用于扫描且已删除。

### Important — evidence-backed gap

当前 runner production dispatcher对8个 capability直接生成 `required provider-backed qualification fixture is not authorized`。这是本次真实 evidence确认的合同缺口，而非环境偶发失败。后续若继续，必须在 active change Task 3.5内逐项 TDD实现并分别获得真实调用授权；尤其503-retry必须使用同一真实 Provider官方/owner-authorized fault injection，不能用 loopback/mock proxy伪造。

## 最终建议

接受 Task 10 Step 18“执行一次真实 OpenAI-compatible qualification”和Step 20“复核实际证据”为完成，但保持 OpenSpec 3.1、3.5、3.6未完成。下一实现批次优先拆分可独立验证的 tool/reasoning/timeout/cancellation/terminal-error fixtures；503-retry在 Provider没有正式 fault-injection能力时继续作为 Gate C硬 blocker，或改用具备该能力的另一 OpenAI-compatible生产 Provider。不得自动重跑本 report path。

## 后续门禁

- OpenSpec：active `harden-agent-runtime-single-node-production`继续存在；3.1/3.5/3.6不勾选，不archive。
- Superpowers：Steps 8–18与20可记录完成；Anthropic Step 19继续 deferred / 未执行。
- Gate C：BLOCKED，8个 required rows需真实PASS。
- Gate D：Gate C未通过，不启动正式24-hour production soak。
- Dashboard：保持 `proposed`，同步本次report SHA与blocker。
- Git：未 staging、commit、push或创建PR。
- 项目规则：未修改。
