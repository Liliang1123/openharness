# p0a-integration Specification

## Purpose
TBD - created by archiving change implement-p0a-skeleton. Update Purpose after archive.
## Requirements
### Requirement: P0a Integration Acceptance
The repository SHALL include P0a integration tests covering catalog, tool execution, agent chat tool loop, auth failure, idempotency replay, catalog mismatch, mock fixture mode, reasoning block roundtrip, and trace continuity.

#### Scenario: Catalog acceptance
- **WHEN** the integration test calls `GET /api/v1/tools/catalog`
- **THEN** the response includes `catalogVersion` and `catalogHash`

#### Scenario: Tool execution acceptance
- **WHEN** the integration test calls `POST /api/v1/tools/execute` for `get_current_time`
- **THEN** the response has `status: "ok"`

#### Scenario: Agent chat time acceptance
- **WHEN** the integration test calls `POST /api/v1/agent/chat` with `现在几点`
- **THEN** the runtime completes model -> tool -> final answer

#### Scenario: Auth failure acceptance
- **WHEN** the integration test calls a Java non-health API without `X-User-Id`
- **THEN** the response is HTTP 401 with `AUTH_MISSING_HEADER`

#### Scenario: Idempotency replay acceptance
- **WHEN** the integration test repeats a Java tool request with the same `idempotencyKey`
- **THEN** the second response returns the first result and `idempotentReplay=true`

#### Scenario: Catalog mismatch acceptance
- **WHEN** the integration test executes a tool with stale `catalogVersion`
- **THEN** the response is HTTP 409 with `CATALOG_OUTDATED`

#### Scenario: Fixture mode acceptance
- **WHEN** the integration test sends `X-Mock-Fixture`
- **THEN** the mock model returns a deterministic canonical response

#### Scenario: Reasoning roundtrip acceptance
- **WHEN** the Java mock returns a reasoning block
- **THEN** the TS Runtime sends the same structured reasoning block back to Java on the next model request

#### Scenario: Trace continuity acceptance
- **WHEN** one chat request completes
- **THEN** at least 1 frontend event, 3 TS events, and 2 Java events share the same `traceId`

