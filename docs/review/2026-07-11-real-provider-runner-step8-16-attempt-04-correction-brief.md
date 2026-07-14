# Real Provider Qualification Runner Step 8–16 Attempt 04 Correction Brief

## 项目与必读材料

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness)
- 执行 worktree：[gate-b-real-provider-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap)
- 必读 Review：[Attempt 03 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-03-review.md)
- 必读计划：[Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- 必读规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/AGENTS.md)
- 批准合同：[harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)

## 任务目标

只修复 Runner Step 8–16 Attempt 03 的 evidence provenance：阻止 transport/runner 用自报字段伪造 stream 与 redaction PASS，并保持已修复的 raw usage、budget 与 immutable publish 行为。

## 必须修复

1. TDD RED：零实际 stream event、仅提交 `streamObserved` 与固定序列时必须不能 PASS；包含固定 canary 明文却声明 `negativeScan=true` 时 redaction row 与 writer 必须拒绝。
2. Stream oracle：在两类 adapter 的真实 SSE 解析路径记录实际 `stream-start`、至少一个有效 delta、`stream-end` 及 merge completion；matrix 只消费该 capture，不得由 runner 根据 request.stream 或成功响应自行构造序列。
3. Redaction oracle：在最终候选 report bytes 与待输出 stdout/stderr 内容已经形成后，对 response、capture、stdout、stderr、report 的实际内容执行 canary 负扫描。最终 PASS 由可信 closeout/writer 重新计算，不能信任 transport 提交的 `negativeScan`、`scanSurfaces` 或 canary hash。
4. Writer 必须对实际固定 canary 明文做精确拒绝；攻击者添加额外字段、嵌套 map/list、大小写或跨 surface 放置 canary 时仍应 fail closed。报告只允许保留不可逆 hash 与真实扫描摘要。
5. 如果当前执行生命周期无法在发布前真实取得某个 required surface，则 redaction row 必须 BLOCKED；不得声称未执行的扫描已完成。
6. 保留 8 个未授权 capability rows 的 BLOCKED、raw/adapter 独立对账、内部 budget admission、cost 重算、hard-link no-overwrite、zero-credential、deadline/cancel/capture cleanup。
7. Report 必须包含 actual diff、RED/GREEN 原始结果、stream capture 来源、redaction 扫描时序、攻击 probe、fresh Step 16、零真实外呼证明与最终 `git status --short`。

## 允许范围

- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [对应 qualification/provider tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend)

## 禁止事项

- 不执行 Step 17–20，不连接真实 endpoint，不读取或打印真实 credential。
- 不以 injected generic transport、request.stream flag、成功响应或声明字段替代实际 stream/canary evidence。
- 不移除 fixed canary 来规避攻击测试，不把包含 canary 的 surface 排除在扫描外。
- 不勾 OpenSpec 3.1/3.2，不修改 dashboard，不归档 change。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 不删除或回退已通过的 raw usage、budget、no-overwrite 修复与 Review 证据。

## Fresh 验证与停止条件

完成 RED/GREEN 后运行完整 Step 16、OpenSpec strict、canary scan 与 `git diff --check`。High 攻击场景必须满足：零实际 stream event不能 PASS；任一真实 surface 含 canary 时 redaction不能 PASS且 writer 不发布。如果无法在当前生命周期取得完整真实 surface，返回对应 row BLOCKED，不得自行制造 PASS evidence。最终输出使用 `DONE_WITH_CONCERNS` 或 `BLOCKED`，不得自行声明 Step 8–16 PASS。
