# Agent Runtime Controlled Production Probe Attempt 01 Review

## 结论

需修改（FAIL）：Attempt 01 在 Runtime application entrypoint 执行前触发 stop condition。`tsx` CLI 尝试监听本地 IPC pipe，被当前 production sandbox 以 `EPERM` 拒绝；Runtime 未监听 port 3001，未执行 scoped write，live SQLite counts/integrity 与 legacy JSON hashes均未变化。

## Review 范围

- [Task 8 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-14-agent-runtime-controlled-production-probe-preflight-review.md)
- [Attempt 01 wrapper](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [Attempt 01 evidence](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260714T093953Z-task8-controlled-probe/)
- [Live SQLite](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)

## 主要发现

### Critical — `tsx` CLI IPC 与 sandbox 不兼容

启动命令以 exit 1 终止，错误为 `listen EPERM`，目标是 sandbox temp directory 下的 `tsx-501/*.pipe`。失败发生在 CLI `createIpcServer`，早于 `src/index.ts` 和 `ProductionRuntimeContext`；因此它不是 SQLite、singleton lock、HTTP listen 或业务路由失败。

### Pass — Stop 与 live-data invariant 生效

Attempt 01 后 port 3001 仍未监听；SQLite integrity 为 `ok`，counts仍为 38 conversations、6,689 messages、0 executions、0 runtime events、0 memory facts；probe id 不存在。Pre/post legacy JSON SHA-256 manifests 完全一致，SQLite main/SHM/WAL 仍为 `0600`。

### Root cause / minimal correction

本地验证 `node --import tsx` 可加载 TypeScript且不创建 CLI IPC pipe；直接执行 entrypoint时准确进入 `AGENT_RUNTIME_PROFILE=production is required` 的 fail-closed配置校验。最小 correction 是使用 Node loader替换 `tsx` CLI，不修改 Runtime source或 package manifest。

## 最终建议

返回 Task 7：修订 plan、重做 Preflight、以测试先行把 wrapper切换为 `node --import tsx`、运行 full Runtime/Review，再以新的 Attempt 02 重跑同一 bounded probe。不得重做 import/cutover或增加第二笔 probe row。

## 后续门禁

- OpenSpec：现有 active change 足够，无需新 proposal。
- Task 7：forward-fix 必须 RED/GREEN、fresh verification、独立 Review PASS。
- Task 8：Attempt 02 复用原用户授权与相同 evidence directory，新增 immutable attempt evidence；不得覆盖 Attempt 01。
- Production/live data：继续停止和 `forward_fix_only`。
- Dashboard/tasks：不更新。
- 项目规则：未修改。
