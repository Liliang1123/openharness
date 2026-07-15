# Engineering Invariants

本文件记录容易遗漏、跨实现切片复用且已有机械门禁的工程不变量。领域术语定义仍以根 `CONTEXT.md` 为准。

## MCP rejection must precede the earliest avoidable side effect

- 适用范围：虚拟 `mcp:<server>` Skill 解析、Broker 调用和 Agent Definition 工具过滤。
- 不变量：Agent Definition 授权拒绝，以及仅凭 Broker envelope/config 即可判定的 shape、server identity 和长度拒绝，必须发生在 MCP startup 之前。需要 discovered catalog 才能判定的 tool membership 允许启动并发现目标 server，但必须在 `callTool` 之前拒绝未知 tool。
- 反例：先调用 `getVirtualSkill()` 完成 lazy startup，再检查 Agent Definition 是否允许 `mcp_call`。
- 机械门禁：`agent-runtime/test/agentExecutionRunner.test.ts` 覆盖未授权请求不解析虚拟 Skill；`agent-runtime/test/mcpRegistry.test.ts` 覆盖 unknown/unbounded server/identity 不启动 server，并覆盖未知 discovered tool 不进入 `callTool`。

## MCP child environment is explicit capability

- 适用范围：所有 stdio MCP 子进程。
- 不变量：MCP child 只能继承进程启动所需 host allow-list，再叠加该 server 明确配置的 `env`；不得隐式继承 Runtime service token、OAuth token、API key 或其他无关环境变量。
- 反例：使用 `{ ...process.env, ...config.env }` 构造 MCP child environment。
- 机械门禁：`agent-runtime/test/mcpRegistry.test.ts` 断言敏感 host 变量不会下传、显式 server env 仍然保留；显式 env 的 metadata/result/error 回显继续执行 key/value 脱敏。

## Qualification approval binds nested broker target

- 适用范围：Gate D 确定性 MCP qualification 自动审批 oracle。
- 不变量：审批不得只匹配外层 `mcp_call`；必须同时解析并精确绑定 `server=qualification`、`tool=qualification_echo` 和 object `arguments`。
- 反例：任何 `mcp_call` pending approval 都被 qualification oracle 自动批准。
- 机械门禁：`agent-runtime/test/formalSoakExecution.test.ts` 覆盖错误 server、错误 tool 与无效 JSON 全部 fail closed。

## MCP Broker policy identity is nested

- 适用范围：Java `PolicyService` 对 `name=mcp_call`、`source=mcp:broker` 的评估。
- 不变量：外层 `mcp_call` / `mcp:broker` 只表示稳定传输入口；name-based deny、Skill approval 与 `mcpAllowList` 必须使用有效 envelope 中的 nested tool/server。malformed envelope 不得通过外层 identity 命中 allow-list。
- 反例：只比较 `ToolCallInput.name/source`，导致旧 `safe_tool` / `mcp:trusted-server` allow-list 静默失效，或用 `mcp_call` 全局放行 malformed target。
- 机械门禁：`backend/src/test/java/org/openharness/backend/service/PolicyServiceTest.java` 覆盖 nested tool/server allow、nested deny 和 malformed fail closed。
