# Agent Runtime Trace Transition Chunking Diagnosis Result Review

## 结论

需修改：Gate R9 四次成熟数据库 ABBA 均通过计数、顺序、WAL、checkpoint、绑定和 integrity 硬约束，candidate aggregate admission p95 相对 control 改善 `62.188%`，drain throughput 提升 `3.804%`；但 control 的 400 个 admission 样本中 `>100ms` 数为 `0`、最大值仅 `17.947ms`，未复现 Attempt003 的目标尾延迟，因此冻结的“`>100ms` 数减少至少 `80%`”门槛不可证明。Candidate 不得实施，不更新 OpenSpec crash boundary，不进入 Attempt005。

## Review 范围

- [Gate R9 summary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/gate-r9-20260724-001-summary.json)
- [Control A1 result](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/control-a1-result.json)
- [Candidate B1 result](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/candidate-b1-result.json)
- [Candidate B2 result](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/candidate-b2-result.json)
- [Control A2 result](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/control-a2-result.json)
- [Functional control probe](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/control-probe-result.json)
- [Functional candidate probe](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/candidate-probe-result.json)
- [Gate R9 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/run-trace-transition-chunk-ab.ts)
- [Diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-trace-transition-chunking-diagnosis.md)
- [Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-trace-transition-chunking-diagnosis-preflight-review.md)
- [Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)
- [Checkpoint ownership Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis-result-review.md)
- [Production trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)

## 主要发现

### Critical / High

1. Gate R9 未复现要解释的现象。Control aggregate admission p95 为 `3.306ms`，最大 `17.947ms`，`>100ms` 为 `0/400`；因此不能把 candidate 的低绝对延迟外推为 Attempt003 连续六次 `>100ms` 的根因修复。
2. 冻结门槛要求 candidate 的 `>100ms` admission 数减少至少 `80%`。Control 为零时 reduction percentage 无定义，不能把 candidate 同为零解释为通过。按 Plan stop rule，production source、OpenSpec crash boundary、成熟库短回归和 Attempt005 均继续阻塞。

### Medium

1. Candidate 在两组 replicate 的 p95 方向一致：
   - A1 `3.372ms` → B1 `1.193ms`，改善 `64.607%`；
   - A2 `2.394ms` → B2 `1.349ms`，改善 `43.647%`。
2. Aggregate candidate p95 `1.250ms`，相对 control `3.306ms` 改善 `62.188%`；aggregate throughput 从 `35,766.866` 提升到 `37,127.497` events/s，变化 `+3.804%`。这证明 yield/chunk 可降低隔离 transition 的 event-loop 等待，但不证明它能关闭真实 workload 尾延迟。
3. 四次运行均完成 `20,000/20,000` event transitions；control 为 `200` transactions/`0` yields，candidate 为 `1,000` transactions/`800` yields。所有 run 的 pending/retry/dead-letter、message/execution/event counter、admission event order、cursor、PRAGMA 与 source binding 均通过。
4. WAL peak 在 `4,157,112–4,177,712` bytes，全部低于 `64 MiB`；shutdown WAL 均为 `0`，SQLite integrity 均为 `ok`。
5. R8 中 `81` 次慢操作与 `80` 个 trace ack intervals 的近一一 cadence 仍是有效相关性证据，但 Gate R9 表明“100-row acknowledgement transaction 单独同步执行”不是充分根因。真实尾延迟更可能依赖完整 workload 下的 writer queue、checkpoint、生命周期写和主线程同步工作的组合；这是待架构级证据验证的推断，不授权继续微调。

### Low

1. Probe 和成熟 ABBA 的 runner、plan、source state、database start SHA-256 全部一致。
2. 四个 result JSON 均可解析，结果 SHA-256 已写入 summary；`git diff --check` 通过。
3. Result Review 落盘前未修改 production source、OpenSpec design/tasks、Dashboard 或项目规则。

## 最终建议

1. 拒绝 transition chunking candidate，不新增 chunk-level crash boundary，不修改现有 whole-batch transition 行为。
2. 将 Attempt003 的 admission 尾延迟记录为当前“成熟 SQLite、单 Runtime/单连接、完整 fixed workload”容量 blocker；停止 R6–R9 类单变量微调。
3. 后续若继续追求原 Gate D 阈值，应先做架构级选择与新证据计划，例如把 SQLite 同步写移出 Node 主线程、引入明确的单 writer execution boundary，或重新定义单节点容量合同。任何选择都会改变 runtime control flow / persistence semantics，必须更新 OpenSpec 并重新批准，不能由本 Review 自动实施。
4. 在新架构方向获批前，不启动 Attempt005、正式 24 小时 Gate D、contract freeze、Dashboard `verified` 或 archive。

## 后续门禁

- **OpenSpec：** 当前 `harden-agent-runtime-single-node-production` 保持 active；Gate R9 不修改已批准 design/spec。
- **Superpowers plan：** Gate R9 诊断计划已执行完毕；任何架构级恢复需要新的或显著修订的 OpenSpec contract，批准后再创建实施计划。
- **测试：** Gate R9 证据已完成；无生产源码变更，因此不伪造新的 full regression 通过声明。
- **人工审批：** 需要对“保持现有单节点合同并接受 blocker”或“批准新的 writer architecture / 容量合同”作出产品与架构选择。
- **项目规则：** 未修改。
