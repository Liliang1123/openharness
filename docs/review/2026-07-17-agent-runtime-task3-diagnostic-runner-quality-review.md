# Agent Runtime Task 3 Diagnostic Runner Quality Review

## 结论

通过：Task 3 两个初审 High 已关闭，独立 High Quality re-review 为 **PASS**，允许进入 Task 4。修复后的 runner 在 early/late output inode replacement 中均 fail closed；ready child 后 transport 初始化失败会先回收 child；partial seed 首错会触发 transport stop/abort、等待全部固定 20 workers 退出，再停止 Runtime 并完成失败报告。identity 写前校验、formal oracle、固定 workload/metrics lifecycle、默认环境隔离、secret redaction 与真实 child sentinel-swap 均通过 fresh 验证。

初审 `FAIL` 历史保留在下文，原 Review SHA-256 为 `40d9a094b6ec90e4e8a63d188d16c368d73325b678ba98cf8935adf2f068810e`。本次复审只更新本 Review 文件；未修改源代码、测试、Dashboard、OpenSpec 或项目规则，未执行正式 30 分钟诊断或 Gate D，未提交/推送/归档/合并/tag/清理。

## Review 范围

- 工作树：[Task 3 功能工作树](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- 基线与当前 HEAD：`cccd964a723a0606178c1863f6701c8483be6f8e`
- 权威计划：[Agent Runtime Admission Performance Diagnosis Implementation Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-diagnosis.md)，SHA-256 `a182f569615b45d0fbcd5769da9a7685884f235e6d846b1a870c1b15e2edb9da`
- Preflight：[Plan Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-admission-performance-diagnosis-plan-preflight-review.md)
- Inode 决策：[Task 3 Inode Binding Decision Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-task3-inode-binding-decision-review.md)
- 恢复边界：[Gate D Recovery Final Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-gate-d-recovery-final-plan.md)
- Source：[formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- Source：[gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- Source：[formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- Source：[server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- Source：[productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- Source：[runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- Test：[formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)
- Test：[gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)
- Test：[runtimeStorage.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/runtimeStorage.test.ts)
- 回归 Test：[formalSoakCli.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakCli.test.ts)
- 实际范围：相对 HEAD 的全部 tracked diff，以及计划内 untracked source/test/docs；三份既有 SQLite/lock 仅通过 `git status` 确认存在，未读取、写入、移动、删除或暂存。

## 主要发现

复审未发现新的 actionable finding。以下两个 High 为原 SHA 对应的初审失败历史，现均已关闭；保留原始问题、反例和修复要求以维持审计链。

### Critical

无。

### High 1 — 初审历史：最后一次 identity 检查后仍可替换 outputPath，runner 会对攻击者内容返回成功（CLOSED）

[gateDPerformanceDiagnostics.ts:L609](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L609) 在 cleanup 末尾执行最后一次 path identity 检查；随后生成报告，并在 [gateDPerformanceDiagnostics.ts:L627](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L627) 直接通过保留 fd 写入、fsync、close 后返回。写入完成后没有再次确认请求的 `outputPath` 仍指向 claimed `dev`/`ino`。

确定性 `/tmp` 对抗复现把替换安排在第 181 次 wall-clock callback，即 L609 检查完成、L627 写入开始之前：rename claimed output，在原 `outputPath` 写入 replacement。命令 exit 0，观察结果为：

```json
{"clockCalls":181,"hardFailures":[],"requestedOutput":"attacker-replacement","displacedReportRunId":"late-output-swap"}
```

因此 runner 返回无 hard failure 的成功报告，但请求的 output path 是攻击者内容；真实报告只写入被移走的 inode。现有 [gateDPerformanceDiagnostics.test.ts:L660](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts#L660) 只覆盖更早的 swap，并接受报告落到 `.claimed` 路径，未覆盖最后校验后的窗口。

最小修复：报告写入并 `fsync` 后、成功返回前重新验证命名路径与 claim identity；失配必须 fail closed，不得把 replacement 当成成功制品，也不得覆盖或删除 replacement。增加确定性的 late-swap 测试，要求 runner 不得返回 clean success，并验证 replacement 未被写入/删除。

### High 2 — 初审历史：partial Runtime start/seed 失败不拥有完整 cleanup，可能遗留 child 与在飞 transport worker（CLOSED）

[gateDPerformanceDiagnostics.ts:L428](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L428) 只有在 `startRuntime()` 整体 resolve 后才将 `runtimeStarted` 设为 `true`；失败时 [gateDPerformanceDiagnostics.ts:L591](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L591) 跳过 `stopRuntime()`。但 real dependency 已在 [gateDPerformanceDiagnostics.ts:L1035](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L1035) 启动并确认 child ready，之后才创建 transport/driver；后两步若抛错，runner 写 `RUNTIME_START_FAILURE` 报告却遗留 child、SQLite handle 与端口。

同一所有权缺口也存在于 partial seed：real `driver.seed()` 的一个 worker reject 会使 `Promise.all` 提前拒绝，而其他 worker 仍可能在飞；此时 `workloadStarted === false`，runner 跳过 `stopWorkload()`，real `stopRuntime()` 又只停止 supervisor，不先 `driver.stop()`/abort transport。该路径违反“任何失败仍先停 workload/transport，再停 Runtime”的 shutdown 合同，并可能污染下一 variant。现有 failure test 用一次性 injected `seed`/`startRuntime` throw，且对 Runtime start failure 明确期待无 stop event，没有覆盖真实边界的 partial ownership。

最小修复：使 real `startRuntime` 在 child ready 后的 transport/driver 初始化异常中自行停止 supervisor；并保证 seed/continuous workload 的任意 partial failure 都先幂等停止 driver/transport，再停止 Runtime。增加 real-boundary 对抗测试：`createTransport` throw 必须 stop child；seed 中一个 worker reject、其他 worker pending 时必须先触发 transport stop/abort，再 stop child，且不得残留进程/句柄。

### Medium

无新增独立 finding。

### Low

无。

### 已确认通过的关键不变量

- `dev`/`ino` 从 diagnostic claim 经完整 spawn env pair、child safe-integer parse、server、context 到 actual storage open；普通 production 不解析该 identity，formal default spawn 清除继承变量。
- `openRuntimeDatabase` 在首个 `journal_mode`/WAL/migration/integrity/reconciliation/write-capable statement 前执行 identity 校验；mismatch、missing main、stat failure 使用固定非路径错误，现有测试证明 close 被调用。
- 真实 child sentinel-swap：storage open 前 rename claim 并 symlink sentinel，child 非零退出，sentinel bytes/SHA-256/size/mtime 不变，journal 不含 token/path/dev/ino。
- fixed 30m、30s、10,000 conversations、concurrency 20 与 60/20/15/5 workload 不接受 runtime override；三 variant 只改变 database oracle；绝对单调 deadline 避免探针成本累积漂移。
- SQLite/output 初始 claim 使用 `O_CREAT|O_EXCL|O_RDWR|O_NOFOLLOW`、0600 并持有 fd；formal executor 继续使用默认 `new GateDDatabaseObservationCursor()`，原始七探针 SQL、顺序、secret short-circuit 与单条 duplicate UNION 未变。
- 源码敏感模式扫描的命中仅为认证发送、redaction/sanitizer、identity env 名及正式 secret-canary SQL；未发现 raw service token/path/dev/ino 写入 diagnostic report。

## 初审验证记录（历史）

以下均在本 Review fresh 执行，未运行正式 30 分钟诊断或 Gate D：

| 命令/检查 | 结果 |
|---|---|
| `git rev-parse HEAD` | PASS；`cccd964a723a0606178c1863f6701c8483be6f8e` |
| `shasum -a 256` 权威计划 | PASS；`a182f569615b45d0fbcd5769da9a7685884f235e6d846b1a870c1b15e2edb9da` |
| `pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics` | PASS；70/70 |
| targeted real child sentinel-swap test | PASS；1/1，43 skipped，507ms，无 timeout |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakExecution` | PASS；44/44；包含真实 sentinel-swap |
| `pnpm --filter @openharness/agent-runtime test -- runtimeStorage` | PASS；8/8 |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakCli` | PASS；8/8 |
| `pnpm --filter @openharness/agent-runtime test` | PASS；75 files、526 tests |
| `pnpm --filter @openharness/agent-runtime typecheck` | PASS；exit 0，无 type error |
| `git diff --check` | PASS；无 whitespace error |
| scoped sensitive-pattern scan | PASS with expected code/invariant matches only；无 raw secret value |
| deterministic late-output-swap `/tmp` probe | REPRODUCED；runner clean-return，但 named output 为 replacement |

测试全绿不能消除上述 finding：High 1 已由独立确定性反例复现；High 2 是现有 mock 未覆盖的真实 partial ownership 分支。

## 初审最终建议（历史）

1. 回到 Task 3 同范围修复两个 High，不扩展到 CLI、正式 Gate D 或生产语义变更。
2. 先补 late-output-swap 与 partial start/seed cleanup RED tests，再做最小 GREEN；不得弱化 no-overwrite、identity guard、固定 workload 或 formal oracle。
3. 修复后 fresh 重跑 diagnostic/formal/storage/CLI/full/typecheck/diff/sensitive scan，并再次执行真实 child sentinel-swap与新的 output late-swap/partial-cleanup 对抗。
4. 重新进行独立 Task 3 规格 Review 与 High Quality Review；只有所有 actionable finding 关闭并 Review PASS，才允许进入 Task 4。

## 初审后续门禁（历史）

- **Task 4：不允许进入。** 当前 Task 3 High Review 为 FAIL。
- **OpenSpec：** 当前修复仍是已批准计划内 fail-closed/no-overwrite/shutdown 合同恢复，不需要新 proposal；若改变通用 persistence lifecycle、公共 API、formal workload/threshold 或证据语义，必须停止并重新进入 OpenSpec 审批。
- **Superpowers：** 沿用当前已批准实施计划；按 TDD RED/GREEN → focused/full verification → 独立 Review 循环执行。
- **生产/Git：** 不授权正式 30 分钟 A/B、Gate D、Dashboard 同步、archive、commit、push、merge、tag 或 cleanup。
- **人工审批：** 本轮修复与复审不需要新的 Gate D start approval；后续正式 Gate D 仍需独立 preflight 与明确审批。
- **项目规则：** 未修改。

## 复审结论

PASS：两个初审 High 的 claim-to-mechanism、真实边界 cleanup 和对抗测试均闭环，未发现新的 Critical/High/Medium/Low actionable finding。测试没有只验证返回字段：late/early swap 检查命名路径、replacement/sentinel 与 displaced report；partial start/seed 检查资源释放事件顺序与 active worker 归零；真实 child 测试检查 SQLite sentinel bytes/SHA-256/size/mtime 及 token/path/dev/ino 不泄漏。

## 修复证据

### High 1 关闭 — output late/early swap 均 fail closed

- [gateDPerformanceDiagnostics.ts:L627](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L627) 先对 reserved fd 完整写入并 `fsync`；[gateDPerformanceDiagnostics.ts:L628](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L628) 在成功返回前重新校验 named `outputPath` 的 `dev`/`ino`。失配抛固定错误，outer cleanup 只按 identity 删除 owned claim，不覆盖或删除 replacement。
- [gateDPerformanceDiagnostics.test.ts:L705](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts#L705) 在真实报告 fd `fsync` 完成后确定性 rename claim 并创建 replacement；runner reject，原 outputPath 仍为 `replacement`，displaced inode 包含报告但未被当作成功返回。
- [gateDPerformanceDiagnostics.test.ts:L669](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts#L669) 重放 existing early SQLite/output swap；runner reject，Runtime 在 seed/workload 前停止，displaced report 记录两个稳定 identity hard failure，SQLite/output sentinels 内容不变。

### High 2 关闭 — partial start/seed cleanup ownership 完整

- [gateDPerformanceDiagnostics.ts:L1038](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L1038) 在 child ready 后把 transport/driver 初始化包在 cleanup 边界内；创建失败先 `supervisor.stop()`，再把原初始化错误交给 runner 转成稳定 `RUNTIME_START_FAILURE`。
- [formalSoakExecution.ts:L998](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts#L998) 在固定 20-worker execution group 中保留首错、幂等 `driver.stop()`/transport abort，并等待 `runWithFixedConcurrency` 全部 worker settle 后才抛首错；[gateDPerformanceDiagnostics.ts:L1051](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts#L1051) 再保证 driver stop 先于 Runtime stop。
- [gateDPerformanceDiagnostics.test.ts:L1305](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts#L1305) 证明 ready child 后 `createTransport` throw 会在报告返回前 stop child；[gateDPerformanceDiagnostics.test.ts:L1345](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts#L1345) 证明 partial seed 一个 worker reject、其余 pending 时事件顺序为 `transport-stop` → active workers `0` → `runtime-child-stop` → report return，无死锁。

### Formal/identity/security 非回归

- `GateDWorkloadDriver` 正常成功路径仍记录 admission/replay metrics、hard failures 与 event observations；fixed concurrency 仍由 `FIXED_CONCURRENCY = 20` 和 `runWithFixedConcurrency(..., 20, ...)` 锁定。formal focused/full 回归通过。
- diagnostic 仍固定 30 分钟、30 秒、10,000 conversations、20 concurrency、60/20/15/5 mix；三 variant、绝对 deadline、60 samples、shutdown 顺序均未被修复改写。
- `dev`/`ino` claim → spawn env → child parse → server/context → actual storage open 的完整链路未改变；formal/普通 production 默认不携带 identity，继承 identity env 被清除。
- 真实 child storage-open sentinel-swap fresh 通过：child 非零退出，sentinel bytes/SHA-256/size/mtime 不变，journal 不含 service token、SQLite path、expected dev/ino。
- scoped sensitive scan 仅命中认证发送、redaction/sanitizer、identity env 名和正式 secret-canary SQL；未发现 raw token/path/dev/ino 进入 diagnostic report 或错误。

## 复审验证记录

以下命令均由独立 Reviewer fresh 执行；未出现 sandbox `EPERM`，无需权限重跑：

| 命令/检查 | 结果 |
|---|---|
| 原 Review SHA-256 | PASS；`40d9a094b6ec90e4e8a63d188d16c368d73325b678ba98cf8935adf2f068810e` |
| `git rev-parse HEAD` | PASS；`cccd964a723a0606178c1863f6701c8483be6f8e` |
| targeted early/late swap + partial start/seed adversarial tests | PASS；4/4，69 skipped |
| targeted real child sentinel-swap test | PASS；1/1，43 skipped，559ms，无 timeout |
| `pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics` | PASS；73/73 |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakExecution` | PASS；44/44；含真实 child sentinel-swap |
| `pnpm --filter @openharness/agent-runtime test -- runtimeStorage` | PASS；8/8 |
| `pnpm --filter @openharness/agent-runtime test -- formalSoakCli` | PASS；8/8 |
| `pnpm --filter @openharness/agent-runtime test` | PASS；75 files、529 tests |
| `pnpm --filter @openharness/agent-runtime typecheck` | PASS；exit 0，无 type error |
| `git diff --check` | PASS；无 whitespace error |
| scoped sensitive-pattern scan | PASS with expected code/invariant matches only；无 raw secret value |
| `git status --short --untracked-files=all` | PASS；仅计划范围 source/test/docs 加三份受保护既有 SQLite/lock；本次只更新本 Review |

## 最终建议

1. 接受 Task 3 High Quality re-review PASS，允许按权威计划进入 Task 4。
2. Task 4 只能实现 fail-closed diagnostic CLI/analyzer，不得改 formal Gate D schema、阈值、workload、restart 或 production approval 边界。
3. Task 4 完成后仍需其自身 RED/GREEN、focused/full verification、secret/override/no-overwrite 对抗与独立 Review；本 PASS 不等于 Gate R1、30 分钟 A/B 或正式 Gate D 已获批准。

## 后续门禁

- **Task 4：允许进入。** Task 3 两个 High 已关闭，当前独立 Quality Review 为 PASS。
- **OpenSpec：** 当前无需新 proposal；若 Task 4 改变公共 API、persistence lifecycle、formal evidence schema、workload/threshold 或生产权限语义，必须停止并重新审批 OpenSpec。
- **Superpowers：** 继续沿用已批准计划，执行 Task 4 TDD RED/GREEN → focused/full verification → 独立 Review。
- **生产/Git：** 不授权正式 30 分钟 A/B、Gate D、Dashboard 同步、archive、commit、push、merge、tag 或 cleanup。
- **人工审批：** Task 4 实现不代表后续正式 Gate D start approval；Gate D 仍需独立 preflight 与明确审批。
- **项目规则：** 未修改。
