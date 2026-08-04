## 1. Approval And Planning

- [x] 1.1 Obtain explicit approval for this OpenSpec change.
- [x] 1.2 After approval, generate a Superpowers implementation plan with exact
  allowed files, TDD steps, rollback, and focused verification.
- [x] 1.3 Preflight-review the implementation plan before code or local
  configuration changes.

## 2. Provider Configuration Contract

- [x] 2.1 Add RED tests for omitted/default `medium`, explicit `high`, bounded
  safe-identifier validation, and non-Codex rejection.
- [x] 2.2 Add the optional Codex provider configuration field and immutable
  effective value without adding any credential path.
- [x] 2.3 Run focused ProviderProperties and ProviderConfig tests.

## 3. Codex Protocol Wiring

- [x] 3.1 Add RED protocol tests proving `turn/start.effort` uses the provider
  configuration instead of a literal.
- [x] 3.2 Forward the effective value through the adapter/client boundary.
- [x] 3.3 Add a fake app-server rejection case proving structured redacted
  failure and no provider/mock fallback.
- [x] 3.4 Run focused Codex adapter, client, lifecycle, router, and configuration
  tests.

## 4. Local Trial And Documentation

- [x] 4.1 Back up the existing user-local operator configuration.
- [x] 4.2 Configure the existing explicit route
  `openai-codex/gpt-5.6-sol` with `reasoning-effort: high` without reading or
  copying OAuth credentials.
- [x] 4.3 Update the local wrapper guide with the non-secret provider example,
  compatibility default, failure behavior, and rollback.
- [x] 4.4 Run `doctor → up → status → chat → logs → down`; record six
  PASS/FAIL results, ports, logs, model/effort evidence, and final stopped state.

## 5. Verification And Review

- [x] 5.1 Run focused Java tests and wrapper shell syntax validation.
- [x] 5.2 Run strict validation for this OpenSpec change and dashboard checks.
- [x] 5.3 Perform implementation Review covering complete diff, protocol
  wiring, OAuth secret boundary, no-fallback behavior, and local rollback.
- [x] 5.4 Reconcile tasks and report residual risk without claiming Production
  Verified, running full-repository regression, archiving, or starting a
  24-hour Gate.
