## ADDED Requirements
### Requirement: Protocol Tool Execution
The Java backend SHALL execute safe protocol tools through the existing `POST /api/v1/tools/execute` endpoint.

#### Scenario: Protocol tool uses existing execute endpoint
- **WHEN** a caller executes `read_file`, `search`, or `run_command` with current catalog version and hash
- **THEN** the response uses the standard `ToolCallResponse` shape
