# Change: Add Runtime Chat Lifecycle Logs

## Why

The user-local operator wrapper can tail Backend, Runtime, and Frontend process
logs, but a successful chat currently leaves no conversation, request, or trace
identifier in those files. The six-command Local CLI smoke therefore reaches a
real model answer while `logs` still cannot locate the request. The TS Runtime
already owns all required execution identities and terminal state, so it needs
a narrow, redacted stdout lifecycle record that the existing wrapper can follow
without querying SQLite or changing CLI semantics.

## What Changes

- Emit one structured `accepted` record after a chat execution is durably
  admitted and one structured `terminal` record when it finishes.
- Cover both synchronous and streaming chat because both use the same detached
  execution runner.
- Allow only lifecycle event name, timestamp, conversation/request/trace/
  execution identifiers, terminal status, stop reason, and duration.
- Explicitly prohibit message text, model answer, system prompt, tool names or
  arguments, headers, tenant/user identity, service tokens, provider keys, and
  OAuth material.
- Keep lifecycle-log write failures non-blocking for the agent execution.
- Preserve the existing `openharness logs <target>` tail behavior; no new CLI
  query command, API, database read path, or log persistence authority is added.
- After separate implementation approval, re-run the six-command user-local
  smoke and require the successful chat identifiers to be present in Runtime
  logs.

## Impact

- Affected specs: `agent-runtime`
- Expected implementation scope:
  - a small allowlist-based Runtime chat lifecycle logger
  - `AgentExecutionRunner` lifecycle integration
  - `createServer` production wiring and injectable test seam
  - focused Runtime tests
  - wrapper guide and user-local isolated-source synchronization
- Existing APIs, shared schemas, RuntimeEventStore, trace outbox, message
  history, database schema, Java Backend, provider configuration, Frontend, and
  wrapper command syntax remain unchanged.
- No prompt/answer logging, credential access, production qualification,
  OpenSpec archive, full-repository regression, 24-hour Gate, commit, push, or
  Frontend development is included.
