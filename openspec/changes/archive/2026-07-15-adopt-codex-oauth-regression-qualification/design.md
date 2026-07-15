# Design: Codex OAuth Required Model Regression Qualification

## Context

The archived ChatGPT/Codex OAuth change established a local official Codex app-server provider, kept credential ownership inside Codex, implemented the pending-turn tool bridge, and produced an immutable production report with six required PASS rows. The current Gate C contract was written earlier and still gives an OpenAI-compatible API-key matrix veto authority over single-node Runtime closeout.

The operator now selects the Codex OAuth path as the sole required real-model regression route. Other provider adapters remain useful compatibility surfaces, but expired commercial credentials and provider-specific fixture limitations must not prevent Runtime acceptance.

## Goals

1. Make qualification authority match the real model route used by OpenHarness regression.
2. Preserve truthful row-level evidence while allowing overall PASS when optional API-key rows are unavailable or fail.
3. Reuse the existing Codex production evidence only through fresh hash/schema/source reconciliation.
4. Keep every non-model production and security gate unchanged.
5. Prevent future documents or aggregators from accidentally restoring optional providers to the required set.

## Non-Goals

- Declaring Zhipu, Anthropic, or another API-key family production-qualified from Codex evidence.
- Converting advisory BLOCKED/FAIL rows to PASS.
- Replacing deterministic fake-provider, protocol, pending-turn, tool, or security tests with a real-model smoke.
- Changing Codex OAuth credential ownership or allowing fallback.
- Closing Gate C merely because this proposal exists.

## Decisions

### 1. Required real-model track

The official local Codex CLI/app-server using ChatGPT/Codex OAuth is the only required real-model family for OpenHarness regression and Gate C model-provider acceptance.

The minimum required production row set is:

- sync;
- stream;
- reasoning;
- usage;
- cancellation;
- redaction.

All required rows must PASS in an authorized production report. Missing login, unavailable Codex transport, schema failure, source/evidence hash mismatch, redaction failure, or a required FAIL/BLOCKED row vetoes the model-provider gate. Fake or mock PASS never satisfies this track.

### 2. API-key providers become advisory

Zhipu, generic OpenAI-compatible, Anthropic, and future API-key providers remain supported adapter/test surfaces. Their real matrices are tagged `required: false` for global Runtime regression or are referenced as advisory reports outside the required aggregate.

An advisory row keeps its observed `pass`, `fail`, or `blocked` value. Missing/expired credentials, unsupported reasoning, unavailable provider-backed error fixtures, timeout/cancellation limitations, or other provider-specific blockers are recorded as optimization/compatibility findings and do not veto global model-regression PASS.

An advisory provider may only be labelled production-qualified for its own protocol after its own dedicated real matrix passes. Codex PASS proves the OpenHarness Codex route, not third-party protocol parity.

### 3. Gate C reconciliation artifact

Implementation produces a new no-overwrite Gate C provider-decision artifact that:

1. references the immutable Codex production report and its SHA-256;
2. verifies the report against the shared qualification schema;
3. verifies six required Codex rows PASS;
4. checks the recorded Codex client implementation hash against the current client source, or requires a fresh authorized Codex run after a material route change;
5. references API-key reports as advisory without rewriting them;
6. records the required/advisory policy version and decision result;
7. contains no OAuth credential, raw Authorization value, or sensitive app-server payload.

The reconciliation artifact can mark the model-provider portion PASS. It cannot by itself close the Stage 2 security/integration gate, Gate D, contract freeze, or archive.

### 4. Existing qualification schema is retained

The shared schema already makes only `required: true` rows veto production report PASS. Implementation adds explicit regression coverage for a PASS report containing optional BLOCKED/FAIL rows and for a required Codex BLOCKED/FAIL veto. A new row result such as `advisory` is unnecessary and would blur observed outcome with policy authority.

### 5. Active production change alignment

After this change is explicitly approved, implementation updates the still-active single-node production proposal, design, provider-adapter delta, tasks, approved plan, runbook, dashboard, and reviews to use the same vocabulary:

- `required`: Codex OAuth real-model regression;
- `advisory`: API-key provider compatibility/optimization;
- `independently required`: Java sandbox, MCP, security/integration, persistence/recovery, Gate D, and final release gates.

No existing checkbox is marked complete until the new decision artifact and the corresponding strict verification/review exist.

## Decision Table

| Evidence condition | Model-provider result | Effect on overall Runtime qualification |
| --- | --- | --- |
| Six required Codex production rows PASS and evidence binding is current | PASS | Model-provider gate may pass |
| Any required Codex row FAIL/BLOCKED, login missing, or binding invalid | FAIL/BLOCKED | Vetoes model-provider PASS |
| API-key provider row PASS | Advisory success | Recorded; no global veto or extra authority |
| API-key provider row FAIL/BLOCKED/missing | Advisory finding | Recorded as optimization/compatibility debt; no global veto |
| Mock/fake Codex report only | Not qualified | Cannot satisfy required real-model track |
| Java/MCP/security/Gate D failure | Independent failure | Still vetoes the applicable Runtime gate |

## Alternatives

1. Keep OpenAI-compatible API-key rows required — rejected because the credentials are expired/unavailable and the operator does not use that route for regression acceptance.
2. Mark every old API-key row PASS when Codex passes — rejected because it would fabricate protocol-specific evidence.
3. Select Codex OAuth as required and retain API-key evidence as advisory — selected because it matches the real operational path without deleting compatibility information or weakening unrelated gates.

## Security And Failure Handling

- OAuth credential boundaries from the archived Codex change remain normative.
- The policy checker consumes redacted reports and hashes only; it never invokes credential discovery or reads Codex credential files.
- Missing Codex login is a required-model blocker, not a reason to fall back.
- Missing API-key credentials are advisory and must not cause secret-seeking retries.
- Any inconsistency between report result, required rows, source binding, or immutable hash fails closed.

## Verification Strategy

- TDD for required/advisory aggregation and evidence-binding checks.
- Shared-schema regression proving optional BLOCKED/FAIL rows do not veto production PASS.
- Negative tests proving required Codex BLOCKED/FAIL rows do veto PASS.
- Fresh schema parse and SHA-256 verification of the existing immutable Codex report.
- Secret-canary and path/correlation scans over the new decision artifact.
- Focused Java/shared-schema tests, active OpenSpec strict validation, dashboard rendering/check, and independent strict Review before any Gate C task reconciliation.

## Rollback

Before archive, rollback removes this proposed policy and leaves the existing OpenAI-compatible-required Gate C contract unchanged. After archive, a new OpenSpec change is required to restore API-key provider veto authority. Existing immutable provider evidence is never deleted or overwritten in either direction.
