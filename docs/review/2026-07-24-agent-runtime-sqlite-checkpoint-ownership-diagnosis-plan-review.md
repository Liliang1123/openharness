# Agent Runtime SQLite Checkpoint Ownership Diagnosis Plan Review

## 结论

通过：允许实现仅位于 verification 目录的独立 PASSIVE checkpoint worker 与冻结 A/B runner。候选保持 1,000-frame policy、WAL 和 `synchronous=NORMAL`，只诊断 checkpoint ownership；本结论不授权 production source 变更。

## Review 范围

- [Checkpoint ownership diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis.md)
- [Transaction batching Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-lifecycle-transaction-batching-diagnosis-result-review.md)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite WAL documentation](https://www.sqlite.org/wal.html)
- [SQLite checkpoint pragma documentation](https://www.sqlite.org/pragma.html#pragma_wal_checkpoint)

## 主要发现

### Critical / High

无。

### Medium

1. SQLite 官方说明默认 autocheckpoint 由越过阈值的 COMMIT 线程执行，符合 Gate R7 中普通路径变快但 max/checkpoint 尖峰不消失的证据。
2. Candidate 必须使用独立 worker thread 和独立 connection；Node event-loop 内的 `setTimeout` + 同一 synchronous better-sqlite3 connection 仍会阻塞 admission，不能验证 ownership 假设。
3. 运行期只允许 PASSIVE；FULL/RESTART/TRUNCATE 会获取或等待 writer/readers，不适合作为低干扰 background policy。TRUNCATE 仅限 workload 结束后的 shutdown qualification。
4. `synchronous=NORMAL` 下把 checkpoint 移出 commit thread 会改变 sync 的执行线程，但本诊断保持相同 threshold 并对 WAL peak/shutdown 强约束；若后续实施，必须单独 Review power-loss durability window 与 crash recovery。

### Low

1. 用 NOOP 观测 log/checkpointed frames 可以避免每次 poll 都触发 sync；达到 1,000-frame backlog 才运行 PASSIVE。
2. `25ms` poll interval 与 `64 MiB` WAL hard ceiling 是诊断参数，不预设为 production 配置。

## 最终建议

worker 必须输出聚合统计并对 better-sqlite3 解析路径、数据库绝对路径、SharedArrayBuffer stop signal 和消息 schema 做严格校验。runner 必须先通过包目录 import、参数拒绝、worker 小库协议 probe、source/runner/worker hash 与 `git diff --check`，再创建成熟 clone 并落盘 Preflight Review。

## 后续门禁

- 不修改项目规则、OpenSpec task、Dashboard 或 production source。
- 未完成 worker protocol probe 与 Preflight Review 前不得执行成熟 ABBA。
- A/B 通过也不直接授权实现；必须继续 crash/reopen qualification，并根据 active OpenSpec design 覆盖情况决定是否需要 proposal/design delta。
