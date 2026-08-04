# Design: Runtime Chat Lifecycle Logs

## Context

The user-local wrapper redirects the TS Runtime and local gateway stdout/stderr
to `runtime.log`, and `openharness logs runtime` follows that file. The Runtime
returns `conversationId`, `requestId`, and `traceId` to the caller and its
detached `AgentExecutionRunner` owns `executionId` plus the final
`ExecutionState`, but the Fastify server has logging disabled and neither chat
path emits an operator-safe lifecycle line.

The approved design puts observability at the shared execution lifecycle rather
than in the HTTP gateway or wrapper. This covers synchronous and streaming chat
without duplicating endpoint logic and keeps storage/API contracts unchanged.

## Goals

1. Make every admitted chat execution locatable in the existing Runtime log by
   conversation, request, trace, or execution identifier.
2. Emit a terminal record for successful and unsuccessful execution outcomes.
3. Use a strict field allowlist so prompts, answers, tool data, identities, and
   credentials cannot enter the record accidentally.
4. Keep logging operationally non-blocking and preserve detached execution
   semantics.

## Non-Goals

- Logging user messages, assistant answers, system prompts, reasoning content,
  tool names, tool arguments, tool results, HTTP headers, tenant/user identity,
  Authorization, service tokens, API keys, or OAuth data.
- A general application logging framework or enabling Fastify request logging.
- A new CLI command, CLI argument, API endpoint, shared schema, trace event, or
  SQLite table.
- Making stdout logs a replay, audit, trace-ingestion, or persistence authority.
- Adding retention, rotation, remote export, search indexing, or Frontend log
  views.
- Changing Java Backend, provider routing, Runtime event durability, or chat
  response semantics.

## Structured Record Contract

Each record is one JSON object on one stdout line.

The `accepted` record contains only:

- `schemaVersion`: fixed integer `1`
- `event`: fixed string `runtime_chat_accepted`
- `timestamp`: ISO-8601 UTC timestamp
- `conversationId`
- `requestId`
- `traceId`
- `executionId`

The `terminal` record contains the same fields plus:

- `status`: the terminal execution status
- `stopReason`: the terminal end reason when available
- `durationMs`: non-negative integer measured from lifecycle acceptance

The serializer MUST construct a fresh object from these named values. It MUST
NOT spread request bodies, execution input, event attributes, state objects,
errors, headers, or arbitrary metadata. JSON serialization/write failure MUST
be caught and MUST NOT alter execution state or HTTP/SSE results.

## Runtime Wiring

1. `createServer` supplies the production stdout lifecycle logger to the shared
   `AgentExecutionRunner`; tests can inject a collecting or disabled sink.
2. `AgentExecutionRunner.start` creates the execution identity and performs the
   existing admission.
3. After admission succeeds, the runner emits exactly one `accepted` record.
4. When the detached execution reaches a terminal state, the runner emits
   exactly one `terminal` record with status, stop reason, and duration.
5. Admission failure MAY emit only a terminal error record because no accepted
   execution became operator-visible.
6. Both `/api/v1/agent/chat` and `/api/v1/agent/chat/stream` retain their current
   adapters and automatically receive the behavior through the shared runner.

Lifecycle logs do not replace durable Runtime events or Java trace ingestion.
They are a process-level diagnostic projection only.

## Alternatives Considered

### Local gateway access logging

Rejected because the gateway can see HTTP identities but not authoritative
execution admission, detached completion, or stop reason.

### CLI queries SQLite or a Runtime API

Rejected because it changes the existing follow-only `logs` contract, couples
the wrapper to storage/authentication, and creates a second operational read
path.

### Enable general Fastify logging

Rejected because generic request logging may capture unrelated headers or body
metadata and still would not express detached execution terminal state.

## Compatibility And Rollback

- Chat APIs, SSE frames, trace ingestion, persistent data, and wrapper syntax
  are unchanged.
- Additional stdout lines are additive operator-visible behavior.
- Rollback removes the lifecycle logger wiring and restores the backed-up
  user-local isolated-source files; no data migration is required.
- The user-local stack MUST be stopped before synchronization or rollback and
  MUST be returned to a stopped state after smoke verification.

## Verification

- RED/GREEN unit tests for the exact accepted and terminal JSON shapes.
- Negative assertions for message, answer, prompts, tools, headers,
  tenant/user identity, Authorization, token/key/OAuth-like canaries, and
  arbitrary error text.
- Runner tests proving one accepted and one terminal record for normal sync and
  stream-shared execution, plus terminal failure coverage.
- A sink-failure test proving chat execution and terminal state are unchanged.
- Focused Runtime tests, typecheck, strict OpenSpec validation, dashboard check,
  wrapper shell syntax, and diff validation.
- After explicit implementation approval, a real user-local
  `doctor → up → status → chat → logs → down` smoke. `logs` passes only when
  the successful chat's conversation/request/trace identifiers are found in
  `runtime.log`, and final shutdown closes ports `8080`, `3001`, `3101`, and
  `5173`.

## Risks

- Identifier values are operator-visible metadata. The implementation mitigates
  accidental expansion with a fresh-object allowlist and explicit canary tests.
- A stdout sink can fail or be closed. Logging is best-effort and must not
  become an execution dependency.
- Duplicate lifecycle lines would reduce diagnostic value. Tests require
  exactly-once accepted and terminal emission per runner handle within one
  process; cross-process log deduplication is outside scope.
