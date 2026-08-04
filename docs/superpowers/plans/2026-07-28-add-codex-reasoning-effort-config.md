# Codex Provider Reasoning Effort Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-scoped Codex `reasoning-effort` setting that defaults to `medium`, forwards an explicit `high` to `turn/start`, and fails closed without reading OAuth credentials or introducing fallback.

**Architecture:** Spring binds and validates the optional field at the Java provider boundary, `ProviderConfig` carries the effective immutable value, the adapter forwards it once, and the app-server client serializes it only into JSON-RPC `turn/start.effort`. Existing overloads retain `medium`, and no TS Runtime, Frontend, OAuth, process-argument, or public CLI contract changes are allowed.

**Tech Stack:** Java 21, Spring Boot configuration properties, Jackson JSON-RPC, JUnit 5, AssertJ, Maven, Bash wrapper validation, OpenSpec.

---

## File Map And Boundaries

- Modify [ProviderProperties.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java): bind, default, and validate `reasoning-effort`.
- Modify [ProviderConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java): carry the effective immutable value while preserving existing constructors.
- Modify [CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java): forward the provider value through the managed-session boundary.
- Modify [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java): preserve default `medium` overloads and serialize the explicit value.
- Modify [ProviderPropertiesTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/ProviderPropertiesTest.java): configuration contract RED/GREEN tests.
- Modify [CodexAppServerAdapterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerAdapterTest.java): forwarding and structured non-fallback error tests.
- Modify [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java): protocol frame tests for explicit and default effort.
- Modify [OpenHarness Local CLI Wrapper Guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md): non-secret configuration, default, failure, and rollback instructions.
- Modify [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/tasks.md) and [development dashboard JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json); regenerate dashboard outputs.
- Create implementation review under [docs/review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review).
- User-local changes are limited to backed-up copies of the four production Java files, the one signature-coupled `CodexAppServerAdapterTest.java` that Maven compiles before `spring-boot:run`, an ignored `.env`, and `agent-runtime/agents/default-agent.json` under [isolated source](file:///Users/elvis/.local/share/openharness/source). Never inspect or copy Codex credential files.
- Do not modify [primary checkout](file:///Users/elvis/file/develop/opensource/openharness), TS Runtime schemas, Frontend, app-server argument allow-list, or OAuth storage. Do not run `git reset`, `git clean`, `git add`, `git commit`, `git push`, archive, full-repository regression, or a 24-hour Gate.

### Task 1: Record Approval, Plan, And Preflight

- [ ] **Step 1: Mark approval and plan creation**

In [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-codex-reasoning-effort-config/tasks.md), mark `1.1` and `1.2` complete only. Add this plan path to the proposed dashboard entry.

- [ ] **Step 2: Run plan placeholder and scope checks**

Run:

```bash
rg -n 'TBD|TODO|implement later|fill in|git (add|commit|push|reset|clean)|Frontend|ModelChatRequest|AgentChatRequest' docs/superpowers/plans/2026-07-28-add-codex-reasoning-effort-config.md
git diff --check
```

Expected: only intentional non-goal references; no placeholders, Git mutation steps, or whitespace errors.

- [ ] **Step 3: Create Plan Preflight review**

Create `docs/review/2026-07-28-codex-reasoning-effort-plan-preflight-review.md` with `结论：通过`, file-URL review scope, exact allowed files, TDD sequence, rollback, OAuth boundary, and explicit exclusions. If any requirement is uncovered, stop and update this plan before production code.

- [ ] **Step 4: Validate planning artifacts**

Run:

```bash
openspec validate add-codex-reasoning-effort-config --strict --no-interactive
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
```

Expected: all exit `0`; only the known non-blocking offline telemetry warning is allowed. Then mark `1.3` complete.

### Task 2: Configuration Contract TDD

- [ ] **Step 1: Add failing configuration tests**

Add focused tests to `ProviderPropertiesTest`:

```java
@Test
void codexReasoningEffortDefaultsToMediumWhenMissingOrBlank() {
  for (String value : java.util.Arrays.asList(null, "", " ")) {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    entry.setReasoningEffort(value);
    properties.setProviders(List.of(entry));
    configureRoute(properties, "gpt-5.4");
    properties.init();
    assertThat(registry.configByName("openai-codex").reasoningEffort()).isEqualTo("medium");
  }
}

@Test
void codexReasoningEffortAcceptsBoundedSafeIdentifier() {
  ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
  ProviderProperties properties = new ProviderProperties(registry);
  ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
  entry.setReasoningEffort("high");
  properties.setProviders(List.of(entry));
  configureRoute(properties, "gpt-5.4");
  properties.init();
  assertThat(registry.configByName("openai-codex").reasoningEffort()).isEqualTo("high");
}

@Test
void unsafeReasoningEffortIsRejectedBeforeRegistration() {
  ProviderProperties properties = new ProviderProperties(
      new ProviderRegistry(List.of(adapter("codex-app-server"))));
  ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
  entry.setReasoningEffort("../oauth");
  properties.setProviders(List.of(entry));
  configureRoute(properties, "gpt-5.4");
  assertThatThrownBy(properties::init)
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("reasoning-effort");
}

@Test
void nonCodexProviderRejectsReasoningEffort() {
  ProviderProperties properties = new ProviderProperties(
      new ProviderRegistry(List.of(adapter("openai-compatible"))));
  ProviderProperties.ProviderEntry entry = new ProviderProperties.ProviderEntry();
  entry.setName("zhipu");
  entry.setType("openai-compatible");
  entry.setReasoningEffort("high");
  properties.setProviders(List.of(entry));
  assertThatThrownBy(properties::init)
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("reasoning-effort")
      .hasMessageContaining("codex-app-server");
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ProviderPropertiesTest test
```

Expected: compilation fails because `setReasoningEffort` and `ProviderConfig.reasoningEffort()` do not exist. Record the failure as RED evidence.

- [ ] **Step 3: Implement the minimal configuration model**

Extend `ProviderConfig` with final record component `String reasoningEffort`. Preserve the six- and nine-argument constructors; the nine-argument constructor supplies `medium` only for `codex-app-server`, otherwise `null`.

Extend `ProviderEntry` with getter/setter. In `ProviderProperties.validate`, reject nonblank use on non-Codex providers, default missing/blank Codex values to `medium`, and require explicit values to match:

```java
private static final Pattern SAFE_REASONING_EFFORT =
    Pattern.compile("[a-z][a-z0-9_-]{0,31}");
```

Pass the effective value into the canonical `ProviderConfig` constructor. Do not map it into `command`, `appServerArgs`, endpoint, base URL, API key, or logs.

- [ ] **Step 4: Run GREEN**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest test
```

Expected: all selected tests pass. Mark tasks `2.1` through `2.3` only after GREEN.

### Task 3: Protocol And Adapter TDD

- [ ] **Step 1: Add failing client protocol test**

Add to `CodexAppServerClientTest`:

```java
@Test
void forwardsExplicitReasoningEffortOnTurnStart() throws Exception {
  try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
    CompletableFuture<Void> server = peer.run(() -> {
      peer.initializeHandshake();
      JsonNode thread = peer.readRequest("thread/start");
      peer.send("{\"id\":" + thread.path("id").asLong()
          + ",\"result\":{\"thread\":{\"id\":\"thread-1\"}}}");
      JsonNode turn = peer.readRequest("turn/start");
      assertThat(turn.at("/params/effort").asText()).isEqualTo("high");
      peer.send("{\"id\":" + turn.path("id").asLong()
          + ",\"result\":{\"turn\":{\"id\":\"turn-1\"}}}");
      peer.send(peer.completedFrame());
    });
    client.startTurn("gpt-5.6-sol", "hello", List.of(), "high");
    server.get(1, TimeUnit.SECONDS);
  }
}
```

Keep the existing assertion that the three-argument overload emits `medium`.

- [ ] **Step 2: Add failing adapter forwarding and rejection assertions**

Construct the adapter test `CONFIG` with canonical `reasoningEffort = "high"`, extend `FakeSession.startTurn` to accept/capture it, and assert:

```java
assertThat(session.reasoningEffort).isEqualTo("high");
```

Add a case whose fake session returns `new ErrorTurn("INVALID_REQUEST", "unsupported high OAUTH-CANARY")`; assert `PROVIDER_UNAVAILABLE`, `fallbackAllowed == false`, `retryOwner == "none"`, and no canary appears in the response.

- [ ] **Step 3: Run RED**

Run:

```bash
mvn -f backend/pom.xml -Dtest=CodexAppServerClientTest,CodexAppServerAdapterTest test
```

Expected: compilation fails because the explicit-effort client overload and managed-session signature do not exist. Record the failure as RED evidence.

- [ ] **Step 4: Implement minimal forwarding**

Keep compatibility overloads:

```java
public TurnResult startTurn(String model, String inputText) {
  return startTurn(model, inputText, List.of(), "medium");
}

public TurnResult startTurn(String model, String inputText, List<DynamicTool> dynamicTools) {
  return startTurn(model, inputText, dynamicTools, "medium");
}
```

Add the four-argument method, validate the effort as a bounded nonblank safe identifier, and replace the literal with:

```java
.put("effort", reasoningEffort);
```

Change `ManagedSession.startTurn` to accept `reasoningEffort`; pass `config.reasoningEffort()` from the adapter and then to the client. Preserve all current terminal error mapping and never retry another provider.

- [ ] **Step 5: Run GREEN**

Run:

```bash
mvn -f backend/pom.xml -Dtest=CodexAppServerClientTest,CodexAppServerAdapterTest,CodexProcessSupervisorTest,CodexOperatorCommandTest,ProviderPropertiesTest,ProviderRegistryTest,ModelRouterTest test
```

Expected: all selected tests pass. Mark tasks `3.1` through `3.4` only after GREEN.

### Task 4: Documentation And Focused Repository Verification

- [ ] **Step 1: Update the wrapper guide**

Document a non-secret Spring configuration example for route `openai-codex/gpt-5.6-sol`, `reasoning-effort: high`, default `medium`, safe-identifier/startup rejection, semantic app-server rejection, no fallback, and rollback by restoring the backed-up isolated-source configuration. State that Codex CLI owns OAuth and the wrapper never reads credentials.

- [ ] **Step 2: Run focused verification**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ProviderPropertiesTest,CodexAppServerClientTest,CodexAppServerAdapterTest,CodexProcessSupervisorTest,CodexOperatorCommandTest,ProviderRegistryTest,ModelRouterTest test
bash -n /Users/elvis/.local/bin/openharness
openspec validate add-codex-reasoning-effort-config --strict --no-interactive
git diff --check
```

Expected: all exit `0`; no secret material is printed.

### Task 5: Back Up, Sync, And Configure The User-Local Trial

- [ ] **Step 1: Confirm stopped state and resolve exact targets**

Run read-only status/port checks. If the wrapper is running, use only `openharness down`. Do not kill by process name.

- [ ] **Step 2: Create a timestamped backup**

Create a timestamped directory under [backups](file:///Users/elvis/.local/state/openharness/backups). Copy the four current isolated-source production Java files, `CodexAppServerAdapterTest.java`, existing `.env` if present, and existing agent definition if present. Write a manifest containing source and backup paths plus SHA-256 values; never include environment values or credentials.

- [ ] **Step 3: Sync only approved production files**

Copy the verified worktree versions of:

```text
ProviderProperties.java
ProviderConfig.java
CodexAppServerAdapter.java
CodexAppServerClient.java
CodexAppServerAdapterTest.java
```

to the same relative paths in [isolated source](file:///Users/elvis/.local/share/openharness/source). The test file is required because the wrapper's existing `mvn spring-boot:run` lifecycle compiles tests and the managed-session signature changed; syncing only production files causes startup compilation to fail before the backend launches. Do not sync any other tests, Git metadata, OpenSpec, dashboard, or unrelated files.

- [ ] **Step 4: Write non-secret local configuration**

Use the ignored isolated-source `.env` to provide `SPRING_APPLICATION_JSON` with existing provider entries plus:

```json
{
  "name": "openai-codex",
  "type": "codex-app-server",
  "command": "/opt/homebrew/bin/codex",
  "app-server-args": ["app-server"],
  "endpoint": "stdio://",
  "models": ["gpt-5.6-sol"],
  "reasoning-effort": "high"
}
```

and route `openai-codex/gpt-5.6-sol` to `openai-codex`. Write `agent-runtime/agents/default-agent.json` selecting `openai-codex/gpt-5.6-sol`. Do not read, copy, encode, print, or persist Codex OAuth credentials.

- [ ] **Step 5: Verify provenance without exposing values**

Record file existence, permissions, hashes, configured model name, and configured effort only. Confirm the Codex CLI version and `codex login status`; do not inspect login storage.

### Task 6: Six-Command End-To-End Smoke

- [ ] **Step 1: Run `doctor`**

Expected: dependencies, configuration, and ports are usable; record exact PASS/FAIL.

- [ ] **Step 2: Run `up`**

Expected: wrapper supervisor starts and health checks pass on backend `8080`, runtime `3001`, control `3101`, and frontend `5173`; record actual ports.

- [ ] **Step 3: Run `status`**

Expected: wrapper-owned supervisor and four services are healthy.

- [ ] **Step 4: Run `chat`**

Send one deterministic message through the wrapper. Expected: normal response through `openai-codex/gpt-5.6-sol`; capture only request/trace IDs, selected model, configured effort, stop reason, and non-secret response summary.

- [ ] **Step 5: Run `logs`**

Use a bounded snapshot or timeout so the follow command cannot block. Expected: command succeeds and the current smoke correlation ID is locatable in wrapper-owned logs. If the command works but current correlation evidence is absent, report this command `FAIL` for smoke acceptance and do not broaden scope without a new proposal decision.

- [ ] **Step 6: Run `down` and verify stopped state**

Expected: wrapper-owned supervisor stops, PID file is removed, and ports `8080`, `3001`, `3101`, and `5173` are closed. Always attempt this cleanup even if an earlier smoke step fails.

### Task 7: Independent Review, Dashboard, And Closeout

- [ ] **Step 1: Perform a distinct implementation review**

Review the complete diff, RED/GREEN evidence, protocol frame, constructor compatibility, OAuth boundary, non-fallback mapping, backup manifest, local configuration provenance, and six-command evidence. Land the conclusion in `docs/review/2026-07-28-codex-reasoning-effort-implementation-review.md` using the project review template and file-URL paths.

- [ ] **Step 2: Reconcile OpenSpec tasks**

Mark only objectively completed items. Do not archive `add-codex-reasoning-effort-config`.

- [ ] **Step 3: Synchronize dashboard**

If implementation and focused formal verification pass, set the dashboard entry to `verified`, add this plan, source/test files, verification commands/results, and current next/non-goals. Regenerate:

```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
```

If formal verification is incomplete, keep status `proposed` and record the blocker instead.

- [ ] **Step 4: Run final fresh verification**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ProviderPropertiesTest,CodexAppServerClientTest,CodexAppServerAdapterTest,CodexProcessSupervisorTest,CodexOperatorCommandTest,ProviderRegistryTest,ModelRouterTest test
bash -n /Users/elvis/.local/bin/openharness
openspec validate add-codex-reasoning-effort-config --strict --no-interactive
pnpm dashboard:check
git diff --check
git status --short
```

Expected: focused checks pass; status contains only this task's known files plus the pre-existing handoff/review artifacts. Report six command PASS/FAIL, ports, logs, changed files, evidence, rollback, residual risks, active OpenSpec state, and shortest daily command flow. Never claim Production Verified.
