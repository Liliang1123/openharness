# Task 13 — 24-hour Soak Preflight Review

## 结论

需修改：Task 13 preflight 的基础方向正确，已把 24-hour soak 默认配置、多重 TS-only restart hook、no-overwrite report writer 复用和首尾 2 小时 RSS/FD median growth oracle 接入本地 runner；focused tests、typecheck 与 `git diff --check` 均通过。但当前 restart schedule 证据链仍是 fail-open：调用方可以传入空数组、缺失项或非法项，runner 会静默过滤并仍可能生成 `local_verified` 报告。该问题在 Gate D 前必须修复，否则正式 24-hour soak 证据无法证明 hours 2/12/22 三次 TS-only restart 确实按计划执行。

## Review 范围

- [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- [localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)
- [localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)
- [Task 13 design closeout](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task13-24h-soak-preflight.md)
- [Task 13 verification evidence](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task13-24h-soak-preflight.md)
- Active OpenSpec：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)、[design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)、[agent-runtime spec](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Important — 24-hour restart schedule 是 fail-open，不能支撑 Gate D 证据

位置：

- [localShortBaselineRunner.ts#L100-L110](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts#L100-L110)
- [localShortBaselineRunner.ts#L125-L137](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts#L125-L137)
- [localShortBaselineRunner.ts#L180-L183](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts#L180-L183)
- [localShortBaselineExecution.ts#L67-L83](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts#L67-L83)

问题：`createTwentyFourHourLocalSoakConfig` 允许调用方传入 `restartScheduleMs`；`normalizeRestartSchedule` 会对空数组、重复、非整数、负数或超出 duration 的时间点进行静默过滤。随后 `runDeterministicLocalShortBaseline` 在 `restartScheduleMs.length === 0` 时回退到 `restartAtMs`，但 24-hour soak config 没有设置 `restartAtMs`，因此可以产生零 restart 的运行。只要 sampler 指标达标，`createRuntimeBaselineReport` 仍会返回 `local_verified`。

影响：OpenSpec 明确要求 24-hour soak 在 hours 2、12、22 只重启 TS Runtime。当前实现无法 fail-closed 地保证三次重启存在，也缺少负向测试覆盖“空 schedule / 缺一项 / 越界项必须拒绝或 fail”。这会削弱 Gate D 的证据严肃性。

建议：

1. 把 formal 24-hour schedule 设为不可静默放宽的强约束：默认必须精确为 `[2h, 12h, 22h]`。
2. 如需要压缩测试 schedule，应显式引入测试专用入口或参数，例如 `allowCompressedScheduleForTest: true`，避免 production/preflight API 被随意覆盖。
3. 对空数组、缺项、非法项、被过滤后不足三项、duration 无法覆盖三次 restart 的情况新增负向测试，并抛错或生成 `RESTART_SCHEDULE_MISMATCH` hard failure。

### Important — 报告缺少 planned-vs-observed restart oracle

位置：

- [localShortBaselineExecution.ts#L103-L114](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts#L103-L114)
- [localShortBaselineExecution.ts#L119-L142](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts#L119-L142)

问题：报告环境当前只通过可变的 `restartEvents` 记录实际 hook 事件，没有固定写入 planned restart schedule，也没有在生成 report 前断言 `restartEvents` 与 `config.restartScheduleMs` 完全一致。

影响：即使默认 schedule 正确，后续实际 24-hour run 的审计人员仍需要手工推断“计划是什么、是否全部发生”。如果某次 restart 未触发或 schedule 被误配，当前 oracle 不会自动把报告置为 fail。

建议：

1. 在 `environment` 中记录 `durationMs`、`sampleIntervalMs`、`restartScheduleMs`、`baselineKind`。
2. 在 report 生成前执行 planned-vs-observed 检查：实际 `restartEvents.map(elapsedMs)` 必须等于计划 schedule；否则加入 hard failure 或直接抛出。
3. 在测试中覆盖 compressed schedule 的成功路径和缺失 restart 的失败路径。

### Pass — 资源增长 oracle 与本地 preflight 边界基本正确

位置：

- [localBaseline.ts#L133-L142](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts#L133-L142)
- [localBaseline.ts#L340-L371](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts#L340-L371)

确认：新增 `RESOURCE_GROWTH_BREACH` 使用首尾 2 小时 median RSS/FD 增长 >10% 作为 hard failure，和 OpenSpec 固定阈值一致。当前测试覆盖 10% 边界通过、11%/12% 失败，方向正确。

### Pass — 未越权关闭 Gate D / Gate B

确认：[Task 13 design closeout](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task13-24h-soak-preflight.md) 和 [Task 13 verification evidence](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task13-24h-soak-preflight.md) 均明确本轮未启动 24-hour soak、不关闭 Gate D、不构成 production_verified。这与双轨资格设计一致。

## 验证记录

```bash
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localShortBaselineRunner localShortBaselineExecution
```

结果：

- 4 files passed
- 16 tests passed

```bash
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
```

结果：

- `tsc --noEmit` exit 0

```bash
git diff --check
```

结果：

- exit 0

## 最终建议

当前 Task 13 preflight diff 不建议直接作为 Gate D start 前的最终 runner 版本。建议先补一个小修复切片：

1. fail-closed 校验 24-hour schedule；
2. report environment 固化 planned schedule；
3. planned-vs-observed restart oracle；
4. 加负向测试证明缺失/非法 restart schedule 会失败；
5. 重新跑 focused tests、agent-runtime full、typecheck、OpenSpec validate 和 `git diff --check`。

## 后续门禁

- OpenSpec：无需新 proposal，现有 active change 已覆盖 Task 13。
- Gate D：仍挂起；完成上述修复后也仍需人工批准才能启动正式 24-hour soak。
- Gate B：仍挂起为 `pending_production_evidence`，本地 preflight 不关闭生产 backup/import/quarantine/restore/RPO/RTO 门禁。
- 代码提交：当前 review 仅落盘审查结论，未提交；若修复后提交，必须精确暂存，禁止 `git add .`。
