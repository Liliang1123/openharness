# Change: Add Tool Protocol

## Why
OpenHarness tool catalog currently exposes business tools only. Agent applications still need common harness-level file and command tools with stable schemas, output caps, and explicit permission metadata.

## What Changes
- Add a tool protocol classification to shared `ToolDefinition`.
- Add Java catalog entries for `read_file`, `search`, and `run_command`.
- Execute protocol tools with bounded output and workspace path containment.
- Document reserved `edit_file` protocol shape as a future write-capable tool, but do not enable writes in this change.

## Impact
- Affected specs: `tool-protocol`, `backend-gateway`, `shared-schema`
- Affected code: shared schema, Java contracts, catalog, tool execution service, backend tests
- Affected docs: `CONTEXT.md`, `docs/architecture/tool_catalog_contract.md`
