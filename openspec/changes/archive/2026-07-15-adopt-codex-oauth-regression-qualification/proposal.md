# Change: Adopt Codex OAuth As The Required Model Regression Qualification

## Why

OpenHarness already has a production-qualified local Codex app-server route backed by the operator's ChatGPT/Codex OAuth login. Its immutable production evidence records six required rows as PASS while keeping OAuth credentials outside OpenHarness.

The current single-node Gate C contract still requires a separate OpenAI-compatible API-key matrix. The available commercial API credentials have expired or are no longer the operator's intended Runtime path, so that contract blocks closeout on providers that are not used for OpenHarness regression or production acceptance. It also duplicates a weaker model path while the Codex OAuth route is the operator-approved, higher-quality default.

User decision on 2026-07-15: all real model calls made by OpenHarness regression qualification SHALL use the official Codex CLI/app-server with ChatGPT/Codex OAuth. API-key providers such as Zhipu and Anthropic remain compatibility and optimization surfaces, but their missing/expired credentials, unsupported capabilities, FAIL, or BLOCKED rows SHALL NOT veto overall model-regression PASS.

This product decision approves the design direction. Implementation remains blocked until this scoped OpenSpec change is reviewed and explicitly approved.

## Approval

The user explicitly approved `adopt-codex-oauth-regression-qualification` on 2026-07-15. Implementation SHALL follow the strict staged plan and Review gates; this approval does not independently authorize real OAuth reruns, Gate D, archive, commit, or push.

## What Changes

- Make the local official Codex CLI/app-server OAuth route the only required real-model family for OpenHarness regression qualification and Gate C model-provider acceptance.
- Define the required Codex production matrix as sync, stream, reasoning, usage, cancellation, and redaction. Every required Codex row must PASS; mock evidence remains forbidden.
- Reclassify Zhipu, Anthropic, and all other API-key provider matrices as optional compatibility/optimization evidence. Their FAIL/BLOCKED/missing rows remain visible but do not veto overall PASS.
- Preserve evidence integrity: an unexecuted or unavailable API-key row is never relabelled PASS. It is recorded as `required: false` with its observed result, or referenced as omitted/advisory by the Gate C reconciliation artifact.
- Preserve non-model hard gates. OAuth secret protection, Codex pending-turn safety, Java sandbox, MCP, tenant isolation, persistence/recovery, security/integration, and formal Gate D production workload remain independently blocking.
- Reconcile the active single-node production change, implementation plan, runbook, dashboard, and closeout language with this required/advisory split.
- Add an executable Gate C provider-policy check and deterministic regression coverage so future documentation or report aggregation cannot silently restore API-key rows to the required set.
- Allow the existing immutable Codex production report to satisfy the required model evidence only after its report hash, client implementation hash, schema, authorization, and redaction evidence are freshly reconciled against the current revision.

## Impact

- Affected specs: `provider-adapter`.
- Affected active change: `harden-agent-runtime-single-node-production` provider qualification contract and task wording.
- Affected implementation: provider qualification policy/aggregation, shared qualification-schema regression tests, Gate C evidence reconciliation, production runbook, dashboard, and closeout reviews.
- Existing API-key adapters and their tests remain in-tree and callable; this change alters release qualification authority, not adapter availability.
- Existing Codex OAuth architecture, local-only IPC, credential ownership, no-fallback behavior, and pending-turn security boundaries remain unchanged.

## Non-Goals

- Reading, copying, refreshing, or exposing ChatGPT/Codex OAuth credentials in OpenHarness.
- Marking an unexecuted API-key row PASS.
- Deleting Zhipu, OpenAI-compatible, or Anthropic adapters and deterministic tests.
- Treating Codex app-server protocol evidence as proof that a specific third-party API protocol is production-qualified.
- Weakening Java sandbox, MCP, approval, redaction, tenant isolation, persistence, recovery, Gate D, or final promotion gates.
- Adding silent fallback from Codex OAuth to an API-key provider or mock.

## Risk

Strict. This change modifies production qualification authority and could under-qualify an API-key provider if advisory evidence were confused with provider-specific production support. The mitigation is an explicit required/advisory distinction, immutable evidence references, executable aggregation checks, preserved adapter tests, and labels that never call an advisory provider production-qualified without its own real matrix.

## Delivery Profile

- Evidence profile: strict.
- Batch profile: staged policy/schema tests; active-contract alignment; evidence reconciliation; final qualification review.
