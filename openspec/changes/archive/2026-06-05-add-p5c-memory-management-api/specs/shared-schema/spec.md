## ADDED Requirements
### Requirement: Memory Management API Schemas
The shared schema package SHALL define Zod schemas and TypeScript types for Memory Management API list/search/upsert/delete request and response payloads.

#### Scenario: Parse memory list response
- **GIVEN** a response containing scoped memory facts
- **WHEN** the response is parsed by the shared schema
- **THEN** parsing succeeds and preserves the returned `MemoryFact` objects

#### Scenario: Parse memory search query
- **GIVEN** a search request containing a literal query and optional tags
- **WHEN** the request is parsed by the shared schema
- **THEN** parsing succeeds and preserves the query and tag filters

#### Scenario: Parse memory upsert request
- **GIVEN** an upsert request containing optional `memoryId`, content, optional tags, and optional `agentId`
- **WHEN** the request is parsed by the shared schema
- **THEN** parsing succeeds without requiring tenant/user scope in the body

#### Scenario: Reject client-controlled memory scope
- **GIVEN** an upsert request body includes `tenantId`, `userId`, `createdAt`, or `updatedAt`
- **WHEN** the request is parsed by the shared schema
- **THEN** parsing fails because scope and audit timestamps are controlled by the runtime

#### Scenario: Parse memory delete response
- **GIVEN** a delete response contains `memoryId` and `deleted`
- **WHEN** the response is parsed by the shared schema
- **THEN** parsing succeeds and preserves whether the scoped fact was deleted
