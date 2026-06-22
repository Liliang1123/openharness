## 1. Schema
- [x] 1.1 `shared-schema/src/index.ts`：`PolicyEvaluateRequest` 的 `toolCalls[i]` 加 `source?: string`
- [x] 1.2 同步 zod 校验

## 2. Java
- [x] 2.1 `Contracts.java` / Policy DTO：`ToolCallInput` record 加 `String source`（@JsonProperty(required=false)）
- [x] 2.2 `PolicyService.evaluateSingle`：在默认 ALLOW 前插入 MCP 来源分支，命中时返回 `REQUIRE_APPROVAL` + source `MCP_DEFAULT` + 生成 approvalToken
- [x] 2.3 `PolicyContext` 加可选 `mcpAllowList`（接口先定；本 change 不暴露配置入口）

## 3. TS Runtime
- [x] 3.1 `beforeToolUse.ts`：调 evaluatePolicy 时根据 `context.sources` 填每个 toolCall 的 `source` 字段
- [x] 3.2 `MCP_REQUIRE_APPROVAL` 文档地位调整为 hard override（README 微调说明）

## 4. Tests
- [x] 4.1 Java：PolicyService 单测——MCP 来源未匹配规则 → REQUIRE_APPROVAL
- [x] 4.2 Java：catalog 来源未匹配规则 → ALLOW（回归保护）
- [x] 4.3 TS：beforeToolUse 集成 stub Java 验证 source 字段被发出

## 5. Docs
- [x] 5.1 `docs/architecture/policy_contract.md` 加一节"MCP source default rule"
- [x] 5.2 `agent-runtime/README.md` 把 known-limitation 段标记为已修复（保留 MCP_REQUIRE_APPROVAL 作为强制开关说明）

## 6. Verification
- [x] 6.1 `mvn test` 通过
- [x] 6.2 `pnpm typecheck && pnpm test`（agent-runtime + shared-schema）
- [x] 6.3 `npx openspec validate add-p3c-policy-mcp-aware --strict --no-interactive`
