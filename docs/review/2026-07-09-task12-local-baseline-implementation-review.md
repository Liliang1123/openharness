# Task 12A Local Baseline Implementation Review

## 结论

通过：Task 12A 已按 pre-implementation review 的边界完成本地 baseline schema/oracle/seed/hash 第一切片，验证覆盖 RED/GREEN、focused tests、runtime full tests、typecheck 和 OpenSpec validate。该通过结论仅适用于 `local_verified` 本地证据，不关闭 Gate B/Gate D，不代表 formal 24-hour soak。

## Review 范围

- Pre-implementation review：[2026-07-09-task12-local-baseline-preimplementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task12-local-baseline-preimplementation-review.md)
- Verification report：[task12-local-baseline-harness.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12-local-baseline-harness.md)
- Design closeout：[2026-07-09-task12-local-baseline-harness.md](file:///Users/elvis/file/develop/opensource/openharness/docs/design/2026-07-09-task12-local-baseline-harness.md)
- Shared schema implementation：[index.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)
- Shared schema tests：[schema.test.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/test/schema.test.ts)
- Runtime implementation：[localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Runtime tests：[localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)

## 主要发现

### Pass — 双轨语义保持隔离

`RuntimeBaselineReportSchema` 复用 `QualificationTrackSchema` 与报告结果枚举，并明确拒绝 `track=local` 时输出 `pass`，也拒绝 `track=production` 时输出 `local_verified`。这避免了把本地短基线证据误提升为生产资格。

### Pass — Oracle 可测试且可注入

`evaluateRuntimeBaselineSamples` 接收样本数组和阈值对象，测试可以直接注入 hard failure、9 个短 spike 和 10 个连续 30 秒 sustained breach。该设计避免必须等待长跑才能验证 oracle 正确性。

### Pass — Seed 与 hash 可复现

`buildDeterministicBaselineWorkload` 输出固定 operation distribution、scope collision case 和顺序 ID；`createRuntimeBaselineReport` 基于 canonical sorted JSON 计算 SHA-256，重复输入返回相同报告。

### Risk — 尚未接入真实采样与 30 分钟短基线

本切片尚未把 oracle 接到真实 runtime sampler，也尚未运行 deterministic 30-minute local short baseline。因此 OpenSpec Stage 3 的完整 Task 12 仍未完成，不能勾选 formal soak 或 production promotion 相关任务。

### Risk — Full runtime tests 需要非沙箱本地权限

`@openharness/agent-runtime` full test suite 在受限沙箱内因 `listen EPERM` / `tsx IPC pipe EPERM` 失败；按权限流程在非沙箱环境重跑后通过。该现象属于测试环境权限限制，不是 Task 12A 代码失败。

## 验证记录

```bash
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test -- schema.test.ts
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
```

Observed result:

- Shared schema focused/full：`49` tests passed。
- Runtime focused：`3` tests passed。
- Runtime full：`60` files / `297` tests passed（非沙箱重跑）。
- Root typecheck：shared-schema、agent-runtime、frontend all passed。
- OpenSpec validate：`harden-agent-runtime-single-node-production` valid；PostHog DNS warning 非阻塞。

## 最终建议

继续推进 Task 12B：在不改变双轨/门禁语义的前提下，把当前 schema/oracle 接入真实 runtime local sampler，生成 deterministic short baseline 报告；仍禁止标记 production `pass`、禁止关闭 Gate B/Gate D、禁止启动或声称 formal 24-hour soak。

## 后续门禁

- OpenSpec：继续沿用 active change `harden-agent-runtime-single-node-production`，本轮无需新 proposal。
- Superpowers：Task 12B 继续使用 TDD；先写 sampler/report CLI 的 RED 测试，再实现。
- 测试：Task 12B 至少重新运行 shared-schema、agent-runtime focused/full、root typecheck、OpenSpec validate、dashboard check、`git diff --check`。
- 人工审批：生产 backup/restore/RPO/RTO、formal soak 和 promotion 仍需单独人工 Gate。
