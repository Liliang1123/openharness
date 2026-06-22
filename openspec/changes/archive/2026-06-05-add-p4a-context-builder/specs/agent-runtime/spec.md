## ADDED Requirements
### Requirement: ContextBuilder Model Calls
The agent-runtime SHALL call the Java model gateway for each Agent Loop step using model-call messages built by ContextBuilder, the frozen tool catalog, catalog metadata, and cache hints computed from the selected context.

#### Scenario: Model call uses selected context
- **WHEN** an execution step begins
- **THEN** the runtime builds model-call messages from stable history through ContextBuilder
- **AND** sends those selected messages to Java `/api/v1/model/chat`

#### Scenario: History remains the durable source
- **WHEN** ContextBuilder omits older messages from a model call due to budget
- **THEN** those omitted messages remain in `HistoryStore`
- **AND** are still eligible for future compression or replay according to their stable history rules
