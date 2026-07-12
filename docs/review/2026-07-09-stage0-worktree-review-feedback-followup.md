# Stage 0 Worktree Review Feedback Follow-up

## 结论

通过：已处理 [independent checkbox and gate boundary review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-stage0-worktree-task-checkbox-and-gate-boundary-review.md) 中可直接收口的 Important/Medium 反馈。五个 checkbox 保留；Gate B/C/D、Runtime v1 freeze、archive 和 OpenClacky parity Stage 1-9 仍未完成且不得推进。

## Review 范围

- [independent checkbox and gate boundary review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-stage0-worktree-task-checkbox-and-gate-boundary-review.md)
- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts)
- [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/formalSoakRunner.test.ts)
- [task13-formal-soak-preflight-harness.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)
- [agent-runtime-v1-production-runbook.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md)
- [stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)

## 主要发现

### Pass — I-1 production/pass compression risk closed

Before follow-up, unit tests could pass `delayMs: async () => undefined` and receive `track="production"` / `result="pass"`. The runner now rejects unmarked custom delay. Compressed simulations must set `compressedTestRun=true` and produce `track="local"` / `result="local_verified"` with `environment.evidenceKind="compressed-test-simulation"`.

### Pass — I-2 preflight scope clarified

Runbook and verification docs now state that preflight is an operator-attested checklist input. The library validates supplied fields and blocked reasons; it does not automatically connect to Java Gateway, monitoring, or disk probes unless a caller wires those probes.

### Pass — I-3 Gate D start and promotion split

Runbook now separates `Gate D start` from `Gate D promotion`. The promotion row requires immutable 24-hour report, threshold audit, failed-partial-report check, and explicit promotion approval.

### Pass — M-2 approval object boundary clarified

Runbook now states that a `GateDApproval` object is a runtime guard only; the actual approval artifact is the review/audit record attached to the Gate D packet.

### Pass — M-3 stale Gate B status text refreshed

Early [stage1-gate-b.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md) section headers no longer imply local Stage 1 tests remain open. They now point to the actual blocker: missing production migration/cutover/RPO/RTO evidence.

## 验证记录

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
pnpm --filter @openharness/agent-runtime typecheck
pnpm test
pnpm typecheck
mvn -f backend/pom.xml test
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
git diff --check
```

Observed result:

- Focused formal soak runner: `1` file / `5` tests passed.
- Agent Runtime typecheck: passed.
- Full repository test suite: shared schema `49` tests, Agent Runtime `64` files / `311` tests, frontend `24` tests, integration `17` tests passed.
- Full repository typecheck: passed.
- Backend Maven suite: `45` tests passed.
- OpenSpec strict validation: `23` items passed, `0` failed; PostHog DNS flush warning did not affect exit code.
- Dashboard check: passed, generated outputs current.
- Diff whitespace check: passed.
- Stage 0 documentation link/path check: `83` `file:///` links checked, `0` missing, `0` bare local paths.

## 最终建议

保留 2.1、2.3、2.4、2.5、4.4 勾选。不要勾选 2.6/2.7、3.1/3.2、4.2/4.3、4.5/4.6 或 5.x。下一步仍只能是 Gate B 生产证据，或经显式批准后的 Gate C/Gate D。

## 后续门禁

- 需要 OpenSpec proposal：否，属于已批准 active change 内的 review follow-up。
- 需要 TDD：已完成，formal soak runner RED/GREEN 已观察。
- 需要人工审批：是，Gate B/C/D 仍需独立审批。
- 是否修改项目规则：否。
