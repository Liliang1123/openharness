# provider-adapter Specification Deltas

## ADDED Requirements

### Requirement: Provider adapters SHALL declare message structural capabilities

All provider adapters MUST implement or expose a capability metadata configuration `ProviderMessageCapabilities`:
1. `supportsSyntheticAssistantInjection`: boolean (can inject consecutive assistant messages or system-tagged assistant role messages).
2. `requiresLastUserMessage`: boolean (requires the final message in history to be user role).
3. `requiresToolResultAdjacency`: boolean (requires tool results to immediately follow tool calls).
4. `supportsParallelToolResults`: boolean (can handle multiple tool outputs simultaneously).

#### Scenario: Capabilities dictate fallback to user-tagged envelope injection

- Given a provider adapter that declares `supportsSyntheticAssistantInjection: false`
- When `AgentLoop` flushes a pending injection
- Then the injection does NOT use an assistant role message
- And instead wraps the skill instructions in a single user message prefixed with custom system envelopes
