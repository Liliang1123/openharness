## RENAMED Requirements

- FROM: `### Requirement: Gate C OpenAI-Compatible-Only Real Provider Qualification`
- TO: `### Requirement: Gate C Codex OAuth Required Model Regression Qualification`

## MODIFIED Requirements

### Requirement: Deferred Anthropic Real Provider Qualification
Anthropic Messages real-provider qualification SHALL remain a deferred, optional production family after the required Codex OAuth Gate C model qualification. The Anthropic adapter and local/fake Anthropic matrix MAY continue to run as supporting evidence. Anthropic SHALL be considered production-qualified only after a dedicated real Anthropic matrix passes with approved credentials. Neither Codex OAuth nor an OpenAI-compatible Provider success MUST be treated as Anthropic success.

#### Scenario: Anthropic real matrix is deferred not deleted
- **WHEN** Gate C is evaluated without Anthropic credentials
- **THEN** Anthropic real matrix is recorded as deferred/not-required for Gate C rather than deleted from the product roadmap

#### Scenario: Another provider success does not qualify Anthropic
- **WHEN** only Codex OAuth or an OpenAI-compatible real matrix has passed
- **THEN** Anthropic is not marked production-qualified

#### Scenario: Later Anthropic credentials enable deferred matrix
- **WHEN** approved Anthropic credentials become available after Gate C
- **THEN** operators MAY run the deferred Anthropic real matrix and promote Anthropic as an additional qualified family without invalidating the required Codex Gate C decision or truthful historical Provider evidence

### Requirement: Gate C Codex OAuth Required Model Regression Qualification
Single-node production Gate C SHALL use the official local Codex CLI/app-server with ChatGPT/Codex OAuth as the only required real-model family for OpenHarness regression and model-provider acceptance. The required production matrix SHALL cover sync, stream, reasoning, usage, cancellation, and redaction, and every required Codex row MUST PASS without mock fallback. Zhipu, generic OpenAI-compatible, Anthropic, and other API-key provider matrices SHALL be optional compatibility/optimization evidence for global Runtime qualification: their rows MUST retain their observed PASS/FAIL/BLOCKED result but MUST be `required: false` or excluded from the required aggregate, and they MUST NOT veto overall model-regression PASS. Codex evidence MUST NOT be represented as production qualification for another provider protocol. Java sandbox, MCP, OAuth security, tenant isolation, persistence/recovery, Stage 2 security/integration, Gate D, final qualification, and contract-freeze gates remain independently required.

#### Scenario: Codex OAuth required matrix passes
- **WHEN** an explicitly authorized Codex app-server production report passes schema, immutable hash, client source binding, redaction, and all six required rows
- **THEN** the Gate C model-provider portion MAY record PASS without requiring any API-key provider credential or matrix PASS

#### Scenario: Required Codex evidence vetoes PASS
- **WHEN** a required Codex row is FAIL or BLOCKED, login is unavailable, mock evidence is supplied, or evidence binding is invalid
- **THEN** the Gate C model-provider portion MUST NOT record PASS and no API-key or mock fallback is attempted

#### Scenario: API-key provider is unavailable
- **WHEN** Zhipu, Anthropic, generic OpenAI-compatible, or another API-key provider has an expired/missing credential, unsupported capability, unauthorized fixture, FAIL row, or BLOCKED row
- **THEN** the observed result is retained as advisory compatibility/optimization evidence and does not veto global model-regression PASS

#### Scenario: Advisory row is not fabricated as PASS
- **WHEN** an API-key provider row did not execute or did not satisfy its provider-specific oracle
- **THEN** the row remains FAIL/BLOCKED or omitted from the required aggregate and MUST NOT be relabelled PASS because Codex passed

#### Scenario: Provider-specific qualification remains truthful
- **WHEN** an operator claims that an advisory API-key provider is production-qualified for its own protocol
- **THEN** that provider MUST have its own dedicated real matrix PASS; Codex OAuth evidence alone is insufficient

#### Scenario: Non-model gate remains blocking
- **WHEN** the Codex model-provider portion passes but a Java sandbox, MCP, OAuth security, tenant isolation, persistence/recovery, Stage 2 security/integration, Gate D, final qualification, or contract-freeze requirement fails or remains blocked
- **THEN** the applicable Runtime promotion or closeout remains blocked
