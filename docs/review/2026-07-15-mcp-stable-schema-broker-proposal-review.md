# MCP Stable-Schema Broker Proposal Review

## 结论

通过。`add-mcp-stable-schema-broker` 只固化用户在 2026-07-15 已批准的稳定桥接、虚拟 Skill、懒启动、五分钟 idle reaper、安全和迁移边界；未扩大到真实模型调用、正式 Gate D、生产晋级、归档或 Git 发布。

## Review 范围

- [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/proposal.md)
- [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/design.md)
- [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/tasks.md)
- [mcp-tools delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/specs/mcp-tools/spec.md)
- [current mcp-tools spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/specs/mcp-tools/spec.md)

## 主要发现

- 严重度：通过。提案明确移除模型侧 MCP 直连 schema，并给出 Agent Definition 迁移路径，没有用兼容别名重新引入上下文膨胀。
- 严重度：通过。设计复用现有 `invoke_skill`、forked subagent、source-aware policy 和 MCP 执行器，没有新增第二套 Agent loop。
- 严重度：通过。懒启动、single-flight、idle close、restart-on-demand、shutdown 和失败不自动重试均有可测试语义。
- 严重度：通过。`mcp_call` 保留名冲突采用 fail-closed，虚拟 Skill 限定 server，且凭据不得进入模型、trace 或错误。
- 严重度：提示。当前生产硬化 change 的正式 Gate D 仍未执行；本 change 只迁移 fixture，不得把研发回归 PASS 表述为生产 Gate D PASS。

## 最终建议

按 `tasks.md` 和批准后的 Superpowers plan 执行。实现时先建立 RED 证据，再改 Runtime；subagent 必须通过 Runtime MCP executor 执行 `mcp_call`，不能把桥接调用误发到 Java catalog endpoint。

## 后续门禁

- OpenSpec：需要对本 change 严格校验；用户已于 2026-07-15 明确批准同内容设计，可在校验 PASS 后进入实现。
- Superpowers：需要 implementation plan、Preflight Review、TDD、完整验证和独立实现 Review。
- 测试：需要聚焦 Runtime 回归和 workspace 全量回归，但不运行真实模型或正式 24 小时 Gate D。
- 人工审批：归档、commit、push、正式 Gate D 和生产晋级仍需各自明确授权。
