# Agent Runtime Controlled Production Probe Preflight Review

## 结论

通过（PASS）：Task 8 controlled production probe 已具备 exact scope、time window、no-overwrite evidence path、ephemeral service credential、single-write oracle、cross-user negative oracle、second-instance fencing、stop/cleanup 条件和 post-probe reconciliation。用户已在 2026-07-14 明确授权后续门禁自动审批与闭环执行。

本 PASS 只授权下述 bounded probe。它不授权 provider credential、真实 Provider matrix、24-hour Gate D、archive、Git commit/push、live DB 删除/重建、JSON write authority 恢复或重复 import/cutover。

## Review 范围

- [Task 8 correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Task 7 wrapper Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-production-startup-command-review.md)
- [Production startup wrapper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [Live production SQLite](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)
- [Production cutover state](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-cutover-state.json)
- [Task 8 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/)
- [Legacy JSON source](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/sessions/)
- [Ephemeral token file](file:///private/tmp/openharness-task8-20260714T093953Z.token)

## 主要发现

### Critical — 无未解决 finding

- Runtime / port 3001 当前无 listener。
- Live SQLite main/SHM/WAL 均为 owner-only `0600`；parent production layout 已由前序 Gate B Review 固化。
- Cutover state 为 `mode=forward_fix_only`、`legacyWritesAllowed=false`；本 probe 不执行 import/cutover/restore。
- Task 7 wrapper 与 71 files / 366 tests、typecheck、OpenSpec strict validation已有 PASS 证据。

### Important — exact operation 与单写 oracle

- Time window：2026-07-14 17:40–18:15 Asia/Shanghai；超窗未开始则重新 Preflight。
- Working directory 固定为 [integration worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)。
- Runtime 通过 reviewed wrapper 启动；SQLite path 指向已 cutover live database；service token 使用 `0600` ephemeral file生成且不打印。
- Readiness 使用 authenticated `GET /api/v1/memory/facts`，完整携带 tenant/user/trace/request headers。
- 唯一 write 使用固定 scope `gate-b-task8-tenant / gate-b-task8-user-a` 与固定 memory id `gate-b-task8-20260714T093953Z`；内容为非敏感 probe canary，证据不落 raw content。
- 同租户 `gate-b-task8-user-b` 对同一唯一 query 返回 0 facts；owner scope 返回 1 fact。
- 第二个 Runtime 进程必须因同一 descriptor-owned SQLite lock 非零退出，不得 listen。

### Stop conditions

任一情况立即停止 Runtime并保留 partial evidence：readiness 超时、second instance 未失败、HTTP status 非预期、cross-user result 非 0、owner result 非 1、SQLite count delta 非预期、integrity 非 `ok`、main/SHM/WAL mode 非 `0600`、JSON hash/mtime 改变、lock 无法重新获取、端口未释放、日志/证据含 raw token或敏感内容。

## 最终建议

按 precheck → start/readiness → second-instance → scoped write/read isolation → graceful stop → postcheck 顺序一次执行。不得重试写入同一 memory id 以外的其他 production row；失败只允许停止和 forward-fix，不允许重做 cutover。

## 后续门禁

- OpenSpec：继续 active `harden-agent-runtime-single-node-production`；probe PASS 后才可评审 tasks 2.6/2.7。
- Production：本次 exact bounded probe已授权；Provider/Gate D仍按各自真实证据门禁。
- Evidence：所有结果写入新的 no-overwrite evidence directory，不包含 raw token或 raw row content。
- Dashboard：probe本身不提升状态；Gate B reconciliation Review 后再决定。
- Git：不 staging、commit、push或 archive。
- 项目规则：未修改。
