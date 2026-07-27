# Agent Runtime 10 分钟成熟数据库回归 Attempt004b Result Review

## 结论

通过：`gate-r5-20260727-mature-004b` 完整执行 20/20 个 30 秒样本，实际采样 `600460.547ms`，结果为 `local_verified`，无 failure code。准入 p95 中位数 `44.723ms`、耐久回放 p95 中位数 `71.492ms`，相对冻结基线 `182.760ms` 改善 `75.529%`；Worker 可用性、队列、主线程心跳、outbox、SQLite 完整性、证据绑定与进程清理门禁全部通过。该证据关闭 OpenSpec 4.1d，并允许准备 Attempt005；它不是正式 24 小时 Gate D 或 production promotion。

## Review 范围

- [Attempt004b Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004b.md)
- [Attempt004b Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004b-preflight-review.md)
- [Attempt004b runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/run-10m-mature-database-regression.ts)
- [Attempt004b report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/gate-r5-20260727-mature-004b-report.json)
- [Attempt004b journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/gate-r5-20260727-mature-004b-journal.jsonl)
- [Attempt004b Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/java-gateway-18084.log)
- [Worker Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-sqlite-storage-worker-implementation-review.md)
- [Readiness Window Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-gate-d-worker-startup-readiness-window-implementation-review.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

## 主要发现

### Critical / High

- 无。20 个样本的 `hardFailures` 均为空，report 顶层 `failures` 为空。
- `storageWorkerMetrics.samples=20`，`workerUnavailableSamples=0`，`queueFullSamples=0`；Worker heartbeat 中位数 `2.400ms`、最大 `3.514ms`，未观察到主线程阻塞。
- admission p95 范围 `32.942–49.532ms`，冻结阈值为 `100ms`，连续超阈值次数为 `0`。
- replay p95 范围 `55.485–80.895ms`，冻结阈值为 `250ms`，连续超阈值次数为 `0`。

### Medium / 证据完整性

- 最大 RSS `472924160` bytes、最大 FD `106`、最大 WAL `5817472` bytes，均低于冻结资源阈值。
- 初始和最终 outbox 的 pending/retry/dead-letter 均为 `0`；Java trace sink 在运行期持续接收，最终无 dead letter。
- runner 在 Runtime 停止后执行 `PRAGMA integrity_check`；未产生 `SQLITE_FINAL_INTEGRITY_PROBE_FAILURE`。
- source、runner、plan、MCP 配置的运行前后绑定一致。报告内置 `reportHash` 为 `ba9a887c4cf5aedc09aa38053317eca62e824f6ed78500805fd68063ba9f8591`；包含该字段后的最终报告文件 SHA-256 为 `11120ae6a90f75154a1daf9e2373c5cf527bc7b712752997eb8497bcbba9abb8`。
- Runtime 端口 `3102` 和 Java 端口 `18084` 已释放，`runtimeCleanupVerified=true`；临时成熟库克隆已整体移入系统废纸篓，项目证据未删除。

## 最终建议

1. 接受 Attempt004b 为 Worker 架构的成熟库本地准入证据，完成 OpenSpec 4.1d。
2. 保持 Dashboard `proposed`：正式 24 小时 Gate D、结果 promotion、完整生产资格、契约冻结、closeout 与 archive 仍未完成。
3. 准备新的 no-overwrite Attempt005 packet；正式运行前必须取得绑定精确 runId、路径和 Gate D plan SHA-256 的独立启动审批。
4. Attempt005 运行期间不得修改固定的 24 小时、30 秒、10,000 conversations、20 concurrency、60/20/15/5 workload、2/12/22 小时 TS-only restart 或性能阈值。

## 后续门禁

- OpenSpec：active change `harden-agent-runtime-single-node-production` 保持 active；4.1d 可完成，4.2/4.3/4.5/4.6 与 closeout/archive 仍保持 open。
- Superpowers：SQLite Worker implementation plan Task 7 可关闭；下一步只准备 Attempt005 Plan/Preflight。
- 人工审批：正式 Gate D start、PASS 后 promotion、archive、Git publication 均需各自独立授权。
- Dashboard：本轮更新事实说明并重新渲染，但状态保持 `proposed`。
- 项目规则：未修改。
