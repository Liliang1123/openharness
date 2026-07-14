# Agent Runtime Production Startup Command Plan Preflight Review

## 结论

通过（PASS）：修订后的 Task 7 已关闭原启动命令的假阳性缺陷，并把 production startup wrapper 拆为静态 RED test、最小 wrapper、非执行式 GREEN 验证和独立 Review。该修订仍处于已批准的 `harden-agent-runtime-single-node-production` SQLite sole-write-authority 范围内。

本 PASS 仅授权创建和静态验证 wrapper；不授权执行 wrapper、启动 Runtime、读取或写入 live SQLite、使用生产凭证、运行 controlled production probe、更新 Stage 0 tasks/dashboard 或推进 Runtime parity。

- 被评审 plan revision SHA-256：`c19bc38f4ab37f29e00dbe286465a800f1c11df38bd4dd8876d6c7b11a2eb2ed`
- Evidence profile：`strict`

## Review 范围

- [Task 7 correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Previous full-plan Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan-preflight-review.md)
- [Tasks 1–5 implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-agent-runtime-sqlite-write-authority-correction-implementation-review.md)
- [Agent Runtime package manifest](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [Direct-execution guard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts)
- [Active Stage 0 OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/)

## 主要发现

### Critical — 原 `start` 命令会静默成功但不启动进程，已在 plan 中修正

`@openharness/agent-runtime` 只有 `dev`、`eval:replay`、`eval:smoke`、`test` 和 `typecheck` scripts，没有 `start`。实测 `pnpm --filter @openharness/agent-runtime run start` 输出 `None of the selected packages has a "start" script`，但退出码仍为 `0`。因此原 wrapper 可能被控制面误判为启动成功。

修订后的 plan 直接使用包内已安装且验证可发现的 `tsx`：`pnpm --filter @openharness/agent-runtime exec tsx src/index.ts`。实测 `pnpm --filter @openharness/agent-runtime exec tsx --version` 返回 `tsx v4.22.3`，无需新增或改变 package script。

### Important — TDD 与非执行式验证边界完整

Task 7 先创建 Vitest 静态 contract test，并要求在 wrapper 不存在时观察 RED；随后仅创建 wrapper，再运行 focused tests、`sh -n`、可执行位和锚点检查。所有验证均不执行 wrapper，也不会触碰 Runtime、端口、live SQLite 或凭证。

### Pass — fail-closed 与唯一 production entrypoint 保持不变

wrapper 仍在任何 Node/pnpm 进程前设置 `set -eu` 和 `umask 077`，强制外部提供 SQLite absolute path 与 service token，并设置 `AGENT_RUNTIME_PROFILE=production`。最终执行既有 [index.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts)，继续由 [productionEntrypoint.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts) 校验 absolute path、token、host、port 和 close lifecycle。

### Pass — Scope、Git 与生产授权边界未扩大

本修订只影响 Task 7 的 plan 内容；没有新增 OpenSpec、没有修改 Runtime source、没有改 package manifest、没有更新 dashboard/tasks，也没有授权 Git staging/commit/push。Task 8 仍明确要求 exact command/time/evidence path 的独立人工授权。

## 最终建议

1. 按修订后的 Task 7 执行严格 RED → GREEN，只创建 wrapper 与静态 test。
2. wrapper 创建后运行 focused tests、shell syntax、executable bit、negative secret/default-path search 和完整 diff Review。
3. 将 Task 7 Review 结论单独落盘；在 PASS 前保持 Runtime 停止。
4. Task 8 controlled production probe 另行准备 exact command、时间窗、evidence no-overwrite path 和停止条件，再请求用户授权。

## 后续门禁

- OpenSpec：继续使用 active `harden-agent-runtime-single-node-production`；无需新 proposal，不得 archive。
- Superpowers：Task 7 使用 TDD、fresh verification 和 distinct Review；任何 finding 返回同一切片修复与复核。
- Production Runtime：保持停止；本 Preflight 不授权执行 wrapper。
- Live SQLite：不得读取、写入、删除、重建、导入或恢复 JSON write authority。
- Stage 0 tasks/dashboard：保持不变。
- Runtime parity：继续 blocked。
- 项目规则：未修改。

## 验证记录

- `pnpm --filter @openharness/agent-runtime run start`：未找到 `start` script；输出明确，但退出码为 `0`，复现假阳性。
- `pnpm --filter @openharness/agent-runtime exec tsx --version`：PASS，`tsx v4.22.3`。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS。
- Plan placeholder / unauthorized Git step scan：PASS；仅 Git authority 禁止项命中。
- `git diff --check`（plan）：PASS。
- Runtime/live data：未启动 Runtime，未执行 wrapper，未读取或写入 live SQLite。
