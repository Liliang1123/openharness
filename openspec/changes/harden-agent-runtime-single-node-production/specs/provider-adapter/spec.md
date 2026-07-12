## ADDED Requirements

### Requirement: Auditable Real Provider Qualification
Production Gate C SHALL exercise a real OpenAI-compatible Chat Completions matrix without mock fallback as the required provider family. Anthropic Messages real-provider qualification is deferred / post-Gate-C and MUST NOT by itself block Gate C overall PASS when Anthropic credentials are absent. Each required OpenAI-compatible matrix row MUST record environment fingerprint, API/model version, capability prerequisites, redacted request hash, observed response/event sequence, oracle, exact provider usage, recomputed cost, duration, and result. Missing OpenAI-compatible credentials or required OpenAI-compatible capabilities SHALL block Gate C overall PASS. OpenAI-compatible success MUST NOT be treated as Anthropic production qualification.

#### Scenario: OpenAI-compatible real matrix can close Gate C provider family without Anthropic
- **WHEN** an approved OpenAI-compatible real-provider matrix has every required row PASS and Anthropic credentials are absent
- **THEN** Gate C provider-family acceptance is not blocked solely by Anthropic absence

#### Scenario: OpenAI-compatible required row vetoes Gate C
- **WHEN** any required OpenAI-compatible real-provider matrix row is FAIL or BLOCKED
- **THEN** Gate C overall PASS is forbidden

#### Scenario: Mock fallback is forbidden
- **WHEN** a real qualification row cannot call its configured endpoint
- **THEN** the row is BLOCKED or FAIL and no mock response can satisfy it

#### Scenario: Deferred Anthropic remains optional
- **WHEN** Anthropic credentials later become available after Gate C
- **THEN** operators MAY run a deferred Anthropic real matrix and promote Anthropic as an additional qualified family without invalidating prior OpenAI-compatible Gate C evidence

### Requirement: Provider Secret Redaction
Provider credentials and authorization payloads MUST be removed by a shared logging redaction boundary before stdout, file logs, traces, runtime events, or qualification reports are written. Qualification MUST include secret canaries and a negative scan of all produced artifacts.

#### Scenario: Canary secret is absent
- **WHEN** a provider failure contains an Authorization header or API-key canary
- **THEN** no raw canary appears in any emitted artifact and the redaction assertion passes
