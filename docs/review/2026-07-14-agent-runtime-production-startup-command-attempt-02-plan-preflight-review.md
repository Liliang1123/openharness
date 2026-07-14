# Agent Runtime Production Startup Command Attempt 02 Plan Preflight Review

## 结论

通过（PASS）：Task 7 Attempt 02 plan revision 以最小机制修复 Attempt 01 的 sandbox IPC blocker。新 wrapper契约使用 `pnpm --filter @openharness/agent-runtime exec node --import tsx src/index.ts`，保留原 fail-closed环境检查、production profile、`umask 077` 和唯一 entrypoint，不扩大 Runtime行为或 persistence契约。

- 被评审 plan revision SHA-256：`594c4a209397420649f8970daac96069a69bbcaccadbcac3809e0a1c904b1b15`

## Review 范围

- [Revised correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Attempt 01 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-controlled-production-probe-attempt-01-review.md)
- [Current wrapper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh)
- [Wrapper test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionStartupScript.test.ts)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)

## 主要发现

### Critical — 无未解决 finding

根因已经单变量验证：`tsx` CLI失败于 IPC pipe；`node --import tsx` loader正常工作并进入 existing entrypoint配置校验。Plan不新增 package `start` script，不改变 `src/index.ts`/production lifecycle，也不绕过 TypeScript loader。

### Important — RED/GREEN 与 scope完整

先将静态 contract test期望改为 Node loader并观察旧 wrapper RED；随后只改 wrapper命令。GREEN必须包含 focused/full Runtime、typecheck、shell syntax、executable bit、OpenSpec strict validation、secret/default-path/legacy CLI负向搜索和 distinct Review。

## 最终建议

按修订 plan执行单行 forward-fix。Task 7 Attempt 02 Review PASS 后自动进入 Task 8 Attempt 02；复用原 probe id，因 Attempt 01 未产生写入。

## 后续门禁

- OpenSpec：existing change，no new proposal。
- Production：在 Task 7 Review PASS 前不重启 Runtime。
- Evidence：Attempt 01 immutable；Attempt 02新增文件，不覆盖。
- Dashboard/tasks/Git：不更新、不提交、不推送。
- 项目规则：未修改。

## 验证记录

- `node --import tsx -e` loader probe：PASS。
- Entry point no-env probe：准确 fail closed于 production profile检查，无 IPC error。
- OpenSpec strict validation：PASS。
- Plan diff check：PASS。
