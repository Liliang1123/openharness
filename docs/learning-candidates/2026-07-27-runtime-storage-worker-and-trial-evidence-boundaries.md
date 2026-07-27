# Runtime Storage Worker And Trial Evidence Boundaries Learning Candidate

```yaml
status: promoted
event_kind: architecture
severity: high
scope: project-local
promotion_trigger: repeated-independent-evidence
symptom: "同步 SQLite 访问阻塞 Runtime 主事件循环；同时，本地稳定性与性能证据容易在 closeout 时被误读为正式生产资格。"
prior_assumption: "保持单进程 better-sqlite3 即可同时满足事务语义与事件循环响应；实现完成后可等同于正式生产验证完成。"
correction_or_evidence: "专用 SQLite Worker 在保留 schema、单例锁、Lifecycle Unit of Work 和公开 API 的前提下消除了主循环数据库阻塞；20/20 成熟数据库回归和心跳门禁独立通过。正式 24 小时 Gate D 未执行，因此状态仅为 Local Trial Ready。"
generalized_invariant: "生产 Runtime 的 SQLite 句柄只由专用 Worker 持有，主线程只能通过有界、分优先级、类型化语义命令访问；Local Trial Ready 证据不得提升为 Production Verified，生产资格必须绑定新 runId、有效 preflight、显式开跑批准和结果晋级批准。"
independent_reproductions:
  - "agent-runtime/test/runtimeStorageWorkerProtocol.test.ts"
  - "agent-runtime/test/runtimeStorageWorkerCrash.test.ts"
  - "agent-runtime/test/runtimeStorageWorkerHeartbeat.test.ts"
  - "docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004b-result-review.md"
  - "docs/review/2026-07-27-agent-runtime-local-trial-readiness-decision-review.md"
independence_rationale: "协议、崩溃、心跳、成熟数据库性能与状态决策来自五条独立证据链；任一链失败均不能由其他链替代。"
duplicate_or_conflict_result: "现有 engineering invariants 仅覆盖 MCP 安全边界；CONTEXT.md 已定义 Local Trial Ready/Production Verified，但尚无机械门禁说明。"
target_artifacts:
  - "CONTEXT.md"
  - "docs/engineering-invariants.md"
  - "agent-runtime/src/storage/runtimeStorageWorkerProtocol.ts"
  - "agent-runtime/src/storage/runtimeStorageWorkerClient.ts"
  - "agent-runtime/src/storage/runtimeStorageWorkerKernel.ts"
  - "agent-runtime/test/runtimeStorageWorkerProtocol.test.ts"
  - "agent-runtime/test/runtimeStorageWorkerCrash.test.ts"
  - "agent-runtime/test/runtimeStorageWorkerHeartbeat.test.ts"
mechanical_enforcement: required
mechanical_enforcement_reason: "Worker ownership可由协议/崩溃/心跳测试和禁止主线程 SQLite 访问的负向扫描确定性验证；证据状态由 OpenSpec tasks、Dashboard status 与 closeout Review 三方一致性检查验证。"
verification: "focused worker tests, mature-database Attempt004b, full workspace tests, OpenSpec strict validation, dashboard check, state-claim negative scan"
review_result: pass
decision_owner: codex
decision_provenance: "harden-agent-runtime-single-node-production Local Trial Ready pre-archive Project Learning Closeout"
```
