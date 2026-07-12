package org.openharness.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.AgentMessage;
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
import org.springframework.mock.web.MockHttpServletRequest;

class ModelControllerTest {

  @Test
  void chatAddsCostUsdMicrosForPricedProviderUsage() {
    ModelChatResponse response = controllerFor(adapterReturningMessageUsage()).chat(requestModel(), request());

    assertThat(response.usage().costUsdMicros()).isEqualTo(1);
    assertThat(response.message().content()).isEqualTo("ok");
  }

  @Test
  void chatAddsCostWithoutDroppingPendingContinuationFields() {
    ModelChatResponse response = controllerFor(adapterReturningPendingUsage()).chat(requestModel(), request());

    assertThat(response.usage().costUsdMicros()).isEqualTo(1);
    assertThat(response.pendingTurn()).isEqualTo(new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"text\":\"hello\"}",
        "2026-07-11T10:00:00.000Z"));
    assertThat(response.idempotentReplay()).isTrue();
  }

  private ModelController controllerFor(ProviderAdapter adapter) {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter));
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

    return new ModelController(
        new ModelRouter(registry, properties),
        new CostCalculator(properties),
        new MockModelService(),
        new TraceService(new com.fasterxml.jackson.databind.ObjectMapper()));
  }

  private ModelChatRequest requestModel() {
    return new ModelChatRequest(
        "req-cost", "conv-cost", "user-001", "tenant-001", "glm-4-flash", false,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(), Map.of());
  }

  private ProviderAdapter adapterReturningMessageUsage() {
    return new ProviderAdapter() {
      @Override
      public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
        return new ModelChatResponse(
            request.requestId(), request.conversationId(),
            new AgentMessage("assistant", "ok", null, null, null, null, null, null, null, null, null, null, null),
            new Usage(1200, 500, 1700, null, null, false, null), config.name(), null);
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

  private MockHttpServletRequest request() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader("X-Trace-Id", "trace-cost");
    request.addHeader("X-Request-Id", "req-cost");
    request.addHeader("X-User-Id", "user-001");
    request.addHeader("X-Tenant-Id", "tenant-001");
    return request;
  }
}
