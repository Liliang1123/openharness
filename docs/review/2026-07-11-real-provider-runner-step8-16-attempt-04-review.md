# Real Provider Qualification Runner Step 8–16 Attempt 04 Review

## 结论

需修改。Attempt 04 已把两类 SSE parser capture 与 writer canary closeout 接入正式链路，真实 canary 明文、缺失 surface、嵌套 report canary 均能 fail closed，全部 fresh Step 16 通过。但 High 独立 synthetic-transport probe 仍可在零真实 parser/response/capture 下令 `stream` 与 `redaction` 两行 PASS：stream oracle 未验证 parser provenance，writer 又把 transport outcome 中两个命名为 `_actual...` 的普通字符串当作真实 surface。另有 writer closeout 后 runner 使用旧 result 的时序风险。Step 8–16 仍不得 PASS，Step 17–20 与真实 Provider 执行继续禁止开始。

## Review 范围

- [Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Attempt 03 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-03-review.md)
- [Attempt 04 Correction Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-04-correction-brief.md)
- [Runtime production OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)
- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [qualification tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification)

## 主要发现

### 高：capture map 存在即可伪造 stream parser provenance

[Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java) 的 stream oracle 要求 `adapterCapturePresent`、固定事件序列、正 delta count 与 merge complete，但不检查实际 adapter 写入的 `streamParser=openai-sse/anthropic-sse`，也不把 parser identity 与当前 Provider 对账。[Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java) 的公开 `merge` 可由 injected transport 写入同形 map。

High probe 使用 synthetic credential 与 injected transport，未构造 adapter、未解析 SSE、未执行网络，仅向 capture 写入三个声明字段。结果 `stream=pass`，且已发布 observed 中 `streamParser=null`。因此当前 PASS 仍只能证明“存在一张满足形状的 capture map”，不能证明 evidence 来自 OpenAI/Anthropic SSE parser。

### 高：writer 把 transport outcome 普通字段当作真实 redaction surface

[Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java) 把 response/capture 以 `_actualResponseSurface`、`_actualCaptureSurface` 放回普通 observed map。[Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java) 只检查这两个键非 null，随后扫描其字符串并晋升 redaction PASS，没有独立 provenance 或只允许内部生产 transport 提供的边界。

同一 High probe 的 injected transport 从未获得 Provider response/capture，仅提交两个安全字符串；writer 仍发布 `redaction=pass`。这修复了“canary 明文仍发布”的泄漏漏洞，但没有修复“未执行真实扫描却声称 PASS”的 evidence-integrity 漏洞。

### 中：runner 在 writer closeout 前缓存 result，未来可与发布报告不一致

[Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java) 在 writer 调用前读取 report result、构造 stdout prefix，并在 writer 返回后继续用旧 result 决定 exit code。[Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java) 会在副本中晋升 redaction row 并重算 report result。当前八个 BLOCKED rows 掩盖了差异；后续 rows 解锁后，发布 JSON 可能为 PASS，而 stdout/exit 仍为 BLOCKED/3。最终结果必须由 closeout 后的唯一不可变候选决定。

## 已确认修复

- OpenAI 与 Anthropic loopback tests 已证明 SSE parser 会记录 provider-specific parser tag、正 delta count、merge complete 与固定事件序列。
- transport 仅在 outcome map 自报旧 stream 字段且没有 capture 时保持 BLOCKED。
- writer 对真实固定 canary 进行大小写不敏感字节拒绝；response、capture、stdout、stderr 或嵌套候选 report 命中均不发布且无 temp 残留。
- raw/adapter usage 独立对账、内部预算、cost 重算、deadline/cancel、capture cleanup 与 hard-link no-overwrite 保持通过。
- 无凭据路径继续保持 transport construction/calls 为 0；actual diff 未执行 Step 17–20。

## Fresh 验证

- 显式 unset 两个 credential 的 focused Maven：43/43 PASS，exit 0。
- 显式 unset 两个 credential 的 backend full：77/77 PASS，exit 0。
- shared-schema：49/49 PASS；全仓 typecheck PASS。
- runtime qualification：5/5 PASS；runtime typecheck PASS。
- `DO_NOT_TRACK=1 npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：valid，exit 0。
- `git diff --check`：无输出，exit 0。
- High synthetic-transport probe：`exit=3 calls=13 stream=pass streamParser=null redaction=pass report=blocked`，真实 Provider/DNS/socket/HTTP 调用为 0。
- 所有 High 临时 probe 源码、class、classpath 与报告目录均已删除。

## 最终建议

只执行 Step 8–16 Attempt 05 provenance-boundary correction：production PASS 必须绑定到内部正式 adapter/parser execution，而不是可注入 transport 写入的 map。stream 至少校验 provider-specific parser identity 并阻止 test transport 自行制造 production evidence；redaction surface 必须通过 report 外的可信 closeout carrier 传给 writer，禁止从 observed map 中提取 `_actual...`。writer 应返回 closeout 后的最终 result，runner 再据此形成 stdout、exit code 与发布内容。

## 后续门禁

- 继续使用 active OpenSpec change `harden-agent-runtime-single-node-production`，无需新增 proposal。
- Step 8–16 Attempt 04 Review FAIL；不得进入 Step 17–20，不得讨论或执行真实 Provider qualification。
- OpenSpec 3.1/3.2、dashboard `verified` 与 archive 继续 BLOCKED。
- 不读取真实 credential，不执行真实 Provider 外呼。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次仅新增 Review 与 correction brief；未修改项目规则、OpenSpec tasks、dashboard 或实现文件。
