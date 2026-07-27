## MODIFIED Requirements

### Requirement: Eval Case Schema
The shared schema package SHALL define a Zod schema for eval replay cases whose `expectedStopReason` accepts all Runtime terminal reasons, including `EXECUTION_TIMEOUT` and `EXECUTION_INTERRUPTED`, so recovery qualification can be expressed without bypassing schema validation.

#### Scenario: Parse interrupted recovery expectation
- **WHEN** an eval case uses `expectedStopReason: "EXECUTION_INTERRUPTED"`
- **THEN** schema parsing succeeds and preserves the stop reason

#### Scenario: Preserve execution timeout expectation
- **WHEN** an eval case uses `expectedStopReason: "EXECUTION_TIMEOUT"`
- **THEN** schema parsing continues to succeed

## ADDED Requirements

### Requirement: Durable And Transient SSE Wire Union
The shared schema package SHALL define a discriminated SSE wire-event union with mutually exclusive durable and transient variants. A durable `SessionEvent` MUST require `eventId`, `tenantId`, `userId`, `conversationId`, `executionId`, `traceId`, `requestId`, `createdAt`, kind, and data. A transient `PreviewDeltaEvent` MUST require kind `preview_delta`, connection-local positive `previewSeq`, execution/conversation identity, and preview data, and MUST reject durable `eventId`. Making `eventId` merely optional on one shared shape is forbidden.

#### Scenario: Parse durable event with owner scope
- **WHEN** a durable session event contains eventId and complete tenant/user/conversation ownership
- **THEN** the durable union branch parses successfully

#### Scenario: Reject durable event without userId
- **WHEN** a durable session event omits userId
- **THEN** schema parsing fails

#### Scenario: Parse transient preview
- **WHEN** a preview_delta contains previewSeq and no eventId
- **THEN** the transient union branch parses successfully

#### Scenario: Reject preview carrying durable cursor
- **WHEN** a preview_delta contains eventId
- **THEN** schema parsing fails

### Requirement: Shared Runtime Terminal Error Schema
The shared runtime terminal-error schema SHALL preserve all existing terminal classes and include `EXECUTION_INTERRUPTED` for restart reconciliation. Runtime, Frontend, session detail, SSE, trace, and eval schemas MUST use the same terminal vocabulary.

#### Scenario: Parse interrupted terminal event
- **WHEN** a durable stream error contains `EXECUTION_INTERRUPTED`
- **THEN** shared schema parsing succeeds and Frontend-visible types preserve that class
