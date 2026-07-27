# Java Service Token 生产接线实现 Review

## 结论

**通过。** Java Gateway 现在从 Spring property / `OPENHARNESS_SERVICE_TOKEN` 接收 raw service token，使用 constant-time comparison 验证完整 Authorization header；本地无配置时仍兼容既有开发 token。endpoint、identity headers、401 taxonomy 与 response schema 均未改变。

## Review 范围

- [Java service token 计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-java-service-token-production-wiring.md)
- [计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-service-token-production-wiring-plan-review.md)
- [AuthFilter implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/main/java/org/openharness/backend/api/AuthFilter.java)
- [AuthFilter tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend/src/test/java/org/openharness/backend/api/AuthFilterTest.java)
- [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)

## 主要发现

### Critical

无未关闭项。

### Important

无未关闭项。

### 通过依据

1. `openharness.service-token` 优先，随后读取 `OPENHARNESS_SERVICE_TOKEN`，仅在二者都未配置时使用开发默认值。
2. 构造时拒绝空、blank、任意空白字符和带 `Bearer` 前缀的配置，避免双前缀或 header injection。
3. request header 与预计算 expected bytes 使用 `MessageDigest.isEqual`，不再使用源码常量普通字符串比较。
4. token 不进入 log、trace、error response、report 或命令行；测试只使用非敏感本地 fixture。
5. missing/wrong token 继续返回 `401 AUTH_SERVICE_TOKEN_INVALID`，identity headers 逻辑不变。

### 验证记录

- TDD RED：专用测试因旧 `AuthFilter` 只有单参数构造器而编译失败。
- AuthFilter + Backend API focused：19 tests PASS。
- Java full：213 tests，0 failures，0 errors。
- Integration：5 files / 17 tests PASS。
- OpenSpec strict、dashboard check、`git diff --check`：PASS。
- attempt 004 第一次以非默认 token preflight 被旧硬编码实现 fail-close；未创建 SQLite/report/journal。修复后的 preflight 必须重新绑定新 source hash，旧 hash 不得使用。

## 最终建议

以非默认、仅当前本地运行使用的 token 重新启动 Java，并重新执行 attempt 004 `--validate-only`。只有新 source hash、runner/plan/MCP hash 和 Java/MCP fixture 全部通过才启动固定 60 分钟。

## 后续门禁

- **OpenSpec proposal：** 不需要新增。
- **Superpowers plan：** attempt 004 plan 保持有效，但 source hash 必须更新。
- **测试：** fresh preflight 与固定 60 分钟恢复回归。
- **人工审批：** 正式 Gate D/promotion 不变。
- **归档 / dashboard：** 当前不得归档或同步状态。
