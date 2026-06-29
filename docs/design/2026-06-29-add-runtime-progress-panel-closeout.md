# add-runtime-progress-panel Closeout

## 结论

通过：`add-runtime-progress-panel` 已完成实现、review 修复、验证和 OpenSpec 归档。该变更为 Agent Runtime 增加了安全的 runtime progress snapshot，并在前端提供运行时进度面板，帮助用户观察当前 execution 状态、step、activity、approval/terminal 信息，同时保留 Trace Tree 与 raw events 调试能力。

## OpenSpec

- Change ID: `add-runtime-progress-panel`
- Archived path: `openspec/changes/archive/2026-06-29-add-runtime-progress-panel/`
- Updated specs:
  - `openspec/specs/agent-runtime/spec.md`
  - `openspec/specs/frontend-runtime/spec.md`
  - `openspec/specs/shared-schema/spec.md`

## 实现摘要

- `packages/shared-schema/src/index.ts` 增加 `RuntimeProgressSnapshot` 及相关 enum/detail/recent event schema。
- `agent-runtime/src/runtimeProgress.ts` 从 `RuntimeEventStore` 事件和 `ExecutionStateStore` 状态派生安全进度快照。
- `agent-runtime/src/server.ts` 在 session detail API 中可选返回 `runtimeProgress`。
- `frontend/src/runtimeProgress.ts` 从 live SSE 事件派生前端进度快照。
- `frontend/src/RuntimeProgressPanel.tsx` 展示状态、当前活动、step、审批、工具、子 Agent 和 terminal 信息。
- `frontend/src/App.tsx` 将 live stream 和 session reload 的 progress 接入面板。

## Review 修复

二次 review 指出并已修复：

- 普通 `trace` 事件穿插导致 `currentActivity` 回退为 `idle`。
- 前端一旦收到 `approval_requested` 后在执行恢复前一直锁死为 `waiting_approval`。
- 前端 streaming 派生漏提取 safe `reason` 字段。

修复方式：

- 后端和前端都改为倒序查找最近语义事件来判定 activity。
- 前端 `waiting_approval` 仅由最新语义事件为 `approval_requested` 时触发。
- 前端 detail 派生补齐 `reason` 白名单字段。

## 验证记录

- `pnpm --filter @openharness/shared-schema test`：通过，38 tests。
- `pnpm --filter @openharness/shared-schema typecheck`：通过。
- `pnpm --filter @openharness/agent-runtime test -- runtimeProgress sessionsApi nonStreamRunner`：通过，13 tests。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `pnpm --filter @openharness/frontend test`：通过，19 tests。
- `pnpm --filter @openharness/frontend typecheck`：通过。
- `pnpm typecheck`：通过。
- `pnpm test`：通过，shared-schema 38、agent-runtime 235、frontend 19、integration-tests 17。
- `npx openspec validate add-runtime-progress-panel --strict --no-interactive`：通过。
- `npx openspec archive add-runtime-progress-panel --yes`：通过，归档为 `2026-06-29-add-runtime-progress-panel`。

## 注意事项

- OpenSpec CLI 的 PostHog telemetry flush 在离线环境中会输出 `ENOTFOUND edge.openspec.dev` warning；相关命令退出码为 0，属于非阻塞 warning。
- 完整 `pnpm test` 中部分 agent-runtime 测试需要本地 listener 权限，已在允许本地监听的执行环境中通过。
- 当前工作区仍包含此前 `add-subagent-trace-tree` 归档产生的未提交变更，应在提交前一起复核。
