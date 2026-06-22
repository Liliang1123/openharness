## MODIFIED Requirements
### Requirement: Tool Registry Catalog Freeze
The TS Runtime SHALL fetch Java tool catalog through `GET /api/v1/tools/catalog` and freeze the tools schema definition, `catalogVersion`, and `catalogHash` for each `(tenantId, conversationId)` session lifecycle to prevent caching disruption from tool catalog mutations. However, tool execution permissions and security revocations MUST remain dynamic and dynamically audited via the `beforeToolUse` gateway on each step.

#### Scenario: Same conversation reuses catalog schema
- **WHEN** the same tenant and conversation sends two chat turns
- **THEN** the TS Runtime presents the identical tools schema to the model to preserve cache matching
- **AND** still dynamically validates permission policies on tool execution in `beforeToolUse`
