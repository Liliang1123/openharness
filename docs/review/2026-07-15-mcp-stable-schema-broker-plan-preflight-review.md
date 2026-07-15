# MCP Stable-Schema Broker Plan Preflight Review

## 结论

通过。实施计划覆盖已批准 OpenSpec 的完整业务链，文件边界、TDD RED/GREEN、兼容迁移、安全约束和最终证据均可执行；未发现需要回到设计门禁的缺口。

## Review 范围

- [实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-mcp-stable-schema-broker.md)
- [proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/proposal.md)
- [design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/design.md)
- [tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/tasks.md)
- [mcp-tools delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/specs/mcp-tools/spec.md)
- [McpRegistry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/mcpRegistry.ts)
- [ToolRegistry](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/toolRegistry.ts)
- [AgentExecutionRunner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/agentExecutionRunner.ts)
- [SubagentDispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/subagent/dispatcher.ts)

## 主要发现

- 严重度：通过。计划先建立 Registry 生命周期，再建立 catalog 和执行路由，依赖顺序正确。
- 严重度：通过。每个行为变更先有 RED 命令，生产代码修改后有对应 GREEN 与回归命令。
- 严重度：通过。虚拟 Skill 的 child executor 明确只接管 `mcp_call`，普通 forked Skill 继续走 Java，避免扩大 subagent 架构改动。
- 严重度：通过。`MCP_REQUIRE_APPROVAL=true` 在 child 内保持 fail-closed；计划没有未经设计的嵌套 ask-user 协议。父 Runtime 直接 Broker 路径继续使用现有完整审批工作流。
- 严重度：通过。Gate D 只迁移 deterministic fixture 并跑单测，明确禁止启动正式 24 小时 workload。
- 严重度：提示。工作树已有大量同一 Runtime change 的未提交修改；实施必须精确检查 diff，不能覆盖现有 Gate D、compression 和 persistence 变更。

## 最终建议

按 Task 1 至 Task 7 内联执行。每个业务切片保留 RED/GREEN 输出；一旦出现非预期回归，先按 systematic-debugging 查因，不得通过削弱测试或恢复 direct MCP schema 绕过。

## 后续门禁

- OpenSpec：提案已严格校验且设计已获用户批准，可以实施；本轮不授权 archive。
- Superpowers：使用 `executing-plans`、TDD、verification-before-completion；完成后必须有 distinct implementation Review。
- 测试：需要 Runtime 聚焦/全量和 workspace 全量回归；禁止真实模型及正式 Gate D。
- 人工审批：archive、commit、push、worktree cleanup、正式 Gate D 和生产晋级保持未授权。
