## ADDED Requirements
### Requirement: Tool Definition Protocol Metadata
The shared schema SHALL allow `ToolDefinition.protocol` to identify reserved harness protocol tools.

#### Scenario: Protocol metadata parses
- **WHEN** zod parses a tool definition with `protocol: "read_file"`
- **THEN** parsing succeeds and preserves the protocol value
