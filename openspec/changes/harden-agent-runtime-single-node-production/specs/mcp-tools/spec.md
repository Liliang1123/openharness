## ADDED Requirements

### Requirement: Real MCP Production Qualification
Production qualification SHALL use a real stdio MCP test server and SHALL cover initialize, `tools/list`, catalog conflicts, multi-step `tools/call`, provenance, approval, timeout, crash isolation, supported cancellation, and SIGTERM shutdown. Each matrix row MUST record setup, observed protocol evidence, oracle, duration, and result. Required unsupported behavior SHALL block overall PASS rather than be silently skipped.

#### Scenario: MCP lifecycle qualifies end to end
- **WHEN** the qualification server starts and exposes approved tools
- **THEN** startup, catalog merge, multi-step calls, approval, failure isolation, and shutdown rows produce passing protocol evidence

#### Scenario: Server crash is isolated
- **WHEN** the MCP process crashes during a qualification call
- **THEN** Runtime returns the structured MCP failure, remains available, and records no secret or cross-tenant payload
