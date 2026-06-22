## MODIFIED Requirements
### Requirement: Tool catalog merge
The agent runtime SHALL merge Java catalog tools with MCP tools when freezing the per-conversation tool list. When a tool name appears in both sources, the catalog tool MUST win and the MCP entry MUST be dropped with a warning. The merged list given to the model MUST NOT include any internal source-tag field, and when an Agent Definition is selected the model-visible list MAY be further filtered by that definition's `tools` allow-list without changing the frozen source map used for routing allowed tool calls.

#### Scenario: Catalog wins on name conflict

- Given the catalog defines a tool named `echo`
- And an MCP server also defines a tool named `echo`
- When the merged list is computed
- Then only the catalog `echo` is present
- And a warning is logged about the dropped MCP `echo`

#### Scenario: Distinct names coexist

- Given the catalog defines `get_current_time`
- And an MCP server defines `read_file`
- When the merged list is computed
- Then both tools are present

#### Scenario: Agent definition filters model-visible merged tools

- Given the frozen merged tool list contains catalog tool `get_current_time` and MCP tool `read_file`
- And the selected Agent Definition lists only `read_file`
- When the runtime prepares tools for a model call
- Then the model-visible tools contain `read_file`
- And the model-visible tools do not contain `get_current_time`
