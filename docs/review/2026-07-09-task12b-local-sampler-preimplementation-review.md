# Task 12B Local Sampler Pre-implementation Review

## 结论

有风险：可以继续推进 Task 12B，把 Task 12A 的 baseline schema/oracle 接入本地 runtime sampler 和 report runner primitives；但本轮仍只能输出 `local_verified` 支持证据，不得运行或声称 30-minute baseline / formal 24-hour soak，不得关闭 Gate B/Gate D。

## Review 范围

- Active OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- Active OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- Stage 3 implementation plan：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- Task 12A implementation：[localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Task 12A tests：[localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- Runtime database boundary：[runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/runtimeStorage.ts)
- MCP registry boundary：[mcpRegistry.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/mcpRegistry.ts)

## 主要发现

### Important — sampler 必须可真实读取，也必须可测试注入

Task 12 的 metrics 包括 admission/replay p95、RSS、FD、WAL、MCP children、integrity、duplicates、ordering、cross-scope leakage 和 canary leakage。若 sampler 直接绑死 OS/process 状态，单元测试无法稳定覆盖；若只用测试假数据，又无法支撑后续短基线。因此本轮应实现“默认真实读取 + 测试注入覆盖”的 sampler primitives。

### Important — 不应修改生产 runtime admission 路径

Task 12B 目标是采样与报告生成，不应重构 `server.ts`、execution runner、storage admission 或 MCP routing。生产行为变化应留给已有 OpenSpec 的专门任务或后续 Task 12C 长跑接线。

### Risk — MCP child count 暂时只能作为注入式/registry 适配指标

当前 `McpRegistry` 的子进程句柄封装在 SDK transport 内部，不能无侵入读取 OS child pid。Task 12B 可以先提供 `mcpChildCount` 注入/读取接口，后续 Task 12C 再在实际 harness 装配时绑定 registry/config 计数。

### Risk — cross-scope leakage 不能与 intentional conversationId collision 混淆

Task 12A seed 故意在不同 tenant/user scope 间复用 `conversationId`。这用于验证 scope key 是否完整，不应被 sampler 误报为泄漏。Task 12B 的 leakage oracle 只能基于显式泄漏观测或未带 scope 的事件，不应仅因 `conversationId` 重复而失败。

## 最终建议

本轮实施 `Task 12B — local sampler/report runner primitives`：

1. 新增 RED 测试覆盖 `collectRuntimeBaselineSample`：
   - p95 计算；
   - RSS / FD / WAL / MCP child 指标采集；
   - `PRAGMA integrity_check` 非 `ok` 时 hard failure；
   - canary text 泄漏 hard failure；
   - 一过性 spike 不直接 FAIL，由 Task 12A oracle 统一判断持续阈值。
2. 在 [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts) 内最小实现 sampler primitives，保持可注入 defaults，不接入真实 server admission。
3. 落盘验证与设计文档，明确 Task 12B 仍不等于 30-minute baseline。

## 后续门禁

- OpenSpec：沿用 active change `harden-agent-runtime-single-node-production`，无需新 proposal。
- TDD：必须先观察 RED，再实现 GREEN。
- 验证：focused sampler tests、agent-runtime typecheck、shared-schema/runtime focused or full tests、OpenSpec validate、dashboard check、`git diff --check`。
- 禁止事项：不修改生产 SQLite 数据、不运行 formal soak、不把本地 sampler 报告写成 production `pass`。
