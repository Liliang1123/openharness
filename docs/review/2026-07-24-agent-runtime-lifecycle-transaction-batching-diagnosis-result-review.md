# Agent Runtime Lifecycle Transaction Batching Diagnosis Result Review

## 结论

需修改：把每 execution 的 lifecycle write transactions 从 `10` 降至 `4`，虽然将 aggregate last-half p50 改善 `25.5481%`、transaction 内累计耗时降低 `14.1070%`，但 aggregate throughput 退化 `0.4374%`、last-half p95 退化 `12.3636%`，且两组 replicate 的 throughput/p95 方向不一致。该候选不能解决 Gate 的 admission 尾延迟，不得实施到 production source。

## Review 范围

- [Diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-lifecycle-transaction-batching-diagnosis.md)
- [Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-lifecycle-transaction-batching-diagnosis-preflight-review.md)
- [冻结 A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/run-lifecycle-transaction-ab.ts)
- [Control A1 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/control-a1-result.json)
- [Candidate B1 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/candidate-b1-result.json)
- [Candidate B2 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/candidate-b2-result.json)
- [Control A2 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/control-a2-result.json)
- [聚合结论](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/gate-r7-20260724-001-summary.json)
- [Runtime lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)

## 主要发现

### High

1. Candidate 未达到冻结的 `>=15%` aggregate throughput 或 last-half p95 改善门槛：
   - control aggregate throughput：`90.315440/s`；
   - candidate aggregate throughput：`89.920412/s`；
   - throughput 改善：`-0.437387%`；
   - control aggregate last-half p95：`6.676666ms`；
   - candidate aggregate last-half p95：`7.502146ms`；
   - last-half p95 改善：`-12.363647%`。
2. replicate 主指标方向不一致：
   - B1 相对 A1 throughput `-4.002659%`、last-half p95 `-33.075756%`；
   - B2 相对 A2 throughput `+3.408211%`、last-half p95 `+3.865033%`。
   Candidate 无法稳定改善吞吐或尾延迟。
3. transaction 数减少 `60%` 后，aggregate transaction 内累计耗时仅降低 `14.106980%`，而 total duration 反而增加 `0.295641%`。最大单 transaction 仍为数百毫秒，四组 operation max 均约 `0.98–1.25s`；证据指向 WAL autocheckpoint / commit frame 长尾比 transaction dispatch 数量更主导。

### Medium

1. Candidate aggregate last-half p50 从 `0.966396ms` 降至 `0.719500ms`，改善 `25.548119%`，证明 batch 确实降低普通路径固定开销；但 Gate 失败指标是 admission p95 连续超限，不能用 p50 取代预先冻结的决策指标。
2. Candidate WAL 末态大小 aggregate 低 `3.331745%`，但数据库增长高 `0.900114%`，不足以抵消 p95/throughput 退化。
3. Candidate peak RSS aggregate 仅增加 `1.274765%`，不是淘汰原因。
4. 四个 run 的 event order、sample cursor continuity、message/execution/event/trace counter、pragma 与 `PRAGMA integrity_check` 全部通过；结果可归因于性能而不是正确性漂移。

### Low

1. 四份原始 stdout JSON 与聚合 JSON 均通过解析；聚合 SHA-256 为 `c11773f240dd69953dc519ba8aaac7e5e0c327c806992433787babedb5e5a406`。
2. `git diff --check` 通过。

## 最终建议

1. 不新增 `recordEvents` production API，不改造 [Agent execution runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentExecutionRunner.ts) 的 event clusters。
2. 下一诊断切片转向 WAL checkpoint scheduling：
   - 保持 `journal_mode=WAL`、`synchronous=NORMAL` 与 durable event/outbox 语义；
   - 对比现有 `wal_autocheckpoint=1000` 与关闭 connection autocheckpoint、由受控 background coordinator 执行 bounded `PASSIVE` checkpoint；
   - 记录 admission/operation p95、checkpoint duration/busy/log/checkpointed frames、WAL peak/steady size、shutdown truncate 与 crash recovery；
   - 不允许用 `synchronous=OFF`、memory journal、丢弃 trace 或不受限 WAL 换取性能。
3. 先做本地诊断 A/B；未证明 tail 指标稳定改善与 WAL 上界可控前，不改 production source。

## 后续门禁

- 本次没有修改项目规则、OpenSpec task、Dashboard 或 production source。
- Active OpenSpec change 仍为 `harden-agent-runtime-single-node-production`。
- WAL checkpoint ownership 会改变运行时持久化运维语义；必须先在现有 approved design 范围内完成严格诊断。若需要新增 background checkpoint coordinator、shutdown contract 或配置项且现有 design 未覆盖，必须先更新 OpenSpec proposal/design 并获批。
- Attempt005、正式 Gate D 24h、promotion 与 archive 继续保持阻塞；本结果不批准任何上述门禁。
