# long-term-memory Specification

## Purpose
TBD - created by archiving change add-p5a-memory-and-eval. Update Purpose after archive.
## Requirements
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
The `MemoryStore` SHALL persist memory facts across process restarts. In the single-node production profile, the authoritative store MUST be SQLite with tenant/user scope indexes and transactional upsert/delete behavior. Existing JSON memory files MAY be imported through a deterministic, idempotent migration path but MUST NOT remain a concurrent write authority after cutover.

#### Scenario: Memory facts survive restart in SQLite
- **WHEN** a memory fact is committed and the Runtime restarts with the same SQLite database
- **THEN** a search using the same tenant and user scope returns the fact

#### Scenario: Imported memory is not duplicated
- **WHEN** the same JSON memory backup is imported more than once
- **THEN** the SQLite store contains one logical copy of each fact

#### Scenario: Corrupt memory input is quarantined
- **WHEN** a legacy memory record fails schema validation
- **THEN** its source hash and validation error are quarantined and valid records continue importing

#### Scenario: Memory quarantine blocks automatic cutover
- **WHEN** memory import leaves quarantined records
- **THEN** automatic cutover requires explicit human acceptance, the manifest contains no record content or secret, and reruns remain idempotent

#### Scenario: Memory scope remains isolated
- **WHEN** a different tenant or user searches for an imported or newly written fact
- **THEN** that fact is not returned outside its original scope

### Requirement: No Online Context Injection
The Agent Runtime SHALL NOT inject memory facts into online model context unless an explicit MemoryStore-backed retrieval layer is configured.

#### Scenario: Existing context builder behavior remains unchanged
- **WHEN** an agent turn is executed without configured memory retrieval support
- **THEN** model context layers remain limited to the existing configured non-memory layers

#### Scenario: Configured memory retrieval may inject facts
- **GIVEN** a MemoryStore is configured for the runner
- **WHEN** matching scoped facts are retrieved for the current turn
- **THEN** the ContextBuilder may include those facts in the `memory_retrieval` layer

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

### Requirement: Memory Management API
The Agent Runtime SHALL expose a Memory Management API for explicit operator/developer management of scoped memory facts.

#### Scenario: List scoped memory facts
- **GIVEN** memory facts exist for multiple tenants and users
- **WHEN** a caller lists memory facts through the API with `X-Tenant-Id` and `X-User-Id`
- **THEN** only facts from the exact header-derived `(tenantId, userId)` scope are returned

#### Scenario: Search scoped memory facts
- **GIVEN** memory facts exist in the caller's scope
- **WHEN** a caller searches memory facts through the API using a literal query and optional tag filters
- **THEN** the API returns only scoped facts matching the existing deterministic literal memory search semantics

### Requirement: Memory Management Upsert
The Agent Runtime SHALL allow the Memory Management API to upsert memory facts while deriving tenant and user scope from request headers.

#### Scenario: Create scoped memory fact
- **GIVEN** a caller provides memory content and optional tags
- **WHEN** the caller upserts a memory fact through the API
- **THEN** the stored fact uses the header-derived `tenantId` and `userId`
- **AND** the API returns the stamped `MemoryFact`

#### Scenario: Update scoped memory fact
- **GIVEN** a memory fact already exists in the caller's scope
- **WHEN** the caller upserts with that `memoryId` and new content or tags
- **THEN** the existing scoped fact is updated
- **AND** facts in other tenant/user scopes are not modified

### Requirement: Memory Management Delete
The Agent Runtime SHALL allow the Memory Management API to delete memory facts by `memoryId` within the header-derived scope.

#### Scenario: Delete existing scoped memory fact
- **GIVEN** a memory fact exists in the caller's scope
- **WHEN** the caller deletes that `memoryId` through the API
- **THEN** the fact is removed from that scope
- **AND** subsequent scoped list and search calls do not return it

#### Scenario: Delete missing scoped memory fact
- **GIVEN** no memory fact with the requested `memoryId` exists in the caller's scope
- **WHEN** the caller deletes that `memoryId` through the API
- **THEN** the API returns structured not-found evidence

### Requirement: Memory Management Boundaries
The Memory Management API SHALL NOT mutate MessageHistory, trigger agent execution, call Java Backend, perform automatic memory extraction, or perform vector/semantic retrieval.

#### Scenario: Manage memory without agent side effects
- **WHEN** a caller lists, searches, upserts, or deletes memory through the API
- **THEN** MessageHistory is unchanged
- **AND** no model call, tool call, Java Backend memory write, or agent execution is started

