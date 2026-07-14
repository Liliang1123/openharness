# Real Provider Qualification Runner Step 8–16 Reconciliation Review

## 结论

通过（PASS）：Task 10 Steps 8–16 的 runner/config/fixed-matrix/deadline-budget/report-writer实现门禁已闭环，可进入单独授权的 Step 17/18 bounded real-provider evidence attempt。Fresh no-credential verification为 focused 50/50、Backend full 200/200、shared-schema 58/58、Runtime qualification 5/5，所有相关 typecheck通过。

本 PASS不证明真实 Provider required rows通过，不勾 OpenSpec 3.1，不关闭 Gate C。Attempt 05遗留的“private production issuer正向端到端” concern只能由 Step 18真实入口执行产生证据；它被保留为 Step 18 oracle，而不是继续把已经通过本地严格验收的 Steps 8–16永久循环阻塞。

## Review 范围

- [Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Attempt 05 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-05-review.md)
- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Qualification tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/)

## 主要发现

### Critical — 无未解决 finding

- Missing credential在 transport构造前生成固定 13 行 `blocked` report并非零退出。
- Production main使用 private `ProductionExecution` / `ProductionTransport`边界，injected transport不能伪造 production stream/redaction evidence。
- Fixed rows、required-row veto、request hash、raw/adapter usage、cost复算、budget admission、deadline/cancellation cleanup和 immutable no-overwrite writer均有攻击/负例回归。
- OpenAI/Anthropic loopback只绑定 `127.0.0.1`，验证正式 adapter parser capture但不冒充 production evidence。

### Important — Step 18真实执行边界

当前 production dispatcher有意将 `single-tool-call`、`multi-step-tool-call`、`structured-arguments`、`reasoning`、`503-retry`、`timeout`、`cancellation`、`terminal-error` 标为 `blocked`，只对 `sync`、`stream`、`usage`、`cost`、`redaction`发真实 Provider请求。因此 Step 18可以验证 private production issuer、真实协议 capture、usage/cost和redaction closeout，但按当前实现不可能关闭 Gate C；不得把预期 `blocked`报告晋升为 PASS。

## 最终建议

在 exact Step 17 authorization后运行一次 no-overwrite OpenAI-compatible attempt，验证生产入口实际行为并独立复核 report。若结果如预期 blocked，应把精确 blocker回写 Gate C Review；后续只允许对这些 evidence-backed capability gaps做 TDD forward-fix。

## 后续门禁

- OpenSpec：继续 active change；3.1保持未完成。
- Superpowers：可勾 Steps 8–16；Step 17/18/20需各自真实 artifact。
- Credential：不得打印、落盘、枚举或传入 CLI；只允许单进程环境注入。
- Dashboard：保持 `proposed`。
- Git：不 staging、commit、push或 archive。
- 项目规则：未修改。
