# Agent Runtime Controlled Production Probe Attempt 03 Preflight Review

## 结论

通过（PASS）：Attempt 03 可在 2026-07-14 18:00–18:45 Asia/Shanghai 的新时间窗内执行。前两次尝试均已停止且没有产生 production write；当前 port 3001 无 listener、SQLite integrity 为 `ok`、目标 probe row 和全部 memory facts 均为 0、39 个 legacy JSON 文件的 SHA-256 与 immutable pre-probe manifest 完全一致。

本 PASS 仅授权原 Task 8 的 bounded probe：启动 reviewed wrapper、authenticated readiness、同一 SQLite descriptor 的 second-instance fencing、唯一一笔 scoped memory upsert、owner/cross-user read oracle、graceful stop 与 post-probe reconciliation。不得执行 import/cutover、删除或重建 live SQLite、恢复 JSON write authority、Provider matrix、24-hour Gate D、Git commit/push 或 OpenSpec archive。

## Review 范围

- [Task 8 correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Original controlled-probe preflight](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-controlled-production-probe-preflight-review.md)
- [Attempt 01 failure review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-controlled-production-probe-attempt-01-review.md)
- [Corrected startup wrapper review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-production-startup-command-attempt-02-review.md)
- [Production startup wrapper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh)
- [Live production SQLite](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)
- [Task 8 no-overwrite evidence directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/)
- [Immutable legacy JSON pre-manifest](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/pre-json.sha256)
- [Ephemeral credential file](file:///private/tmp/openharness-task8-20260714T093953Z.token)

## 主要发现

### Critical — 无未解决 finding

- Attempt 01 在 application entrypoint 之前因 `tsx` CLI IPC `EPERM` 停止；已用 reviewed `node --import tsx` wrapper forward-fix。
- Attempt 02 与后续 integrated attempt 均已停止。当前无 listener；production SQLite 仍为 38 conversations、6,689 messages、0 executions、0 runtime events、0 memory facts，固定 probe id 不存在。
- SQLite directory 为 `0700`，main database 与 ephemeral token 为 `0600`；cutover state 仍为 `forward_fix_only` 且 `legacyWritesAllowed=false`。
- 39 个 legacy `.json` 文件按原 manifest 口径重算，无新增、删除或内容哈希变化。

### Important — exact operation 与 oracle

- Scope 固定为 tenant `gate-b-task8-tenant`、owner `gate-b-task8-user-a`、negative reader `gate-b-task8-user-b`、memory id `gate-b-task8-20260714T093953Z`。
- 唯一写入内容为非敏感 canary；证据仅记录 status、scope、id 和 count，不记录 raw credential 或 raw content。
- Readiness 和全部 API 请求必须携带 service bearer token 及 tenant/user/trace/request headers。
- 第一实例 ready 后，第二实例必须因 singleton lock 非零退出且不得 listen；owner query 必须恰好返回 1，cross-user query 必须返回 0。
- 停机后必须确认 port unbound、lock 可重新获取/释放、integrity `ok`、仅 memory facts 增加 1、其他 core counts不变、main/WAL/SHM owner-only、legacy JSON manifest不变。

### Stop conditions

任一 readiness/HTTP/oracle/second-instance/lock/integrity/count/mode/manifest 条件不符，立即停止第一实例并保留 partial evidence；不得用第二个 id 重试，不得删除已产生的 production row，不得重跑 import/cutover。

## 最终建议

按 start → readiness → second-instance fencing → one upsert → owner read → cross-user read → graceful stop → immutable reconciliation 一次执行。前序失败不授权扩大 scope，本 Attempt 03 继续使用原 no-overwrite evidence directory并新增 attempt-specific evidence。

## 后续门禁

- OpenSpec：继续 active `harden-agent-runtime-single-node-production`；本 probe PASS 仍需独立 Gate B reconciliation Review 才能更新 tasks 2.6/2.7。
- Dashboard：本 probe不提升整项 change 状态。
- Provider/Gate D：不在本门禁授权范围内，必须使用各自真实证据。
- Git：不 staging、commit、push或 archive。
- 项目规则：未修改。
