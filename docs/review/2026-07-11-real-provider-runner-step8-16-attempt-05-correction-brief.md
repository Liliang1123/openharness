# Real Provider Qualification Runner Step 8–16 Attempt 05 Correction Brief

## 项目与必读材料

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness)
- 执行 worktree：[gate-b-real-provider-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout)
- 必读 Review：[Attempt 04 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-04-review.md)
- 必读计划：[Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- 必读规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/AGENTS.md)
- 批准合同：[harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/changes/harden-agent-runtime-single-node-production)

## 任务目标

只修复 Runner Step 8–16 Attempt 04 的最后一层 evidence provenance boundary：production PASS 必须来自内部正式 adapter/parser 与真实 closeout surface，不能由 injected transport 构造同形 map/string；同时统一 closeout 后 report/stdout/exit result。

## 必须修复

1. TDD RED：synthetic credential + injected transport 调用 capture API 写入固定 stream 字段时不能令 production stream PASS；仅提交 `_actualResponseSurface/_actualCaptureSurface` 字符串时不能令 redaction PASS。
2. Production/test seam 隔离：测试注入 transport 可验证 orchestration 与 fail-closed，但不能制造 production PASS evidence。正式 provider transport 与 loopback adapter fixture 必须经过同一受控 adapter/parser evidence 路径。
3. Stream provenance：校验 `streamParser` 必须与 Provider 精确匹配为 `openai-sse` 或 `anthropic-sse`，并把 parser identity、request id、实际事件与 merge completion 绑定到同一正式 execution。仅有 capture map 或可伪造 tag 不足以 PASS。
4. Redaction provenance：移除 report observed 中的 `_actualResponseSurface/_actualCaptureSurface`。使用 report 外的不可变 closeout carrier 传递真实 response/capture/stdout/stderr；只有内部正式 execution 可以产生可晋升 evidence。若 carrier 缺失或来源为 injected transport，redaction 保持 BLOCKED。
5. Result 一致性：writer/closeout 返回最终 immutable report bytes、hash 与最终 result；runner 必须在 closeout 后使用该 final result 构造实际 stdout 和 exit code。发布 JSON、stdout result、return code 不得使用不同阶段的值。
6. 保留实际 canary 字节拒绝、五 surface 扫描、8 个未授权 rows BLOCKED、raw/adapter 对账、budget/cost、deadline/cancel、capture cleanup 与 hard-link no-overwrite。
7. Report 必须包含 actual diff、RED/GREEN、受控 provenance 设计、两类 loopback parser evidence、Attempt 04 攻击复跑、result 一致性测试、fresh Step 16、零真实外呼证明和最终 `git status --short`。

## 允许范围

- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [对应 qualification/provider tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/test/java/org/openharness/backend)

## 禁止事项

- 不执行 Step 17–20，不连接真实 endpoint，不读取或打印真实 credential。
- 不以字段改名、增加固定 tag、私有命名约定或普通布尔值冒充 provenance boundary。
- 不让 injected transport 获得 production evidence issuer；不能通过“测试不这样调用”规避攻击。
- 不勾 OpenSpec 3.1/3.2，不修改 dashboard，不归档 change。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 不删除或回退已通过的 raw usage、budget、canary、no-overwrite 修复与 Review 证据。

## Fresh 验证与停止条件

完成 RED/GREEN 后运行完整 Step 16、OpenSpec strict、canary scan 与 `git diff --check`。High 攻击必须得到 stream/redaction 均非 PASS；两类 loopback adapter parser 必须仍产生可验证 evidence；最终 result 的 report/stdout/exit 必须一致。若无法在当前 Java 信任边界内区分正式 adapter evidence 与 injected transport map，相关 row 保持 BLOCKED，不得自行声明 PASS。最终输出使用 `DONE_WITH_CONCERNS` 或 `BLOCKED`。
