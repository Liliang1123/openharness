# Agent Runtime Single-Node Production Design

## Status

Approved for OpenSpec proposal drafting on 2026-07-03. This document defines the product boundary and release criteria; it does not authorize implementation.

## Objective

Promote the existing Agent Runtime from a feature-complete MVP to a single-node production-ready runtime, then freeze its v1 contracts so platform work can proceed independently.

The target deployment is one trusted platform gateway calling one private TypeScript Agent Runtime, with one Java Enterprise Gateway providing model and tool execution. Distributed scheduling and high availability are explicitly deferred.

## Release Boundary

The runtime v1 release is complete only when all of the following are true:

1. OpenAI-compatible and Anthropic providers both pass real end-to-end qualification.
2. Java sandbox protocol tools and MCP external tools both pass real multi-step execution qualification.
3. SQLite transactionally persists conversations, stable messages, execution state, approvals, runtime events, and memory facts.
4. Process restart recovery preserves stable history and pending approvals, reconciles interrupted executions deterministically, and supports event replay without inventing execution progress.
5. A single node sustains 20 concurrent executions and 10,000 persisted conversations for a 24-hour soak without correctness failures, unbounded resource growth, or store corruption.
6. Runtime APIs are private-service APIs. A trusted gateway injects tenant, user, trace, and request identity; the Runtime does not implement temporary end-user login.

## Architecture

### Ownership

- TypeScript Agent Runtime owns the agent loop, execution lifecycle, durable runtime state, context, memory, approvals, event replay, and recovery.
- Java Enterprise Gateway owns provider credentials, model routing, provider adapters, sandboxed built-in tool execution, policy, permission, and audit ingestion.
- The future platform gateway owns user authentication, tenant membership, browser sessions, and identity injection.
- Frontend remains an interaction and observability client and never receives provider credentials.

### SQLite Storage

Introduce a transactional storage boundary rather than letting runtime components issue unrelated SQL. The initial schema contains:

- conversations and stable messages;
- executions and terminal/recovery state;
- approvals, including decision and timeout state;
- runtime events with per-conversation monotonic cursors;
- memory facts and scope indexes;
- schema migration metadata.

SQLite runs in WAL mode with foreign keys enabled, a configured busy timeout, bounded transactions, and an explicit migration runner. Store interfaces remain injectable so tests can use deterministic temporary databases and a future PostgreSQL implementation can preserve the same semantic contract.

JSON history remains import-only during a bounded migration window. New writes go only to SQLite after cutover; dual-write is rejected because it creates two authorities.

### Recovery Semantics

On startup the Runtime performs migration, integrity checks, and state reconciliation before accepting traffic.

- Completed, aborted, and errored executions remain terminal.
- `waiting_approval` and `running` executions found after process death are atomically terminated as `EXECUTION_INTERRUPTED`; pending approvals are invalidated because runner continuation is not durable in v1.
- Runtime events remain replayable from durable cursors within the configured retention policy.
- Stable history never contains transient approval sentinels, token deltas, or speculative assistant output.

### Real Provider Qualification

Both provider families must be tested through the Java Gateway using credentials supplied only at test/deployment time. Qualification covers:

- non-streaming and streaming responses;
- multi-step tool calls;
- structured tool arguments;
- reasoning/thinking block preservation where supported;
- token usage and cost attribution;
- retryable and terminal provider failures;
- cancellation and timeout propagation;
- secret redaction from logs, traces, events, and API responses.

Real-provider tests are opt-in outside the production qualification environment and must never silently fall back to mock responses.

### Real Tool Qualification

Java sandbox tools and MCP tools are both required:

- built-in read/search/command operations enforce workspace containment, output limits, timeout, and policy;
- MCP lifecycle covers startup, catalog merge, calls, failure isolation, approval requirements, and shutdown;
- tool calls participate in idempotency and execution cancellation where the underlying protocol supports it;
- untrusted results retain provenance and cannot bypass approval escalation.

### Capacity And Soak Gate

The release harness seeds 10,000 conversations, executes a representative mix with 20 concurrent executions, and runs for 24 hours. It records latency separately from provider latency and checks:

- zero cross-tenant data leakage;
- zero duplicate tool execution caused by Runtime retries;
- zero corrupt conversations or invalid event ordering;
- bounded database, listener, process, MCP, and cache resources;
- successful restart/recovery checkpoints during the run;
- actionable metrics and logs for every terminal failure.

The approved OpenSpec design fixes the numeric latency/resource thresholds and workload mix before implementation. Real provider/tool qualification is a separate evidence matrix; the 24-hour soak uses deterministic local fixtures and restarts only TS Runtime. Thresholds cannot be relaxed after observing a run.

### Review Resolution Addendum

- Production is one Runtime process/worker.
- Lifecycle transitions use one SQLite Unit of Work with `BEGIN IMMEDIATE`; streaming fragments are transient and only final state receives durable cursors.
- JSON import validates each record and quarantines corrupt input; post-cutover operation is forward-fix only.
- Approval tokens are memory-only secrets with durable HMAC digests and restart invalidation.
- Composite tenant/conversation cursor keys, service authentication, global log redaction, WAL checkpointing, bounded busy retry, and low-disk write prevention are release requirements.

## Error Handling

Storage failures fail closed and produce a structured terminal error without acknowledging a state transition that was not committed. Provider and tool failures retain the existing taxonomy and add explicit persistence, migration, recovery-interrupted, and capacity-gate classifications where needed. Secrets and raw sensitive payloads are excluded from durable runtime events.

## Testing Strategy

1. Unit and contract tests for migrations, stores, transaction boundaries, and adapter mappings.
2. Crash/restart integration tests at each execution lifecycle boundary.
3. Real-provider qualification suites for OpenAI-compatible and Anthropic.
4. Real-tool qualification for Java sandbox and MCP.
5. Security tests for identity isolation, path containment, approval bypass, secret leakage, and untrusted content.
6. A reproducible 20-concurrency, 10,000-conversation, 24-hour soak report.
7. Full workspace, Java, OpenSpec, and dashboard verification before release.

## Non-Goals

- Multi-node scheduling, leader election, or distributed locks.
- PostgreSQL production deployment.
- End-user login, browser session management, or tenant administration UI.
- Model configuration UI or user-managed provider credentials.
- Agent Definition CRUD/UI, SDK packaging, or frontend product redesign.
- Automatic replay of an interrupted external side effect without an idempotency proof.

## Delivery Strategy

Use staged delivery:

1. SQLite schema, migrations, stores, import path, and restart reconciliation.
2. Real provider and real tool qualification with security evidence.
3. Capacity harness, restart injection, 24-hour soak, documentation, and v1 contract freeze.

Each stage must have its own rollback and evidence gate. Implementation begins only after the OpenSpec change is approved and a detailed Superpowers plan is reviewed.
