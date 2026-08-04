# OpenHarness Local CLI Wrapper Guide

## Current Status

OpenHarness currently ships a working local Runtime stack and internal evaluation/gate command-line entry points, but it does **not** yet publish an official installable `openharness` product CLI package.

For CLI-heavy local trial, use a user-local operator wrapper named `openharness`. The wrapper is an installation convenience around the merged repository services; it is not a stable public product contract.

## Recommended Installation Layout

- Source clone: `~/.local/share/openharness/source`
- Executable: `~/.local/bin/openharness`
- PID/state: `~/.local/state/openharness`
- Logs: `~/.local/state/openharness/logs`
- Configuration remains in the isolated source clone and MUST NOT be printed by the wrapper.

The source clone should be created locally from the merged `main` at [OpenHarness repository](file:///Users/elvis/file/develop/opensource/openharness), so installation does not mutate or clean the user's dirty primary checkout.

## Wrapper Commands

```text
openharness doctor
openharness up
openharness status
openharness logs [backend|runtime|frontend|all]
openharness chat "your message" [conversation-id]
openharness down
```

- `doctor`: verify Git, Node.js, pnpm, Java, Maven, `curl`, free ports, dependencies, and required local configuration.
- `up`: start the existing full local stack in the background, write a supervisor PID, and wait for service readiness.
- `status`: report supervisor/process state and service health without exposing secrets.
- `logs`: follow one or all service logs.
- `chat`: call the existing Runtime basic-chat endpoint with generated request/trace IDs and safe local defaults.
- `down`: terminate the recorded supervisor process gracefully, wait for children, and remove only wrapper-owned PID files.

## Runtime Chat Lifecycle Logs

Every admitted synchronous or streaming chat writes an accepted JSON-lines
record to Runtime stdout and writes a terminal record when the execution reaches
a terminal state. The wrapper exposes both through `openharness logs runtime`:

```text
runtime_chat_accepted:
  schemaVersion, event, timestamp, conversationId, requestId, traceId, executionId

runtime_chat_terminal:
  accepted fields + status, optional stopReason, durationMs
```

Use the `conversationId`, `requestId`, `traceId`, or `executionId` returned for
the chat to locate its accepted and terminal lines while following the Runtime
log. The `logs` command remains a live tail; it does not add a query API or read
Runtime storage.

These records contain no message or answer text, prompts, reasoning, tool names,
tool arguments or results, HTTP headers, tenant/user identity, credentials,
OAuth material, or arbitrary error text. They are best-effort process
diagnostics, not a persistence, replay, trace-ingestion, or audit authority.

To roll back synchronized lifecycle-log code, stop the wrapper first, restore
the backed-up Runtime source files, remove the newly added lifecycle logger file
if the backup manifest records it as previously absent, run `openharness doctor`,
and leave the stack stopped until the restored source passes its normal checks.

## Codex Reasoning Effort

The isolated source configuration may route one model to the local Codex
app-server and select a provider-scoped reasoning effort without putting that
setting into Runtime or Frontend requests:

```yaml
openharness:
  model-router:
    routes:
      openai-codex/gpt-5.6-sol: openai-codex
  providers:
    - name: openai-codex
      type: codex-app-server
      command: codex
      app-server-args: ["app-server"]
      endpoint: stdio://
      models: ["gpt-5.6-sol"]
      reasoning-effort: high
```

When `reasoning-effort` is missing or blank, Codex turns use `medium` for
compatibility. An explicit value must match `[a-z][a-z0-9_-]{0,31}`.
Syntactically unsafe values and nonblank use on a non-Codex provider fail
backend startup before Codex launches. A syntactically safe value that the
selected app-server/model does not support returns the existing structured,
redacted provider-unavailable error; the router does not fall back to another
provider or mock.

The Codex CLI remains the sole owner of OAuth login, refresh, and credential
storage. Neither this provider configuration nor the wrapper reads or prints
Codex credentials, and `reasoning-effort` is sent only as the JSON-RPC
`turn/start.effort` value, never as a process argument.

Before changing the isolated source configuration, create a timestamped backup
under `~/.local/state/openharness/backups`. To roll back, stop the wrapper,
restore the backed-up isolated-source configuration, omit
`reasoning-effort` to return to `medium`, then run `openharness doctor` before
starting the stack again.

## Browser Chat Activity

Open the local browser UI at `http://localhost:5173`. Do not use
`http://127.0.0.1:5173`: the local Frontend may load there, but that origin is
not in the configured Runtime CORS allowlist and chat requests can fail with
`Failed to fetch`.

The chat pane keeps one execution activity group for the current turn:

- while a model call is active, the group is expanded and shows
  `🤔 思考中...`;
- `model_call_end` clears thinking immediately;
- terminal success, abort, or error auto-collapses the group;
- the collapsed row groups repeated terminal tools, for example
  `read_file ×5`;
- selecting the row expands every safe chronological model/tool state;
- a failure remains visible as safe Runtime/upstream identifiers such as
  `MODEL_ERROR · PROTOCOL_FAILURE`, without raw error text or provider bodies.

This lifecycle fix does not reduce provider inference time. With
`gpt-5.6-sol` and `reasoning-effort: high`, one model call can still take tens
of seconds; use the Runtime accepted/terminal log pair to distinguish provider
duration from a stuck UI.

The current tool catalog exposes read-oriented capabilities but no approved
workspace write/edit capability. A request such as “create a Python factorial
skill” therefore cannot create a skill file in this trial. The turn must still
finish with a final answer or an explicit safe terminal error, and all observed
tool states must remain inspectable.

For this activity/tool-flow update, user-local synchronization and rollback are
scoped to exactly eight production files under the isolated source:

```text
frontend/src/App.tsx
frontend/src/App.css
frontend/src/api.ts
frontend/src/ApprovalCard.tsx
frontend/src/executionActivity.ts
frontend/src/ExecutionActivityGroup.tsx
agent-runtime/src/agentExecutionRunner.ts
agent-runtime/src/server.ts
```

Stop the wrapper before synchronization. The backup manifest records hashes for
the six existing files and records the two new Frontend files as `absent`.
Rollback restores only the six hashed files, removes only the two files that
the manifest proves were absent, verifies the restored hashes, runs
`openharness doctor`, and leaves services stopped.

## Safety Contract

- Never run `git reset`, `git clean`, or delete files in [the primary checkout](file:///Users/elvis/file/develop/opensource/openharness).
- Never embed or print OAuth tokens, API keys, service tokens, or `.env` values.
- Never kill processes by broad name matching; stop only the wrapper-owned PID tree.
- Refuse `up` if a live wrapper PID exists or required ports belong to another process.
- Keep `chat` headers and endpoint aligned with the repository's current README and Runtime API.
- Run `doctor` after every source update.

## Future Product Work

An official distributable CLI, stable command contract, package publishing, upgrade channel, shell completion, richer terminal UX, and credential management require a separate OpenSpec change. This local wrapper intentionally does not pre-decide those product semantics.
