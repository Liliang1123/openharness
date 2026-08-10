# Gate Closure Persistence Fix Exact Command Allowlist v22

版本：`v22`（evidence-scope correction-only relock）

日期：2026-08-10

主工作目录：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness/)

状态：候选实现已在隔离 worktree 完成本地验证；主 worktree 尚未按本文件 staging/commit，C23-C51 与 PIR 尚未执行。

v21 的 [allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-command-allowlist.md) 与一次性 C31 失败证据保持不可变。v22 不重跑、不改写、不重标 v21 C31；C31 只能由本 allowlist 在 fresh anchor 的 clean worktree 中执行一次。

## Fresh scope contract

本轮只允许以下新增或修改路径进入 correction scope；所有路径均须按此清单逐项 staging，禁止 `git add .`、目录级 staging 或覆盖其他 dirty work。27 个 v21 closure-only 路径已经存在于 v21 parent anchor，不在本轮重复 staging；C23-C30 会从 fresh anchor 验证它们仍在 clean tree、closure 与 provenance 中。

### Correction-only and governance paths

- [mcpRegistry correction test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts)
- [traceOutbox correction test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts)
- [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)
- [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- [machine provenance manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- [human provenance manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md)
- [secret scanner](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- [secret-scan candidate library](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs)
- [scope governance test](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)
- [scope diagnostic](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-diagnostic.mjs)
- [scope preflight Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-preflight-review.md)
- [scope implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-08-10-gate-closure-evidence-scope-implementation-plan.md)
- [v22 allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-persistence-fix-command-allowlist-v22.md)

### OpenSpec and dashboard paths already prepared for the main worktree

- [proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/proposal.md)
- [design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/design.md)
- [tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/tasks.md)
- [governance spec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/specs/gate-closure-evidence/spec.md)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)
- [dashboard Markdown artifact](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.md)
- [dashboard HTML artifact](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/index.html)

The original mixed [mcpRegistry test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts) and [traceOutbox test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts) are explicitly excluded. No real credential/provider/MCP/browser call, promotion, archive, push, or broad cleanup is authorized.

## Roles, phases, counts, and exit status

- `author-preflight` may run only local syntax, governance, verifier, focused-test, dashboard, and the one-time scope diagnostic commands listed before Phase B. It cannot sign a commit or clean checkout.
- `executor` runs the fresh Phase B sequence from the committed anchor. Every C23-C51 command has maximum invocation count `1`; any retry, changed argument, changed path, changed role/phase, or changed scope requires v23 and a new review.
- `executor-clean` is the Phase B clean-worktree role. It must use a different session identity from `executor`.
- `reviewer-post-implementation` is a distinct session identity and may run only the separate PIR protocol after C23-C51 succeeds. No self-review may be reported as an independent PIR.
- Every Git command uses `--no-optional-locks`. Offline dependency preparation failing is a hard stop; it must not be replaced with network access.

## One-time author-preflight diagnostic

Exact command:

```text
node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-diagnostic.mjs --role=author-preflight --phase=scope-diagnostic
```

Role: `author-preflight`; phase: `scope-diagnostic`; maximum count: `1`; observed exit status in the isolated candidate: `0`.

Observed redacted counts: `entrypoints=17`, `closure_paths=102`, `manifest_rows=107`, `secret_scan_dependencies=29`, `fixture_rule_paths=29`. The diagnostic is scope evidence only; it is not C31 evidence and cannot be promoted to a gate result.

The governance regression test may invoke the same read-only implementation only with the separate `governance-test` / `scope-diagnostic-test` pair. That test invocation is not the author-preflight command and does not consume the author-preflight count; unknown or credential-shaped arguments remain rejected.

## C22 exact scope gate

Before staging, review the exact path list above against the staged name list. After and only after explicit staging authorization, run this command once as `executor` / `phase-a`:

```text
git --no-optional-locks diff --cached --check
```

Maximum count: `1`; expected exit status: `0`. Any staged path outside the list, any omitted path required by the new manifest/allowlist, or any whitespace failure is a hard stop before commit.

## Fresh Phase B: executor anchor and clean candidate (C23-C32)

The user-authorized correction commit must exist before C23. C23 writes the complete 40-character commit SHA to the disposable anchor; C24-C49 use only that anchor and never dynamic `HEAD`. The clean worktree and anchor are new v22 paths and must not already exist.

| ID | Exact command | Role / phase | Max | Expected exit / evidence |
| --- | --- | --- | ---: | --- |
| C23 | `git --no-optional-locks rev-parse --verify HEAD^{commit} \| tee /tmp/openharness-gate-closure-evidence-scope-v22-anchor` | executor / phase-b-anchor | 1 | `0`; full 40-character anchor |
| C24 | `ANCHOR="$(cat /tmp/openharness-gate-closure-evidence-scope-v22-anchor)" && test ! -e /tmp/openharness-gate-closure-evidence-scope-v22-clean && git --no-optional-locks worktree add --detach /tmp/openharness-gate-closure-evidence-scope-v22-clean "$ANCHOR"` | executor / phase-b-clean-create | 1 | `0`; clean worktree from C23 anchor |
| C25 | `test "$(git --no-optional-locks -C /tmp/openharness-gate-closure-evidence-scope-v22-clean rev-parse --verify HEAD^{commit})" = "$(cat /tmp/openharness-gate-closure-evidence-scope-v22-anchor)"` | executor / phase-b-clean-anchor | 1 | `0`; clean HEAD equals C23 |
| C26 | `git --no-optional-locks -C /tmp/openharness-gate-closure-evidence-scope-v22-clean ls-tree -r --name-only HEAD` | executor / phase-b-clean-tree | 1 | `0`; tree contains the exact committed scope |
| C27 | `test -f /tmp/openharness-gate-closure-evidence-scope-v22-clean/agent-runtime/test/mcpRegistry.correction.test.ts && test -f /tmp/openharness-gate-closure-evidence-scope-v22-clean/agent-runtime/test/traceOutbox.correction.test.ts && test -f /tmp/openharness-gate-closure-evidence-scope-v22-clean/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json && test -f /tmp/openharness-gate-closure-evidence-scope-v22-clean/docs/review/2026-08-10-gate-closure-evidence-scope-diagnostic.mjs && node -e 'const fs = require("node:fs"); JSON.parse(fs.readFileSync("/tmp/openharness-gate-closure-evidence-scope-v22-clean/agent-runtime/package.json", "utf8"));'` | executor / phase-b-clean-anchors | 1 | `0`; correction artifacts and manifest parse |
| C28 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm install --frozen-lockfile --offline` | executor / phase-b-clean-install | 1 | `0`; offline dependency preparation |
| C29 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && node /tmp/openharness-gate-closure-evidence-scope-v22-clean/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs --require-locked --role=executor-clean` | executor-clean / phase-b-closure | 1 | `0`; fresh locked closure equality |
| C30 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && node /tmp/openharness-gate-closure-evidence-scope-v22-clean/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs --require-closure --role=executor-clean` | executor-clean / phase-b-provenance | 1 | `0`; fresh rows, hashes, modes, human binding |
| C31 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && node /tmp/openharness-gate-closure-evidence-scope-v22-clean/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs --role=executor-clean` | executor-clean / phase-b-secret-scan | 1 | `0`; fresh candidate-bound secret scan |
| C32 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && node /tmp/openharness-gate-closure-evidence-scope-v22-clean/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs && pnpm --filter @openharness/agent-runtime exec vitest run test/mcpRegistry.correction.test.ts test/traceOutbox.correction.test.ts` | executor-clean / phase-b-correction-tests | 1 | `0`; governance and two correction-only tests pass |

## Fresh Phase B: regression and repository gates (C33-C49)

| ID | Exact command | Role / phase | Max | Expected exit / evidence |
| --- | --- | --- | ---: | --- |
| C33 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/agent-runtime exec vitest run test/gateCProviderPolicy.test.ts` | executor-clean / phase-b-gate-c | 1 | `0`; fake/local Gate C authority and redaction |
| C34 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/agent-runtime exec vitest run test/gateDPerformanceDiagnostics.test.ts test/formalSoakCli.test.ts test/formalSoakExecution.test.ts test/formalSoakRunner.test.ts test/productionEntrypoint.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/productionStartupScript.test.ts` | executor-clean / phase-b-runtime-regression | 1 | `0`; Gate D/formal/production regression |
| C35 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/agent-runtime exec vitest run test/jsonFileHistoryStore.test.ts` | executor-clean / phase-b-json-persistence | 1 | `0`; JSON persistence and tenant/user isolation |
| C36 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/integration-tests exec vitest run test/p1b.integration.test.ts` | executor-clean / phase-b-integration | 1 | `0`; P1b local write/read and negative isolation |
| C37 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/agent-runtime exec tsc --noEmit` | executor-clean / phase-b-runtime-typecheck | 1 | `0`; Runtime typecheck |
| C38 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/integration-tests exec tsc --noEmit` | executor-clean / phase-b-integration-typecheck | 1 | `0`; integration typecheck |
| C39 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/agent-runtime test` | executor-clean / phase-b-runtime-full | 1 | `0`; clean Runtime full test |
| C40 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/frontend test` | executor-clean / phase-b-frontend | 1 | `0`; clean frontend regression |
| C41 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm --filter @openharness/integration-tests test` | executor-clean / phase-b-integration-full | 1 | `0`; clean integration regression |
| C42 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm typecheck` | executor-clean / phase-b-workspace-typecheck | 1 | `0`; workspace typecheck |
| C43 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && /Users/elvis/file/develop/environment/apache-maven-3.6.3/bin/mvn --version` | executor-clean / phase-b-maven-env | 1 | `0`; Maven environment proof |
| C44 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && /Users/elvis/file/develop/environment/apache-maven-3.6.3/bin/mvn -o -s /Users/elvis/.m2/setting-new.xml -Dmaven.repo.local=/Users/elvis/.m2/repository -f /tmp/openharness-gate-closure-evidence-scope-v22-clean/backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test` | executor-clean / phase-b-java-critical | 1 | `0`; local Java critical slice only |
| C45 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && /Users/elvis/file/develop/environment/apache-maven-3.6.3/bin/mvn -o -s /Users/elvis/.m2/setting-new.xml -Dmaven.repo.local=/Users/elvis/.m2/repository -f /tmp/openharness-gate-closure-evidence-scope-v22-clean/backend/pom.xml test` | executor-clean / phase-b-java-full | 1 | `0`; local backend full test |
| C46 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && npx --no-install openspec validate refactor-gate-closure-evidence-scope --strict --no-interactive && npx --no-install openspec validate harden-agent-runtime-single-node-production --strict --no-interactive && npx --no-install openspec validate defer-anthropic-from-gate-c --strict --no-interactive` | executor-clean / phase-b-openspec | 1 | `0`; active OpenSpec changes remain active and strict-valid |
| C47 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm dashboard:check` | executor-clean / phase-b-dashboard | 1 | `0`; dashboard source and generated artifacts fresh; product state remains `partial` |
| C48 | `cd /tmp/openharness-gate-closure-evidence-scope-v22-clean && pnpm test` | executor-clean / phase-b-root-full | 1 | `0`; clean root aggregation |
| C49 | `git --no-optional-locks -C /tmp/openharness-gate-closure-evidence-scope-v22-clean status --porcelain=v1 --untracked-files=all` | executor-clean / phase-b-clean-status | 1 | `0`; no dependency artifacts or dirty clean tree |

## Disposable cleanup (C50-C51)

| ID | Exact command | Role / phase | Max | Expected exit / evidence |
| --- | --- | --- | ---: | --- |
| C50 | `git --no-optional-locks worktree remove /tmp/openharness-gate-closure-evidence-scope-v22-clean` | executor / phase-b-cleanup | 1 | `0`; remove only the v22 disposable worktree |
| C51 | `rm -f /tmp/openharness-gate-closure-evidence-scope-v22-anchor` | executor / phase-b-anchor-cleanup | 1 | `0`; remove only the v22 anchor |

## Independent post-implementation review / PIR

Only after every fresh C23-C51 command exits `0`, a distinct `reviewer-post-implementation` session may execute the following once each. The reviewer must preserve stdout in the conversation, compare initial/final snapshots and complete encoded diffs in memory, and report verifiable reviewer/executor identity evidence. The reviewer must not create temporary files.

| ID | Exact command | Max | Expected evidence |
| --- | --- | ---: | --- |
| PIR1 | `git --no-optional-locks status --short --untracked-files=all` | 1 | initial post-implementation status |
| PIR2 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-workspace-snapshot.mjs` | 1 | stdout-only initial snapshot |
| PIR3 | `git --no-optional-locks diff --no-ext-diff --binary --full-index \| gzip -n -c \| base64 \| tr -d '\\n'` | 1 | complete stdout-only encoded unstaged diff |
| PIR4 | `git --no-optional-locks diff --cached --no-ext-diff --binary --full-index` | 1 | complete stdout-only staged diff |
| PIR5 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs --require-closure --role=reviewer-post-implementation` | 1 | locked provenance |
| PIR6 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs --role=reviewer-post-implementation` | 1 | fresh no-secret-output scan |
| PIR7 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs --require-locked --role=reviewer-post-implementation` | 1 | locked closure equality |
| PIR8 | `git --no-optional-locks status --porcelain=v1 --untracked-files=all` | 1 | final status |
| PIR9 | `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-workspace-snapshot.mjs` | 1 | stdout-only final snapshot |
| PIR10 | `git --no-optional-locks diff --no-ext-diff --binary --full-index \| gzip -n -c \| base64 \| tr -d '\\n'` | 1 | complete stdout-only encoded unstaged diff |
| PIR11 | `git --no-optional-locks diff --cached --no-ext-diff --binary --full-index` | 1 | complete stdout-only staged diff |

PIR12 is a reviewer context assertion, not an additional shell command: PIR2/PIR9 fields and PIR3/PIR10 complete encoded stdout must be compared exactly; PIR4/PIR11 must remain equal; locked closure/provenance/secret-scan must pass; reviewer identity must be distinct and verifiable. Any mutation, truncation, identity gap, or count mismatch is `BLOCKED`, not a pass.

## Non-authorized actions

- No real provider, OpenAI-compatible credential, Codex OAuth, MCP, browser, or network call.
- No Gate C/D promotion, evidence promotion, OpenSpec archive, worktree deletion outside the named disposable probe, or push.
- No broad reset, checkout, clean, `git add .`, user-directory deletion, or overwrite of unrelated dirty/untracked work.
- The dashboard product entry remains `partial`; the new OpenSpec change remains active; no archive or closeout is performed in this sequence.
