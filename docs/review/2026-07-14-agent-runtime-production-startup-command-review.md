# Agent Runtime Production Startup Command Review

## 结论

通过（PASS）：correction plan Task 7 已按 RED → GREEN 完成。production startup wrapper 在启动任何 Node/pnpm 进程前执行 `set -eu` 与 `umask 077`，强制外部提供 SQLite path 和 service token，并直接进入已评审的 production entrypoint；静态 contract test、focused/full Runtime tests、typecheck、shell syntax、executable bit、OpenSpec strict validation、secret/default-path 负向搜索和完整 diff Review 均通过。

本 PASS 只关闭 Task 7 wrapper gate。未执行 wrapper、未启动 Runtime、未访问 live SQLite、未使用凭证，也不授权 Task 8 controlled production probe、Gate B promotion、Stage 0 task/dashboard 更新或 Runtime parity。

## Review 范围

- [Task 7 correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Task 7 Plan Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-production-startup-command-plan-preflight-review.md)
- [Production startup wrapper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh)
- [Production startup wrapper test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionStartupScript.test.ts)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [Direct-execution guard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts)
- [Agent Runtime package manifest](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [Active Stage 0 OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/)

## 主要发现

### Critical — 无未解决 finding

原 plan 使用不存在的 package `start` script；pnpm 会输出缺失信息但退出码为 `0`，可能形成启动假阳性。修订后的 wrapper 使用 `pnpm --filter @openharness/agent-runtime exec tsx src/index.ts`，命令解析到 Agent Runtime package 目录并直接运行唯一 production entrypoint，不再依赖缺失 script。

### Important — 无未解决 finding

- Fail-closed order：`set -eu`、`umask 077`、SQLite path/token presence checks 和 production profile export 全部先于 `exec pnpm`。
- Credential/data boundary：wrapper 与 test 不包含 secret、bearer token、provider key、live SQLite path、tenant/user default 或数据库内容。
- Entrypoint boundary：[index.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts) 只在 direct execution 时调用 `main()`；[productionEntrypoint.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts) 继续校验 production profile、absolute SQLite path、non-empty service token 和合法端口。
- File mode：wrapper 为 executable `0755`；脚本本身不包含敏感值，运行时创建文件权限由继承的 `umask 077` 约束。
- TDD evidence：新 test 首次因 wrapper 不存在而在 `existsSync` 断言处 RED；创建最小 wrapper 后转为 GREEN。

### Residual — Task 8 exact operator command 必须固定 workspace working directory

`pnpm --filter` 从 OpenHarness workspace 根目录解析 package，并把 `exec` 工作目录切换到 Agent Runtime package；静态审查和 `pnpm --filter @openharness/agent-runtime exec pwd` 已验证 package cwd。Task 8 的 exact command 应先进入 [integration worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/) 再调用 wrapper。该前置条件在 Task 8 独立授权中固化，当前不执行生产命令。

## 验证记录

- RED：`pnpm --filter @openharness/agent-runtime test -- productionStartupScript` → 1 file / 1 test FAIL，原因是 wrapper 不存在。
- GREEN focused：`pnpm --filter @openharness/agent-runtime test -- productionStartupScript productionEntrypoint productionServerLifecycle serviceAuth` → 4 files / 15 tests PASS。
- Full Runtime：`pnpm --filter @openharness/agent-runtime test` → 71 files / 366 tests PASS。
- TypeScript：`pnpm --filter @openharness/agent-runtime typecheck` → PASS。
- Shell：`sh -n`、`test -x` → PASS；wrapper mode `0755`。
- OpenSpec：`npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` → PASS。
- Hygiene：`git diff --check` → PASS；secret/default-path/legacy `run start` searches on new files无命中。
- Side-effect audit：port 3001 无新增 listener；production data 目录无本切片近 30 分钟修改文件；wrapper 未执行。
- OpenSpec telemetry：出现 `edge.openspec.dev` DNS/PostHog warning，但 local strict validation 退出码为 `0` 且 change valid，不影响结论。

## 最终建议

1. 保持 Runtime 停止，保留 live SQLite 原位且继续 `forward_fix_only`。
2. 下一步只准备 Task 8 controlled probe 的 exact command、执行时间窗、no-overwrite evidence path、停止条件和 secret-safe 观察项。
3. 在用户明确批准该 exact production operation 前，不执行 wrapper、不读取/写入 live DB、不更新 Stage 0 tasks/dashboard。
4. Probe 后必须停止 Runtime，复核 lock、SQLite integrity、预期 count delta、JSON hashes/mtimes、sidecar modes 和 secret scan，再做独立 production Review。

## 后续门禁

- OpenSpec：active `harden-agent-runtime-single-node-production` 继续有效；无需新 proposal，不得 archive。
- Superpowers：Task 7 Review PASS；Task 8 需新的 exact production authorization、fresh evidence 和独立 Review。
- Production Runtime / live SQLite：保持停止和未触碰状态。
- Stage 0 tasks/dashboard：本切片不更新；Gate B 尚未 promotion。
- Runtime parity：继续 blocked。
- Git：未 staging、commit、push或创建 PR。
- 项目规则：未修改。
