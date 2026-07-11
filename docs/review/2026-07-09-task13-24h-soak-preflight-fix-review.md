# Task 13 — 24-hour Soak Preflight Fix Review

## 结论

通过：Task 13 preflight review 中指出的 restart schedule fail-open 风险已修复。formal 24-hour soak 配置现在 fail-closed 地要求 hours 2 / 12 / 22 三次 TS-only restart；压缩 schedule 只能通过测试专用开关使用；报告会记录 planned-vs-observed restart schedule，且不一致时返回 `RESTART_SCHEDULE_MISMATCH` hard failure。本结论不代表 formal 24-hour soak 已运行或 Gate D 已关闭。

## Review 范围

- 原 review：[2026-07-09-task13-24h-soak-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task13-24h-soak-preflight-review.md)
- Verification evidence：[task13-24h-soak-preflight.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task13-24h-soak-preflight.md)
- Design closeout：[2026-07-09-task13-24h-soak-preflight.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task13-24h-soak-preflight.md)
- Baseline oracle：[localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Runner config：[localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- Execution entry：[localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- Focused tests：[localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)、[localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)、[localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)

## 主要发现

### Pass — formal 24-hour schedule 已 fail-closed

`createTwentyFourHourLocalSoakConfig` 不再静默过滤非法 schedule。默认 formal 配置必须保持 24 小时、30 秒采样、hours 2 / 12 / 22 restart；空数组、缺项、负数、越界值和压缩 duration 均拒绝。

### Pass — 测试压缩入口被显式隔离

压缩 duration / schedule 现在必须设置 `allowCompressedScheduleForTest`。这保留快速单测能力，同时避免正式 Gate D preflight API 被误配后仍产生 `local_verified` 报告。

### Pass — planned-vs-observed restart oracle 已接入 report

fixed 24-hour soak report 会写入 `restartScheduleMs` 和 `observedRestartScheduleMs`。runner 始终用本轮实际采集值覆盖 observed；二者不一致时，`createRuntimeBaselineReport` 生成 `RESTART_SCHEDULE_MISMATCH` hard failure，报告结果为 `fail`。

### Risk — Gate D 仍未执行

本轮只修复 runner/preflight 证据完整性。还没有实际 24 小时采样 JSON、正式 report hash、Java Gateway 长驻证据或 Gate D 人工审批。

## 验证记录

```bash
pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner localShortBaselineExecution
pnpm --filter @openharness/agent-runtime test -- localBaseline localShortBaselineRunner localShortBaselineExecution
pnpm --filter @openharness/agent-runtime typecheck
pnpm --filter @openharness/agent-runtime test
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
git diff --check
```

Observed result:

- RED observed：invalid formal schedule 未抛错；planned/observed schedule 缺失；mismatch 仍返回 `local_verified`；compressed public entry 未要求测试开关。
- Focused runner/execution：2 files / 10 tests passed。
- Task 13 focused：4 files / 20 tests passed。
- Runtime typecheck：passed。
- Runtime full：63 files / 313 tests passed。
- OpenSpec：change valid；PostHog telemetry DNS warning 非阻塞。
- Diff hygiene：exit 0。

## 最终建议

Task 13 preflight runner 可以作为 Gate D 启动前的 runner 版本继续使用。下一步不是勾选 OpenSpec Task 4.2，而是先做 Gate D 启动前人工确认：Java Gateway、fixtures、磁盘余量、输出路径、监控、中断流程和 no-overwrite 策略。

## 后续门禁

- OpenSpec：继续沿用 active change `harden-agent-runtime-single-node-production`，无需新 proposal。
- Gate D：仍需人工批准后才能启动 formal 24-hour soak；完成后还要人工审查 report 才能 promotion。
- Gate B：仍保持 `pending_production_evidence`；本地 preflight 不授权生产 SQLite cutover、生产 credentials 或 production promotion。
- Dashboard：本轮不把 active change 更新为 `verified`，因为 Stage 3 formal soak 和生产资格仍未完成。
