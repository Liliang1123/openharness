package org.openharness.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.ConnectException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelCancelRequest;
import org.openharness.backend.model.Contracts.ModelCancelResponse;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.PendingCodexTurn;
import org.openharness.backend.model.Contracts.Usage;
import org.openharness.backend.service.MockModelService;
import org.openharness.backend.service.TraceService;
import org.openharness.backend.service.provider.CostCalculator;
import org.openharness.backend.service.provider.ModelRouter;
import org.openharness.backend.service.provider.Pricing;
import org.openharness.backend.service.provider.ProviderAdapter;
import org.openharness.backend.service.provider.ProviderConfig;
import org.openharness.backend.service.provider.ProviderProperties;
import org.openharness.backend.service.provider.ProviderRegistry;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

class ModelControllerTest {

  @Test
  void chatAddsCostUsdMicrosForPricedProviderUsage() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapterReturningUsage()));
    registry.register(
        new ProviderConfig(
            "zhipu",
            "openai-compatible",
            "https://example.test",
            "key",
            List.of("glm-4-flash"),
            Map.of("glm-4-flash", new Pricing(100L, 300L))),
        true);
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault("zhipu");
    router.setRoutes(Map.of("glm-4-flash", "zhipu"));
    properties.setModelRouter(router);
    ProviderProperties.ProviderEntry provider = new ProviderProperties.ProviderEntry();
    provider.setName("zhipu");
    provider.setPricing(Map.of("glm-4-flash", new Pricing(100L, 300L)));
    properties.setProviders(List.of(provider));

    ModelController controller = new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));

    ModelChatResponse response = controller.chat(
        new ModelChatRequest(
            "req-cost",
            "conv-cost",
            "user-001",
            "tenant-001",
            "glm-4-flash",
            false,
            List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
            List.of(),
            Map.of()),
        request());

    assertThat(response.usage().costUsdMicros()).isEqualTo(1);
  }

  @Test
  void chatAddsCostWithoutDroppingPendingContinuationFields() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapterReturningPendingUsage()));
    registry.register(
        new ProviderConfig(
            "zhipu",
            "openai-compatible",
            "https://example.test",
            "key",
            List.of("glm-4-flash"),
            Map.of("glm-4-flash", new Pricing(100L, 300L))),
        true);
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault("zhipu");
    router.setRoutes(Map.of("glm-4-flash", "zhipu"));
    properties.setModelRouter(router);
    ProviderProperties.ProviderEntry provider = new ProviderProperties.ProviderEntry();
    provider.setName("zhipu");
    provider.setPricing(Map.of("glm-4-flash", new Pricing(100L, 300L)));
    properties.setProviders(List.of(provider));

    ModelController controller = new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));

    ModelChatResponse response = controller.chat(
        new ModelChatRequest(
            "req-cost",
            "conv-cost",
            "user-001",
            "tenant-001",
            "glm-4-flash",
            false,
            List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
            List.of(),
            Map.of()),
        request());

    assertThat(response.usage().costUsdMicros()).isEqualTo(1);
    assertThat(response.pendingTurn()).isEqualTo(new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"text\":\"hello\"}",
        "2026-07-11T10:00:00.000Z"));
    assertThat(response.idempotentReplay()).isTrue();
  }

  @Test
  void chatReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapterTimingOut()));
    registry.register(
        new ProviderConfig(
            "zhipu",
            "openai-compatible",
            "https://example.test",
            "key",
            List.of("glm-4-flash"),
            Map.of()),
        true);
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault("zhipu");
    router.setRoutes(Map.of("glm-4-flash", "zhipu"));
    properties.setModelRouter(router);

    ModelController controller = new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));

    ModelChatResponse response = controller.chat(
        new ModelChatRequest(
            "req-timeout",
            "conv-timeout",
            "user-001",
            "tenant-001",
            "glm-4-flash",
            false,
            List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
            List.of(),
            Map.of("timeoutMs", 1)),
        request());

    assertThat(response.message()).isNull();
    assertThat(response.rawProvider()).isEqualTo("zhipu");
    assertThat(response.usage().totalTokens()).isZero();
    assertThat(response.error().errorClass()).isEqualTo("PROVIDER_TIMEOUT");
    assertThat(response.error().httpStatus()).isEqualTo(504);
    assertThat(response.error().retriable()).isTrue();
    assertThat(response.error().retryOwner()).isEqualTo("java");
    assertThat(response.error().maxRetries()).isEqualTo(1);
    assertThat(response.error().fallbackAllowed()).isTrue();
  }

  @Test
  void compressReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapterTimingOut()));
    registry.register(
        new ProviderConfig(
            "zhipu",
            "openai-compatible",
            "https://example.test",
            "key",
            List.of("glm-4-flash"),
            Map.of()),
        true);
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault("zhipu");
    router.setRoutes(Map.of("default", "zhipu"));
    properties.setModelRouter(router);

    ModelController controller = new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));

    AppException exception = org.junit.jupiter.api.Assertions.assertThrows(
        AppException.class,
        () -> controller.compress(
            new ModelController.CompressRequest(
                List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null))),
            request()));

    assertThat(exception.status()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
    assertThat(exception.error().errorClass()).isEqualTo("PROVIDER_TIMEOUT");
    assertThat(exception.error().httpStatus()).isEqualTo(504);
    assertThat(exception.error().retriable()).isTrue();
    assertThat(exception.error().retryOwner()).isEqualTo("java");
    assertThat(exception.error().maxRetries()).isEqualTo(1);
    assertThat(exception.error().fallbackAllowed()).isTrue();
  }

  @Test
  void chatSupportsCancellationViaPublicCancelEndpoint() {
    AtomicBoolean cancelThreadInterrupted = new AtomicBoolean(false);
    CancellableAdapter adapter = new CancellableAdapter(cancelThreadInterrupted);
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter));
    registry.register(
        new ProviderConfig(
            "zhipu",
            "openai-compatible",
            "https://example.test",
            "key",
            List.of("glm-4-flash"),
            Map.of()),
        true);
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault("zhipu");
    router.setRoutes(Map.of("glm-4-flash", "zhipu"));
    properties.setModelRouter(router);

    ModelController controller = new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));

    String requestId = "req-production-cancel";
    ModelChatRequest request = new ModelChatRequest(
        requestId,
        "conv-cancel",
        "user-001",
        "tenant-001",
        "glm-4-flash",
        false,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(),
        Map.of());

    AtomicReference<ModelChatResponse> chatResponse = new AtomicReference<>();
    Thread t = new Thread(() -> {
      try {
        chatResponse.set(controller.chat(request, request()));
      } catch (Throwable throwable) {
        throw new RuntimeException(throwable);
      }
    });

    t.start();
    adapter.waitForStart();

    ModelCancelResponse response = controller.cancel(new ModelCancelRequest(requestId), request());

    assertThat(response.cancelled()).isTrue();

    try {
      t.join(3000);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }

    assertThat(t.isAlive()).isFalse();
    assertThat(chatResponse.get()).isNotNull();
    assertThat(chatResponse.get().error()).isNotNull();
    assertThat(chatResponse.get().error().errorClass()).isEqualTo("PROVIDER_CANCELLED");
    assertThat(chatResponse.get().error().httpStatus()).isEqualTo(409);
    assertThat(chatResponse.get().error().retriable()).isFalse();
    assertThat(cancelThreadInterrupted.get()).isTrue();
    assertThat(response.requestId()).isEqualTo(requestId);
  }

  @Test
  void cancelUnknownRequestReturnsFalse() {
    ProviderRegistry registry = new ProviderRegistry(new ArrayList<>());
    ProviderProperties properties = new ProviderProperties(registry);
    ModelController controller = new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));

    ModelCancelResponse response = controller.cancel(new ModelCancelRequest("missing-req"), request());
    assertThat(response.cancelled()).isFalse();
  }

  @Test
  void gateDMockFixtureCallsQualificationMcpOnceThenReturnsFinalAnswer() {
    ProviderRegistry registry = new ProviderRegistry(new ArrayList<>());
    ProviderProperties properties = new ProviderProperties(registry);
    ModelController controller = new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));
    MockHttpServletRequest fixtureRequest = request();
    fixtureRequest.addHeader("X-Mock-Fixture", "mcp-qualification-echo");

    ModelChatResponse first = controller.chat(
        new ModelChatRequest(
            "req-gate-d-mcp",
            "conv-gate-d-mcp",
            "user-001",
            "tenant-001",
            "default",
            false,
            List.of(new AgentMessage("user", "gate d", null, null, null, null, null, null, null, null, null, null, null)),
            List.of(),
            Map.of()),
        fixtureRequest);

    assertThat(first.message().toolCalls()).hasSize(1);
    assertThat(first.message().toolCalls().getFirst().name()).isEqualTo("mcp_call");
    assertThat(first.message().toolCalls().getFirst().argumentsRaw())
        .isEqualTo("{\"server\":\"qualification\",\"tool\":\"qualification_echo\",\"arguments\":{}}");

    ModelChatResponse second = controller.chat(
        new ModelChatRequest(
            "req-gate-d-mcp",
            "conv-gate-d-mcp",
            "user-001",
            "tenant-001",
            "default",
            false,
            List.of(
                new AgentMessage("user", "gate d", null, null, null, null, null, null, null, null, null, null, null),
                first.message(),
                new AgentMessage("tool", "qualification:echo", null, "call-mcp-qualification-echo", null, null, null, null, null, null, null, null, null)),
            List.of(),
            Map.of()),
        fixtureRequest);

    assertThat(second.message().content()).isNotNull();
    assertThat(second.message().toolCalls()).isNull();
  }

  private ProviderAdapter adapterReturningUsage() {
    return new ProviderAdapter() {
      @Override
      public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
        return new ModelChatResponse(
            request.requestId(),
            request.conversationId(),
            new AgentMessage("assistant", "ok", null, null, null, null, null, null, null, null, null, null, null),
            new Usage(1200, 500, 1700, null, null, false, null),
            config.name(),
            null);
      }

      @Override
      public String providerType() {
        return "openai-compatible";
      }
    };
  }

  private ProviderAdapter adapterReturningPendingUsage() {
    return new ProviderAdapter() {
      @Override
      public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
        return new ModelChatResponse(
            request.requestId(),
            request.conversationId(),
            null,
            new PendingCodexTurn(
                "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"text\":\"hello\"}",
                "2026-07-11T10:00:00.000Z"),
            new Usage(1200, 500, 1700, null, null, false, null),
            config.name(),
            null,
            true);
      }

      @Override
      public String providerType() {
        return "openai-compatible";
      }
    };
  }

  private ProviderAdapter adapterTimingOut() {
    return new ProviderAdapter() {
      @Override
      public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
        throw new RuntimeException(
            "OpenAI-compatible call failed: HTTP connect timed out",
            new ConnectException("HTTP connect timed out"));
      }

      @Override
      public String providerType() {
        return "openai-compatible";
      }
    };
  }

  private static final class CancellableAdapter implements ProviderAdapter {
    private final java.util.concurrent.ConcurrentHashMap<String, Thread> active = new java.util.concurrent.ConcurrentHashMap<>();
    private final AtomicBoolean cancelThreadInterrupted;
    private final java.util.concurrent.CountDownLatch started = new java.util.concurrent.CountDownLatch(1);

    CancellableAdapter(AtomicBoolean cancelThreadInterrupted) {
      this.cancelThreadInterrupted = cancelThreadInterrupted;
    }

    @Override
    public String providerType() {
      return "openai-compatible";
    }

    @Override
    public void cancel(String requestId) {
      Thread thread = active.get(requestId);
      if (thread != null) {
        thread.interrupt();
      }
    }

    @Override
    public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
      Thread current = Thread.currentThread();
      active.put(request.requestId(), current);
      try {
        started.countDown();
        try {
          Thread.sleep(2000);
        } catch (InterruptedException e) {
          cancelThreadInterrupted.set(true);
          throw new RuntimeException("OpenAI-compatible call failed: interrupted", e);
        }
      } finally {
        active.remove(request.requestId());
      }
      return new ModelChatResponse(
          request.requestId(),
          request.conversationId(),
          new AgentMessage("assistant", "delayed", null, null, null, null, null, null, null, null, null, null, null),
          new Usage(0, 0, 0, null, null, false, null),
          config.name(),
          null);
    }

    void waitForStart() {
      try {
        started.await();
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
  }

  private MockHttpServletRequest request() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader("X-Trace-Id", "trace-cost");
    request.addHeader("X-Request-Id", "req-cost");
    request.addHeader("X-User-Id", "user-001");
    request.addHeader("X-Tenant-Id", "tenant-001");
    return request;
  }
}
