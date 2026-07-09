## ADDED Requirements

### Requirement: Real Sandbox Tool Qualification
The Java Enterprise Gateway SHALL qualify protocol tools through the real sandbox path using a matrix that records environment/sandbox fingerprint, setup, observed protocol and audit evidence, oracle, duration, and result. It MUST verify workspace containment, configured output cap, timeout, policy, idempotency, cancellation, and audit emission. Missing required sandbox capabilities SHALL block overall PASS.

#### Scenario: Workspace escape is denied
- **WHEN** a protocol tool attempts to access a path outside its configured workspace
- **THEN** the Gateway denies execution and records a structured, redacted audit result

#### Scenario: Duplicate idempotency key does not repeat side effect
- **WHEN** the same tenant and idempotency key are submitted for a side-effecting sandbox operation
- **THEN** the Gateway returns the recorded result without executing the side effect again

### Requirement: Idempotent Trace Event Ingestion
The Java Enterprise Gateway SHALL deduplicate Runtime trace/audit ingestion by committed durable event identity so the Runtime outbox can retry delivery at least once.

#### Scenario: Duplicate outbox delivery is idempotent
- **WHEN** the Runtime delivers the same committed event identity more than once
- **THEN** the Gateway records one logical trace event and acknowledges subsequent deliveries
