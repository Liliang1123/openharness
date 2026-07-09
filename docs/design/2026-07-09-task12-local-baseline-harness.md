# Task 12A Local Runtime Baseline Harness Design Closeout

- 文档类型：设计收口 / 本地基线验证记录
- 日志及版本：2026-07-09 v1.0，记录 Task 12A 本地 deterministic baseline schema、seed、oracle 与 hash 契约的实现边界

## 结论

通过：Task 12A 已完成本地 deterministic baseline harness 的第一切片，实现共享报告契约、固定 workload seed、hard-fail oracle、持续 5 分钟阈值 oracle 和 canonical report hash。该结论仅属于 `local_verified` 轨道，不等价于 formal 24-hour soak，不关闭 Gate B/Gate D，不授权生产 SQLite 写入。

## 核心设计

1. Baseline 报告复用双轨语义：`track=local` 只能输出 `local_verified | fail | blocked`，禁止使用生产语义 `pass`。
2. Workload seed 固定为 60% no-tool、20% Java sandbox、15% MCP、5% approval/interruption，用 deterministic `operationId` 和 tenant/user collision case 支持后续可复现基线。
3. Oracle 采用 fail-closed 原则：任何 hard failure 直接进入 hard failure 列表；关键指标持续超过阈值达到 5 分钟才判定持续阈值失败，避免单点 spike 误报。
4. Report hash 使用 canonical sorted JSON 后计算 SHA-256，排除 `reportHash` 字段自身，保证同一输入重复生成同一哈希。
5. 本切片只提供可测试的 schema/oracle/harness primitives，不伪造 30-minute baseline 或 24-hour formal soak 结果。

## 实现范围

- [index.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)：新增 `RuntimeBaselineReportSchema`、workload、threshold、sample、failure 和 operation contract。
- [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)：新增 deterministic workload builder、sample evaluator、report creator 和 canonical hash。
- [schema.test.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/test/schema.test.ts)：覆盖 baseline report 解析、本地 `pass` 拒绝、带 failures 的通过态拒绝。
- [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)：覆盖 60/20/15/5 分布、tenant/user collision、hard failure、一过性 spike、持续 5 分钟阈值失败和 hash 稳定性。

## 验证摘要

- [Task 12A verification report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task12-local-baseline-harness.md)
- Shared schema focused/full：`/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test -- schema.test.ts` 和 `/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test`，`49` tests passed。
- Runtime focused：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline`，`3` tests passed。
- Runtime full：`/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test`，`60` files / `297` tests passed（非沙箱重跑；沙箱内因本地 listen/IPC 权限出现 `EPERM`）。
- 根类型检查：`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck`，shared-schema / agent-runtime / frontend 均通过。
- OpenSpec：`npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`，change valid；PostHog DNS flush warning 为非阻塞遥测。

## 待办 / 门禁

- 继续 Task 12B：接入真实 runtime sampler，采集 admission/replay p95、RSS、FD、WAL、MCP child count，并生成本地短基线报告。
- 继续 Task 12C：运行 deterministic 30-minute local short baseline，可包含一次 runtime restart，但仍只能输出 `local_verified` 支持证据。
- Gate B 仍为 `pending_production_evidence`；formal 24-hour soak 和 production promotion 必须等待生产级 backup/restore/RPO/RTO 证据。
