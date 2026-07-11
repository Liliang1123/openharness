# Task 13 — 24-hour Soak Preflight Fix Implementation Review

## 结论

通过：上一轮 [preflight review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-review.md) 指出的 formal restart schedule fail-open 与 planned-vs-observed 证据缺失，已在实现层修复并通过 focused 回归。`createTwentyFourHourLocalSoakConfig` 对正式 2h/12h/22h 三次 TS-only restart fail-closed；压缩 schedule 必须显式 `allowCompressedScheduleForTest`；`RESTART_SCHEDULE_MISMATCH` hard failure 已接入 report。可作为 Gate D 启动前的 runner 版本继续使用。

二次加固已完成：`withObservedRestartEnvironment` 不再信任调用方预置的 `observedRestartScheduleMs`，而是始终覆盖为本轮 runner 实际采集值；mismatch 测试也改为直接构造 report environment 注入不一致 observed。Gate D 本身仍未启动、未关闭。

## Review 范围

- Codex self-review closeout：[2026-07-09-task13-24h-soak-preflight-fix-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-fix-review.md)
- 上一轮阻塞 review：[2026-07-09-task13-24h-soak-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-review.md)
- Design closeout：[2026-07-09-task13-24h-soak-preflight.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task13-24h-soak-preflight.md)
- Evidence：[task13-24h-soak-preflight.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task13-24h-soak-preflight.md)
- 实现：
  - [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
  - [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
  - [localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- 测试：
  - [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
  - [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)
  - [localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)
- OpenSpec active change：
  - [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
  - [agent-runtime/spec.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Pass — formal 24-hour schedule 已 fail-closed

位置：

- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts) — `createTwentyFourHourLocalSoakConfig` / `validateFormalSoakRestartSchedule`

确认：

1. 默认 `restartScheduleMs = [2h, 12h, 22h]`，且 formal 路径要求与 `DEFAULT_SOAK_RESTART_SCHEDULE_MS` **精确相等**。
2. formal 路径强制 `durationMs === 24h` 且 `sampleIntervalMs === 30s`；压缩 duration/interval 未开测试开关即抛错。
3. 空数组、缺项、负数、越界项会抛错，不再静默 filter 后继续产出 `local_verified`。
4. 负向测试覆盖上述拒绝路径。

这直接关闭了上一轮 Important 的 fail-open schedule 问题。

### Pass — 压缩 schedule 已隔离到测试专用开关

位置：

- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts) — `allowCompressedScheduleForTest`
- [localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts) — `runLocalTwentyFourHourSoak`
- [localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts) — rejects compressed without flag

确认：公开 formal 入口在未设置 `allowCompressedScheduleForTest: true` 时拒绝压缩 schedule；测试可显式压缩并验证 multi-restart hook 只触发一次。

### Pass — planned/observed restart oracle 与 hard failure 已接入

位置：

- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts) — `withTimingEnvironment` / runner 循环采集
- [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts) — `evaluateRestartSchedule` / `RESTART_SCHEDULE_MISMATCH`

确认：

1. environment 写入 `durationMs`、`sampleIntervalMs`、`restartScheduleMs`、`baselineKind: fixed-24-hour-local-soak`。
2. runner 按 schedule 触发 hook，并累积 `observedRestartScheduleMs`。
3. 仅对 `fixed-24-hour-local-soak` 执行 planned-vs-observed 比对；不一致、缺失 planned 或 observed → hard failure → `result: fail`。
4. 30 分钟 short baseline 不受该 oracle 误伤。

### Pass — `observedRestartScheduleMs` 预置短路已消除

位置：

- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts) — `withObservedRestartEnvironment`
- [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts) — preseeded observed 覆盖测试与直接 report mismatch 测试

确认：

1. runner 内部从空数组开始收集本轮 restart hook 观察值，不再读取调用方预置 observed。
2. `withObservedRestartEnvironment` 始终把 `observedRestartScheduleMs` 覆盖为本轮采集数组。
3. 新增 RED/GREEN 测试证明：即使输入 environment 预置 `observedRestartScheduleMs: [999000]`，最终 report 也只包含 `[30000, 90000]`。
4. mismatch 测试改为直接调用 `createRuntimeBaselineReport` 注入不一致 planned/observed，覆盖 report oracle 本身，不再依赖污染 runner environment。

### Risk — Gate D / Task 4.2 仍未关闭（预期）

确认：文档与 Codex closeout 均未把本轮标成 formal soak 完成。OpenSpec Task 4.2 仍未勾选是正确的。本轮也没有 24 小时采样 JSON、正式 report hash 审计、Java Gateway 长驻证据。

### Pass — 资源增长 oracle 与边界声明保持正确

`RESOURCE_GROWTH_BREACH`、no-overwrite writer、`local_verified` 不晋升 production、不关闭 Gate B/D，与双轨资格设计一致。Codex 文档边界声明正确。

### Nit — execution 层未断言 planned/observed 字段

[localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts) 验证了 `restartEvents` 与 `baselineKind`，但未断言 report 内 `restartScheduleMs` / `observedRestartScheduleMs`。runner 层有覆盖，故不阻塞；建议 execution 成功路径补两条 equality 断言，形成端到端证据链。

### Note — 工作树中的 AGENTS.md 变更不属于本轮实现

当前 working tree 另有 [AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/AGENTS.md) 修改（含一处 “风险 and 依据” 中英混写）。Codex Task 13 closeout 称未修改项目规则；该 diff 应与 Task 13 preflight fix 分开处理，避免误入同一提交。

## 验证记录

本轮独立复跑：

```bash
PATH=/opt/homebrew/bin:$PATH pnpm --filter @openharness/agent-runtime test -- localBaseline localShortBaselineRunner localShortBaselineExecution
PATH=/opt/homebrew/bin:$PATH pnpm --filter @openharness/agent-runtime typecheck
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
git diff --check
```

结果：

- 4 files passed
- 20 tests passed
- typecheck passed
- OpenSpec change valid；PostHog telemetry DNS warning 非阻塞
- diff hygiene exit 0

Codex 前一轮已完成且与文档一致：

- 前一轮 focused：4 files / 19 tests passed
- typecheck：passed
- full agent-runtime：63 files / 313 tests passed
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：valid
- `git diff --check`：passed

## 最终建议

1. **接受本轮 preflight fix 作为 Gate D runner 版本**：上一轮两个 Important 阻塞项已关闭。
2. **不勾选 OpenSpec Task 4.2，不关闭 Gate D / Gate B，不把 dashboard 标为 verified**。
3. **observed 写入策略已加固**：runner 始终覆盖为本轮采集值，mismatch 测试改为直接验证 report oracle。
4. Gate D 启动前仍需人工确认：Java Gateway 长驻、fixtures、磁盘余量、输出路径、监控、中断/partial report、no-overwrite 策略，并明确批准 24-hour run。

## 后续门禁

- OpenSpec：继续沿用 active change `harden-agent-runtime-single-node-production`，无需新 proposal。
- Superpowers plan：本轮仍是 approved change 下的 preflight 修复，不新增 plan；正式 soak 执行仍按现有 Stage 3 / Gate D 流程。
- Gate D：仅在人工批准后启动；完成后人工审查 report 才能 promotion。
- Dashboard：不得因本轮 preflight fix 更新为 `verified`。
