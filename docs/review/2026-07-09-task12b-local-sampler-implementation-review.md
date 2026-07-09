# Task 12B Local Sampler Implementation Review

## 结论

通过：Task 12B 已完成本地 runtime sampler/report runner primitives，覆盖 Task 12 所需的指标采集与硬失败入口，并通过 focused tests、runtime full tests、typecheck 和实施计划同步。该结论仅适用于 `local_verified` 本地证据，不代表 30-minute baseline 或 formal 24-hour soak 已完成。

## Review 范围

- Pre-implementation review：[2026-07-09-task12b-local-sampler-preimplementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task12b-local-sampler-preimplementation-review.md)
- Verification report：[task12b-local-sampler.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12b-local-sampler.md)
- Design closeout：[2026-07-09-task12b-local-sampler.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task12b-local-sampler.md)
- Runtime implementation：[localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Runtime tests：[localBaselineSampler.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaselineSampler.test.ts)
- Baseline oracle tests：[localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- Implementation plan：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### Pass — Metrics sampler 与 report oracle 分层清晰

`collectRuntimeBaselineSample` 仅生成 sample，不在单点样本中做最终报告结论；持续 5 分钟阈值 breach 仍由 `evaluateRuntimeBaselineSamples` 统一判断，避免 sampler 层过早把一过性 spike 判定为失败。

### Pass — Hard failure 覆盖 Task 12 指标入口

Sampler 已覆盖 SQLite integrity、secret canary、duplicate operation IDs、event ordering 和 explicit cross-scope leakage。硬失败进入 `hardFailures[]` 后由 report oracle 一票否决，符合 fail-closed 思路。

### Pass — 真实读取与测试注入兼容

RSS、FD、WAL、MCP child count 均支持本地真实读取或 deterministic 注入。单元测试稳定覆盖 p95 和资源指标，后续短基线 runner 可以复用同一 API。

### Risk — 尚未产生实际短基线报告

Task 12B 仍是 sampler primitives；尚未完成 10,000 seeded conversations / 20 concurrency / 30-minute run / minute 15 restart 的实际报告。因此 OpenSpec Stage 3 任务仍不能标记完成。

### Risk — MCP child count 仍需 Task 12C 装配

当前 sampler 支持 `mcpChildCount` 注入或函数，但没有修改 `McpRegistry` 暴露 OS child pid。实际短基线 runner 需要根据 registry/config 明确绑定该计数。

## 验证记录

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaselineSampler
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
```

Observed result:

- Sampler RED observed：missing `collectRuntimeBaselineSample` and missing invariant checks.
- Baseline focused：`2` files / `7` tests passed。
- Runtime typecheck：passed。
- Shared schema full：`49` tests passed。
- Root typecheck：shared-schema、agent-runtime、frontend all passed。
- Runtime full：`61` files / `301` tests passed（非沙箱重跑；沙箱内 localhost listen / tsx IPC 受限）。

## 最终建议

继续推进 Task 12C：创建 deterministic local short baseline runner，把 seed generator、sampler、report schema 和 local report writer 串起来，生成实际短基线报告；仍禁止把本地结果标记为 production `pass` 或 formal soak。

## 后续门禁

- OpenSpec：继续沿用 active change `harden-agent-runtime-single-node-production`，无需新 proposal。
- TDD：Task 12C 先写 runner/report RED 测试，再实现。
- 验证：Task 12C 至少运行 focused runner tests、agent-runtime full、root typecheck、OpenSpec validate、dashboard check、`git diff --check`。
- 人工 Gate：生产 backup/restore/RPO/RTO、formal 24-hour soak 和 production promotion 仍需独立人工审批。
