## ADDED Requirements
### Requirement: Prompted Model Calls
The agent-runtime SHALL prepend a versioned system prompt from PromptRegistry to model-call messages before sending them to the Java model gateway. The prompt message MUST be transient model-call input and MUST NOT be appended to stable history.

#### Scenario: Runner sends prompted context
- **WHEN** an execution step calls the Java model gateway
- **THEN** the first message is the resolved system prompt
- **AND** subsequent messages are the ContextBuilder-selected conversation context

#### Scenario: Prompt does not pollute history
- **WHEN** the execution completes
- **THEN** stable history contains the user, assistant, and tool messages but not the system prompt
