# Agent Runtime 存储压力生产接线计划

> 模式：OpenSpec 精简模式；适用 change：`harden-agent-runtime-single-node-production`

## 目标

补齐 active OpenSpec 已批准、但当前只存在纯函数测试而没有 production wiring 的 WAL/low-disk 保护：

- production 启动时立即采样，之后每 60 秒采样 SQLite WAL 与所在文件系统；
- WAL 达到 256 MiB 时执行 `TRUNCATE` checkpoint；
- reader 导致 checkpoint BUSY 时记录无敏感信息的告警、停止外部 mutation admission，并在 5 秒 deadline 内有界重试；
- 可用磁盘低于 `max(2 GiB, 10%)` 时停止新 execution 与所有外部 mutation；
- 可用磁盘低于 `max(512 MiB, 2%)` 时进入 critical drain，尽力原子终止在途 execution，然后关闭 Runtime；
- 正常恢复后自动恢复 admission；
- readiness 暴露明确的存储压力 reason，同时保留 trace dead-letter readiness。

## 依据

- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [现有纯 disk guard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/diskGuard.ts)
- [production server lifecycle](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [startup reconciliation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/reconcile.ts)
- [Admission 写竞争实现 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-admission-write-contention-recovery-implementation-review.md)

## OpenSpec 边界

这是已批准 runtime storage safety contract 的缺失接线，不新增 capability，因此不创建新 proposal。

允许修改：

- [diskGuard.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/diskGuard.ts)（仅在必要时补充可复用类型）；
- 新增 `agent-runtime/src/storage/runtimeStorageMonitor.ts`；
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)；
- 对应 monitor、disk guard 与 production lifecycle tests；
- 本次 Review、计划与验证证据。

禁止修改：

- SQLite schema/migration、outbox 状态机、retry policy、batch size/concurrency；
- performance workload、sample interval、固定阈值；
- data retention 或 Java trace sink；
- 已有 recovery attempts 001/002/003 证据；
- dashboard 状态与 OpenSpec task checkbox。

## Task 1：TDD 锁定 monitor 状态机

先新增失败测试，覆盖：

1. start 立即采样，健康状态允许 admission，并安排 60 秒下一次检查；
2. WAL `>=256 MiB` 执行 `PRAGMA wal_checkpoint(TRUNCATE)`；
3. checkpoint BUSY 时 readiness/admission fail closed、记录告警并按短间隔在 5 秒 deadline 内重试；
4. checkpoint 成功或 WAL 回落后恢复；
5. low disk 拒绝外部 mutation、critical disk 只触发一次 critical callback；
6. stat/checkpoint 未知错误 fail closed；
7. close 取消定时器且不再采样。

## Task 2：最小 monitor 实现

1. 默认采样 SQLite 文件所在文件系统的 `bavail * bsize` 与 `blocks * bsize`，缺失 WAL 视为 0。
2. 复用现有 `evaluateDiskGuard` 阈值，不复制或调整阈值。
3. WAL checkpoint 使用当前单一 Runtime database connection，不另开写权威。
4. BUSY episode 在 5 秒 deadline 内以 250ms 有界重试；deadline 耗尽后保持 admission blocked，下一个 60 秒检查周期重新评估。
5. warning 只包含稳定 code/计数，不记录 service token、request payload 或 trace attributes。
6. critical 状态 latch，避免重复 drain/close。

## Task 3：production admission/readiness/drain 接线

1. `createServer` 增加只读 admission provider；认证与 identity 校验完成后，对 `POST/PUT/PATCH/DELETE` fail closed 返回 `503`，GET/SSE/readiness 不受 mutation gate 拦截。
2. `createProductionServer` 创建并拥有 storage monitor；组合 storage 与 trace-outbox readiness。
3. critical callback 枚举在途 execution，并通过现有 lifecycle Unit of Work 逐 execution 原子写入 `EXECUTION_INTERRUPTED`、approval invalidation 与 durable terminal event；随后关闭 Fastify、dispatcher、MCP、monitor、SQLite 与 singleton lock。
4. 初始 critical sample 阻止生产服务成功创建；low/BUSY 可保持进程存活但 unready 且拒绝 mutation。
5. 增加受控 dependency seam，只供 deterministic lifecycle tests 注入样本/调度，不改变 production entrypoint 默认行为。

## Task 4：验证与收口

1. 观察新增测试 RED，再实现至 GREEN。
2. 运行 disk guard、storage monitor、production lifecycle、sessions/memory/trace dispatcher focused suite。
3. 运行 Runtime full tests、workspace full tests、workspace typecheck、Java backend、OpenSpec strict、dashboard check 与 `git diff --check`。
4. 独立实现 Review，确认认证优先级、只拦截外部 mutation、critical drain、资源关闭顺序与恢复语义。
5. Review 通过后，基于最终源 hash 只执行一次新的固定 60 分钟真实恢复回归；不得覆盖历史证据。

## 不在本计划内

- Java `TraceService` 的 retention、stdout 或内存策略；
- 正式 24 小时 Gate D start approval 与 post-result promotion approval；
- OpenSpec archive、dashboard `verified`/`archived` 或前端开发。
