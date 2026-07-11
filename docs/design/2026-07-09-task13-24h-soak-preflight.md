# Task 13 — 24-hour Soak Preflight Runner

- 文档类型：设计收口 / Gate D 前置 runner 能力记录
- 日志及版本：2026-07-09 v1.0，记录 Task 13 在不启动 24-hour soak 前提下完成的 runner/preflight 能力补强

## 结论

通过：本轮已为 Task 13 formal soak 增加固定 24-hour 配置、多重 TS-only restart schedule、可压缩测试入口、planned-vs-observed restart oracle 和首尾 2 小时资源增长 oracle。该结论只说明 Gate D 前置 runner 能力准备完成；实际 24-hour soak 仍未启动、未通过、未晋升，不关闭 Gate D，也不改变 Gate B pending 状态。

## 核心逻辑

1. 24-hour soak 配置固定为 24 小时、30 秒采样、hours 2/12/22 三次 TS-only restart hook、10,000 seeded conversations、20 concurrency 和 60/20/15/5 workload。
2. formal 24-hour runner fail-closed：默认 schedule 必须精确为 `[2h, 12h, 22h]`，空数组、缺项、重复项、非正数、越界项或压缩 duration 均拒绝。
3. 压缩 schedule 只允许测试显式设置 `allowCompressedScheduleForTest`，避免正式 preflight API 静默放宽 Gate D restart 约束。
4. runner 从单次 `restartAtMs` 扩展为 `restartScheduleMs`，并保证每个 restart hook 在采样循环中只触发一次。
5. execution 入口新增 `runLocalTwentyFourHourSoak`，复用 Task 12D 的 SQLite seed、sampler、no-overwrite writer 和 restart close/reopen boundary。
6. baseline oracle 新增 `RESTART_SCHEDULE_MISMATCH`：fixed 24-hour soak 报告中的 `restartScheduleMs` 与 `observedRestartScheduleMs` 不一致即 hard fail。
7. baseline oracle 新增 `RESOURCE_GROWTH_BREACH`：当样本跨度足以覆盖首尾两个 2-hour window 时，RSS 或 FD median 增长超过 10% 即 hard fail。

## 涉及文件

- [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- [localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)
- [localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)
- [Task 13 verification](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task13-24h-soak-preflight.md)
- [Task 13 fix review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-fix-review.md)

## 验证记录

- RED：focused runner/execution tests 失败，缺少 24-hour config、multi-restart schedule 和 soak execution entry。
- RED：baseline oracle test 失败，缺少首尾 2 小时资源增长 hard-fail。
- GREEN：`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localShortBaselineRunner localShortBaselineExecution`，4 files / 20 tests passed。
- Typecheck：`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck`，exit 0。
- Runtime full：`pnpm --filter @openharness/agent-runtime test`，63 files / 313 tests passed。
- OpenSpec：`npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`，change valid；PostHog telemetry DNS warning 非阻塞。
- Diff hygiene：`git diff --check`，exit 0。

## 剩余风险

- 这不是 formal 24-hour soak report。
- 当前没有实际 24 小时采样 JSON，因此 OpenSpec Task 4.2 不能勾选。
- Gate D 仍要求启动前和完成后的人工确认。
- Gate B 生产 backup/import/quarantine/restore/RPO/RTO 证据仍 pending。

## 待办

1. 在用户明确批准 Gate D start 后，确认 Java Gateway、fixtures、磁盘余量、输出路径、监控与中断流程。
2. 使用 fixed 24-hour config 运行完整 soak，不允许运行中修改代码、配置或阈值。
3. 完成后执行 secret scan、SQLite integrity、event ordering、cross-scope isolation、outbox/dead-letter 与首尾 2-hour median growth 审查。
4. 人工审查通过后才可推进 Gate D promotion。
