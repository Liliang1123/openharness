## ADDED Requirements

### Requirement: Memory Context Retrieval
The Agent Runtime SHALL optionally retrieve scoped memory facts for an agent turn and pass them into the ContextBuilder.

#### Scenario: Retrieve facts for current user message
- **GIVEN** a MemoryStore is configured for the runner
- **WHEN** an agent turn starts for a tenant/user/conversation and current user message
- **THEN** the runner searches memory using the same `tenantId`, `userId`, and current user message
- **AND** only matching facts from that scope are eligible for model context

#### Scenario: No configured memory store
- **GIVEN** no MemoryStore is configured for the runner
- **WHEN** an agent turn calls the model
- **THEN** memory retrieval is skipped
- **AND** existing context layers remain unchanged

### Requirement: Memory Retrieval Boundaries
Memory context retrieval SHALL be deterministic literal retrieval and SHALL NOT write memory facts.

#### Scenario: Retrieval does not mutate memory
- **WHEN** a memory-backed agent turn is executed
- **THEN** the runtime may read matching facts
- **AND** it does not create, update, or delete memory facts as part of retrieval

## MODIFIED Requirements

### Requirement: No Online Context Injection
The Agent Runtime SHALL NOT inject memory facts into online model context unless an explicit MemoryStore-backed retrieval layer is configured.

#### Scenario: Existing context builder behavior remains unchanged
- **WHEN** an agent turn is executed without configured memory retrieval support
- **THEN** model context layers remain limited to the existing configured non-memory layers

#### Scenario: Configured memory retrieval may inject facts
- **GIVEN** a MemoryStore is configured for the runner
- **WHEN** matching scoped facts are retrieved for the current turn
- **THEN** the ContextBuilder may include those facts in the `memory_retrieval` layer
