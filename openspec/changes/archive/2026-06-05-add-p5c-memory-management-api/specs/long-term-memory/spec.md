## ADDED Requirements
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
