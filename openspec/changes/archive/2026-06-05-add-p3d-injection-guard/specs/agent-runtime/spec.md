## ADDED Requirements

### Requirement: Tool Result Provenance Persistence
The agent-runtime SHALL classify every tool result as `trusted` or `untrusted` before appending it to `HistoryStore`. Java catalog tool responses without explicit provenance SHALL default to `trusted`; MCP tool responses without explicit provenance SHALL default to `untrusted`. The runtime SHALL persist the classification in internal `AgentMessage.toolResultProvenance` metadata.

#### Scenario: Java catalog tool defaults trusted
- **WHEN** a Java catalog tool returns `status: "ok"` without `provenance`
- **THEN** the runtime appends a tool message with `toolResultProvenance: "trusted"`

#### Scenario: MCP tool defaults untrusted
- **WHEN** an MCP tool returns `status: "ok"` without explicit provenance
- **THEN** the runtime appends a tool message with `toolResultProvenance: "untrusted"`

### Requirement: Untrusted Tool Output Boundary
The agent-runtime SHALL wrap model-visible content for untrusted tool results in a stable boundary that marks the content as data, not instructions. The runtime SHALL NOT expose internal provenance fields as separate model message fields.

#### Scenario: Untrusted output is wrapped for model input
- **WHEN** a tool result with `toolResultProvenance: "untrusted"` is appended to history
- **THEN** the model-visible tool message content starts with `<tool_output trust="untrusted"` and ends with `</tool_output>`
- **AND** `toModelMessages()` does not include `toolResultProvenance` as a message field

#### Scenario: Trusted output keeps existing content shape
- **WHEN** a trusted tool result is appended to history
- **THEN** the model-visible content remains the serialized tool result without the untrusted boundary wrapper

### Requirement: Untrusted Context Policy Forwarding
Before calling Java policy evaluation, the agent-runtime SHALL detect whether any untrusted tool output exists after the latest user message and SHALL include that state in `ReviewPolicyEvaluateRequest.context.untrustedToolOutputSinceLastUser`. The runtime SHALL also include frozen tool permission metadata in `context.toolPermissions`.

#### Scenario: Runtime forwards untrusted context
- **GIVEN** the latest history after the last user message contains an untrusted tool result
- **WHEN** the model asks to call `submit_payment`
- **THEN** the runtime calls policy evaluate with `context.untrustedToolOutputSinceLastUser: true`
- **AND** `context.toolPermissions.submit_payment: "sensitive"`

#### Scenario: Runtime forwards trusted context as false
- **GIVEN** the latest history after the last user message contains only trusted tool results
- **WHEN** the model asks to call `echo`
- **THEN** the runtime calls policy evaluate with `context.untrustedToolOutputSinceLastUser: false`
