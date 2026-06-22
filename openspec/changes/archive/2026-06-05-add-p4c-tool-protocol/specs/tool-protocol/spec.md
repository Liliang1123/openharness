## ADDED Requirements
### Requirement: Protocol Tool Catalog Metadata
The backend SHALL expose harness protocol tools as catalog tools with `protocol` metadata.

#### Scenario: Protocol metadata appears in catalog
- **WHEN** a caller fetches `GET /api/v1/tools/catalog`
- **THEN** protocol tools include `protocol: "read_file"`, `"search"`, or `"run_command"`

### Requirement: Read File Protocol Tool
The backend SHALL execute `read_file` only for paths contained in the configured tool workspace and SHALL cap returned content.

#### Scenario: Read contained file
- **WHEN** `read_file` is called with a workspace-relative path
- **THEN** the response contains file content and `truncated` status

#### Scenario: Reject path escape
- **WHEN** `read_file` is called with a path escaping the workspace
- **THEN** the backend rejects the call with `TOOL_USER_ERROR`

### Requirement: Search Protocol Tool
The backend SHALL execute `search` over workspace files and return bounded matches.

#### Scenario: Search returns matches
- **WHEN** `search` is called with a query present in a workspace file
- **THEN** the response contains matching file paths and line numbers

### Requirement: Run Command Protocol Tool
The backend SHALL execute `run_command` without shell evaluation, using an allow-list and bounded output.

#### Scenario: Allowed command runs
- **WHEN** `run_command` is called with an allowed command such as `echo`
- **THEN** the response contains `exitCode`, `stdout`, and `stderr`

#### Scenario: Disallowed command rejected
- **WHEN** `run_command` is called with a command outside the allow-list
- **THEN** the backend rejects the call with `TOOL_USER_ERROR`
