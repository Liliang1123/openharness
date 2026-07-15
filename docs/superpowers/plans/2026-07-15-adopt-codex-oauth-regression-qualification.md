# Codex OAuth Required Regression Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make official local Codex CLI/app-server + ChatGPT/Codex OAuth the only required real-model regression track, keep API-key Provider reports advisory without falsifying their row results, and produce a no-overwrite Gate C provider decision artifact.

**Architecture:** Add a small shared decision schema and a pure TypeScript policy evaluator under Agent Runtime qualification. A CLI wrapper reads immutable Provider reports, hashes the current Codex client source, evaluates the required/advisory policy, and writes one new decision JSON with create-new semantics. Active Stage 0 contracts and operator docs then migrate together so the executable policy, OpenSpec, plan, runbook, dashboard, and task status cannot disagree.

**Tech Stack:** TypeScript 5.8, Zod, Node.js `crypto`/`fs`, Vitest, pnpm workspace, OpenSpec, dashboard renderer.

---

## Execution Contract

- Worktree: `/Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap` on branch `add-openclacky-runtime-parity-roadmap`.
- OpenSpec authority: `openspec/changes/adopt-codex-oauth-regression-qualification/` explicitly approved 2026-07-15.
- Evidence profile: `strict`; capability profile: `control-plane-high` for policy/promotion decisions and `cohesive-medium` for implementation.
- Git authority: no `git add`, `git commit`, `git push`, `git reset`, `git clean`, or branch/archive action in this plan.
- External effects: no real model call, no OAuth login/status/logout mutation, no API-key call, and no Gate D run. The existing immutable Codex report is read-only input.
- Evidence output: exactly one new file at `docs/verification/agent-runtime-v1/providers/2026-07-15-gate-c-codex-oauth-provider-decision.json`; the CLI must fail if it exists.
- Historical evidence under `docs/verification/agent-runtime-v1/providers/` is never overwritten, deleted, or relabelled.
- Stop conditions: required Codex report/schema/hash/source binding mismatch, secret/correlation scan hit, unexpected required row, generated target already exists, failing focused/full test, OpenSpec conflict, dashboard drift, or Review finding.

## File Map

### Create

- `agent-runtime/src/qualification/gateCProviderPolicy.ts` — pure required/advisory decision evaluator; no filesystem or credential access.
- `agent-runtime/src/qualification/gateCProviderReconcileCli.ts` — argument parsing, report/source hashing, schema parsing, no-overwrite output, bounded stdout/stderr.
- `agent-runtime/test/gateCProviderPolicy.test.ts` — policy and CLI regression tests, including adversarial optional/required rows and no-overwrite behavior.
- `docs/verification/agent-runtime-v1/providers/2026-07-15-gate-c-codex-oauth-provider-decision.json` — generated immutable decision evidence.
- `docs/review/2026-07-15-adopt-codex-oauth-regression-qualification-implementation-review.md` — strict implementation Review.

### Modify

- `packages/shared-schema/src/index.ts` — add Gate C provider decision/evidence reference schema; do not change row result enums.
- `packages/shared-schema/test/schema.test.ts` — prove optional FAIL/BLOCKED rows do not veto production PASS and validate decision artifacts.
- `agent-runtime/package.json` — add a deterministic `qualification:gate-c-provider` CLI script.
- `openspec/changes/adopt-codex-oauth-regression-qualification/tasks.md` — reconcile approval/plan/implementation evidence only after each gate passes.
- `openspec/changes/harden-agent-runtime-single-node-production/proposal.md` — replace required OpenAI-compatible wording with required Codex/advisory API wording.
- `openspec/changes/harden-agent-runtime-single-node-production/design.md` — migrate Provider authority while preserving independent non-model gates.
- `openspec/changes/harden-agent-runtime-single-node-production/tasks.md` — migrate 3.1/3.2/3.5/3.6 acceptance wording; checkbox changes remain evidence-dependent.
- `openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md` — align the active delta so later archive cannot restore old semantics.
- `docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md` — update Gate C operational task and preserve historical API matrices as advisory.
- `docs/architecture/agent-runtime-v1-production-runbook.md` — document required Codex report, advisory API reports, decision artifact, no-fallback, and non-model gates.
- `docs/project-dashboard/development-log.json` — add implementation paths/evidence as status advances; never edit generated dashboard files directly.
- `docs/project-dashboard/development-log.md` and `docs/project-dashboard/index.html` — regenerated only by the renderer.

## Task 1: RED Shared Contract And Policy Tests

**Files:**

- Modify: `packages/shared-schema/test/schema.test.ts`
- Create: `agent-runtime/test/gateCProviderPolicy.test.ts`

- [ ] **Step 1: Add a shared-schema regression for optional failures**

Add a production `QualificationReportSchema.safeParse` case with one `required: true/result: "pass"` row plus `required: false` rows with `result: "blocked"` and `result: "fail"`; assert parse success and preserve both advisory results. Add the inverse case with a required blocked row and assert parse failure.

```ts
const optionalFailures = QualificationReportSchema.safeParse({
  track: "production",
  generatedAt: "2026-07-15T00:00:00.000Z",
  result: "pass",
  rows: [
    qualificationRow("codex-real-sync", true, "pass"),
    qualificationRow("openai-compatible-timeout", false, "blocked"),
    qualificationRow("anthropic-sync", false, "fail")
  ]
});
expect(optionalFailures.success).toBe(true);
```

- [ ] **Step 2: Add policy RED cases**

Create fixtures with exact Codex row ids `codex-real-sync`, `codex-real-stream`, `codex-real-reasoning`, `codex-real-usage`, `codex-real-cancellation`, and `codex-real-redaction`. Each row must be production/required/PASS and carry:

```ts
environment: {
  provider: "codex-app-server",
  qualificationAuthorization: "granted",
  credentialState: "not-read",
  clientImplementationSha256: CLIENT_SHA
}
```

Add tests asserting:

1. six Codex required PASS rows + advisory blocked/fail reports => decision PASS;
2. required Codex blocked/fail => decision BLOCKED;
3. missing/extra required Codex row => BLOCKED;
4. wrong provider/authorization/credentialState => BLOCKED;
5. report/client source hash mismatch => BLOCKED;
6. advisory results remain unchanged in the decision references;
7. a mock/local Codex report cannot pass;
8. CLI refuses an existing output path without changing its bytes.

- [ ] **Step 3: Run RED tests**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
pnpm --filter @openharness/agent-runtime test -- gateCProviderPolicy
```

Expected: shared-schema decision-schema assertions and Agent Runtime policy imports fail because the new schema/evaluator do not exist. Any unrelated failure triggers systematic debugging before implementation.

## Task 2: Implement Decision Schema And Pure Evaluator

**Files:**

- Modify: `packages/shared-schema/src/index.ts`
- Create: `agent-runtime/src/qualification/gateCProviderPolicy.ts`

- [ ] **Step 1: Add strict decision schemas**

Add these exported shapes after `QualificationReportSchema`:

```ts
export const GateCProviderEvidenceRefSchema = z.object({
  authority: z.enum(["required", "advisory"]),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  track: QualificationTrackSchema,
  reportResult: QualificationReportResultSchema
}).strict();

export const GateCProviderDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  policy: z.literal("codex-oauth-required-v1"),
  generatedAt: z.string().datetime(),
  result: z.enum(["pass", "blocked"]),
  required: GateCProviderEvidenceRefSchema.extend({
    authority: z.literal("required"),
    clientImplementationSha256: z.string().regex(/^[a-f0-9]{64}$/),
    requiredRowIds: z.array(z.string()).length(6)
  }).strict(),
  advisory: z.array(GateCProviderEvidenceRefSchema.extend({
    authority: z.literal("advisory")
  }).strict()),
  blockers: z.array(z.string())
}).strict().superRefine((decision, context) => {
  if (decision.result === "pass" && decision.blockers.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["blockers"], message: "pass decision cannot contain blockers" });
  }
});
```

Export inferred types. Do not add `advisory` to `QualificationRowResultSchema`; advisory is authority, while PASS/FAIL/BLOCKED remains the observed result.

- [ ] **Step 2: Implement the pure evaluator**

Use this public boundary:

```ts
export const REQUIRED_CODEX_ROW_IDS = [
  "codex-real-sync",
  "codex-real-reasoning",
  "codex-real-usage",
  "codex-real-stream",
  "codex-real-cancellation",
  "codex-real-redaction"
] as const;

export interface ProviderReportInput {
  path: string;
  sha256: string;
  report: QualificationReport;
}

export function evaluateGateCProviderQualification(input: {
  generatedAt: string;
  codex: ProviderReportInput;
  codexClientSourceSha256: string;
  advisory: ProviderReportInput[];
}): GateCProviderDecision;
```

The evaluator must:

- parse all public inputs with shared schemas;
- collect blockers instead of throwing for evidence outcomes;
- require production/PASS Codex report;
- require exactly the six required ids, unique and in canonical order;
- require every Codex row `required: true/result: "pass"`;
- require each row environment to record `provider=codex-app-server`, `qualificationAuthorization=granted`, `credentialState=not-read`, and the supplied client source SHA;
- preserve advisory report `track` and `result` without inspecting them as vetoes;
- return a final object parsed through `GateCProviderDecisionSchema`.

- [ ] **Step 3: Run focused GREEN tests**

Run the two Task 1 commands. Expected: all new policy/schema cases PASS; existing qualification-schema cases remain green.

## Task 3: Implement No-Overwrite Reconciliation CLI

**Files:**

- Create: `agent-runtime/src/qualification/gateCProviderReconcileCli.ts`
- Modify: `agent-runtime/package.json`
- Modify: `agent-runtime/test/gateCProviderPolicy.test.ts`

- [ ] **Step 1: Implement exact CLI arguments**

Accept only:

```text
--project-root <path>
--codex-report <path>
--codex-client-source <path>
--advisory-report <path>   # repeatable
--output <path>
--generated-at <UTC ISO timestamp>
```

Reject unknown/missing/duplicate singleton flags before reading files. Resolve every input/output against the canonical project root, reject paths that escape it, and store forward-slash project-relative evidence paths in the decision artifact. Do not read environment variables, Codex credential paths, `.env`, or command output.

- [ ] **Step 2: Implement read/hash/evaluate/write flow**

Use `createHash("sha256")`, `QualificationReportSchema.parse(JSON.parse(readFileSync(...)))`, and `evaluateGateCProviderQualification`. Serialize with two-space indentation and a trailing newline, reparse with `GateCProviderDecisionSchema`, then write using:

```ts
writeFileSync(outputPath, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
```

On PASS print only `result=pass policy=codex-oauth-required-v1 output=<basename> sha256=<hash>`. On BLOCKED write the schema-valid decision, print only blocker class names/count, and exit 3. Preflight/parse/no-overwrite failure exits 2 without creating or changing the target. No stdout/stderr may contain report bodies, absolute credential paths, raw correlation ids, Authorization values, OAuth values, or app-server payloads.

- [ ] **Step 3: Add package script and finish CLI tests**

Add:

```json
"qualification:gate-c-provider": "tsx src/qualification/gateCProviderReconcileCli.ts"
```

Run CLI tests against temporary reports, including concurrent/two-call no-overwrite assertions and byte-identical preservation of an existing target.

- [ ] **Step 4: Run focused verification**

```bash
pnpm --filter @openharness/agent-runtime test -- gateCProviderPolicy qualificationReport qualificationRedaction
pnpm --filter @openharness/agent-runtime typecheck
pnpm --filter @openharness/shared-schema test -- schema
pnpm --filter @openharness/shared-schema typecheck
```

Expected: PASS. Negative search:

```bash
rg -n "\.codex|auth\.json|accessToken|refreshToken|Authorization|Bearer" agent-runtime/src/qualification/gateCProviderPolicy.ts agent-runtime/src/qualification/gateCProviderReconcileCli.ts
```

Expected: only explicit forbidden-key/redaction assertions if any; no credential discovery or secret-bearing output.

## Task 4: Align Active Stage 0 Contract And Operations

**Files:**

- Modify: `openspec/changes/harden-agent-runtime-single-node-production/proposal.md`
- Modify: `openspec/changes/harden-agent-runtime-single-node-production/design.md`
- Modify: `openspec/changes/harden-agent-runtime-single-node-production/tasks.md`
- Modify: `openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md`
- Modify: `docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md`
- Modify: `docs/architecture/agent-runtime-v1-production-runbook.md`
- Modify: `docs/project-dashboard/development-log.json`

- [ ] **Step 1: Migrate normative wording as one slice**

Replace Gate C required OpenAI-compatible language with:

- required model family: Codex OAuth, six required production rows;
- advisory provider families: Zhipu/OpenAI-compatible/Anthropic/other API-key routes;
- no advisory row relabelling;
- dedicated real matrix still required before claiming an advisory provider itself production-qualified;
- Java sandbox/MCP/security/integration remain independent Gate C blockers.

Keep historical evidence and already completed local API matrix implementation steps. Mark them `supporting/advisory`, not deleted or rewritten as Codex evidence.

- [ ] **Step 2: Reconcile active task wording without premature checkbox promotion**

Task 3.1 becomes required Codex OAuth model qualification. Task 3.2 becomes optional/advisory API-key Provider qualification and explicitly cannot block Gate C. Task 3.5 limits release-blocking fixes to required Codex/non-model evidence while advisory gaps enter optimization records. Task 3.6 remains the strict Stage 2 signoff. Leave all four unchecked until Task 5 evidence and Review determine their exact status.

- [ ] **Step 3: Update runbook and dashboard source**

Document the exact CLI command, immutable inputs/output, expected PASS/BLOCKED semantics, no-overwrite rule, incident handling, and non-model blockers. Update both change entries in dashboard source but leave statuses `proposed`.

- [ ] **Step 4: Render and verify navigation**

```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
DO_NOT_TRACK=1 npx openspec validate adopt-codex-oauth-regression-qualification --strict --no-interactive
DO_NOT_TRACK=1 npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
```

Expected: all PASS. Run negative searches for stale normative claims; matches in immutable historical reviews/evidence are allowed, matches in active proposal/design/tasks/delta/plan/runbook/dashboard are not:

```bash
rg -n "Gate C required.*OpenAI-compatible|OpenAI-compatible.*Gate C required|OpenAI-compatible required row.*veto" openspec/changes/harden-agent-runtime-single-node-production docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md docs/architecture/agent-runtime-v1-production-runbook.md docs/project-dashboard/development-log.json
```

## Task 5: Generate And Review Gate C Provider Decision Evidence

**Files:**

- Create: `docs/verification/agent-runtime-v1/providers/2026-07-15-gate-c-codex-oauth-provider-decision.json`
- Modify: `openspec/changes/adopt-codex-oauth-regression-qualification/tasks.md`
- Modify: `openspec/changes/harden-agent-runtime-single-node-production/tasks.md` only when evidence permits
- Modify: `docs/project-dashboard/development-log.json`
- Create: `docs/review/2026-07-15-adopt-codex-oauth-regression-qualification-implementation-review.md`

- [ ] **Step 1: Confirm no-overwrite precondition**

Verify the target does not exist. If it exists, stop; never delete, overwrite, rename, or choose a deceptive replacement filename without a new review decision.

- [ ] **Step 2: Generate the decision artifact from immutable inputs**

Run from the Agent Runtime package context:

```bash
pnpm --filter @openharness/agent-runtime qualification:gate-c-provider -- \
  --project-root .. \
  --codex-report docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json \
  --codex-client-source backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java \
  --advisory-report docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json \
  --output docs/verification/agent-runtime-v1/providers/2026-07-15-gate-c-codex-oauth-provider-decision.json \
  --generated-at 2026-07-15T00:00:00.000Z
```

Expected: exit 0, PASS decision, required Codex report SHA `af2aee9aa03ed1d795599205936fe3f47e25bbfa3bdd3e16e317e6e0769bfad6`, current client source SHA `08b2aa0126f78ca45aad239e20981ad06b6e796539a1edc498706f2b81833ddc`, six canonical required row ids, and Zhipu report retained as advisory `blocked`.

- [ ] **Step 3: Prove no-overwrite and sensitive-data invariants**

Hash the new artifact, run the same CLI again, and require exit 2 with unchanged hash. Parse through `GateCProviderDecisionSchema`. Search the artifact, stdout/stderr capture, and new Review scope for OAuth/access/refresh/Authorization/Bearer canaries, absolute credential paths, bridge ids, raw correlation ids, and app-server payloads; any match is a hard stop.

- [ ] **Step 4: Run Stage 2 critical regression**

```bash
pnpm --filter @openharness/shared-schema test
pnpm --filter @openharness/shared-schema typecheck
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
mvn -f backend/pom.xml -Dtest=CodexFakeProviderMatrixTest,CodexAppServerClientTest,CodexAppServerAdapterTest,CodexPendingTurnRegistryTest,CodexTurnControllerTest,OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,QualificationReportPromoterTest,RealProviderQualificationMatrixTest,QualificationRedactorTest test
```

Expected: PASS. Do not make a real model call during this gate.

- [ ] **Step 5: Perform strict implementation Review**

Review actual code/diff and trace: CLI inputs → schema parse → SHA binding → pure policy → no-overwrite write → decision artifact → active contract/task/dashboard. Add an adversarial probe with optional advisory FAIL/BLOCKED plus required Codex PASS, and a required Codex blocker. Every actionable finding returns to fix → focused verification → Review.

- [ ] **Step 6: Reconcile task status conservatively**

After Review PASS:

- check new change 2.x–4.x tasks supported by observed evidence;
- check active 3.1 only if the decision artifact and required Codex evidence PASS;
- check active 3.5 only if no unresolved required Codex/non-model contract gap remains and advisory findings are recorded separately;
- check active 3.6 only if the complete Stage 2 strict regression/security/integration gate passes;
- never check Gate D, full qualification, contract freeze, closeout, or archive from this work.

Render/check dashboard after task reconciliation.

## Task 6: Final Verification And Handoff State

**Files:**

- Modify: `openspec/changes/adopt-codex-oauth-regression-qualification/tasks.md`
- Modify: `docs/project-dashboard/development-log.json`
- Modify: generated dashboard outputs through renderer
- Modify: implementation Review only if final evidence changes its conclusion

- [ ] **Step 1: Run final critical matrix**

```bash
pnpm --filter @openharness/shared-schema test
pnpm --filter @openharness/shared-schema typecheck
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
mvn -f backend/pom.xml test
DO_NOT_TRACK=1 npx openspec validate adopt-codex-oauth-regression-qualification --strict --no-interactive
DO_NOT_TRACK=1 npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
git diff --check
```

Expected: all PASS. Inspect `git status --short` and separate pre-existing dirty operations-documentation files from this change.

- [ ] **Step 2: Final sensitive-data and stale-contract searches**

Require no sensitive match in generated decision/review and no stale required OpenAI-compatible claim in active normative artifacts. Historical archived specs/reviews and advisory source reports remain unchanged and may retain old wording/results.

- [ ] **Step 3: Final Review and completion boundary**

Invoke `superpowers:verification-before-completion`. Mark the new change `verified` only if every implementation task except archive passes and dashboard requirements are satisfied. Archive requires a separate explicit completion decision because the active Stage 0 change still consumes this policy; no commit/push/archive occurs in this plan.

## Rollback

- Before evidence generation: revert only this change's new policy/schema/CLI/tests and active normative wording; regenerate dashboard from source. Historical reports remain untouched.
- After decision generation but before publication: do not delete or overwrite the generated immutable decision. Mark it superseded/blocked in a new reviewed artifact if implementation is rolled back.
- Any source/report hash mismatch stops reuse and requires either restoring the reviewed source or separately authorizing a fresh Codex OAuth qualification; this plan does not grant that real-call authorization.
