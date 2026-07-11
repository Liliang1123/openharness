# Task 13 — 24-hour Soak Preflight Runner Evidence

## 结论

通过：Task 13 的 Gate D 前置 runner 能力已补强，并已修复 review 指出的 restart schedule fail-open 风险。fixed 24-hour local soak 配置现在 fail-closed 地要求 hours 2 / 12 / 22 三次 TS-only restart；压缩 schedule 只能通过测试专用开关使用；报告会记录 planned-vs-observed restart schedule 并在不一致时 hard fail。但本产物没有启动 24-hour soak，不关闭 Gate D，不构成 production_verified。

## 范围

- [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- [localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)
- [localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)

## 已实现能力

1. `createTwentyFourHourLocalSoakConfig` 默认固定：
   - duration: 24 hours
   - sample interval: 30 seconds
   - restart schedule: hours 2, 12, 22
   - workload: 10,000 seeded conversations / 20 concurrency / 60-20-15-5 mix
2. `createTwentyFourHourLocalSoakConfig` 拒绝空 schedule、缺项、重复项、非正数、越界项和压缩 duration，除非显式设置测试专用 `allowCompressedScheduleForTest`。
3. `runDeterministicLocalShortBaseline` 支持多重 restart schedule，确保每个 TS-only restart hook 只触发一次，并写入 `environment.restartScheduleMs` 与 `environment.observedRestartScheduleMs`。
4. `runLocalTwentyFourHourSoak` 复用 SQLite seed / sampler / no-overwrite report writer，并把 `environment.baselineKind` 标记为 `fixed-24-hour-local-soak`。
5. `createRuntimeBaselineReport` 新增 `RESTART_SCHEDULE_MISMATCH` hard failure：fixed 24-hour soak 的 planned-vs-observed restart schedule 不一致即 fail。
6. `evaluateRuntimeBaselineSamples` 新增 `RESOURCE_GROWTH_BREACH` hard failure：首尾 2 小时 median RSS 或 FD 增长超过固定 10% 即 fail。

## RED 记录

命令：

```bash
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner localShortBaselineExecution
```

观察结果：

- `createTwentyFourHourLocalSoakConfig is not a function`
- `runLocalTwentyFourHourSoak is not a function`
- `restartScheduleMs` 缺失

补充 RED：

```bash
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localShortBaselineRunner localShortBaselineExecution
```

观察结果：

- `RESOURCE_GROWTH_BREACH` 期望失败，但收到 `[]`，证明首尾 2 小时增长 oracle 缺失。

Review fix RED：

```bash
pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner localShortBaselineExecution
```

观察结果：

- invalid formal 24-hour restart schedules 未抛错。
- `report.environment.restartScheduleMs` / `observedRestartScheduleMs` 缺失。
- planned-vs-observed mismatch 仍返回 `local_verified`。
- compressed 24-hour public entry 未要求测试专用开关。

Observed overwrite RED：

```bash
pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner
```

观察结果：

- 输入 environment 预置 `observedRestartScheduleMs: [999000]` 时，runner 未覆盖为本轮实际采集值，报告结果为 `fail`。

## GREEN 记录

```bash
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localShortBaselineRunner localShortBaselineExecution
```

结果：

- 4 files passed
- 20 tests passed

```bash
pnpm --filter @openharness/agent-runtime test
```

结果：

- 63 files passed
- 313 tests passed

```bash
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
```

结果：

- `tsc --noEmit` exit 0

```bash
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
git diff --check
```

结果：

- OpenSpec change valid。
- `git diff --check` exit 0。
- OpenSpec CLI 出现 PostHog telemetry DNS flush warning；不影响 validate exit 0。

## 未执行事项

- 未启动 24-hour soak。
- 未确认 Java Gateway 长驻运行环境。
- 未确认正式报告输出路径、磁盘余量、监控窗口和中断流程。
- 未关闭 Gate D。
- 未把本地 runner/preflight 产物标记为 production_verified。

## 下一步 Gate D 前置条件

启动 formal 24-hour soak 前必须人工确认：

1. Java Gateway 已启动并保持运行；本轮只允许 TS Runtime 在 hours 2, 12, 22 重启。
2. deterministic Provider/tool fixtures、SQLite 数据库路径、报告路径和 no-overwrite 策略已确认。
3. 磁盘余量、FD/RSS 监控、进程中断流程和 partial report 保留策略已确认。
4. 用户明确批准开始 24-hour run。
