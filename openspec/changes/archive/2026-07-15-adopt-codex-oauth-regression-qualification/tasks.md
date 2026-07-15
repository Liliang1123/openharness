## 1. Approval And Planning

- [x] 1.1 Review and explicitly approve this OpenSpec change before implementation.
- [x] 1.2 After approval, create a strict staged Superpowers implementation plan and pass Plan Preflight Review.

## 2. Executable Qualification Policy

- [x] 2.1 Add RED shared-schema/policy tests proving optional API-key FAIL/BLOCKED rows do not veto production PASS and required Codex FAIL/BLOCKED rows do veto it.
- [x] 2.2 Implement a bounded Gate C provider-policy evaluator that accepts only the authorized Codex OAuth report as the required real-model track and treats API-key reports as advisory.
- [x] 2.3 Enforce immutable report hash, schema, required-row set, client source binding, authorization, and redaction checks; fail closed on inconsistency and never read credential files.
- [x] 2.4 Prove that mock/fake Codex evidence, silent provider fallback, and relabelled advisory rows cannot satisfy the required track.

## 3. Active Contract Alignment

- [x] 3.1 Update the active single-node production proposal, design, provider-adapter delta, and tasks so Codex OAuth is required and API-key providers are advisory without changing non-model gates.
- [x] 3.2 Update the approved Stage 0 implementation plan and production runbook with the same required/advisory vocabulary, evidence paths, rollback, and operator actions.
- [x] 3.3 Update dashboard navigation and review artifacts without marking the active Runtime change verified or archived.
- [x] 3.4 Retain API-key adapters, deterministic tests, and historical immutable reports; remove no provider capability.

## 4. Evidence Reconciliation

- [x] 4.1 Freshly verify the immutable Codex production report SHA-256, schema, authorization metadata, six required PASS rows, redaction, and current client implementation binding.
- [x] 4.2 Generate one new no-overwrite Gate C provider-decision artifact that references Codex required evidence and API-key advisory evidence without modifying either source report.
- [x] 4.3 Run secret-canary, Authorization, OAuth credential-path, raw correlation, and sensitive payload negative scans over the new artifact and affected logs/reviews.
- [x] 4.4 Reconcile Gate C model-provider task status only after evidence and strict Review pass; keep Stage 2 security/integration, Gate D, full qualification, contract freeze, and archive independently pending until their evidence exists.

## 5. Verification And Closeout

- [x] 5.1 Run focused Java/provider-policy tests, shared-schema tests, TypeScript checks where affected, active/new OpenSpec strict validation, dashboard render/check, and diff/sensitive-data checks.
- [x] 5.2 Complete strict implementation Review and fix every actionable finding before final verification.
- [x] 5.3 Reconcile this change's tasks, update dashboard to verified, and write closeout artifacts only after observed evidence exists.
- [x] 5.4 Archive this change only after all tasks pass; update current specs and dashboard to archived without deleting historical API-provider evidence.
