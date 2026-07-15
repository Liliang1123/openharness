# Agent Runtime Gate D Production Executor Implementation Review

## 结论

通过：实现、测试、主动本地探针和负向审计足以将 Gate D production executor 标记为 `preflight_ready`。本结论不批准、也不表示已经执行 24 小时 Gate D，不构成 production promotion。

## Review 范围

- [Gate D implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)
- [Active OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/)
- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- [formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)
- [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- [MCP registry wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/mcpRegistry.ts)
- [Production Runtime wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [Java deterministic fixture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/MockModelService.java)
- [Gate D tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)
- [Gate D CLI tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakCli.test.ts)
- [Fixed runner tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts)
- [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)
- [Preflight-ready evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/2026-07-15-preflight-ready.md)

## 主要发现

### Critical / High

- 无。

### Medium

- 无阻断项。Fixed duration/sample/restart/threshold invariants、真实 Runtime child PID restart、20-worker load、exact 10,000 scope seed、active Java/MCP probes、read-only DB oracle、append-only journal、no-overwrite evidence、approval/hash/path binding 和 current-request terminal evidence 均有直接实现与测试依据。

### Low / 后续运行注意事项

- Java Gateway 当前本地鉴权契约会拒绝不匹配的 service token；主动探针已证明 fail-closed。正式 start packet 必须确认外部 Java Gateway 与 Runtime 使用同一经 operator 复核的值。
- Gate D 子进程会剥离父进程继承的 Provider/API/OAuth 凭据；显式 MCP config 仍是独立 immutable input。正式 start approval 必须复核其 hash、命令与 `env` 不包含凭据，并只启动 reviewed qualification stdio fixture。
- `preflight_ready` 证据没有运行 approval-gated preflight CLI，因为当前没有 24 小时 start approval。这是预期门禁，不是测试缺口。

## 最终建议

- 接受本次实现 Review，并把主 Stage 3 计划中的“实现并严格 Review executor”单项标记完成。
- 保持 OpenSpec tasks 4.2/4.3、Dashboard `proposed` 和 24 小时执行状态不变。
- 未来若准备开跑，先固定 runId、绝对 artifact paths、credential-free MCP config 与本计划最终 SHA-256，再单独请求用户批准；任何绑定变化都生成新 start packet。

## 后续门禁

- 不需要新的 OpenSpec proposal；本实现落在既有已批准 change 与 plan 内。
- 仍需要精确的 Gate D 24 小时 start approval，之后才能运行 approval-gated preflight 和 `qualification:gate-d-run`。
- 24 小时报告即使 PASS，也必须再经过阈值/完整性/secret scan Review 和独立 promotion approval。
- 项目规则未修改；不得在当前节点 archive active change、标记 Dashboard `verified`、提交、推送或清理 worktree。
