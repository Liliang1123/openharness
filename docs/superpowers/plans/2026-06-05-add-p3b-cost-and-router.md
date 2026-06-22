# add-p3b-cost-and-router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement configuration-driven model routing and response cost propagation for `add-p3b-cost-and-router`.

**Architecture:** Java Backend owns provider routing, provider pricing, and `costUsdMicros` calculation. TS Agent Runtime treats cost as provider usage metadata and forwards the final model response usage to `AgentChatResponse` without provider-specific logic.

**Tech Stack:** Java 21, Spring Boot `@ConfigurationProperties`, Maven/JUnit, TypeScript, Fastify, Vitest, pnpm workspace, OpenSpec.

---

### Task 1: Java Model Router

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java`
- Modify: `backend/src/main/java/org/openharness/backend/service/provider/ProviderRegistry.java`
- Create: `backend/src/main/java/org/openharness/backend/service/provider/ModelRouter.java`
- Test: `backend/src/test/java/org/openharness/backend/service/provider/ModelRouterTest.java`

- [ ] **Step 1: Write failing router tests**

Create `ModelRouterTest` with three cases:

```java
@Test
void explicitMappingResolvesMappedProvider() {
  ProviderRegistry registry = registryWith("zhipu", "anthropic");
  ModelRouter router = new ModelRouter(registry, properties("zhipu", Map.of("claude-sonnet-4-20250514", "anthropic")));

  ResolvedProvider resolved = router.resolve("claude-sonnet-4-20250514");

  assertThat(resolved.config().name()).isEqualTo("anthropic");
}

@Test
void unmappedModelFallsBackToDefaultProvider() {
  ProviderRegistry registry = registryWith("zhipu", "anthropic");
  ModelRouter router = new ModelRouter(registry, properties("zhipu", Map.of()));

  ResolvedProvider resolved = router.resolve("unknown-model");

  assertThat(resolved.config().name()).isEqualTo("zhipu");
}

@Test
void defaultModelUsesConfiguredDefaultProvider() {
  ProviderRegistry registry = registryWith("zhipu", "anthropic");
  ModelRouter router = new ModelRouter(registry, properties("anthropic", Map.of("default", "zhipu")));

  ResolvedProvider resolved = router.resolve("default");

  assertThat(resolved.config().name()).isEqualTo("zhipu");
}
```

Run: `mvn -q -Dtest=ModelRouterTest test`

Expected: FAIL because `ModelRouter` does not exist.

- [ ] **Step 2: Implement router configuration and service**

Add `openharness.model-router.default` and `openharness.model-router.routes` binding to `ProviderProperties`. Add `ProviderRegistry.configByName(name)` and `ProviderRegistry.adapterForConfig(config)`. Implement `ModelRouter.resolve(model)` returning a small `ResolvedProvider` record containing `ProviderAdapter` and `ProviderConfig`.

- [ ] **Step 3: Update ModelController routing**

Replace direct `providerRegistry.adapterFor(model)` / `configFor(model)` calls with `modelRouter.resolve(model)` in `/api/v1/model/chat` and `/api/v1/model/compress`. Preserve mock fixture and `model: "mock"` behavior.

- [ ] **Step 4: Verify router green**

Run: `mvn -q -Dtest=ModelRouterTest test`

Expected: PASS.

### Task 2: Java Cost Calculator

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java`
- Modify: `backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java`
- Create: `backend/src/main/java/org/openharness/backend/service/provider/CostCalculator.java`
- Modify: `backend/src/main/java/org/openharness/backend/api/ModelController.java`
- Test: `backend/src/test/java/org/openharness/backend/service/provider/CostCalculatorTest.java`

- [ ] **Step 1: Write failing cost tests**

Create `CostCalculatorTest`:

```java
@Test
void calculatesMicrosWithCeiling() {
  CostCalculator calculator = new CostCalculator(Map.of(
      "zhipu", Map.of("glm-4-flash", new Pricing(100L, 300L))));

  Long cost = calculator.calculate("zhipu", "glm-4-flash", 1200, 500);

  assertThat(cost).isEqualTo(1L);
}

@Test
void returnsNullWhenPricingMissing() {
  CostCalculator calculator = new CostCalculator(Map.of());

  Long cost = calculator.calculate("zhipu", "unknown", 1200, 500);

  assertThat(cost).isNull();
}
```

Run: `mvn -q -Dtest=CostCalculatorTest test`

Expected: FAIL because `CostCalculator` does not exist.

- [ ] **Step 2: Implement pricing model**

Add provider `pricing` config with `inputPerMToken` and `outputPerMToken` in USD micros / M tokens. Carry it through `ProviderConfig`. Implement `CostCalculator.calculate(providerName, modelName, promptTokens, completionTokens)` as `ceil((promptTokens * input + completionTokens * output) / 1_000_000)`.

- [ ] **Step 3: Populate response cost**

In `ModelController`, after adapter response returns, copy `ModelChatResponse.usage` and set `costUsdMicros` when usage exists and calculator returns a non-null value. Leave mock responses unchanged unless they already include usage.

- [ ] **Step 4: Verify cost green**

Run: `mvn -q -Dtest=CostCalculatorTest test`

Expected: PASS.

### Task 3: TS Usage Propagation

**Files:**
- Modify: `agent-runtime/src/types.ts`
- Modify: `agent-runtime/src/agentLoop.ts`
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
- Test: `agent-runtime/test/agentRuntime.test.ts`
- Test: `agent-runtime/test/nonStreamRunner.test.ts`

- [ ] **Step 1: Write failing TS response test**

Add a `FakeJavaClient` response whose final model response includes:

```ts
usage: {
  promptTokens: 100,
  completionTokens: 20,
  totalTokens: 120,
  costUsdMicros: 42
}
```

Assert:

```ts
expect(response.json().usage).toEqual({ costUsdMicros: 42 });
```

Run: `pnpm --filter @openharness/agent-runtime test -- agentRuntime.test.ts`

Expected: FAIL because `AgentChatResponse.usage` is not returned.

- [ ] **Step 2: Implement sync response usage**

Add `usage?: { costUsdMicros?: number }` to `AgentChatResponse`. Track the latest `resp.usage?.costUsdMicros` in `AgentLoop.run()` and include `usage` only when the cost is a number.

- [ ] **Step 3: Implement runner convergence**

Track latest usage in `AgentExecutionRunner` as well and include `usage` in the `final_answer` event payload. This keeps stream and non-stream paths converged around the same final model metadata.

- [ ] **Step 4: Verify TS green**

Run: `pnpm --filter @openharness/agent-runtime test -- agentRuntime.test.ts nonStreamRunner.test.ts`

Expected: PASS.

### Task 4: Full Verification And Checklist

**Files:**
- Modify: `openspec/changes/add-p3b-cost-and-router/tasks.md`

- [ ] **Step 1: Run Java verification**

Run: `mvn test`

Expected: `BUILD SUCCESS`.

- [ ] **Step 2: Run TS verification**

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm --filter @openharness/agent-runtime test`

Expected: all agent-runtime tests pass.

- [ ] **Step 3: Run OpenSpec verification**

Run: `npx openspec validate add-p3b-cost-and-router --strict --no-interactive`

Expected: `Change 'add-p3b-cost-and-router' is valid`.

- [ ] **Step 4: Update OpenSpec task checklist**

Mark completed tasks in `openspec/changes/add-p3b-cost-and-router/tasks.md` only after the matching tests pass. Do not archive until all tasks and verification items are complete.

### Self-Review

- Spec coverage: provider routing, default fallback, configured default, cost calculation, missing pricing, and TS usage propagation are covered.
- Placeholder scan: no implementation step relies on a later unspecified component.
- Type consistency: Java uses `ProviderConfig`, `ProviderAdapter`, `ModelChatResponse.usage.costUsdMicros`; TS uses `AgentChatResponse.usage.costUsdMicros`.
