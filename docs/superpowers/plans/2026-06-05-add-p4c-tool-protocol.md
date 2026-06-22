# Tool Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded harness protocol tools for file reading, search, and simple command execution through the Java tool catalog.

**Architecture:** Shared schema extends `ToolDefinition` with optional `protocol`. Java catalog advertises protocol tools and `ToolExecutionService` executes them under workspace containment and output caps. TS Runtime continues to route catalog tools through Java unchanged.

**Tech Stack:** TypeScript/Zod/Vitest, Java 21/Spring Boot/JUnit, OpenSpec.

---

### Task 1: Shared Schema
- [ ] Add failing schema test for `ToolDefinition.protocol`.
- [ ] Implement optional protocol enum.
- [ ] Run `pnpm --filter @openharness/shared-schema test`.

### Task 2: Backend Protocol Tools
- [ ] Add failing backend tests for protocol catalog metadata and execute behavior.
- [ ] Implement catalog entries and `ToolExecutionService` protocol handlers.
- [ ] Run `mvn test`.

### Task 3: Docs and Archive
- [ ] Update `CONTEXT.md` and `docs/architecture/tool_catalog_contract.md`.
- [ ] Run `pnpm typecheck`, `pnpm test`, `mvn test`, `npx openspec validate --all --strict --no-interactive`.
- [ ] Archive with `npx openspec archive add-p4c-tool-protocol --yes`.
