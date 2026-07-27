# Agent Runtime SQLite Page Cache A/B Diagnosis Result Review

## 结论

需修改：`cache_size=-65536`（64 MiB）与 `mmap_size=268435456`（256 MiB）候选未达到实施门槛。ABBA aggregate throughput 仅改善 `0.9475%`，aggregate last-half p95 退化 `0.8793%`，两组 replicate 方向不一致，同时 aggregate peak RSS 增加 `130.8384%`。不得把该候选写入 production source，也不得据此启动 Attempt005。

## Review 范围

- [诊断计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-sqlite-page-cache-diagnosis.md)
- [Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-page-cache-diagnosis-preflight-review.md)
- [冻结 A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/run-lifecycle-cache-ab.ts)
- [Control A1 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/control-a1-result.json)
- [Candidate B1 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/candidate-b1-result.json)
- [Candidate B2 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/candidate-b2-result.json)
- [Control A2 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/control-a2-result.json)
- [聚合结论](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/gate-r6-20260724-001-summary.json)
- [Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)

## 主要发现

### High

1. Candidate 未达到预先冻结的 `>=10%` aggregate 改善门槛：
   - control aggregate throughput：`88.741978/s`；
   - candidate aggregate throughput：`89.582771/s`；
   - throughput 改善：`0.947458%`；
   - control aggregate last-half p95：`6.226250ms`；
   - candidate aggregate last-half p95：`6.280999ms`；
   - last-half p95 改善：`-0.879333%`，即发生退化。
2. replicate 方向不一致：
   - B1 相对 A1 throughput `+6.054598%`，但 last-half p95 `-6.592006%`；
   - B2 相对 A2 throughput `-3.746242%`，但 last-half p95 `+4.597684%`。
   这不满足“candidate 两次结果方向一致”的实施条件，无法排除 host/APFS cache 与时序噪声。
3. Candidate aggregate peak RSS 从 `256,983,040` bytes 增至 `593,215,488` bytes，增幅 `130.838381%`。虽然绝对值仍低于 Gate 的 `1.5 GiB` 上限，但以约 `336 MiB` 常驻增量换取不足 `1%` aggregate throughput 收益，不具备生产合理性。

### Medium

1. 四次有效 run 均完成 `8,000` executions、`16,000` messages、`96,000` runtime events，delivered trace 增量均为 `48,000`，pending trace 最终均为 `0`；`PRAGMA integrity_check` 均为 `ok`。
2. 四次 run 的数据库起始 SHA-256、runner SHA-256、plan SHA-256、source-state SHA-256 完全一致；journal mode、foreign keys、wal autocheckpoint、synchronous 与 page size 无漂移。
3. Candidate 数据库增长 aggregate 比 control 高 `0.955721%`，并未提供文件增长方面的补偿收益。

### Low

1. B1 首次调用误带冻结 runner 不支持的 `--expected-database-bytes` 参数，`parseCli` 在打开数据库前拒绝调用。该次没有启动 workload、未纳入 ABBA；修正调用参数后复用未打开的 fresh clone 完成有效 B1。此调用事故已记录在聚合结论中。
2. 原始 JSON 均通过 JSON parse，聚合文件 SHA-256 为 `ad0472ec9a5c66d7991beda2deeac73a9bb363654109779a381cd08e0f5c5c3c`，`git diff --check` 通过。

## 最终建议

1. 放弃 page-cache/mmap candidate，不修改 [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)。
2. 下一诊断切片转向 lifecycle event transaction batching：先用严格 A/B 量化“单 execution 多次 transaction”相对“单 execution 原子 transaction”的收益与语义风险，再决定是否生成 TDD implementation plan。
3. 新诊断必须保持消息、execution、event、trace outbox 的最终计数和 `integrity_check` 一致，并验证失败回滚语义；不得为了吞吐牺牲 execution lifecycle 原子性、durability 或 trace delivery。

## 后续门禁

- 本次没有修改项目规则、OpenSpec task、Dashboard 或 production source。
- Active OpenSpec change 仍为 `harden-agent-runtime-single-node-production`。
- lifecycle transaction batching 属于运行时持久化语义与架构边界变更，必须先在现有 approved change 范围内完成诊断、独立计划 Review 与 TDD；若超出现有 spec/design，必须先更新 OpenSpec proposal/design 并获批。
- Attempt005、正式 Gate D 24h、promotion 与 archive 继续保持阻塞；短诊断或局部验证不能预批准这些门禁。
