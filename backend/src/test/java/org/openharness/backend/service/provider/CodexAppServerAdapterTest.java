package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.CodexTurnCancelRequest;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.ToolDefinition;
import org.openharness.backend.service.provider.CodexAppServerClient.DynamicTool;
import org.openharness.backend.service.provider.CodexAppServerClient.ErrorTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.FinalTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;
import org.openharness.backend.service.provider.CodexAppServerClient.TokenUsage;
import org.openharness.backend.service.provider.CodexAppServerClient.TurnResult;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.Identity;

class CodexAppServerAdapterTest {
  private static final ProviderConfig CONFIG = new ProviderConfig(
      "codex", "codex-app-server", null, null, List.of("gpt-test"), Map.of(),
      "codex", List.of("app-server"), "stdio://");

  @Test
  void mapsReadyFinalAndForwardsFrozenDynamicToolsWithoutProviderFallback() {
    FakeSession session = new FakeSession(new FinalTurn(
        "thread", "turn", "answer", "reason", new TokenUsage(3, 2, 1)));
    CodexAppServerAdapter adapter = adapter(config -> session);

    ModelChatResponse response = adapter.chat(request(), CONFIG);

    assertThat(response.message().content()).isEqualTo("answer");
    assertThat(response.message().reasoningBlocks()).containsExactly(Map.of("type", "thinking", "text", "reason"));
    assertThat(response.usage().promptTokens()).isEqualTo(3);
    assertThat(response.usage().completionTokens()).isEqualTo(2);
    assertThat(response.usage().cacheReadTokens()).isEqualTo(1);
    assertThat(response.rawProvider()).isEqualTo("codex");
    assertThat(session.model).isEqualTo("gpt-test");
    assertThat(session.input).contains("system", "rules", "user", "hello");
    assertThat(session.tools).containsExactly(new DynamicTool(
        "echo", "Echo", Map.of("type", "object", "properties", Map.of())));
    assertThat(session.closed).hasValue(1);
  }

  @Test
  void registersPendingAndClosesManagedSessionAfterExactCancel() {
    FakeSession session = new FakeSession(new PendingToolCall(
        7, "thread", "turn", "call", "echo", "{\"text\":\"hello\"}"));
    CodexPendingTurnRegistry registry = registry();
    CodexAppServerAdapter adapter = new CodexAppServerAdapter(registry, config -> session);

    ModelChatResponse response = adapter.chat(request(), CONFIG);

    assertThat(response.pendingTurn().toolName()).isEqualTo("echo");
    assertThat(session.closed).hasValue(0);
    registry.cancel(
        new Identity("tenant", "user", "request", "conversation"),
        response.pendingTurn().bridgeId(),
        new CodexTurnCancelRequest("request", "conversation", "thread", "turn", "call"));
    assertThat(session.interrupts).hasValue(1);
    assertThat(session.closed).hasValue(1);
  }

  @Test
  void completionResumesExactPendingSessionAndClosesOnFinal() {
    FakeSession session = new FakeSession(new PendingToolCall(
        7, "thread", "turn", "call", "echo", "{\"text\":\"hello\"}"));
    CodexPendingTurnRegistry registry = registry();
    ModelChatResponse pending = new CodexAppServerAdapter(registry, config -> session).chat(request(), CONFIG);

    CodexPendingTurnRegistry.RegistryResult result = registry.complete(
        new Identity("tenant", "user", "request", "conversation"),
        pending.pendingTurn().bridgeId(),
        new CodexToolResultSubmission(
            "request", "conversation", "thread", "turn", "call", "key", "ok", "safe"));

    assertThat(result.turnResult()).isInstanceOf(FinalTurn.class);
    assertThat(session.resumes).hasValue(1);
    assertThat(session.closed).hasValue(1);
  }

  @Test
  void mapsNeedsLoginAndUnavailableToFixedNonFallbackErrors() {
    FakeSession auth = new FakeSession(new ErrorTurn("AUTH_FAILED", "Bearer AUTH-CANARY"));
    ModelChatResponse needsLogin = adapter(config -> auth).chat(request(), CONFIG);
    assertThat(needsLogin.error().errorClass()).isEqualTo("PROVIDER_NEEDS_LOGIN");
    assertThat(needsLogin.error().fallbackAllowed()).isFalse();
    assertThat(needsLogin.error().retryOwner()).isEqualTo("none");
    assertThat(needsLogin.toString()).doesNotContain("AUTH-CANARY");
    assertThat(auth.closed).hasValue(1);

    ModelChatResponse unavailable = adapter(config -> {
      throw new IllegalStateException("OAUTH-CANARY transport failed");
    }).chat(request(), CONFIG);
    assertThat(unavailable.error().errorClass()).isEqualTo("PROVIDER_UNAVAILABLE");
    assertThat(unavailable.error().fallbackAllowed()).isFalse();
    assertThat(unavailable.error().retryOwner()).isEqualTo("none");
    assertThat(unavailable.toString()).doesNotContain("OAUTH-CANARY");
  }

  private static CodexAppServerAdapter adapter(CodexAppServerAdapter.SessionFactory factory) {
    return new CodexAppServerAdapter(registry(), factory);
  }

  private static CodexPendingTurnRegistry registry() {
    return new CodexPendingTurnRegistry(Clock.systemUTC(), Duration.ofMinutes(65), Duration.ofMinutes(5));
  }

  private static ModelChatRequest request() {
    return new ModelChatRequest(
        "request", "conversation", "user", "tenant", "openai-codex/gpt-test", false,
        List.of(
            new AgentMessage("system", "rules", null, null, null, null, null, null, null, null, null, null, null),
            new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(new ToolDefinition(
            "echo", "Echo", Map.of("type", "object", "properties", Map.of()),
            "v1", "hash", "safe", true, false, false, true, "java")),
        Map.of());
  }

  private static final class FakeSession implements CodexAppServerAdapter.ManagedSession {
    final TurnResult initial;
    final AtomicInteger interrupts = new AtomicInteger();
    final AtomicInteger resumes = new AtomicInteger();
    final AtomicInteger closed = new AtomicInteger();
    String model;
    String input;
    List<DynamicTool> tools;

    FakeSession(TurnResult initial) { this.initial = initial; }

    public TurnResult startTurn(String model, String input, List<DynamicTool> tools) {
      this.model = model;
      this.input = input;
      this.tools = tools;
      return initial;
    }

    public TurnResult resume(PendingToolCall call, String status, String content) {
      resumes.incrementAndGet();
      return new FinalTurn("thread", "turn", "done", "", new TokenUsage(0, 0, 0));
    }

    public TurnResult interrupt(PendingToolCall call, String reason) {
      interrupts.incrementAndGet();
      return new ErrorTurn("BRIDGE_CANCELLED", "cancelled");
    }

    public void close() { closed.incrementAndGet(); }
  }
}
