## MODIFIED Requirements

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
