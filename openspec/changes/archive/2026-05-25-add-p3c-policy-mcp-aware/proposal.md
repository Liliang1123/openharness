# Proposal: add-p3c-policy-mcp-aware

## Why

P2a 集成 MCP 后引入了一个真实的安全 gap：Java `PolicyService.evaluateSingle` 对未知工具默认返回 `ALLOW`。MCP 工具因为不在 Java catalog 中，永远落入这个默认分支，等于 MCP 工具 = 默认放行。

虽然 TS 端有 `MCP_REQUIRE_APPROVAL` 兜底（P2a 加的），但那是 defense-in-depth 选项，policy 在 hook 中是 law 这条架构原则要求 **Java 自己** 必须能识别并默认拒绝 / 升级未知来源的工具。

## What

让 `evaluatePolicy` 接受工具来源信号，针对 MCP 来源的工具改变默认决策：

1. TS Runtime 在 `evaluatePolicy` 请求的 `toolCalls[i]` 中新增可选字段 `source: "catalog" | "mcp:{server-name}"`（默认 `catalog`）。
2. Java `PolicyService` 在所有现有 deny / require_approval 规则之后、默认 ALLOW 之前，新增一条规则：**工具来源为 `mcp:*` 时，默认决策为 `REQUIRE_APPROVAL`**（带 source `MCP_DEFAULT`，并生成 approvalToken）。
3. 显式放行机制：`PolicyContext` 加可选字段 `mcpAllowList: string[]`（按 `tool name` 或 `mcp:{server}` 匹配），命中则降级回 ALLOW。本 change 暂不暴露该字段的配置入口（保留接口）。
4. `MCP_REQUIRE_APPROVAL` 在 TS 端依然有效，但定位从"修补 Java 默认 ALLOW"变成"组织级强制策略"。

## Impact

- **Java**：`PolicyService` 加分支 + `PolicyContext` 新增 `mcpAllowList`；`PolicyController` 入参 record 加 `source` 字段
- **TS Runtime**：`evaluatePolicy` 调用前根据 `ToolRegistry.resolveSource` 填 source；`beforeToolUse.ts` 不再依赖 `MCP_REQUIRE_APPROVAL` 来"修补"安全 gap（保留作为 hard override）
- **shared-schema**：`PolicyEvaluateRequest.toolCalls[i]` 加 `source?: string`
- **测试**：Java service test + agent-runtime beforeToolUse test 各加一条
- **Breaking changes**：无（所有新字段都是 optional；旧客户端不传 source 时 Java 视为 catalog，行为同今天）
- **风险**：低 — 改动只新增分支，不修改既有 deny/require 规则

## Open Questions

1. `mcp:{server-name}` 的格式是否要标准化进 trace/audit？建议：是；本 change 同步加。
2. `mcpAllowList` 是否在本 change 真实落地（带配置入口）？建议：否（接口先定，配置入口留下一个 change）。

## Acceptance

- 当 TS 不传 `source`，行为完全同 P2a；
- 当 TS 传 `source: "mcp:foo"`，Java 默认返回 `REQUIRE_APPROVAL`（除非组织策略显式放行）；
- 整套 P2a unit + integration tests 仍全绿。
