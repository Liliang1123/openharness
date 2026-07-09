## MODIFIED Requirements

### Requirement: Configurable Store Backend
The Runtime MUST support a configurable `HistoryStore` backend. The single-node production profile SHALL use SQLite and MUST persist stable messages transactionally with `(tenantId,userId,conversationId)` ownership scope. The in-memory backend MAY remain available for tests. Existing JSON history SHALL be supported only through a deterministic, idempotent import path after SQLite cutover and MUST NOT remain a concurrent write authority.

#### Scenario: Production defaults to SQLite
- **WHEN** the Runtime starts in the single-node production profile
- **THEN** stable history reads and writes use the configured SQLite database

#### Scenario: JSON import is idempotent
- **WHEN** the same backed-up JSON history is imported more than once
- **THEN** the resulting SQLite conversations and stable messages are not duplicated

#### Scenario: Corrupt JSON is quarantined
- **WHEN** one legacy conversation fails schema validation during import
- **THEN** its path, hash, and validation error are written to the quarantine manifest while valid conversations continue importing

#### Scenario: Quarantine blocks automatic cutover
- **WHEN** import completes with one or more quarantined records
- **THEN** automatic cutover stops until a human explicitly accepts the data gap; the manifest contains no record content or secret and reruns do not duplicate entries

#### Scenario: No dual-write after cutover
- **WHEN** SQLite cutover has completed and a stable message is appended
- **THEN** the message is committed to SQLite and the Runtime does not also write it to the legacy JSON store

### Requirement: Persistent Message History
The Runtime SHALL persist stable conversation messages across process restarts. In the single-node production profile, persistence MUST use SQLite transactions and `(tenantId,userId,conversationId)` ownership constraints. Reads MUST return only the requested tenant, user, and conversation in chronological order. Runtime events, pending approvals, token deltas, and speculative assistant output MUST NOT be stored as stable message history. Legacy JSON records without user ownership MUST be quarantined unless an explicit migration mapping supplies the owner.

#### Scenario: History survives restart
- **WHEN** the Runtime commits stable messages, stops, and starts again with the same SQLite database
- **THEN** the same tenant, user, and conversation can read those messages in chronological order

#### Scenario: Tenant and user scope are enforced by storage access
- **WHEN** a caller requests a conversation using a different tenant or a different user in the same tenant
- **THEN** no messages or existence signal from the original owner are returned

### Requirement: Stable History Layering
The agent-runtime SHALL separate stable model-context messages, durable replay events, transient streaming previews, and execution lifecycle state. Transient preview deltas MUST NOT enter `HistoryStore` or durable `RuntimeEventStore`. Assistant messages containing unresolved tool calls SHALL remain execution-owned provisional context and MUST be excluded from future model context if reconciliation interrupts the execution.

#### Scenario: Preview delta is not durable
- **WHEN** a provider emits a streaming preview delta
- **THEN** it may appear only on the current main stream and is absent from stable history and session replay

#### Scenario: Interrupted tool call does not pollute next turn
- **WHEN** restart interrupts an execution after an assistant tool call but before its tool result
- **THEN** the provisional assistant message is excluded from later model context
