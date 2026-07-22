# Agent Runtime Task 4 Diagnostic CLI Quality Review

## 结论

通过：Task 4 唯一 High 修复已完成独立 High Quality re-review，当前结论为 **PASS**，允许进入 Task 5。

修复后的 analyzer 在 exact 60 报告进入分析前统一绑定 sampleIndex、sampledAt、generatedAt 与 variant probe timing signature。原 synthetic QA reports 现返回 code 2 且不生成 decision output；带 report/sample hardFailure 的 signature 错配同样不能跳过结构门禁；符合真实 runner 结构的 exact 60 报告仍可正常分析。fresh focused 128、formal 44、storage 8、formal CLI 8、full Runtime 584、typecheck、diff、direct CLI 与定向扫描全部通过，未发现 actionable finding。

原初审结论为 **FAIL**，Review SHA-256 为 `cc98489c72cf0ba5826350a56c754c23a59dac399a5b6ce376dd080f4f977444`。原 FAIL 发现、观察结果、建议、命令与门禁历史完整保留在下文；本次复审关闭记录追加于文末。

## Review 范围

- 项目与实际 dirty worktree：[add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 基线 HEAD：cccd964a723a0606178c1863f6701c8483be6f8e
- 项目规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md)
- OpenSpec 规则：[openspec/AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/AGENTS.md)
- 权威计划：[2026-07-16-agent-runtime-admission-performance-diagnosis.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，复核 SHA-256：a182f569615b45d0fbcd5769da9a7685884f235e6d846b1a870c1b15e2edb9da
- Task 3 PASS Review：[2026-07-17-agent-runtime-task3-diagnostic-runner-quality-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-task3-diagnostic-runner-quality-review.md)，复核 SHA-256：69c0c40de049645bad95dae91f3a55a9ced5f10ccb8755ba4313cefaa97ef09a

Task 4 实际文件：

- [gateDPerformanceDiagnosticCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- [package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)

同时追踪了 Task 1–3 交互与完整实际 diff，重点包括：

- [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)
- [runtimeStorage.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/runtimeStorage.test.ts)

既有三份 SQLite/lock 证据只执行了 status/stat；未打开、移动、删除或写入：

- [attempt 001 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/runtime.sqlite)
- [attempt 002 runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite)
- [attempt 002 runtime.sqlite.lock](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite.lock)

## 主要发现（初审 FAIL 历史）

### High — 诊断证据结构一致性缺口可产生错误 confirmed decision（复审已关闭）

位置：

- [gateDPerformanceDiagnostics.ts:210](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L210)
- [gateDPerformanceDiagnostics.ts:220](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L220)
- [gateDPerformanceDiagnosticCli.ts:333](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts#L333)
- [gateDPerformanceDiagnosticCli.ts:351](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts#L351)

当前通用报告 validator 会验证单个 sample 的字段类型、非负/有限数值、oracleDurationMs 求和与 exact object shape；CLI 会验证 variant 标签、exact 60、distinct runId/database basename 和 environment fingerprint。但是它没有验证以下跨样本及跨字段不变量：

1. sampleIndex 必须与数组位置一致；
2. sampledAt 必须按采样顺序递增；
3. report.generatedAt 不得早于最后一个 sample；
4. variant 必须与每个 sample 的 probeTimings signature 一致。

已观察的 synthetic QA probe 使用三份各 60 条的报告：

- 所有 sampleIndex 均为 0；
- sampledAt 严格倒序；
- full-oracle、incremental-oracle、workload-only 的 probeTimings 均为空；
- runId、database basename 与 environment fingerprint 仍满足当前表面校验；
- report/sample hardFailures 均为空。

观察结果：

- CLI 返回 code 0；
- CLI 输出 result=ok、command=analyze；
- decision 为 result=confirmed；
- primaryCause 为 database-oracle-contention。

这证明现有 114 个 diagnostics tests 未覆盖 analyzer 的结构一致性边界。问题不是输出格式差异，而是 confirmed 结论缺少真实 runner 结构所应提供的最小证明。

未发现其他 actionable finding。

## 最终建议

在进入分析前增加统一的可分析报告结构校验，并采用以下最小不变量：

1. 对 exact 60 的报告，samples[position].sampleIndex 必须精确等于 position，即 0..59。
2. sampledAt 必须严格递增。不要要求相邻样本精确等于 30 秒，也不要设置窄容差：真实 runner 使用绝对 monotonic deadline，probe overrun 与调度抖动会影响墙钟间隔；严格递增足以阻断倒序/重复证据而不与真实运行机制冲突。
3. report.generatedAt 必须大于或等于最后一个 sampledAt。
4. 仅允许进入分析的 exact60 且 report/sample hardFailures 全空报告，必须逐 sample 绑定 variant signature：
   - full-oracle：精确七项并固定顺序为 incremental-events、dead-letter、orphaned-approval、duplicate-event、sqlite-busy、event-secret-canary、message-secret-canary；
   - incremental-oracle：精确一项 incremental-events；
   - workload-only：probeTimings 必须为空。
5. 增加 negative tests，分别覆盖重复/越位 index、倒序或重复 timestamp、generatedAt 早于末样本、三种 signature 错配；每一项都必须返回 blocked、不得创建 decision output。再增加一项完整 synthetic QA regression，证明本 Review 的输入不再得到 confirmed。
6. 保留当前 exact 60、hardFailures、environment fingerprint、distinct runId/database basename、20% inclusive boundary、threshold、secret-free 与 no-overwrite tests。

## 初审命令结果（FAIL 历史）

以下均为本次独立 fresh 结果：

- pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics：114/114 PASS。
- pnpm --filter @openharness/agent-runtime test -- formalSoakExecution：44/44 PASS。
- pnpm --filter @openharness/agent-runtime test -- runtimeStorage：8/8 PASS。
- pnpm --filter @openharness/agent-runtime test -- formalSoakCli：8/8 PASS。
- pnpm --filter @openharness/agent-runtime test：75 files、570/570 PASS。
- pnpm --filter @openharness/agent-runtime typecheck：PASS。
- git diff --check：PASS。
- 直接 tsx CLI 与 package script 均成功进入入口；缺失必填 flags 时按设计返回结构化 blocked/invalid_input 与 CLI exit 2。
- synthetic QA probe：复现 code 0、confirmed/database-oracle-contention，结果与 High finding 一致。
- 定向源码扫描确认 argv 无 duration/sample/workload/threshold/track/restart/overwrite/credential override 入口；service token 在完整路径/MCP config 与 probe seam pair 校验后读取；错误输出仅包含稳定 errorClass，未观察到 token、路径或底层异常文本泄漏。
- 未启动真实 30 分钟诊断、正式 Gate D 或任何生产服务。

测试全绿不能关闭本 finding，因为当前测试矩阵没有覆盖跨样本与 variant signature 不变量。

## 初审后续门禁（FAIL 历史）

- Task 4 当前门禁：FAIL。
- Task 5：不允许开始。
- 修复范围应保持在已批准 Task 4 及其既有报告校验边界内；这是对权威计划已定义行为的收口，不需要新增 OpenSpec proposal，也不需要新建 Superpowers plan。
- 修复后必须 fresh 重跑 diagnostics 114 基线及新增回归、formal 44、storage 8、formalSoakCli 8、full Runtime、typecheck、diff check 和 direct CLI，并由独立 High Quality Reviewer 对实际完整 diff 重新 Review。
- 只有新 Review 无任何 actionable finding 且结论 PASS，才允许进入 Task 5。
- 本 Review 未修改项目规则、OpenSpec、Dashboard、源代码或测试；除本 Review 文档外未保留任何 QA 临时文件。

## High re-review 结论

通过：唯一 High 已关闭，无新增 actionable finding。

修复位于 [gateDPerformanceDiagnosticCli.ts:344](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts#L344) 至 [gateDPerformanceDiagnosticCli.ts:390](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts#L390)。readDiagnosticReport 在通用 schema、expected variant 与 exact 60 校验后调用统一结构门禁；门禁对所有进入分析的报告生效，不以 hardFailures 为空作为绕过条件。

## High re-review 主要证据

1. **Index 精确绑定**：每个 samples[position].sampleIndex 必须等于 position，精确覆盖 0..59；重复、跳号与错位均返回 blocked。
2. **Timestamp 顺序**：sampledAt 必须严格递增，相等与倒序均返回 blocked。实现不要求精确 30 秒或窄容差，保留真实 runner 的绝对 deadline、probe overrun 与调度抖动空间。
3. **报告完成时间**：generatedAt 必须大于或等于最后一个 sampledAt；早于末样本返回 blocked，等于末样本不会被误拒。
4. **Variant signature**：
   - full-oracle 每个 sample 必须精确为七项固定顺序：incremental-events、dead-letter、orphaned-approval、duplicate-event、sqlite-busy、event-secret-canary、message-secret-canary；
   - incremental-oracle 每个 sample 只能包含 incremental-events；
   - workload-only 每个 sample 的 probeTimings 必须为空。
5. **Hard-failure 不能绕过**：独立普通 QA fixture 给 full report 与首 sample 同时加入 QA_FAILURE，再清空 full probeTimings；结果仍为 code 2 且无 output。
6. **原 synthetic QA 关闭**：60 条 index 全为 0、sampledAt 倒序、三个 variant timing signature 全空的三报告组合现在为 code 2，decision output 不存在。
7. **无真实形态 false rejection**：独立普通 QA fixture 使用 0..59、严格递增 timestamp、generatedAt 晚于末样本和三个固定 signature；CLI code 0，正常生成 local diagnosis decision。focused runner 测试中的三个 variant exact 60 路径也全部通过。
8. **无周边回归**：analyzer 的 exact 60、distinct runId/database basename、environment fingerprint、hard-failure confirmation 阻断、20% inclusive rule、threshold、secret-free 与 no-overwrite 行为保持；writer、token getter 顺序、Java/MCP probe pair 和固定 runner wiring 未改变。

新增回归集中在 [gateDPerformanceDiagnostics.test.ts:2164](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts#L2164) 至 [gateDPerformanceDiagnostics.test.ts:2279](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts#L2279)，覆盖重复/跳号/错位 index、相等/倒序时间、generatedAt、full/incremental/workload signature 和原综合 synthetic QA fixture。

## High re-review fresh 命令结果

- pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics：128/128 PASS。
- pnpm --filter @openharness/agent-runtime test -- formalSoakExecution：44/44 PASS。
- pnpm --filter @openharness/agent-runtime test -- runtimeStorage：8/8 PASS。
- pnpm --filter @openharness/agent-runtime test -- formalSoakCli：8/8 PASS。
- pnpm --filter @openharness/agent-runtime test：75 files、584/584 PASS。
- pnpm --filter @openharness/agent-runtime typecheck：PASS。
- git diff --check：PASS；三份 untracked Task 4 源/测试文件的 no-index whitespace check 无输出，exit 1 仅表示其与 /dev/null 存在内容差异。
- direct tsx CLI：成功进入真实入口；缺失 profile 必填 flags 时返回结构化 blocked/invalid_input，CLI exit 2，符合 fail-closed 预期。sandbox 内首次受 tsx IPC 权限限制，按规则在获批的非 sandbox 环境重跑后取得上述代码结果。
- 定向扫描：未新增 duration/sample/workload/threshold/track/restart/overwrite/credential argv 入口；service token getter、Java/MCP probe pair、稳定 stdout/stderr errorClass 和 assertAnalyzableReportStructure wiring 保持。
- 独立普通 QA fixture：结构不一致组合 code 2/无 output；hardFailure+signature 错配 code 2/无 output；合法 exact60 组合 code 0/有 output。fixture 与数据目录均已删除。
- 未运行真实 30 分钟诊断、正式 Gate D；未打开或读写三份既有 SQLite/lock。

## High re-review 最终建议

保持当前结构门禁与新增回归，不再放宽为只在 no-hard-failure 时校验 signature，也不要引入精确 30 秒墙钟 cadence。后续 Task 5 应继续复核完整实际 diff、local-only 证据边界与 formal Gate D 非回归；本 Review PASS 不等于正式 Gate D 或最终发布完成。

## High re-review 后续门禁

- Task 4：PASS。
- Task 5：允许开始。
- 不需要新增 OpenSpec proposal 或 Superpowers plan；修复属于权威计划已批准 Task 4 的既有行为收口。
- 本次复审未修改项目规则、OpenSpec、Dashboard、源代码或测试，仅更新本 Review 文档；未 commit、push 或启动长跑。
