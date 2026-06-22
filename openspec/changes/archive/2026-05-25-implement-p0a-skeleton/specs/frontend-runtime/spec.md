## ADDED Requirements

### Requirement: Minimal Chat First Screen
The frontend SHALL render a chat interface as the first screen and SHALL NOT render a marketing landing page.

#### Scenario: App loads chat UI
- **WHEN** the frontend app loads
- **THEN** the user sees a message input, send control, assistant response area, and trace/debug panel

### Requirement: Frontend Calls Only TS Runtime
The frontend SHALL call only the TS Runtime `POST /api/v1/agent/chat` and SHALL NOT configure or call the Java backend URL.

#### Scenario: Sending message uses agent runtime
- **WHEN** the user submits a message
- **THEN** the frontend posts to the configured TS Runtime URL at `/api/v1/agent/chat`
- **AND** no Java backend URL is used by frontend code or environment config

### Requirement: Trace Debug Panel
The frontend SHALL generate or propagate `X-Trace-Id` on user submission and SHALL display trace/debug JSON from the agent chat response.

#### Scenario: Trace id visible after response
- **WHEN** the chat request completes
- **THEN** the trace/debug panel shows JSON including the trace id used for the request
