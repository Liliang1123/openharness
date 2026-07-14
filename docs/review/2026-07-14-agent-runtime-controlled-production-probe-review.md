# Agent Runtime Controlled Production Probe Review

## 结论

通过（PASS）：Task 8 Attempt 03 在批准的 2026-07-14 18:00–18:45 Asia/Shanghai 时间窗内完成。真实 production Runtime 在 reviewed wrapper 下监听 `127.0.0.1:3001`；authenticated readiness 为 HTTP 200；第二实例被 descriptor-owned SQLite singleton lock 以 exit 1 拒绝；唯一一笔 scoped memory upsert 为 HTTP 200；owner query 精确返回 1，同租户另一用户返回 0；停止后端口释放、锁可重新获取/释放、SQLite integrity 为 `ok`、仅 memory facts 从 0 增至 1，其余 core counts 与 39 个 legacy JSON 哈希均未变化。

Attempt 03 的首次非提权启动在 `listen(127.0.0.1:3001)` 被 sandbox 以 `EPERM` 拒绝，发生在 listen/readiness/write 之前。随后按执行环境权限规则以受控提权重跑完全相同的 reviewed command并成功；该环境事件没有扩大 probe scope，也没有产生额外 production row。

## Review 范围

- [Attempt 03 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-controlled-production-probe-attempt-03-preflight-review.md)
- [Task 8 correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Reviewed production startup wrapper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [Singleton lock implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/singletonLock.ts)
- [Attempt 03 sanitized result](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/attempt-03-result.json)
- [Attempt 03 post-DB state](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/attempt-03-post-db-state.txt)
- [Attempt 03 post-SQLite files](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/attempt-03-post-sqlite-files.txt)
- [Attempt 03 post-JSON manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/attempt-03-post-json.sha256)
- [Immutable pre-DB state](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/pre-db-state.txt)
- [Immutable pre-JSON manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/pre-json.sha256)
- [Live production SQLite](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)

## 主要发现

### Critical — 无未解决 finding

- Runtime 只在受控提权上下文绑定 loopback；readiness 前没有任何业务写入。
- 第二实例报 `Runtime singleton lock is already held` 并以 exit 1 结束；第一实例仍是唯一 listener。
- 唯一 write 固定到 `gate-b-task8-tenant / gate-b-task8-user-a / gate-b-task8-20260714T093953Z`，数据库 post-audit 仅发现这一条目标 row。
- 同租户 `gate-b-task8-user-b` 的同 query 返回 0，且数据库中该 cross-user scope 的目标 row 为 0。
- 停机后 port 3001 无 listener；descriptor lock 实际重新获取和释放均成功。lock path 的零字节 inode持续存在是当前 descriptor-owned advisory lock设计，不代表 lock仍被持有。

### Important — durable-state reconciliation

- SQLite integrity：`ok`。
- Pre/post：conversations 38→38，messages 6,689→6,689，executions 0→0，active executions 0→0，pending approvals 0→0，runtime events 0→0，memory facts 0→1。
- SQLite main/SHM/WAL/lock 均为 owner-only `0600`；WAL 在停止后为 0 bytes。
- 39 个 legacy `.json` 文件 pre/post SHA-256 manifest逐字节一致，证明本 probe未恢复 JSON write authority或产生 dual-write。
- Sanitized evidence不包含 bearer token或 raw canary content；API response仅在 `0600` 临时文件中短暂保存，收尾后删除。

### Minor — 运行环境说明

- sandbox 内部与受控提权进程使用不同 local-network namespace；因此非提权 curl无法连接已监听进程。提权 curl只访问 `127.0.0.1`，没有外部网络调用。
- PTY 发送 `SIGINT` 后 pnpm wrapper报告 exit 1；判定依据采用必须满足的 shutdown postconditions（port unbound、SQLite clean、WAL zero、lock reacquire/release），这些条件全部通过。

## 最终建议

接受 Task 8 Steps 1–3 为完成，并进入单独的 Stage 0 Gate B total reconciliation。该 reconciliation 必须把既有 backup/import/quarantine/crash/permission证据与本次 write-authority probe逐项映射到 OpenSpec tasks 2.1–2.7；不得仅凭本 probe把整项 active change标记为 verified或 archived。

## 后续门禁

- OpenSpec：继续 active `harden-agent-runtime-single-node-production`；先完成 Gate B total reconciliation，再判断 tasks 2.6/2.7。
- Superpowers：现有 correction plan足够，不需要为本 probe新建 proposal或实施计划。
- Gate C / Gate D：本 Review不覆盖真实 OpenAI-compatible matrix与正式 24-hour soak，必须继续以真实证据执行。
- Dashboard：本 Review不提升整项 change状态。
- Git：未 staging、commit、push或 archive。
- 项目规则：未修改。
