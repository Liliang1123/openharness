# Change: Add P5a memory store and eval replay harness

## Why
OpenHarness now has stable execution lifecycle, context building, prompts, and protocol tools, but it lacks a scoped long-term memory primitive and an offline replay path for validating agent turns. Without these foundations, later memory retrieval and regression evaluation would couple directly to session history or ad hoc scripts.

## What Changes
- Add a TS Runtime owned long-term memory contract with tenant/user scoped facts, literal search, JSON persistence, and deletion.
- Add an offline eval replay harness that runs deterministic `EvalCase` inputs through the existing AgentExecutionRunner and reports pass/fail with terminal state and event evidence.
- Add shared-schema Zod contracts for memory facts and eval cases.
- Document memory/eval boundaries without changing online model context selection or frontend behavior.

## Impact
- Affected specs: `long-term-memory`, `eval-replay`, `shared-schema`
- Affected code: `packages/shared-schema`, `agent-runtime/src`, `agent-runtime/test`, `CONTEXT.md`, `docs/architecture`
- Non-goals: vector database retrieval, online memory injection into ContextBuilder, frontend UI, Java-owned memory writes, production eval service
