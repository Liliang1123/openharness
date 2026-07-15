## ADDED Requirements

### Requirement: Auditable Real Provider Qualification
Production Gate C SHALL use the official local Codex CLI/app-server with ChatGPT/Codex OAuth as the only required real-model family. The authorized production report MUST contain required PASS rows for sync, reasoning, usage, stream, cancellation, and redaction, MUST pass immutable report/current client source binding and credential-boundary review, and MUST NOT use mock or API-key fallback. Zhipu, generic OpenAI-compatible, Anthropic, and other API-key reports SHALL retain observed PASS/FAIL/BLOCKED results as advisory compatibility/optimization evidence and MUST NOT veto global model-regression PASS. Codex success MUST NOT be treated as production qualification for another provider protocol. Java sandbox, MCP, security/integration, persistence/recovery, Gate D, and final release gates remain independently required.

#### Scenario: Codex OAuth required matrix can close the model-provider portion
- **WHEN** the authorized Codex production report and current client source binding pass all six required rows and redaction/no-fallback checks
- **THEN** the Gate C model-provider portion MAY PASS without any API-key Provider credential or matrix PASS

#### Scenario: Required Codex evidence vetoes PASS
- **WHEN** any required Codex row is FAIL/BLOCKED, the report is local/mock, OAuth transport is unavailable, or evidence binding is invalid
- **THEN** the model-provider portion MUST NOT PASS and no API-key/mock fallback is attempted

#### Scenario: API-key Provider evidence remains advisory and truthful
- **WHEN** an API-key Provider credential/capability/fixture is unavailable or its real row is FAIL/BLOCKED
- **THEN** the observed result remains advisory, does not veto global model-regression PASS, and is not relabelled PASS

#### Scenario: Provider-specific claim requires provider-specific evidence
- **WHEN** an operator claims an advisory API-key Provider is production-qualified for its own protocol
- **THEN** that Provider MUST have its own dedicated real matrix PASS; Codex OAuth evidence alone is insufficient

#### Scenario: Non-model gates remain blocking
- **WHEN** the Codex model-provider portion passes but an independent tool, security, persistence/recovery, Gate D, or final release requirement fails or remains blocked
- **THEN** the applicable Runtime promotion remains blocked

### Requirement: Provider Secret Redaction
Provider credentials and authorization payloads MUST be removed by a shared logging redaction boundary before stdout, file logs, traces, runtime events, or qualification reports are written. Qualification MUST include secret canaries and a negative scan of all produced artifacts.

#### Scenario: Canary secret is absent
- **WHEN** a provider failure contains an Authorization header or API-key canary
- **THEN** no raw canary appears in any emitted artifact and the redaction assertion passes
