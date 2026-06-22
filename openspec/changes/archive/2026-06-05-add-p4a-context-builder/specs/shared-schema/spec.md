## ADDED Requirements
### Requirement: Model Chat Request Context Metadata
The shared schema SHALL define `ModelChatRequest.meta` as the cross-runtime metadata container for model calls, including optional cache hints, catalog identifiers, provider hints, and ContextBuilder metadata.

#### Scenario: Context metadata is accepted
- **WHEN** a model chat request includes `meta.context`
- **THEN** shared schema validation accepts builder name, selected message count, estimated tokens, budget tokens, layer names, and truncation status

#### Scenario: Requests without context metadata remain valid
- **WHEN** a model chat request omits `meta.context`
- **THEN** shared schema validation still accepts the request
