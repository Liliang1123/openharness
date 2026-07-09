# Task 12C Local Short Baseline Runner Implementation Review

## 结论

通过：Task 12C 已完成 deterministic local short baseline runner 与 no-overwrite report writer，验证覆盖 RED/GREEN、focused Task 12 tests、agent-runtime full tests、typecheck 和共享 schema 回归。该结论仅说明 runner 已准备好，不代表 30-minute baseline 已实际运行，不关闭 Gate B/Gate D。

## Review 范围

- Pre-implementation review：[2026-07-09-task12c-local-short-baseline-runner-preimplementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task12c-local-short-baseline-runner-preimplementation-review.md)
- Verification report：[task12c-local-short-baseline-runner.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12c-local-short-baseline-runner.md)
- Design closeout：[2026-07-09-task12c-local-short-baseline-runner.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task12c-local-short-baseline-runner.md)
- Runner implementation：[localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- Runner tests：[localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)
- Baseline sampler/oracle implementation：[localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Implementation plan：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### Pass — Runner 默认配置与 OpenSpec Task 12 对齐

`createThirtyMinuteLocalBaselineConfig` 固定 30-minute duration、30-second sample interval、minute-15 restart hook、10,000 seeded conversations 与 20 concurrency，并强制 `track=local`。这满足“准备 30-minute baseline”的 runner 配置要求。

### Pass — 测试可压缩时间，真实运行可后续接入 delay

`runDeterministicLocalShortBaseline` 接收 `durationMs`、`sampleIntervalMs`、sampler、restart hook 和可选 `delayMs`。单元测试用 90 秒压缩配置验证调度逻辑，避免等待 30 分钟；后续真实 run 可显式传入 real-time delay。

### Pass — Evidence writer 默认不可覆盖

`writeRuntimeBaselineReport` 在目标文件已存在且未设置 `overwrite=true` 时 fail closed，避免 runner 或测试静默覆盖历史 evidence。

### Risk — 尚未执行真实 30-minute baseline

本轮只证明 runner 准备完成。计划中的 “Run a 30-minute baseline with one TS restart at minute 15” 仍未执行，也未生成最终短基线报告；OpenSpec Stage 3 4.0/4.1 仍不得勾选。

### Risk — TS restart 仍是 hook，不是进程管理证明

测试证明 hook 会在配置时间点触发，但没有证明真实 runtime process 被停止/重启。Task 12D 必须把 hook 绑定到本地 runtime 进程管理或明确记录手工 restart 证据。

## 验证记录

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler localShortBaselineRunner
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
```

Observed result:

- Runner RED observed：`localShortBaselineRunner` module missing.
- Runner focused：`1` file / `3` tests passed。
- Task 12 focused：`3` files / `10` tests passed。
- Runtime typecheck：passed。
- Shared schema full：`49` tests passed。
- Root typecheck：shared-schema、agent-runtime、frontend all passed。
- Runtime full：`62` files / `304` tests passed（非沙箱重跑；沙箱内 localhost listen / tsx IPC 受限）。

## 最终建议

继续推进 Task 12D：实际运行 deterministic local 30-minute baseline，并使用 no-overwrite writer 落盘报告；完成后再审查是否可以把 OpenSpec 4.0/4.1 标记为本地已完成。Gate B/Gate D 仍需生产/soak 证据，不应被后台自动关闭。

## 后续门禁

- OpenSpec：继续沿用 active change `harden-agent-runtime-single-node-production`，无需新 proposal。
- TDD/验证：Task 12D 是执行与证据收口任务，不能只靠单元测试；必须产出实际 baseline JSON/report hash/secret scan。
- 人工 Gate：Gate B 生产证据与 Gate D formal soak 仍需人工审查，不存在后台自动关闭。
