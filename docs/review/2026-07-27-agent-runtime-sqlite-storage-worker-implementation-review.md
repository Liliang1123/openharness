# Agent Runtime SQLite Storage Worker Implementation Review

## 结论

通过。Dedicated SQLite Storage Worker 实现满足已批准的 OpenSpec 语义：生产主线程不再持有 SQLite connection/repository，Worker 协议和结果均运行时校验，队列有界且公平，生命周期保持 commit-before-publish，Worker 崩溃与协议损坏 fail closed，正常关闭完成 checkpoint/close/join 后才释放 singleton lock。High Review 发现的协议闭合、错误结果响应、准入失败进程态残留与异常退出锁顺序问题均已修复并回归通过；当前无未解决 Critical/High finding。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Agent Runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [Implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-sqlite-storage-worker.md)
- [Worker protocol](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerProtocol.ts)
- [Bounded scheduler](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageCommandScheduler.ts)
- [Worker kernel](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts)
- [Worker entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorker.ts)
- [Worker client](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerClient.ts)
- [Production context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts)
- [Production server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [Agent runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentExecutionRunner.ts)
- [SSE stream loop](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts)
- [Trace outbox dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- [Storage monitor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageMonitor.ts)
- [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- 对应 Worker protocol/scheduler/kernel/client/crash/heartbeat、production persistence/server、SSE、outbox、monitor 测试及完整工作区差异。

## 主要发现

### Critical

无。

### High（已修复）

1. 初版请求解析只验证必要字段，仍会忽略语义 payload 的额外字段；现已按 operation 严格限制顶层字段，并验证 lifecycle crash 枚举与 outbox transition 条件字段。
2. 初版 client 只验证 response envelope，错误的 operation-specific success result 可能被当作成功；现已对 bootstrap、lifecycle、scoped stores、event、outbox、checkpoint、critical drain 和 close 结果逐类验证，错误形状原子触发 unavailable。
3. 在错误 result 的早期修复中，client 曾先清除 current 再触发 unavailable，导致当前 Promise 未被拒绝；TDD 重现后已改为在 scheduler completion 前校验，当前/排队请求均确定性拒绝。
4. 持久化 start admission 拒绝时，ProcessExecutionStateStore 曾残留 `running`；现已在 admission rejection 路径转为 `errored` 并保留稳定 reason，新请求不会遇到幽灵 active execution。
5. Worker unexpected exit 的初版关闭顺序可能过早释放 singleton lock，且 unavailable callback 可能观察旧 shutdown promise；现已先建立 join/terminate promise，只有显式 `close()`/bootstrap cleanup 等待完成后才释放锁。
6. 正常 `storage.close` 现明确先执行 `PRAGMA wal_checkpoint(TRUNCATE)`，再关闭 connection、退出 Worker、释放锁。

### Medium

1. 生产路径只通过 [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts) 创建 Worker-backed adapters。仍保留的同步 SQLite adapters、importer 与 baseline code 是测试/离线资格验证边界，negative scan 未发现生产 server/context 直接持有 database/repositories。
2. Trace Java 网络投递仍在主线程并保持并发；Worker 只执行 claim 与一次 whole-batch outcome transaction，没有引入被 R9 否决的 transition chunk crash boundary。
3. SSE 在 durable admission 成功前不发送 HTTP 200；随后 subscribe-before-async-replay，live 事件先缓冲、按 cursor 顺序排放并用 eventId 去重。
4. P0/P1/P2 scheduler 保持 2,048 pending bound、单 in-flight、P0 exclusive、lane FIFO 和 32:1 fairness。Queue full 不 enqueue、不 drop、不绕过 durable start。
5. Worker error output只返回稳定 code/errorClass，不返回 SQL、路径 payload、bearer token 或 stack。High Review 的源码与新证据扫描未发现 Worker 泄密输出。

### Low

1. P0a integration 允许通过 `P0A_BACKEND_PORT` 改用未占用端口；默认仍为 18080，不改变外部契约。此次全量验证使用 18081 是因为本机 18080 已由用户的 OrbStack 服务占用，未停止或修改用户进程。
2. Worktree 中历史 Gate R1–R9 与 recovery/mature evidence 是本次 active change 的既有审计制品；未发现本次测试遗留的 Worker、Runtime listener 或新临时文件。
3. 未执行 Git add、commit、push、reset、clean、PR 或外部发布。

## 验证记录

- Worker focused matrix：11 个文件、67 个测试，通过。
- `P0A_BACKEND_PORT=18081 pnpm test`：Shared 60、Agent Runtime 682、Frontend 24、Integration 17，合计 783 个测试，通过。
- `pnpm typecheck`：Shared、Agent Runtime、Frontend 全部通过。
- `mvn -o -f backend/pom.xml test`：213 个测试，0 failure、0 error。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：通过。
- `npx openspec validate --all --strict --no-interactive`：23 项通过、0 失败。
- `pnpm dashboard:check`：通过，36 entries，生成物为 current。
- `git diff --check`：通过。
- Worker heartbeat：成熟形态 100-row transition 与 20 并发 admission 业务链下低于冻结的 100ms 阈值。

## 最终建议

实施 Review 通过后可标记 OpenSpec 4.1b/4.1c。4.1d 必须继续保持未完成，直到使用冻结 Attempt003 workload/threshold/source binding 的全新成熟数据库 10 分钟回归满足 20/20 sample、admission median/p95、连续超 100ms 限制、correctness/replay/resource/integrity 和 Worker/queue oracle。

成熟回归通过后仅准备 Attempt005 Plan/Preflight；正式 24 小时 Gate D 仍需要对最终 runId、路径和 plan SHA 的独立明确 start approval，PASS 后还需要独立 promotion approval。当前实现可进入本地完整运行体验，但不能据此声称 production Gate D 已通过。

## 后续门禁

- OpenSpec：active change 保持未归档；4.1d、4.2、4.3 及最终 freeze/archive 尚未完成。
- Superpowers：继续执行成熟数据库 10 分钟 packet 的 Plan Review、Preflight Review、单次运行和 Result Review。
- 测试：成熟回归失败时必须保持 Dashboard `proposed`，不得启动 Attempt005。
- 人工审批：Git 写操作和正式 24 小时 Gate D start/promotion 均未由本 Review 授权。
- 项目规则：未修改。
