package org.openharness.backend.api;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelCancelRequest;
import org.openharness.backend.model.Contracts.ModelCancelResponse;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.StructuredError;
import org.openharness.backend.model.Contracts.Usage;
import org.openharness.backend.service.MockModelService;
import org.openharness.backend.service.TraceService;
import org.openharness.backend.service.provider.CostCalculator;
import org.openharness.backend.service.provider.ModelRouter;
import org.openharness.backend.service.provider.ProviderAdapter;
import org.openharness.backend.service.provider.ResolvedProvider;
import org.openharness.backend.service.provider.ProviderUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/model")
public class ModelController {
  private final ModelRouter modelRouter;
  private final CostCalculator costCalculator;
  private final MockModelService mockModelService;
  private final TraceService traceService;
  private final ConcurrentMap<String, ProviderAdapter> activeChatAdapters = new ConcurrentHashMap<>();

  public ModelController(ModelRouter modelRouter, CostCalculator costCalculator, MockModelService mockModelService, TraceService traceService) {
    this.modelRouter = modelRouter;
    this.costCalculator = costCalculator;
    this.mockModelService = mockModelService;
    this.traceService = traceService;
  }

  @PostMapping("/chat")
  ModelChatResponse chat(@RequestBody ModelChatRequest request, HttpServletRequest servletRequest) {
    String mockFixture = servletRequest.getHeader("X-Mock-Fixture");
    String model = request.model() != null ? request.model() : "default";
    String requestId = request.requestId();

    if (requestId == null || requestId.isBlank()) {
      throw appException(new StructuredError("INVALID_REQUEST_ID", "Missing requestId", false, "none", 0, false, 400, null));
    }

    // Mock fixture mode or explicit "mock" model
    if (mockFixture != null || "mock".equals(model)) {
      traceService.backendEvent(
          servletRequest.getHeader("X-Trace-Id"),
          servletRequest.getHeader("X-Request-Id"),
          request.conversationId(),
          servletRequest.getHeader("X-User-Id"),
          servletRequest.getHeader("X-Tenant-Id"),
          "MODEL_CALL_START", "model call start",
          Map.of("provider", "mock", "model", model, "hasReasoningBlocks", hasReasoningBlocks(request)));
      ModelChatResponse response = mockModelService.chat(request, mockFixture);
      traceService.backendEvent(
          servletRequest.getHeader("X-Trace-Id"),
          servletRequest.getHeader("X-Request-Id"),
          request.conversationId(),
          servletRequest.getHeader("X-User-Id"),
          servletRequest.getHeader("X-Tenant-Id"),
          "MODEL_CALL_END", "model call end",
          Map.of("provider", "mock", "model", model));
      return response;
    }
    ResolvedProvider resolved = modelRouter.resolve(model);
    activeChatAdapters.put(requestId, resolved.adapter());

    traceService.backendEvent(
        servletRequest.getHeader("X-Trace-Id"),
        servletRequest.getHeader("X-Request-Id"),
        request.conversationId(),
        servletRequest.getHeader("X-User-Id"),
        servletRequest.getHeader("X-Tenant-Id"),
        "MODEL_CALL_START", "model call start",
        java.util.Map.of("provider", resolved.config().name(), "model", model));

    try {
      ModelChatResponse response = resolved.adapter().chat(request, resolved.config());
      traceService.backendEvent(
          servletRequest.getHeader("X-Trace-Id"),
          servletRequest.getHeader("X-Request-Id"),
          request.conversationId(),
          servletRequest.getHeader("X-User-Id"),
          servletRequest.getHeader("X-Tenant-Id"),
          "MODEL_CALL_END", "model call end",
          java.util.Map.of("provider", resolved.config().name(), "model", model));
      return withCost(response, resolved.config().name(), model);
    } catch (ProviderUnavailableException e) {
      return providerErrorResponse(
          request,
          resolved.config().name(),
          providerUnavailableError(e));
    } catch (RuntimeException e) {
      if (isProviderTimeout(e)) {
        return providerErrorResponse(
            request,
            resolved.config().name(),
            providerTimeoutError());
      }
      if (isProviderCancellation(e)) {
        return providerErrorResponse(
            request,
            resolved.config().name(),
            providerCancellationError());
      }
      throw e;
    } finally {
      activeChatAdapters.remove(requestId);
    }
  }

  @PostMapping("/cancel")
  ModelCancelResponse cancel(@RequestBody ModelCancelRequest request, HttpServletRequest servletRequest) {
    String requestId = request == null ? null : request.requestId();
    if (requestId == null || requestId.isBlank()) {
      throw appException(new StructuredError("INVALID_CANCEL_REQUEST", "Missing requestId", false, "none", 0, false, 400, null));
    }

    String traceId = servletRequest.getHeader("X-Trace-Id");
    String requestHeaderId = servletRequest.getHeader("X-Request-Id");
    String userId = servletRequest.getHeader("X-User-Id");
    String tenantId = servletRequest.getHeader("X-Tenant-Id");

    traceService.backendEvent(
        traceId,
        requestHeaderId,
        null,
        userId,
        tenantId,
        "MODEL_CANCEL_REQUEST",
        "model cancel request",
        Map.of("requestId", requestId));

    ProviderAdapter adapter = activeChatAdapters.get(requestId);
    if (adapter == null) {
      traceService.backendEvent(
          traceId,
          requestHeaderId,
          null,
          userId,
          tenantId,
          "MODEL_CANCEL_RESULT",
          "model cancel request miss",
          Map.of("requestId", requestId, "cancelled", false));
      return new ModelCancelResponse(requestId, false);
    }

    adapter.cancel(requestId);

    traceService.backendEvent(
        traceId,
        requestHeaderId,
        null,
        userId,
        tenantId,
        "MODEL_CANCEL_RESULT",
        "model cancel request end",
        Map.of("requestId", requestId, "cancelled", true));

    return new ModelCancelResponse(requestId, true);
  }

  public record CompressRequest(List<AgentMessage> messages) {}
  public record CompressResponse(String summary) {}

  private boolean hasReasoningBlocks(ModelChatRequest request) {
    return request.messages() != null &&
        request.messages().stream().anyMatch(message -> message.reasoningBlocks() != null && !message.reasoningBlocks().isEmpty());
  }

  @PostMapping("/compress")
  CompressResponse compress(@RequestBody CompressRequest request, HttpServletRequest servletRequest) {
    String mockFixture = servletRequest.getHeader("X-Mock-Fixture");

    // Build a summarization prompt from the messages
    String transcript = request.messages().stream()
        .map(m -> m.role() + ": " + (m.content() != null ? m.content().toString() : ""))
        .collect(Collectors.joining("\n"));

    String systemPrompt = "Summarize the following conversation in a concise paragraph that preserves key facts, decisions, and context needed to continue the conversation.";

    List<AgentMessage> summarizeMessages = List.of(
        new AgentMessage("user", systemPrompt + "\n\n" + transcript, null, null, null, null, null, null, null, null, null, null, null)
    );

    ModelChatRequest chatRequest = new ModelChatRequest(
        "compress-" + System.currentTimeMillis(), null, null, null,
        mockFixture != null ? "mock" : "default",
        false, summarizeMessages, null, null);

    if (mockFixture != null) {
      return new CompressResponse("Summary of " + request.messages().size() + " messages.");
    }

    ResolvedProvider resolved = modelRouter.resolve(chatRequest.model());
    ModelChatResponse response;
    try {
      response = resolved.adapter().chat(chatRequest, resolved.config());
    } catch (ProviderUnavailableException e) {
      throw appException(providerUnavailableError(e));
    } catch (RuntimeException e) {
      if (isProviderTimeout(e)) {
        throw appException(providerTimeoutError());
      }
      throw e;
    }
    if (response.error() != null) {
      throw appException(response.error());
    }

    String summary = response.message() != null && response.message().content() != null
        ? response.message().content().toString()
        : "Summary unavailable.";
    return new CompressResponse(summary);
  }

  private ModelChatResponse withCost(ModelChatResponse response, String providerName, String modelName) {
    Usage usage = response.usage();
    if (usage == null || usage.costUsdMicros() != null) {
      return response;
    }
    Long cost = costCalculator.calculate(providerName, modelName, usage.promptTokens(), usage.completionTokens());
    if (cost == null) {
      return response;
    }
    Usage withCost = new Usage(
        usage.promptTokens(),
        usage.completionTokens(),
        usage.totalTokens(),
        usage.cacheReadTokens(),
        usage.cacheWriteTokens(),
        usage.totalIsPerTurn(),
        Math.toIntExact(cost));
    return new ModelChatResponse(
        response.requestId(),
        response.conversationId(),
        response.message(),
        response.pendingTurn(),
        withCost,
        response.rawProvider(),
        response.error(),
        response.idempotentReplay());
  }

  private ModelChatResponse providerErrorResponse(ModelChatRequest request, String providerName, StructuredError error) {
    return new ModelChatResponse(
        request.requestId(),
        request.conversationId(),
        null,
        new Usage(0, 0, 0, null, null, false, null),
        providerName,
        error);
  }

  private StructuredError providerUnavailableError(ProviderUnavailableException exception) {
    return new StructuredError("PROVIDER_UNAVAILABLE", exception.getMessage(), true, "ts", 3, true, 503, null);
  }

  private StructuredError providerTimeoutError() {
    return new StructuredError("PROVIDER_TIMEOUT", "Provider timed out.", true, "java", 1, true, 504, null);
  }

  private StructuredError providerCancellationError() {
    return new StructuredError("PROVIDER_CANCELLED", "Model request cancelled.", false, "none", 0, false, 409, null);
  }

  private AppException appException(StructuredError error) {
    int status = error.httpStatus() != null ? error.httpStatus() : 500;
    return new AppException(HttpStatus.valueOf(status), error);
  }

  private boolean isProviderTimeout(Throwable throwable) {
    Throwable current = throwable;
    while (current != null) {
      if (current instanceof java.net.http.HttpTimeoutException) {
        return true;
      }
      String message = current.getMessage();
      if (message != null) {
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("timed out") || lower.contains("timeout deadline exceeded") || lower.contains("connect timed out")) {
          return true;
        }
      }
      current = current.getCause();
    }
    return false;
  }

  private boolean isProviderCancellation(Throwable throwable) {
    Throwable current = throwable;
    while (current != null) {
      if (current instanceof InterruptedException) {
        return true;
      }
      String message = current.getMessage();
      if (message != null && message.contains("InterruptedException")) {
        return true;
      }
      current = current.getCause();
    }
    return false;
  }
}
