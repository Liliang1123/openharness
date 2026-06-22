## ADDED Requirements

### Requirement: Persistent Message History
The agent-runtime SHALL persist conversation messages to JSON files at `data/sessions/{tenantId}/{conversationId}.json` so that history survives process restarts.

#### Scenario: History survives restart
- **WHEN** a conversation has 5 messages and the agent-runtime process restarts
- **THEN** the restarted process can retrieve all 5 messages for that conversation

#### Scenario: Append and save
- **WHEN** a message is appended and the agent loop completes
- **THEN** the session JSON file is written to disk with the updated messages

### Requirement: Three History Views
The agent-runtime SHALL provide three distinct views of message history:

- `toApi`: strips internal fields (for model calls)
- `toPersisted`: retains all fields including internal flags (for storage)
- `toReplay`: skips transient messages, retains compressedSummary (for session resume)

#### Scenario: toApi strips internal fields
- **WHEN** a message has `systemInjected: true`
- **THEN** `toApi` output does not include the `systemInjected` field

#### Scenario: toReplay skips transient
- **WHEN** a message has `transient: true`
- **THEN** `toReplay` output does not include that message

#### Scenario: toPersisted retains everything
- **WHEN** a message has internal flags
- **THEN** `toPersisted` output includes all fields unchanged

### Requirement: Configurable Store Backend
The agent-runtime SHALL support switching between `memory` and `file` history stores via the `HISTORY_STORE` environment variable.

#### Scenario: Default is file
- **WHEN** `HISTORY_STORE` is not set
- **THEN** the agent-runtime uses JSON file storage

#### Scenario: Memory mode for tests
- **WHEN** `HISTORY_STORE=memory`
- **THEN** the agent-runtime uses in-memory storage (no persistence)
