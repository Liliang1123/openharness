# Task 12D Actual Local Short Baseline Run Review

## 结论

通过：Task 12D 已完成实际 30-minute local short baseline，最终 v2 报告满足本地 `local_verified` 轨道要求，且修复了初次实跑暴露的 same-scope conversation seed bug。Gate B/Gate D 仍保持挂起，本结论不得解释为 production promotion 或 formal 24-hour soak。

## Review 范围

- Verification report：[task12d-local-short-baseline-run.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12d-local-short-baseline-run.md)
- Design closeout：[2026-07-09-task12d-local-short-baseline-run.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task12d-local-short-baseline-run.md)
- Final report：[2026-07-09-local-short-baseline-v2.json](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline-v2.json)
- Superseded report：[2026-07-09-local-short-baseline.json](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline.json)
- Baseline execution implementation：[localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- Baseline seed / sampler / oracle：[localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Execution tests：[localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)
- Seed regression tests：[localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- Active OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- Implementation plan：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### Pass — 实际 30-minute local baseline 已完成

Final v2 report 含 `60` 个 30 秒采样点，`generatedAt=2026-07-09T02:25:09.511Z`，最后采样 `2026-07-09T02:55:09.511Z`。报告 `result=local_verified`，`failures=[]`，且记录 minute-15 restart hook：`elapsedMs=900000`、`sampleIndex=29`。

### Pass — SQLite persistence 数量达到 Task 12D 要求

v2 对应 SQLite audit：`conversations=10000`、`executions=10000`、`runtime_events=10000`。这修复了第一版报告 only `5000` conversations 的证据缺陷。

### Pass — 阈值和资源趋势通过

v2 观察到：admission p95 max `0.8064589998684824ms`、durable replay p95 max `1.0927500000034343ms`、RSS max `177668096 bytes`、FD max `27`、WAL max `6550832 bytes`、MCP child count max `0`。RSS first/last 10-sample median growth `-17.904310989284824%`，FD growth `0%`。

### Pass — 旧报告未覆盖，v2 作为最终证据

No-overwrite 策略保持有效。第一版报告 [2026-07-09-local-short-baseline.json](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline.json) 未被覆盖；由于 seed bug 已标记为 superseded，不作为最终 Task 12D 证据。

### Risk — Restart hook 不是 formal TS process supervision 证明

Task 12D 触发的是本地 runner 的 TS restart hook，并通过 close/reopen runtime database boundary 体现。它足以作为 local short baseline 支持证据，但不等价于生产进程管理器或 formal 24-hour soak 中的 TS-only restarts。

### Risk — Gate B/Gate D 仍不是后台任务

Gate B 需要生产 backup/import/quarantine/restore/RPO/RTO；Gate D 需要后续 formal 24-hour soak。二者均未自动执行，也未因 Task 12D 关闭。

## 验证记录

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localShortBaselineExecution
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler localShortBaselineRunner localShortBaselineExecution
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
```

Observed result:

- Task 12 focused：`4` files / `12` tests passed。
- Runtime typecheck：passed。
- Runtime full：`63` files / `306` tests passed。
- Shared schema full：`49` tests passed。
- Root typecheck：shared-schema、agent-runtime、frontend all passed。
- v2 secret scan：no matches。

## 最终建议

可将 OpenSpec Stage 3 的 local baseline 与 reproducible harness 项标记为完成，但不得标记 Stage 3 formal 24-hour soak、production qualification、OpenSpec archive 或 Gate B/Gate D closure。

## 后续门禁

- Gate B：等待生产 backup/import/quarantine/restore/RPO/RTO 人工审查。
- Gate D：等待 formal 24-hour soak 与生产 promotion 审查。
- 下一步建议：准备 Task 13 formal 24-hour soak plan，但仅在用户明确授权并接受运行窗口后启动。
