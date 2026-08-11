# Gate Closure Evidence Scope Exact Command Allowlist v23

版本：`v23`（candidate-tree / dynamic-worker remediation）

日期：2026-08-11

主工作目录：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness/)

状态：v23 实现已在主项目与隔离候选完成本地验证；fresh staging/commit、C23-C51 和独立 PIR 尚未执行。v22 的 `BLOCKED`、C39/C48 `BLOCKED_BASELINE` 与 C51 exact-command violation 保持不可变。

本 allowlist 继承 v22 的安全边界，只允许本文件列出的 v23 remediation scope。v21/v22 的 27 个 closure-only 路径已经存在于 parent anchor，不重复 staging；两个原始 mixed 测试文件也不纳入 correction commit。`traceOutbox.test.ts` 仅作为候选 Git tree 中已有的 scanner fixture 绑定 provenance row，不是 correction entrypoint。

## Fresh v23 scope

### Implementation and evidence paths

- [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)
- [machine provenance manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- [human provenance manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md)
- [secret scanner library](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs)
- [secret scanner](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- [governance regression](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)
- [runtime storage worker](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/runtimeStorageWorker.ts)
- [runtime storage worker kernel](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts)
- [Gate-D attempt 001 procedure](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/interruption-procedure.md)
- [Gate-D attempt 002 procedure](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/interruption-procedure.md)

### Governance and navigation paths

- [v23 preflight Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-11-gate-closure-evidence-scope-v23-preflight-review.md)
- [v23 implementation Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-11-gate-closure-evidence-scope-v23-implementation-review.md)
- [v23 remediation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-08-11-gate-closure-evidence-scope-v23-remediation-plan.md)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/tasks.md)
- [OpenSpec governance spec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/specs/gate-closure-evidence/spec.md)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)
- [dashboard Markdown artifact](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.md)
- [dashboard HTML artifact](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/index.html)
- this v23 allowlist

The [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs) is unchanged in v23 and is validated against the relocked manifest; it is not staged as a false-positive scope change. No original [mcpRegistry test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts) or [traceOutbox test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts) is staged.

## Roles and hard boundaries

- `author-preflight`: local syntax, governance, verifier, scanner, focused-test, OpenSpec and dashboard checks only.
- `executor`: fresh v23 staging/commit and C23-C51, each command at most once.
- `executor-clean`: distinct clean-worktree identity for C24-C49.
- `reviewer-post-implementation`: distinct identity for PIR only; it must not be the executor or claim independence without verifiable session evidence.
- No credentials, real provider/MCP/browser calls, network calls, promotion, archive, push, broad cleanup, or changes outside the listed scope.
- Dashboard product state remains `partial`; the OpenSpec change remains active.

## C22: exact scope and commit gate

Before staging, compare the staged name list against the scope above. Do not use `git add .`, directory staging, reset, checkout, or clean.

Exact staged-path command, after fresh user authorization:

```text
git --no-optional-locks add -- docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs agent-runtime/src/storage/runtimeStorageWorker.ts agent-runtime/src/storage/runtimeStorageWorkerKernel.ts docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/interruption-procedure.md docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/interruption-procedure.md docs/review/2026-08-11-gate-closure-evidence-scope-v23-preflight-review.md docs/review/2026-08-11-gate-closure-evidence-scope-v23-implementation-review.md docs/review/2026-08-11-gate-closure-evidence-scope-command-allowlist-v23.md docs/superpowers/plans/2026-08-11-gate-closure-evidence-scope-v23-remediation-plan.md openspec/changes/refactor-gate-closure-evidence-scope/proposal.md openspec/changes/refactor-gate-closure-evidence-scope/design.md openspec/changes/refactor-gate-closure-evidence-scope/tasks.md openspec/changes/refactor-gate-closure-evidence-scope/specs/gate-closure-evidence/spec.md docs/project-dashboard/development-log.json docs/project-dashboard/development-log.md docs/project-dashboard/index.html
```

Then run once as `executor / phase-a`:

```text
git --no-optional-locks diff --cached --check
```

Commit once with the project-required Chinese segmented message:

```text
git --no-optional-locks commit -F - <<'EOF'
fix(governance): 收口 Gate Closure v23 证据闭包

变更：
- 补齐候选 Git tree fail-closed secret scan、动态 worker/Kernel closure 与 Gate-D marker。
- 重锁 v23 manifest/provenance，并同步 active OpenSpec 与 dashboard 导航。

修复：
- 修复 clean candidate 遗漏动态 worker 导致的 RUNTIME_STORAGE_UNAVAILABLE。
- 修复额外 evidence、未知扩展和非普通 Git tree entry 被静默跳过的风险。

验证：
- closure/provenance/secret-scan、governance 13/13、production focused 18/18、OpenSpec strict 与 dashboard check 已通过。

说明：
- v22 C39/C48 仍是 BLOCKED_BASELINE；不做 credential 外呼、promotion、archive 或 push。
EOF
```

The commit command is not executable until the user confirms this exact v23 path scope. Any staged path mismatch, diff-check failure, or commit failure stops before C23.

## C23-C32: fresh anchor and clean candidate

The new correction commit must exist before C23. Every command below is one-time exact text; a retry or changed argument requires a new v24 review.

| ID | Exact command | Role / phase | Max | Expected evidence |
| --- | --- | --- | ---: | --- |
| C23 | `git --no-optional-locks rev-parse --verify HEAD^{commit} \| tee /tmp/openharness-gate-closure-evidence-scope-v23-anchor` | executor / phase-b-anchor | 1 | `0`; full 40-character anchor |
| C24 | `ANCHOR="$(cat /tmp/openharness-gate-closure-evidence-scope-v23-anchor)" && test ! -e /tmp/openharness-gate-closure-evidence-scope-v23-clean && git --no-optional-locks worktree add --detach /tmp/openharness-gate-closure-evidence-scope-v23-clean "$ANCHOR"` | executor / phase-b-clean-create | 1 | `0`; clean worktree from C23 anchor |
| C25 | `test "$(git --no-optional-locks -C /tmp/openharness-gate-closure-evidence-scope-v23-clean rev-parse --verify HEAD^{commit})" = "$(cat /tmp/openharness-gate-closure-evidence-scope-v23-anchor)"` | executor / phase-b-clean-anchor | 1 | `0`; clean HEAD equals C23 |
| C26 | `git --no-optional-locks -C /tmp/openharness-gate-closure-evidence-scope-v23-clean ls-tree -r --name-only HEAD` | executor / phase-b-clean-tree | 1 | `0`; tree contains only the committed reviewed scope plus parent files |
| C27 | `test -f /tmp/openharness-gate-closure-evidence-scope-v23-clean/agent-runtime/src/storage/runtimeStorageWorker.ts && test -f /tmp/openharness-gate-closure-evidence-scope-v23-clean/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts && test -f /tmp/openharness-gate-closure-evidence-scope-v23-clean/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/interruption-procedure.md && test -f /tmp/openharness-gate-closure-evidence-scope-v23-clean/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/interruption-procedure.md && test -f /tmp/openharness-gate-closure-evidence-scope-v23-clean/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json && node -e 'const fs = require("node:fs"); JSON.parse(fs.readFileSync("/tmp/openharness-gate-closure-evidence-scope-v23-clean/agent-runtime/package.json", "utf8"));'` | executor / phase-b-clean-anchors | 1 | `0`; dynamic closure, Gate-D markers and manifest exist |
| C28 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm install --frozen-lockfile --offline` | executor / phase-b-clean-install | 1 | `0`; offline dependency preparation |
| C29 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && node /tmp/openharness-gate-closure-evidence-scope-v23-clean/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs --require-locked --role=executor-clean` | executor-clean / phase-b-closure | 1 | `0`; `closure_ok entries=18 paths=107` |
| C30 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && node /tmp/openharness-gate-closure-evidence-scope-v23-clean/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs --require-closure --role=executor-clean` | executor-clean / phase-b-provenance | 1 | `0`; `provenance_ok rows=110 closure=locked` |
| C31 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && node /tmp/openharness-gate-closure-evidence-scope-v23-clean/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs --role=executor-clean` | executor-clean / phase-b-secret-scan | 1 | `0`; `secret_scan_ok` |
| C32 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && node /tmp/openharness-gate-closure-evidence-scope-v23-clean/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs && pnpm --filter @openharness/agent-runtime exec vitest run test/mcpRegistry.correction.test.ts test/traceOutbox.correction.test.ts` | executor-clean / phase-b-correction-tests | 1 | `0`; governance and correction-only tests pass |

## C33-C49: fresh regression and repository gates

| ID | Exact command | Role / phase | Max | Expected evidence |
| --- | --- | --- | ---: | --- |
| C33 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/agent-runtime exec vitest run test/gateCProviderPolicy.test.ts` | executor-clean / phase-b-gate-c | 1 | `0`; local Gate C regression |
| C34 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/agent-runtime exec vitest run test/gateDPerformanceDiagnostics.test.ts test/formalSoakCli.test.ts test/formalSoakExecution.test.ts test/formalSoakRunner.test.ts test/productionEntrypoint.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/productionStartupScript.test.ts` | executor-clean / phase-b-runtime-regression | 1 | `0`; Gate-D, formal-soak and production regression; no C34 exception |
| C35 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/agent-runtime exec vitest run test/jsonFileHistoryStore.test.ts` | executor-clean / phase-b-json-persistence | 1 | `0`; JSON persistence isolation |
| C36 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/integration-tests exec vitest run test/p1b.integration.test.ts` | executor-clean / phase-b-integration | 1 | `0`; P1b local integration |
| C37 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/agent-runtime exec tsc --noEmit` | executor-clean / phase-b-runtime-typecheck | 1 | `0`; Runtime typecheck |
| C38 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/integration-tests exec tsc --noEmit` | executor-clean / phase-b-integration-typecheck | 1 | `0`; integration typecheck |
| C39 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/agent-runtime test` | executor-clean / phase-b-runtime-full | 1 | `0` required for pass; known clean baseline nonzero is recorded exactly as `BLOCKED_BASELINE` and is not completion |
| C40 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/frontend test` | executor-clean / phase-b-frontend | 1 | `0`; frontend regression |
| C41 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm --filter @openharness/integration-tests test` | executor-clean / phase-b-integration-full | 1 | `0`; integration regression |
| C42 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm typecheck` | executor-clean / phase-b-workspace-typecheck | 1 | `0`; workspace typecheck |
| C43 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && /Users/elvis/file/develop/environment/apache-maven-3.6.3/bin/mvn --version` | executor-clean / phase-b-maven-env | 1 | `0`; local Maven environment |
| C44 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && /Users/elvis/file/develop/environment/apache-maven-3.6.3/bin/mvn -o -s /Users/elvis/.m2/setting-new.xml -Dmaven.repo.local=/Users/elvis/.m2/repository -f /tmp/openharness-gate-closure-evidence-scope-v23-clean/backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test` | executor-clean / phase-b-java-critical | 1 | `0`; local Java critical slice only |
| C45 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && /Users/elvis/file/develop/environment/apache-maven-3.6.3/bin/mvn -o -s /Users/elvis/.m2/setting-new.xml -Dmaven.repo.local=/Users/elvis/.m2/repository -f /tmp/openharness-gate-closure-evidence-scope-v23-clean/backend/pom.xml test` | executor-clean / phase-b-java-full | 1 | `0`; local Java full test |
| C46 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && npx --no-install openspec validate refactor-gate-closure-evidence-scope --strict --no-interactive && npx --no-install openspec validate harden-agent-runtime-single-node-production --strict --no-interactive && npx --no-install openspec validate defer-anthropic-from-gate-c --strict --no-interactive` | executor-clean / phase-b-openspec | 1 | `0`; active OpenSpec changes remain strict-valid |
| C47 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm dashboard:check` | executor-clean / phase-b-dashboard | 1 | `0`; dashboard generated outputs current and product remains `partial` |
| C48 | `cd /tmp/openharness-gate-closure-evidence-scope-v23-clean && pnpm test` | executor-clean / phase-b-root-full | 1 | `0` required for pass; known clean baseline nonzero is recorded exactly as `BLOCKED_BASELINE` and is not completion |
| C49 | `git --no-optional-locks -C /tmp/openharness-gate-closure-evidence-scope-v23-clean status --porcelain=v1 --untracked-files=all` | executor-clean / phase-b-clean-status | 1 | `0`; clean probe has no dependency artifacts or dirty files |

## C50-C51: cleanup ordering

| ID | Exact command | Role / phase | Max | Expected evidence |
| --- | --- | --- | ---: | --- |
| C50 | `git --no-optional-locks worktree remove /tmp/openharness-gate-closure-evidence-scope-v23-clean` | executor / phase-b-cleanup | 1 | `0`; remove only the named disposable clean worktree |
| C51 | `unlink /tmp/openharness-gate-closure-evidence-scope-v23-anchor` | executor / phase-b-anchor-cleanup | 1 | `0`; remove only the v23 anchor; this is a new v23 command and is not v22 evidence |

## Independent PIR

PIR is performed by a distinct `reviewer-post-implementation` session. To preserve the anchor identity evidence and follow the exact v23 sequence, PIR runs after C50 and before C51. It must not create temporary files or call external providers.

| ID | Exact command | Max | Required evidence |
| --- | --- | ---: | --- |
| PIR1 | `git --no-optional-locks status --short --untracked-files=all` | 1 | initial post-implementation status |
| PIR2 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-workspace-snapshot.mjs` | 1 | stdout-only initial workspace snapshot |
| PIR3 | `git --no-optional-locks diff --no-ext-diff --binary --full-index \| gzip -n -c \| base64 \| tr -d '\\n'` | 1 | complete stdout-only encoded unstaged diff |
| PIR4 | `git --no-optional-locks diff --cached --no-ext-diff --binary --full-index` | 1 | complete staged diff, compared with final staged diff |
| PIR5 | `git --no-optional-locks rev-parse --verify HEAD^{commit}` | 1 | full anchor identity |
| PIR6 | `git --no-optional-locks rev-parse --verify HEAD^` | 1 | full parent identity |
| PIR7 | `git --no-optional-locks diff-tree --no-commit-id --name-status -r HEAD` | 1 | every committed path, manually checked against this v23 allowlist |
| PIR8 | `git --no-optional-locks diff --no-ext-diff --binary --full-index HEAD^ HEAD \| gzip -n -c \| base64 \| tr -d '\\n'` | 1 | complete deterministic reversible parent-to-anchor commit diff; truncation blocks PIR |
| PIR9 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs --require-closure --role=reviewer-post-implementation` | 1 | locked provenance |
| PIR10 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs --role=reviewer-post-implementation` | 1 | candidate-tree secret scan |
| PIR11 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs --require-locked --role=reviewer-post-implementation` | 1 | locked closure equality |
| PIR12 | `git --no-optional-locks status --porcelain=v1 --untracked-files=all` | 1 | final status |
| PIR13 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-workspace-snapshot.mjs` | 1 | stdout-only final workspace snapshot |
| PIR14 | `git --no-optional-locks diff --no-ext-diff --binary --full-index \| gzip -n -c \| base64 \| tr -d '\\n'` | 1 | final encoded unstaged diff; compare exactly with PIR3 |
| PIR15 | `git --no-optional-locks diff --cached --no-ext-diff --binary --full-index` | 1 | final staged diff; compare exactly with PIR4 |

PIR passes only if executor/reviewer identities are distinct and verifiable, `HEAD`/`HEAD^` are valid and bound to the reviewed anchor, the complete encoded commit diff is captured without truncation, every committed path is allowlisted, initial/final workspace snapshots and staged diffs match as required, and closure/provenance/scanner pass. Reproduced C39/C48 `BLOCKED_BASELINE`, any identity gap, scope mismatch, or missing evidence makes PIR `BLOCKED`/`需修改`; no completion claim is permitted.

## Forbidden actions

- No credential reads or real provider/MCP/browser/network calls.
- No Gate C/D promotion, evidence promotion, OpenSpec archive, push, or broad cleanup.
- No relabeling or rerun of v22 C39/C48/C51; v23 uses a fresh anchor, fresh counts and the exact commands above.
