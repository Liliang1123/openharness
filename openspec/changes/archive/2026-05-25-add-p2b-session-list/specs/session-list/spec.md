# Spec: session-list

## ADDED Requirements

### Requirement: Sessions list endpoint

The agent runtime SHALL expose `GET /api/v1/sessions` that returns the list of sessions belonging to the requesting tenant. Each session entry MUST include `conversationId`, `title`, and `updatedAt`. The response MUST be sorted by `updatedAt` descending.

#### Scenario: List sessions for a tenant

- Given the tenant `t1` has two persisted sessions
- When the client calls `GET /api/v1/sessions` with `X-Tenant-Id: t1`
- Then the response status is 200
- And the body contains 2 entries
- And each entry has `conversationId`, `title`, `updatedAt`
- And entries are sorted by `updatedAt` descending

#### Scenario: List for tenant with no sessions

- Given tenant `t-empty` has no sessions
- When the client calls `GET /api/v1/sessions`
- Then the response is `[]`

#### Scenario: Tenant isolation

- Given tenant `t1` has session `c1` and tenant `t2` has session `c2`
- When the client calls `GET /api/v1/sessions` with `X-Tenant-Id: t1`
- Then the response contains `c1` only

### Requirement: Get session messages endpoint

The agent runtime SHALL expose `GET /api/v1/sessions/:conversationId` that returns the message history of the specified session. The response MUST use the `toApi` view (internal fields stripped).

#### Scenario: Fetch existing session

- Given a session `c1` with 3 messages exists for tenant `t1`
- When the client calls `GET /api/v1/sessions/c1`
- Then the response contains the 3 messages without internal fields

#### Scenario: Fetch non-existent session

- Given no session `c-missing` exists
- When the client calls `GET /api/v1/sessions/c-missing`
- Then the response is `404`

### Requirement: Delete session endpoint

The agent runtime SHALL expose `DELETE /api/v1/sessions/:conversationId` that removes the session JSON file AND all associated chunk files. Deletion MUST be idempotent.

#### Scenario: Delete existing session

- Given a session `c1` with 2 chunk files exists
- When the client calls `DELETE /api/v1/sessions/c1`
- Then the response status is 204
- And the JSON file is removed
- And both chunk files are removed

#### Scenario: Delete non-existent session

- Given no session `c-gone` exists
- When the client calls `DELETE /api/v1/sessions/c-gone`
- Then the response status is 204

### Requirement: Session title derivation

The session title SHALL be derived from the first message with `role=user` in the session, taking the first 30 characters of its content. If no user message exists, the title MUST be `"New conversation"`.

#### Scenario: Title from first user message

- Given a session whose first user message content is `"你好这是一个测试消息超过三十个字符的内容会被截断"`
- When the title is computed
- Then it equals the first 30 characters of that content

#### Scenario: Empty session title

- Given a session with no user messages
- When the title is computed
- Then it equals `"New conversation"`

### Requirement: HistoryStore extension

The `HistoryStore` interface SHALL include `list(tenantId)` returning session metadata and `delete(tenantId, conversationId)` removing storage. Both `InMemoryHistoryStore` and `JsonFileHistoryStore` MUST implement them.

#### Scenario: InMemoryHistoryStore.list returns active conversations

- Given two messages have been appended to two different conversations under `t1`
- When `list("t1")` is called
- Then 2 entries are returned

#### Scenario: JsonFileHistoryStore.delete removes chunk files

- Given a conversation with one chunk file exists on disk
- When `delete(tenantId, conversationId)` is called
- Then the JSON file and the chunk file are both removed
