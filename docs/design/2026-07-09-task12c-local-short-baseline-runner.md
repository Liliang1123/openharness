# Task 12C Deterministic Local Short Baseline Runner Design Closeout

- 文档类型：设计收口 / 本地短基线 runner 验证记录
- 日志及版本：2026-07-09 v1.0，记录 Task 12C deterministic local short baseline runner 的实现边界、验证结果和剩余门禁

## 结论

通过：Task 12C 已完成 deterministic local short baseline runner primitives，将 Task 12A 的 seed/report schema 与 Task 12B 的 sampler 串联，并提供默认 30-minute / 30-second sample / minute-15 restart hook / 10,000 seeded conversations / 20 concurrency 配置。该结论仅表示 runner 已准备好，不表示 30-minute baseline 已实际执行，不等价于 formal 24-hour soak，不关闭 Gate B/Gate D。

## 核心设计

1. `createThirtyMinuteLocalBaselineConfig` 固定本地短基线默认配置：30 分钟、30 秒采样、minute 15 restart hook、10,000 seeded conversations、20 concurrency、`track=local`。
2. `runDeterministicLocalShortBaseline` 接收可注入 sampler、restart hook 和可选 delay；测试可压缩时间，真实 30-minute run 可在后续接入 real-time delay 与进程管理。
3. Runner 不自行改变生产 runtime admission、provider、MCP 或 SQLite 写路径；它只调度 sampling 和 report 生成。
4. `writeRuntimeBaselineReport` 默认禁止覆盖已有文件，避免本地 evidence 被测试或重复运行静默改写。
5. 报告仍由 `RuntimeBaselineReportSchema` 和 `createRuntimeBaselineReport` 约束，保持 `track=local` / `local_verified` 双轨隔离。

## 实现范围

- [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)：新增默认 30-minute config、deterministic runner、restart hook、report writer。
- [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)：覆盖默认配置、压缩时间 runner、restart hook、report hash 稳定性和 no-overwrite writer。
- [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)：补充 “Prepare the deterministic local short baseline runner...” 已完成；实际 30-minute baseline 仍未完成。

## 验证摘要

- [Task 12C verification report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12c-local-short-baseline-runner.md)
- Runner focused：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner`，`1` file / `3` tests passed。
- Task 12 focused：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler localShortBaselineRunner`，`3` files / `10` tests passed。
- Runtime typecheck：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck`，passed。
- Shared schema：`/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test`，`49` tests passed。
- Root typecheck：`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck`，shared-schema / agent-runtime / frontend 均通过。
- Runtime full：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test`，`62` files / `304` tests passed（非沙箱重跑；沙箱内已知受 localhost listen / tsx IPC 限制）。

## 待办 / 门禁

- Task 12D：在本地环境实际执行 30-minute local short baseline，minute 15 通过 hook 触发 TS runtime restart，并落盘不可覆盖报告。
- Task 12D：审查报告中的 thresholds、hard failures、report hash、environment fingerprint 和 secret scan。
- Gate B 仍需生产 backup/import/quarantine/restore/RPO/RTO 证据，不会由 Task 12C 后台自动关闭。
- Gate D 仍需 short baseline 审查与后续 formal 24-hour soak，不会由 runner 准备动作后台自动关闭。
