# Agent Runtime Gate D 启动尝试 Review

## 结论

需修改：用户已明确批准 `gate-d-20260716-001` 的正式 Gate D 启动，但 active preflight 因 MCP executable 路径不存在而 fail-closed，exit code 为 `2`。正式 Runtime child、24 小时 workload、journal、partial report 和 final report 均未启动或生成；本次命令未自动重试，不能进入 Gate D 运行或 promotion。

## Review 范围

- [Gate D packet](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/)
- [启动审批](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/approval.json)
- [失败的 MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/mcp-config.json)
- [Monitoring evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/monitoring-evidence.md)
- [Interruption procedure](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/interruption-procedure.md)
- [Gate D executor plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)
- [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)

## 主要发现

### Critical

- 无 Runtime 运行期 Critical failure，因为 production Runtime child 从未 spawn。

### Important

- [失败的 MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/mcp-config.json) 将 qualification server command 绑定到不存在的项目根级 `tsx`；当前实际可执行文件是 [Agent Runtime package tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/node_modules/.bin/tsx)。
- CLI 已按设计在 MCP active probe 阶段返回 schema-stable `blocked / invalid_input`，pnpm 最终 exit code `2`。该结果证明 fail-closed 生效，但不构成 PASS preflight。
- 对 [Gate D packet 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/) 的 no-overwrite 检查确认预检制品、运行 journal、失败 partial report 和最终 report 全部不存在；Runtime 端口 3101 从未监听。
- 临时 Java Gateway 在隔离端口 18084 完成 health/catalog/model/tool probes 后已 graceful shutdown；现有 8080 服务未被修改。

### 审批与完整性

- approval 绑定 runId `gate-d-20260716-001`、approvedAt `2026-07-16T01:22:50.000Z` 和 executor plan SHA-256 `cf809f4286b82c71b377e26e4d66742dea1bfc895ef1369151b632c1511de3ca`。
- packet 输入均为 mode `0600`；未把 service token、Provider API key、OAuth 或其他 credential 写入 packet、CLI argv 或 Review。
- 失败发生在 preflight，未改变固定 24h、30s、10,000、20、60/20/15/5、2/12/22h 或 threshold 合同。

## 最终建议

1. 保留本次失败 packet 原样，不修改、删除或伪装为 PASS。
2. 下一次使用新的 runId 和全新 no-overwrite packet；MCP command 应绑定已存在的 Agent Runtime package `tsx` executable。
3. 对新 packet 重新计算/确认 executor plan SHA，并取得新的明确启动审批；不得把本次审批自动转用于修正后的重试。
4. 新 preflight PASS 后才可调用一次 formal run；任何 FAIL/BLOCKED 继续保留证据且不自动重试。

## 后续门禁

- OpenSpec proposal：无需新增；继续使用已批准 active change。
- Superpowers plan：无需新增；继续使用现有 Gate D executor plan。
- 测试：执行器本地测试仍有效，但新的 active preflight 必须重新通过。
- 人工审批：需要新的 runId/packet 启动审批；本次审批不授权重试、结果 promotion、契约冻结或 archive。
- Dashboard：保持 `proposed`。
