# Agent Runtime SQLite Storage Worker Task 05 Review

## 结论

通过。Task 5 已将 trace outbox、WAL checkpoint、critical drain、readiness/admission 与生产 shutdown 全部迁到命名 Worker 语义端口；生产 Server 不再读取 raw database 或 repositories。

## Review 范围

- [traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [traceOutboxDispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- [runtimeStorageMonitor.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageMonitor.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- 对应 outbox、dispatcher、monitor、production lifecycle 与 admission 测试。

## 主要发现

- 严重度：无阻塞项。
- main thread 仅并发执行 Java trace I/O；Worker `outbox.claim` 返回 immutable candidates，所有 delivery outcomes 最后只通过一次 `outbox.applyOutcomes` 整批事务提交。
- Dispatcher `start()` 异步建立 durable dead-letter readiness，未初始化前不报告 ready；close 等待 in-flight batch。
- Monitor 的磁盘采样留在 main thread，WAL truncate 通过一个 P2 `storage.checkpoint`；首轮和周期均 await，调度 seam 可验证且不允许重叠周期。
- critical storage latch 触发一个 P0 `storage.criticalDrain`，发布其 committed interruption events，再关闭 Fastify。
- 生产 readiness 合并 monitor、dispatcher 与 Worker queue/availability；admission 在 Worker unavailable/queue-full 时 fail closed。
- Fastify onClose 按 monitor close、dispatcher close、Worker close/join、singleton lock release 顺序完成。

## 验证记录

- Operational RED：异步 dispatcher/monitor 首轮仍按同步断言，8 个测试按预期失败。
- `pnpm --filter @openharness/agent-runtime test -- traceOutbox traceOutboxDispatcher runtimeStorageMonitor productionServerLifecycle productionServerAuth runtimeStorageAdmission`：通过，5 个测试文件、29 个测试。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `git diff --check`：通过。
- production raw access scan：Server/production context 无 `context.database` 或 `context.repositories` 使用。

## 最终建议

进入 Task 6，用真实线程/独立进程证明 before-commit 与 after-commit-before-response 崩溃边界、outstanding RPC 拒绝、无自动替换，以及成熟形态写负载下 main-thread heartbeat 不超过冻结阈值。

## 后续门禁

- OpenSpec：继续 active change `harden-agent-runtime-single-node-production`。
- Superpowers：继续串行 TDD。
- 测试：Task 6 必须使用真实 Worker/独立 Runtime process，不以 mock 代替崩溃与 heartbeat 证据。
- 人工审批：无需新增审批；Git 提交、推送和发布仍未授权。
