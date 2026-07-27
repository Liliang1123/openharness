# Agent Runtime 存储压力生产接线实现 Review

## 结论

**通过。** WAL/low-disk protection 已从纯阈值函数补齐为 production-owned monitor、authenticated external-mutation admission gate、composite readiness 与 critical drain/close 生命周期。实现符合 active OpenSpec 已批准边界，无 Critical 或 Important 未关闭 finding，可以进入最终源状态的真实恢复回归准备。

本结论只覆盖 storage pressure production wiring；不代表 Java trace sink 长期容量已经解决，也不替代正式 24 小时 Gate D 与 promotion 审批。

## Review 范围

- [存储压力生产接线计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-storage-pressure-production-wiring.md)
- [计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-storage-pressure-production-wiring-plan-review.md)
- [disk guard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/diskGuard.ts)
- [runtime storage monitor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageMonitor.ts)
- [production server wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [monitor tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageMonitor.test.ts)
- [admission tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageAdmission.test.ts)
- [production lifecycle tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionServerLifecycle.test.ts)
- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 通过依据

1. production monitor 在 `start()` 时立即采样，健康状态每 `60,000ms` 再采样；默认读取实际 SQLite 文件所在文件系统，并把缺失 WAL 视为 0。
2. WAL `>=256 MiB` 时使用当前 Runtime 单一 database connection 执行 `PRAGMA wal_checkpoint(TRUNCATE)`，没有创建第二写权威。
3. checkpoint BUSY 立即将 readiness/admission 设为 `RUNTIME_WAL_CHECKPOINT_BUSY`，以 `250ms` 间隔在 `5,000ms` deadline 内重试；deadline 耗尽后保持 fail closed，60 秒后重新开启独立观察周期。
4. low 与 critical watermark 继续唯一复用 `evaluateDiskGuard`；阈值没有复制、放宽或改写。
5. admission hook 在 service token 与 identity 校验之后执行，只拦截 `POST/PUT/PATCH/DELETE`；GET、readiness、session read/replay 不被存储压力 gate 拦截。
6. storage readiness 优先于 trace outbox readiness；storage 恢复后会自动回到 trace outbox 的当前状态，不会掩盖 durable dead letter。
7. critical 状态 latch，只触发一次 drain。drain 枚举在途 execution，并通过现有 lifecycle Unit of Work 逐 execution 原子写入 `EXECUTION_INTERRUPTED`、approval invalidation、provisional cleanup 与 durable terminal event；随后关闭 Fastify，onClose 依次停止 monitor、等待 dispatcher、关闭 SQLite 并释放 singleton lock。
8. 初始 critical sample 会让 production server 创建失败并释放 lock；运行中 critical test 已实际观察在途 execution 变为 `errored/EXECUTION_INTERRUPTED` 且存在对应 `stream_error`。
9. monitor 及 admission 的 deterministic seam 只由显式 `createProductionServer` option 注入；production entrypoint 不传该 option，默认始终创建真实 monitor。
10. 告警只输出稳定 storage code，不包含 token、payload、trace attributes 或 database content。

### 验证记录

- TDD RED：
  - monitor suite 因模块不存在而失败；
  - admission suite 观察 authenticated POST 实际返回 `200` 而不是预期 `503`；
  - production lifecycle suite 观察 monitor 未启动、critical callback 未接线。
- focused：9 files / 56 tests PASS。
- workspace full：shared 60 + Runtime 640 + Frontend 24 + Integration 17 = 741 tests PASS。
- workspace typecheck：PASS。
- Java backend：208 tests PASS。
- OpenSpec strict validation：PASS。
- dashboard check：PASS。
- `git diff --check`：PASS。

### Advisory

1. critical drain 是设计要求的 best-effort；若底层文件系统已经无法提交 reserved terminal write，代码记录稳定告警并关闭，未提交的在途状态仍由下一次 startup reconciliation 收敛。
2. 本实现保护 Runtime SQLite 与 admission，不解决 Java `TraceService` 当前逐条 stdout 与内存保留造成的长期容量风险。

## 最终建议

保持当前 storage wiring。下一步先单独完成 Java trace sink 的 OpenSpec 边界判断；若无需改变已批准外部契约，则完成最小容量修复后，再以最终源 hash 执行一次新的固定 60 分钟真实恢复回归，避免源变更后重复跑一小时。

## 后续门禁

- **OpenSpec proposal：** 本次不需要新增；Java retention/durability 或可见查询语义若改变，必须先创建或更新 change。
- **Superpowers plan：** Java 风险完成边界判断后再决定是否生成可执行计划。
- **测试：** Java 风险收口后需复跑受影响测试，并执行一次新的固定 60 分钟真实恢复回归。
- **人工审批：** 本地回归不需要；正式 Gate D start approval 与 post-result promotion approval 不变。
- **归档 / dashboard：** 当前不得归档 active change，也不得同步为 `verified`。
