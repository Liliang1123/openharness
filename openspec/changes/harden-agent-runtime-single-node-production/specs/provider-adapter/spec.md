## ADDED Requirements

### Requirement: Auditable Real Provider Qualification
Production qualification SHALL exercise real OpenAI-compatible Chat Completions and Anthropic Messages endpoints without mock fallback. Each matrix row MUST record environment fingerprint, API/model version, capability prerequisites, redacted request hash, observed response/event sequence, oracle, exact provider usage, recomputed cost, duration, and result. Missing credentials or required capabilities SHALL block overall PASS.

#### Scenario: Both provider families pass the matrix
- **WHEN** qualification runs with approved credentials and capable models
- **THEN** sync, stream, multi-step tools, structured arguments, reasoning, usage/cost, retry, timeout, cancellation, terminal error, and redaction rows pass for both families

#### Scenario: Mock fallback is forbidden
- **WHEN** a real qualification row cannot call its configured endpoint
- **THEN** the row is BLOCKED or FAIL and no mock response can satisfy it

### Requirement: Provider Secret Redaction
Provider credentials and authorization payloads MUST be removed by a shared logging redaction boundary before stdout, file logs, traces, runtime events, or qualification reports are written. Qualification MUST include secret canaries and a negative scan of all produced artifacts.

#### Scenario: Canary secret is absent
- **WHEN** a provider failure contains an Authorization header or API-key canary
- **THEN** no raw canary appears in any emitted artifact and the redaction assertion passes
