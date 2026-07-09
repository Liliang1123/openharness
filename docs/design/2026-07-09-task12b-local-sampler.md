# Task 12B Local Runtime Sampler Design Closeout

- 文档类型：设计收口 / 本地采样器验证记录
- 日志及版本：2026-07-09 v1.0，记录 Task 12B 本地 runtime sampler primitives 的实现边界、验证结果和剩余门禁

## 结论

通过：Task 12B 已完成本地 baseline sampler primitives，实现 admission/replay p95、RSS、FD、WAL、MCP child count、SQLite integrity、duplicate operation、event ordering、cross-scope leakage 和 secret canary leakage 的可测试采样/硬失败入口。该结论仅属于 `local_verified` 本地证据，不代表 30-minute baseline 已运行，不等价于 formal 24-hour soak，不关闭 Gate B/Gate D。

## 核心设计

1. Sampler 采用“默认真实读取 + 测试注入”结构：生产外的本地 harness 可读取 process RSS、FD 目录、SQLite WAL 文件和 integrity check；单元测试可注入稳定值。
2. `collectRuntimeBaselineSample` 只生成单个 30 秒采样点，不直接判定报告结果；持续阈值 breach 仍由 Task 12A 的 `evaluateRuntimeBaselineSamples` 统一处理。
3. Hard failure 以 code 列表进入 sample，后续 report oracle 一票否决，避免在 sampler 层把异常吞掉或降级。
4. Cross-scope leakage 检测只基于显式观测到的 visible tenant/user mismatch；不同 scope 复用同一 `conversationId` 是 Task 12 seed 的预期压力用例，不被误判为泄漏。
5. MCP child count 暂以注入式 count/function 暴露，后续 Task 12C 在短基线 runner 装配时绑定真实 registry/config 计数。

## 实现范围

- [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)：新增 `collectRuntimeBaselineSample`、database probe、event observation、p95、FD/RSS/WAL/integrity/canary/invariant helpers。
- [localBaselineSampler.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaselineSampler.test.ts)：新增 sampler focused tests，覆盖指标采集、hard failure、invariant 和 report oracle 接线。
- [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)：Task 12 前三项已按证据标记完成；30-minute baseline 与 freeze 仍未完成。

## 验证摘要

- [Task 12B verification report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12b-local-sampler.md)
- Focused baseline：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler`，`2` files / `7` tests passed。
- Runtime typecheck：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck`，passed。
- Shared schema：`/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test`，`49` tests passed。
- Root typecheck：`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck`，shared-schema / agent-runtime / frontend 均通过。
- Runtime full：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test`，`61` files / `301` tests passed（非沙箱重跑；沙箱内已知受 localhost listen / tsx IPC 限制）。

## 待办 / 门禁

- Task 12C：将 sampler 接入 deterministic local short baseline runner，生成实际 baseline report。
- Task 12C：按计划运行 30-minute baseline，并在 minute 15 执行一次 TS runtime restart（如本地环境允许）。
- Gate B 仍为 `pending_production_evidence`；formal 24-hour soak、production qualification 和 OpenSpec archive 均不得提前声明。
