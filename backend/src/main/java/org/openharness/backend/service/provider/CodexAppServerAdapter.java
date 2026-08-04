package org.openharness.backend.service.provider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.PendingCodexTurn;
import org.openharness.backend.model.Contracts.StructuredError;
import org.openharness.backend.model.Contracts.ToolDefinition;
import org.openharness.backend.model.Contracts.Usage;
import org.openharness.backend.service.provider.CodexAppServerClient.DynamicTool;
import org.openharness.backend.service.provider.CodexAppServerClient.ErrorTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.FinalTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;
import org.openharness.backend.service.provider.CodexAppServerClient.TurnResult;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.Identity;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.TurnBridge;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Provider boundary for one local, non-fallback Codex app-server session. */
@Component
public final class CodexAppServerAdapter implements ProviderAdapter {
  private static final String ROUTE_PREFIX = "openai-codex/";
  private static final int MAX_INPUT = 65_536;
  private static final Duration REQUEST_TIMEOUT = Duration.ofMinutes(30);

  @FunctionalInterface
  interface SessionFactory {
    ManagedSession open(ProviderConfig config);
  }

  interface ManagedSession extends AutoCloseable {
    TurnResult startTurn(
        String model, String input, List<DynamicTool> tools, String reasoningEffort);
    TurnResult resume(PendingToolCall call, String status, String content);
    TurnResult interrupt(PendingToolCall call, String reason);
    @Override void close();
  }

  private final CodexPendingTurnRegistry registry;
  private final SessionFactory sessions;
  private final ObjectMapper json = new ObjectMapper();

  @Autowired
  public CodexAppServerAdapter(CodexPendingTurnRegistry registry) {
    this(registry, CodexAppServerAdapter::openProductionSession);
  }

  CodexAppServerAdapter(CodexPendingTurnRegistry registry, SessionFactory sessions) {
    this.registry = java.util.Objects.requireNonNull(registry, "registry");
    this.sessions = java.util.Objects.requireNonNull(sessions, "sessions");
  }

  @Override
  public String providerType() {
    return "codex-app-server";
  }

  @Override
  public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
    ManagedSession session = null;
    try {
      requireRequest(request, config);
      session = sessions.open(config);
      TurnResult result = session.startTurn(
          request.model().substring(ROUTE_PREFIX.length()),
          transcript(request),
          dynamicTools(request.tools()),
          config.reasoningEffort());
      if (result instanceof PendingToolCall pending) {
        PendingCodexTurn envelope = registry.register(
            new Identity(request.tenantId(), request.userId(), request.requestId(), request.conversationId()),
            pending,
            managedBridge(session, pending));
        session = null;
        return new ModelChatResponse(
            request.requestId(), request.conversationId(), null, envelope, null, config.name(), null, null);
      }
      ModelChatResponse response = terminalResponse(request, config, result);
      safeClose(session);
      session = null;
      return response;
    } catch (RuntimeException failure) {
      safeClose(session);
      return unavailable(request, config);
    }
  }

  private ModelChatResponse terminalResponse(
      ModelChatRequest request,
      ProviderConfig config,
      TurnResult result) {
    if (result instanceof FinalTurn turn) {
      if (turn.usage() == null) return unavailable(request, config);
      List<Map<String, Object>> reasoning = turn.reasoning() == null || turn.reasoning().isEmpty()
          ? null
          : List.of(Map.of("type", "thinking", "text", turn.reasoning()));
      AgentMessage message = new AgentMessage(
          "assistant", turn.message(), null, null, reasoning,
          null, null, null, null, null, null, null, null);
      int total = Math.addExact(turn.usage().inputTokens(), turn.usage().outputTokens());
      Usage usage = new Usage(
          turn.usage().inputTokens(), turn.usage().outputTokens(), total,
          turn.usage().cachedInputTokens(), null, true, null);
      return new ModelChatResponse(
          request.requestId(), request.conversationId(), message, usage, config.name(), null);
    }
    if (result instanceof ErrorTurn error) {
      return errorResponse(request, config, "AUTH_FAILED".equals(error.code()));
    }
    return unavailable(request, config);
  }

  private ModelChatResponse errorResponse(
      ModelChatRequest request,
      ProviderConfig config,
      boolean needsLogin) {
    String errorClass = needsLogin ? "PROVIDER_NEEDS_LOGIN" : "PROVIDER_UNAVAILABLE";
    String message = needsLogin
        ? "Codex provider requires local operator login"
        : "Codex provider is unavailable";
    StructuredError error = new StructuredError(
        errorClass, message, false, "none", 0, false, 503,
        Map.of("provider", config.name(), "status", needsLogin ? "needs_login" : "unavailable"));
    return new ModelChatResponse(
        request.requestId(), request.conversationId(), null, null, null, config.name(), error, null);
  }

  private ModelChatResponse unavailable(ModelChatRequest request, ProviderConfig config) {
    String requestId = request != null && request.requestId() != null ? request.requestId() : "codex-unavailable";
    String conversationId = request != null && request.conversationId() != null
        ? request.conversationId()
        : "codex-unavailable";
    ProviderConfig safeConfig = config != null ? config : new ProviderConfig(
        "codex-app-server", "codex-app-server", null, null, List.of(), Map.of(), null, List.of(), null);
    return errorResponse(
        new ModelChatRequest(requestId, conversationId, null, null, null, false, List.of(), List.of(), Map.of()),
        safeConfig,
        false);
  }

  private void requireRequest(ModelChatRequest request, ProviderConfig config) {
    if (request == null || config == null
        || !"codex-app-server".equals(config.type())
        || request.model() == null
        || !request.model().startsWith(ROUTE_PREFIX)
        || request.model().length() == ROUTE_PREFIX.length()
        || request.requestId() == null
        || request.conversationId() == null
        || request.userId() == null
        || request.tenantId() == null) {
      throw new IllegalArgumentException("invalid Codex provider request");
    }
  }

  private String transcript(ModelChatRequest request) {
    StringBuilder transcript = new StringBuilder();
    for (AgentMessage message : request.messages() == null ? List.<AgentMessage>of() : request.messages()) {
      String content;
      try {
        content = message.content() instanceof String text ? text : json.writeValueAsString(message.content());
      } catch (JsonProcessingException invalid) {
        throw new IllegalArgumentException("invalid model message");
      }
      if (!transcript.isEmpty()) transcript.append('\n');
      transcript.append(message.role()).append(": ").append(content == null ? "" : content);
      if (transcript.length() > MAX_INPUT) throw new IllegalArgumentException("model input is too large");
    }
    if (transcript.isEmpty()) throw new IllegalArgumentException("model input is required");
    return transcript.toString();
  }

  private List<DynamicTool> dynamicTools(List<ToolDefinition> definitions) {
    List<DynamicTool> tools = new ArrayList<>();
    for (ToolDefinition definition : definitions == null ? List.<ToolDefinition>of() : definitions) {
      tools.add(new DynamicTool(definition.name(), definition.description(), definition.parameters()));
    }
    return List.copyOf(tools);
  }

  private TurnBridge managedBridge(ManagedSession session, PendingToolCall initial) {
    AtomicReference<PendingToolCall> current = new AtomicReference<>(initial);
    AtomicBoolean closed = new AtomicBoolean();
    Runnable close = () -> {
      if (closed.compareAndSet(false, true)) safeClose(session);
    };
    return new TurnBridge() {
      @Override
      public TurnResult complete(String status, String content) {
        try {
          TurnResult result = session.resume(current.get(), status, content);
          if (result instanceof PendingToolCall pending) current.set(pending);
          else close.run();
          return result;
        } catch (RuntimeException failure) {
          close.run();
          throw failure;
        }
      }

      @Override
      public TurnResult terminate(String status) {
        try {
          return session.interrupt(current.get(), status);
        } finally {
          close.run();
        }
      }
    };
  }

  private static ManagedSession openProductionSession(ProviderConfig config) {
    if (!"stdio://".equals(config.endpoint())) {
      throw new IllegalStateException("Codex transport is unavailable");
    }
    CodexProcessSupervisor supervisor = new CodexProcessSupervisor(config);
    try {
      supervisor.start();
      CodexAppServerClient client = supervisor.openClient(REQUEST_TIMEOUT);
      return new ManagedSession() {
        public TurnResult startTurn(
            String model, String input, List<DynamicTool> tools, String reasoningEffort) {
          return client.startTurn(model, input, tools, reasoningEffort);
        }
        public TurnResult resume(PendingToolCall call, String status, String content) {
          return client.resumeToolCall(
              call, status, List.of(new CodexAppServerClient.ContentItem("inputText", content)));
        }
        public TurnResult interrupt(PendingToolCall call, String reason) {
          return client.interruptToolCall(call, reason);
        }
        public void close() {
          supervisor.stop();
        }
      };
    } catch (RuntimeException failure) {
      supervisor.stop();
      throw new IllegalStateException("Codex provider is unavailable");
    }
  }

  private static void safeClose(ManagedSession session) {
    if (session == null) return;
    try {
      session.close();
    } catch (RuntimeException ignored) {
      // Cleanup failure must not expose process output or replace the structured provider error.
    }
  }
}
