# Task 12C Local Short Baseline Runner Pre-implementation Review

## 结论

有风险：可以继续推进 Task 12C，生成 deterministic local short baseline runner，将 Task 12A 的 seed/report schema 与 Task 12B 的 sampler 串联起来，并为 30-minute baseline 提供可执行入口；但本轮不得把 runner 的 dry-run/短测试输出声称为已完成 30-minute baseline，也不得关闭 Gate B/Gate D 或代表 formal 24-hour soak。

## Review 范围

- Active OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- Active OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- Stage 3 implementation plan：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- Task 12A baseline schema/oracle：[localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Task 12B sampler tests：[localBaselineSampler.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaselineSampler.test.ts)
- Shared report contract：[index.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)

## 主要发现

### Important — Runner 应先支持可压缩时间的 deterministic execution

Task 12 要求 30-second samples、30-minute local baseline、minute 15 TS restart。若测试直接等待真实 30 分钟，不可接受；若 runner 只生成假报告，又不能支撑后续执行。因此本轮应实现可配置 clock/delay/sampleCount/restart hooks：生产默认 30 分钟配置，测试使用短间隔与注入 sampler，验证 runner 调度和报告生成。

### Important — Report writer 必须 fail-closed 且默认不覆盖

Task 12 的报告 hash 是证据链。runner 写 JSON 报告时应默认拒绝覆盖已有文件，除非显式 `overwrite=true`。这延续 Task 10 promoter 不可变报告文件策略，避免本地测试无意篡改证据。

### Important — 30-minute baseline 只能“准备”，不自动声称已运行

本轮可以提供 `createThirtyMinuteLocalBaselineConfig` 或 CLI/函数入口，用于后续执行 30-minute baseline；但除非实际运行满 30 分钟并落盘报告，否则计划中的 “Run a 30-minute baseline” 与 OpenSpec Stage 3 4.0/4.1 仍不能勾选。

### Risk — TS restart 目前只能作为 hook 证据

真正 TS Runtime restart 需要进程编排环境。Task 12C runner 可以在 minute 15 调用 `onRestart` hook 并记录环境/样本，但不能证明真实 runtime 已重启。后续实际 baseline 运行必须由外部执行脚本或进程管理器完成。

## 最终建议

本轮实施 `Task 12C — deterministic local short baseline runner`：

1. 新增 runner RED 测试，覆盖：
   - 使用 10,000 seed / 20 concurrency / local track；
   - 按 sample count 调用 sampler 并生成 `local_verified` report；
   - restart hook 在配置点被调用；
   - report hash 稳定；
   - report writer 默认拒绝覆盖，显式 overwrite 才允许。
2. 新增 runner 实现：
   - `createThirtyMinuteLocalBaselineConfig`：默认 30 分钟、30 秒采样、minute 15 restart、10,000/20 workload；
   - `runDeterministicLocalShortBaseline`：接受可注入 sampler/clock/delay/restart hook；
   - `writeRuntimeBaselineReport`：写 JSON，默认 no-overwrite。
3. 不接入生产服务、不启动真实 provider、不运行 formal 24h soak。

## 后续门禁

- OpenSpec：沿用 active change `harden-agent-runtime-single-node-production`，无需新 proposal。
- TDD：先观察 runner RED，再实现 GREEN。
- 验证：focused runner/baseline tests、agent-runtime typecheck/full、shared-schema test/typecheck、OpenSpec validate、dashboard check、`git diff --check`。
- 禁止事项：不关闭 Gate B/Gate D；不把 dry-run/短测报告命名为 formal 30-minute baseline；不覆盖既有证据文件。
