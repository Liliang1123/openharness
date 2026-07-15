# MCP Stable-Schema Broker 实施 Review

## 结论

通过。已按批准设计完成固定 `mcp_call` Broker、每服务虚拟 Skill、lazy/idle 生命周期、父子执行隔离、Gate D fixture 迁移与凭据边界；三轮独立 Review 的全部 Critical/Important finding 均已修复，最终无 Critical、Important 或 Minor 遗留。

## Review 范围

- OpenSpec： [proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/proposal.md)、[design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/design.md)、[tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/tasks.md)、[mcp-tools spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/add-mcp-stable-schema-broker/specs/mcp-tools/spec.md)。
- 核心实现： [mcpRegistry.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/mcpRegistry.ts)、[toolRegistry.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/toolRegistry.ts)、[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/agentExecutionRunner.ts)、[agentLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/agentLoop.ts)、[dispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/subagent/dispatcher.ts)。
- Gate D 兼容： [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)、[formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)、[formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)、[MockModelService.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/MockModelService.java)。
- 测试与运维文档： [agent-runtime tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test)、[ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)、[production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)。

## 主要发现

### 已关闭的重要问题

- Agent Definition 的 `mcp_call` 授权检查已前置到虚拟 Skill 解析之前，未授权请求不会启动 MCP。
- startup/shutdown race、active-call idle reaper、startup discovery 失败 client close 均已补齐确定性测试。
- legacy AgentLoop 也通过隔离 subagent 执行虚拟 MCP Skill，完整 schema 不进入父 history。
- server/tool identity 限制为 1..128；trace identity 有界；MCP metadata、result 的 key/value、startup/call error 均对显式 server env secret 脱敏。
- MCP child 仅继承安全 host 环境白名单与显式 server env，不再隐式继承 Runtime service token、OAuth token 或 API key。
- Gate D approval oracle 精确绑定 `qualification` / `qualification_echo` / object arguments；错误 server、错误 tool、无效 JSON 均 fail closed。

### 验证依据

- Focused Runtime：10 个测试文件、128 个测试全部通过；Runtime typecheck 通过。
- Workspace：`pnpm test && pnpm typecheck && mvn -f backend/pom.xml test` 退出码 0；后端 201 个测试通过，BUILD SUCCESS。
- OpenSpec：目标 change strict valid；全量 24 项 strict validation 全部通过。
- 治理与卫生：dashboard render/check、`git diff --check` 通过；11 个生产/治理文件的环境敏感值扫描为 0 命中。
- 独立 Review 最终结论 PASS，无 Critical、Important、Minor 遗留。

## 最终建议

- 将 `add-mcp-stable-schema-broker` 保持为 `verified` active change，待单独授权后再 archive。
- 正式 Gate D 只在独立启动授权与 reviewed fixture 齐备后执行；本次不得用确定性 fixture 测试冒充 24 小时生产证据。
- 后续提交必须精确暂存本 change 已复核文件，并使用项目要求的中文分段式 commit message。

## 后续门禁

- OpenSpec proposal：已批准并实现，当前无需新 proposal。
- Superpowers plan：已执行完成并与证据对齐。
- 测试：本地 focused、workspace、backend、OpenSpec、dashboard 与卫生门禁已通过。
- 人工审批：正式 24 小时 Gate D、OpenSpec archive、commit、push、worktree cleanup 仍需各自明确授权；本次均未执行。
- 项目规则：未修改。
