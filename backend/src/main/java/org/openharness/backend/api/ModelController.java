package org.openharness.backend.api;

import java.util.List;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.StructuredError;
import org.openharness.backend.model.Contracts.Usage;
import org.openharness.backend.service.MockModelService;
import org.openharness.backend.service.TraceService;
import org.openharness.backend.service.provider.CostCalculator;
import org.openharness.backend.service.provider.ModelRouter;
import org.openharness.backend.service.provider.ResolvedProvider;
import org.openharness.backend.service.provider.ProviderUnavailableException;
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
      return new ModelChatResponse(
          request.requestId(), request.conversationId(), null,
          new Usage(0, 0, 0, null, null, false, null), resolved.config().name(),
          new StructuredError("PROVIDER_UNAVAILABLE", e.getMessage(), true, "ts", 3, true, 503, null));
    }
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
    ModelChatResponse response = resolved.adapter().chat(chatRequest, resolved.config());

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
}
