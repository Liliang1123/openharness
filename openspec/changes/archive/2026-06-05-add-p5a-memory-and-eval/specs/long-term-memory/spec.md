## ADDED Requirements

### Requirement: Scoped Memory Facts
The Agent Runtime SHALL provide a long-term memory store for facts scoped by `tenantId` and `userId`.

#### Scenario: Memory facts are isolated by tenant and user
- **GIVEN** memory facts exist for multiple tenants and users
- **WHEN** the runtime lists memory for one `(tenantId, userId)` scope
- **THEN** only facts from that exact scope are returned

### Requirement: Memory Fact Lifecycle
The memory store SHALL support upsert, list, literal search, and delete operations for memory facts.

#### Scenario: Upsert and search facts
- **GIVEN** a memory fact with content and tags is upserted
- **WHEN** the runtime searches the same scope using a case-insensitive literal query that matches content or tags
- **THEN** the matching fact is returned with stable metadata

#### Scenario: Delete facts
- **GIVEN** a memory fact exists in a scope
- **WHEN** the runtime deletes the fact by `memoryId`
- **THEN** subsequent list and search calls for that scope do not return the fact

### Requirement: JSON Memory Persistence
The Agent Runtime SHALL provide a JSON-file memory store for local durable memory facts.

#### Scenario: Reload persisted facts
- **GIVEN** a memory fact is saved by a JSON memory store
- **WHEN** a new JSON memory store instance is created over the same data directory
- **THEN** the memory fact is available from the new instance

### Requirement: No Online Context Injection
P5a memory storage SHALL NOT inject memory facts into online model context.

#### Scenario: Existing context builder behavior remains unchanged
- **WHEN** an agent turn is executed without explicit future memory retrieval support
- **THEN** model context layers remain limited to the existing configured layers
