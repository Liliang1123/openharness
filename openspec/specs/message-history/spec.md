# message-history Specification

## Purpose
TBD - created by archiving change add-p1b-persistence. Update Purpose after archive.
## Requirements
### Requirement: Persistent Message History
The agent-runtime SHALL persist conversation messages to JSON files at `data/sessions/{tenantId}/{conversationId}.json` so that history survives process restarts. `HistoryStore` SHALL only contain stable messages: `user` messages, completed `assistant` messages, and completed `tool` results. Runtime drafts (e.g. pending approvals, denied tool placeholders, streaming token deltas) MUST NOT be written to `HistoryStore`. On read, sentinel values like `"PENDING_APPROVAL"` or `"POLICY_DENY"` written by older versions MUST be filtered out so they do not pollute model context.

#### Scenario: History survives restart
- **WHEN** a conversation has 5 messages and the agent-runtime process restarts
- **THEN** the restarted process can retrieve all 5 messages for that conversation

#### Scenario: Append and save
- **WHEN** a message is appended and the agent loop completes
- **THEN** the session JSON file is written to disk with the updated messages

#### Scenario: Pending approval is not written to HistoryStore
- **WHEN** a tool call receives `REQUIRE_APPROVAL` from policy
- **THEN** no `tool` message with content `"PENDING_APPROVAL"` is appended to `HistoryStore`
- **AND** the pending approval is recorded in `ApprovalStore` and emitted as an SSE `approval_requested` event

#### Scenario: Denied tool is not written to HistoryStore as raw sentinel
- **WHEN** a tool call receives `DENY` from policy
- **THEN** the appended tool message contains a structured rejection result (`status: "rejected"`, `errorClass: "POLICY_DENY"`, `errorMessage`), not the raw string `"POLICY_DENY"`

#### Scenario: Legacy sentinel values are filtered on read
- **WHEN** a persisted JSON file contains a `tool` message with content `"PENDING_APPROVAL"` written by a prior agent-runtime version
- **THEN** the read view skips that message and does not include it in model input or replay

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

### Requirement: Stable History Layering
The agent-runtime SHALL maintain a clear separation between three runtime stores by purpose: `HistoryStore` (stable model-context messages), `RuntimeEventStore` (per-conversation event log used for SSE replay), and `ExecutionStateStore` plus `ApprovalStore` (execution lifecycle and approval state). Compression input MUST be limited to `HistoryStore`; runtime events and approval state MUST NOT enter the compression token estimate.

#### Scenario: Compression operates on stable messages only
- **WHEN** `compress` is invoked for a conversation that has both stable user/assistant/tool messages and active runtime events
- **THEN** `compress` reads only the `HistoryStore` view and is not affected by entries in `RuntimeEventStore` or `ApprovalStore`

#### Scenario: SSE events do not enter HistoryStore
- **WHEN** an SSE event such as `model_call_start` or a token delta is emitted
- **THEN** that event is appended to `RuntimeEventStore` and is NOT appended to `HistoryStore`

