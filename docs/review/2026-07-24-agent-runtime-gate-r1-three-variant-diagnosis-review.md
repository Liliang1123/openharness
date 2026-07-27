# Agent Runtime Gate R1 三变量诊断 Review

## 结论

有风险：三组固定 30 分钟诊断均有效，但 analyzer 正确给出 `inconclusive / combined`。现有证据已排除 database oracle 是共同退化的主因，同时确认 session replay 增长和 outbox backlog 都是 contributing；在区分两者主次前不得猜测生产修复，也不得重复本次 90 分钟 workload。

## Review 范围

- [Gate R1 诊断恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-23-agent-runtime-gate-r1-diagnosis-resume.md)
- [计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-23-agent-runtime-gate-r1-diagnosis-plan-review.md)
- [Gate R1 evidence 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/)
- [full-oracle report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-full-001-report.json)
- [workload-only report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-workload-001-report.json)
- [incremental-oracle report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-incremental-001-report.json)
- [analyzer decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1-20260723-001/gate-r1-20260723-decision.json)
- [session detail implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [production Runtime context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)

## 主要发现

### Critical — 三个变体共同出现 admission 退化

| variant | admission 首 10 中位数 | admission 末 10 中位数 | replay 首 10 中位数 | replay 末 10 中位数 |
|---|---:|---:|---:|---:|
| full-oracle | 37.02ms | 124.42ms | 42.10ms | 127.39ms |
| workload-only | 42.34ms | 121.11ms | 47.23ms | 123.74ms |
| incremental-oracle | 31.30ms | 122.11ms | 34.15ms | 125.12ms |

两个控制组相对 full-oracle 的末段 latency 与 slope 都没有达到 analyzer 要求的至少 20% 改善，因此 full-table database oracle 不是共同退化主因。full-oracle 自身末 10 probe duration 中位数已达 3.60s，仍是正式 24 小时 oracle 必须后续优化的独立风险。

### Critical — session detail 同步全量 replay 被执行两次

[session detail implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts) 先用 `runtimeEventStore.since(..., null)` 读取 `scopedEvents`，随后 `progressForSession()` 再次对同一 scope 执行相同全量读取。该路径由 Gate D 每个 operation 的 durable replay poll 调用，并在同步 SQLite / JSON decode 的同一 Node event loop 上运行。

本轮 immutable SQLite 显示每个 conversation 已积累 264–360 个 durable event；三组 replay 与 admission 曲线同步上升，符合 session poll 阻塞共享 event loop、间接拖慢 admission 的机制，但仍需窄微基准量化一次读取与两次读取的差异。

### Critical — durable trace outbox 没有生产 dispatcher lifecycle

- [trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts) 仅存在单批函数，生产 server/context 没有 import、启动、停止或 readiness wiring。
- SQLite `delivery_status` 对所有 durable event 默认 `pending`；本轮 incremental 数据库共有 3,525,521 条 pending，其中 trace 1,762,134 条，非 trace 1,763,387 条。
- `claimOutbox()` 先从全部 pending/retry 取 limit，再在内存过滤 `kind === "trace"`；非 trace 老记录可以永久饿死 trace delivery。
- 当前 outbox index 只覆盖 `(delivery_status,next_attempt_at)`，claim 还需按 `(created_at,event_id)` 排序；query plan 明确出现 temporary B-tree。

这已经是 active OpenSpec durable outbox 合同的实现缺口，不依赖性能结论。它同时造成约 9.2GiB/90 分钟本地证据增长和持续扩大的 pending partial index，但其对 admission 的直接贡献仍需索引 A/B 量化。

### Important — 本轮 evidence 有效

- full、workload、incremental 均为 exactly 60 samples、零 report/sample hard failure。
- 三个 SQLite / lock / report 与 decision 均为 no-overwrite、mode `0600`。
- Java PID 在三轮之间未变化；每轮 Runtime/MCP 均有序退出；最终端口和进程清理通过。
- report SHA-256：
  - full：`560808b25715eec582308f2e6b45b390f1fb131d7e9c9fc9060e883173c81a2c`
  - workload：`b4258fbafa134b547f7ad745306efb7d838230ae1a49cba3a6bb7c9fd4d8e6d7`
  - incremental：`683025986b4fe83a3edc267b7410b4818b157b01a37dc4b4eaf5531bea1cca11`
  - decision：`e2dfcebfd7ef31212a09df6c6d43930707ab5c898e531106ad72bdfe19c56841`

## 最终建议

不重复三组 workload。下一步只执行两个有界诊断：

1. 对已完成 SQLite 做 immutable read-only replay 微基准，比较同一 scope 一次与两次全量读取和 decode；
2. 对 APFS 临时克隆做保留/移除 `runtime_event_outbox` 索引的相同插入 A/B，量化 pending index 对写入路径的贡献。

若 replay 双读有显著成本且 outbox index 影响较小，先以 session detail 单读复用作为性能主修复；outbox dispatcher/eligibility/index 作为同一 active change 下的正确性修复。若 outbox index 也有显著影响，两者纳入同一 recovery plan，但仍分别以 RED/GREEN 测试实施。

## 后续门禁

- **OpenSpec proposal：** 当前不需要新增；两处缺陷都在 active `harden-agent-runtime-single-node-production` 已批准的 durable replay / outbox 合同内。
- **Superpowers plan：** 需要一个新的窄诊断计划；诊断确认后再创建具体 TDD 修复计划。
- **测试：** 禁止重复本轮 90 分钟 workload；修复后必须执行 focused/full tests、60 分钟 local regression 与新的正式 24 小时 Gate D。
- **人工审批：** 用户已授权持续推进与技术决策；正式 Gate D 结果后的 production promotion 仍需基于实际 evidence。
- **Dashboard：** 未触发 `proposed`、`verified` 或 `archived` 同步点，不修改 Dashboard。
- **项目规则：** 未修改。
