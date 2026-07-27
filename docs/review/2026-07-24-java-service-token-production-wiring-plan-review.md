# Java Service Token 生产接线计划 Review

## 结论

**通过。** 这是已批准 private-service authentication 与 production runbook 的缺失接线，不是新 capability；范围最小、fail-closed 与不泄密边界明确，可以按 TDD 实施。

## Review 范围

- [Java service token 计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-java-service-token-production-wiring.md)
- [AuthFilter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- [auth contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/auth_contract.md)

## 主要发现

### Critical

当前 Java 只接受源码硬编码的开发 token，忽略 runbook 要求的 `OPENHARNESS_SERVICE_TOKEN`。这会让生产凭据轮换不可执行，并导致使用非默认 token 的 Gate D preflight 被拒绝。

### Important

无其他未关闭项。

## 最终建议

实施 raw-token injection，构造时拒绝空白/带 `Bearer`/包含空白的配置，request 时 constant-time 比较完整 Authorization header；保持本地默认仅用于现有开发/测试。

## 后续门禁

- **OpenSpec proposal：** 不需要新增。
- **Superpowers plan：** 当前计划已批准。
- **测试：** 专用、Backend API、Java full、Integration 与 attempt 004 fresh preflight。
- **人工审批：** 本地实施无需；正式 Gate D/promotion 不变。
- **归档 / dashboard：** 当前不得归档或同步状态。
