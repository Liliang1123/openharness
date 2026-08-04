## 1. Approval And Planning

- [x] 1.1 Inspect the failed Local CLI log-correlation evidence and existing
  Runtime execution/trace contracts.
- [x] 1.2 Obtain user approval for the minimal shared-runner, allowlist-based
  lifecycle-log design.
- [x] 1.3 Obtain explicit approval for this OpenSpec change.
- [x] 1.4 After approval, generate and preflight-review a Superpowers
  implementation plan with exact files, TDD sequence, sync backup, rollback,
  and focused verification.

## 2. Lifecycle Log Contract

- [x] 2.1 Add RED tests for exact accepted/terminal JSON shapes and exactly-once
  emission.
- [x] 2.2 Add negative canary tests proving messages, answers, prompts, tools,
  headers, tenant/user identity, credentials, OAuth material, and arbitrary
  errors are absent.
- [x] 2.3 Add a sink-failure test proving lifecycle logging cannot change chat
  execution or terminal state.
- [x] 2.4 Implement the minimal allowlist-based JSON-lines logger.

## 3. Shared Runner Wiring

- [x] 3.1 Add RED runner tests for admitted, successful, and failed executions.
- [x] 3.2 Inject the lifecycle logger through `createServer` and wire it once at
  `AgentExecutionRunner`, covering synchronous and streaming chat without
  endpoint duplication.
- [x] 3.3 Preserve APIs, SSE frames, RuntimeEventStore, trace outbox, storage,
  Java Backend, and wrapper syntax.
- [x] 3.4 Run focused Runtime server, runner, stream, lifecycle, and production
  startup tests plus typecheck.

## 4. User-Local Trial

- [x] 4.1 Back up every user-local isolated-source file that the approved plan
  permits changing.
- [x] 4.2 Stop the wrapper, synchronize only verified files, and preserve
  existing non-secret Codex provider/agent configuration without inspecting
  OAuth storage.
- [x] 4.3 Update the wrapper guide with lifecycle-log fields, privacy boundary,
  and rollback.
- [x] 4.4 Run `doctor → up → status → chat → logs → down`; require all six
  commands to pass, record ports/log locations and correlation identifiers,
  and verify the final stopped state.

## 5. Verification And Review

- [x] 5.1 Run focused Runtime tests, typecheck, wrapper syntax, strict OpenSpec
  validation, dashboard checks, sensitive-canary negative scans, and
  `git diff --check`.
- [x] 5.2 Perform implementation Review over the complete diff, production
  wiring, exactly-once behavior, non-blocking sink failure, privacy boundary,
  local sync, and rollback.
- [x] 5.3 Reconcile tasks and report residual risk without claiming Production
  Verified, running full-repository regression, archiving either active change,
  committing, pushing, developing Frontend, or starting a 24-hour Gate.
