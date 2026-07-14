# Agent Runtime Production Startup Command Attempt 02 Review

## 结论

通过（PASS）：Task 7 forward-fix 已关闭 Attempt 01 的 `tsx` CLI IPC blocker。Wrapper 现在通过 `node --import tsx` 加载同一 `src/index.ts` production entrypoint，保留 `set -eu`、`umask 077`、required SQLite path/token 与 production profile；RED/GREEN、71 files / 366 tests、typecheck、shell/static checks、OpenSpec strict validation和负向搜索全部通过。

## Review 范围

- [Attempt 02 plan Preflight](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-production-startup-command-attempt-02-plan-preflight-review.md)
- [Attempt 01 probe Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-controlled-production-probe-attempt-01-review.md)
- [Revised wrapper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh)
- [Wrapper contract test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionStartupScript.test.ts)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [Correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)

## 主要发现

### Critical — 无未解决 finding

Node loader probe已证明 TypeScript loader正常、无 CLI IPC创建；entrypoint no-env probe准确在 production profile校验处 fail closed。Wrapper没有改变 entrypoint、数据库、service auth或 lifecycle机制。

### Important — 无未解决 finding

- Test先改为期望 Node loader，旧 wrapper精确 RED；单行实现后 GREEN。
- 负向搜索不再存在 `exec tsx src/index.ts`、缺失 package `start` script调用、raw secret、live DB default或 tenant/user default。
- Wrapper仍为 executable `0755`，运行时文件权限由继承的 `umask 077`保护。
- Attempt 01后 live SQLite/JSON invariants已复核，probe id仍不存在，因此 Attempt 02可安全复用同一 single-write oracle。

## 验证记录

- RED：1 file / 1 test FAIL，期望 Node loader但观察到旧 CLI命令。
- Focused GREEN：4 files / 15 tests PASS。
- Full Runtime：71 files / 366 tests PASS。
- TypeScript：PASS。
- `sh -n` / executable bit：PASS。
- OpenSpec strict validation：PASS。
- `git diff --check`：PASS。

## 最终建议

自动进入 Task 8 Attempt 02，沿用已批准 exact scope/time/evidence path。若再次在启动/readiness/second-instance/HTTP/SQLite/JSON/lock/secret任一 oracle失败，立即停止并保留新 attempt evidence。

## 后续门禁

- OpenSpec：existing active change。
- Production：Task 8 Attempt 02已由用户 blanket authorization与原 exact preflight授权。
- Dashboard/tasks：probe Review前不更新。
- Git：不提交、不推送。
- 项目规则：未修改。
