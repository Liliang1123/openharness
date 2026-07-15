# MCP Broker Security Boundaries Learning Candidate

```yaml
status: promoted
event_kind: security
severity: high
scope: project-local
promotion_trigger: high-severity
symptom: "独立 Review 连续发现未授权 lazy startup、Runtime credentials 下传 MCP child、policy 只匹配 Broker 外层 identity、qualification oracle 只绑定外层工具名等副作用或审批边界缺口。"
prior_assumption: "完成 Broker schema 与路由隔离即可覆盖安全边界，授权和脱敏可在启动或外层工具匹配之后处理。"
correction_or_evidence: "实施 Review 三轮追踪并修复权限检查时序、child environment capability 与 nested approval target binding。"
generalized_invariant: "授权及仅凭 envelope/config 可判定的 MCP 拒绝必须先于 startup，discovered-tool membership 必须先于 callTool；子进程环境必须显式最小授权；Broker policy 与自动审批必须绑定完整嵌套目标。"
independent_reproductions:
  - "docs/review/2026-07-15-mcp-stable-schema-broker-implementation-review.md sha256:468ff48b9a0b7e7b67050deb13b70bff897660a238cf1f36822445eb3df54582"
  - "agent-runtime/test/mcpRegistry.test.ts sha256:d8b8e73d975cc655f0a6ea5504349437ab9f7ff8d193d8e0b690fb199be59a81"
  - "agent-runtime/test/agentExecutionRunner.test.ts sha256:d44e77f227c4b7b1be9c82851cef02e97bb539af2b4e78686c517ec75835465a"
  - "agent-runtime/test/formalSoakExecution.test.ts sha256:a6a0a95bd3e951cc5da200fb3c50ea9b96b63b8173acc3e938a75f36e508d899"
  - "backend/src/test/java/org/openharness/backend/service/PolicyServiceTest.java sha256:9f9356c899112d79b17d68c5a692a4628ebda3430a379bcd8809afc4be00958c"
independence_rationale: "Reviewer 从 Agent Definition、process environment、Java policy 与 Gate D approval 四条独立执行链发现缺口；各自具有独立回归测试。"
duplicate_or_conflict_result: "根 CONTEXT.md 原 MCP lifecycle 定义过期；仓库此前无 engineering-invariants 或同主题 Candidate Card。"
target_artifacts:
  - "CONTEXT.md"
  - "docs/engineering-invariants.md"
  - "agent-runtime/test/mcpRegistry.test.ts"
  - "agent-runtime/test/agentExecutionRunner.test.ts"
  - "agent-runtime/test/formalSoakExecution.test.ts"
  - "backend/src/test/java/org/openharness/backend/service/PolicyServiceTest.java"
mechanical_enforcement: required
mechanical_enforcement_reason: "四个不变量都可在不启动真实模型或正式 Gate D 的情况下确定性拒绝旧错误路径。"
verification: "focused MCP/Gate D tests, Runtime typecheck, OpenSpec strict validation, dashboard check, git diff --check"
review_result: pass
decision_owner: codex
decision_provenance: "add-mcp-stable-schema-broker implementation Review and pre-archive Project Learning closeout"
```
