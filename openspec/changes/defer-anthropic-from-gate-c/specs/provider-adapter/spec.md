## ADDED Requirements

### Requirement: Gate C OpenAI-Compatible-Only Real Provider Qualification
Single-node production Gate C SHALL require a real OpenAI-compatible Chat Completions matrix without mock fallback. Gate C MUST NOT require a real Anthropic Messages matrix. Each required OpenAI-compatible matrix row MUST record environment fingerprint, API/model version, capability prerequisites, redacted request hash, observed response/event sequence, oracle, exact provider usage where applicable, recomputed cost where applicable, duration, and result. Missing OpenAI-compatible credentials or required OpenAI-compatible capabilities SHALL block Gate C overall PASS. Missing Anthropic credentials SHALL NOT by themselves block Gate C overall PASS.

#### Scenario: OpenAI-compatible real matrix can close Gate C without Anthropic
- **WHEN** an approved OpenAI-compatible real-provider matrix has every required row PASS and Anthropic credentials are absent
- **THEN** Gate C provider-family acceptance for real LLM paths is not blocked solely by Anthropic absence

#### Scenario: OpenAI-compatible required row still vetoes Gate C
- **WHEN** any required OpenAI-compatible real-provider matrix row is FAIL or BLOCKED
- **THEN** Gate C overall PASS is forbidden

#### Scenario: Mock fallback remains forbidden for required real rows
- **WHEN** a required real OpenAI-compatible qualification row cannot call its configured endpoint
- **THEN** the row is BLOCKED or FAIL and no mock response can satisfy it

### Requirement: Deferred Anthropic Real Provider Qualification
Anthropic Messages real-provider qualification SHALL remain a deferred, optional production family after Gate C. The Anthropic adapter and local/fake Anthropic matrix MAY continue to run as supporting evidence. Anthropic SHALL be considered production-qualified only after a dedicated real Anthropic matrix passes with approved credentials. OpenAI-compatible success MUST NOT be treated as Anthropic success.

#### Scenario: Anthropic real matrix is deferred not deleted
- **WHEN** Gate C is evaluated without Anthropic credentials
- **THEN** Anthropic real matrix is recorded as deferred/not-required for Gate C rather than deleted from the product roadmap

#### Scenario: Zhipu or other OpenAI-compatible success does not qualify Anthropic
- **WHEN** only an OpenAI-compatible real matrix has passed
- **THEN** Anthropic is not marked production-qualified

#### Scenario: Later Anthropic credentials enable deferred matrix
- **WHEN** approved Anthropic credentials become available after Gate C
- **THEN** operators MAY run the deferred Anthropic real matrix and promote Anthropic as an additional qualified family without invalidating prior OpenAI-compatible Gate C evidence
