package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.junit.jupiter.api.Test;

class ModelRouterTest {

  @Test
  void explicitMappingResolvesMappedProvider() {
    ProviderRegistry registry = registryWith("zhipu", "anthropic");
    ModelRouter router = new ModelRouter(registry, properties("zhipu", Map.of("claude-sonnet-4-20250514", "anthropic")));

    ResolvedProvider resolved = router.resolve("claude-sonnet-4-20250514");

    assertThat(resolved.config().name()).isEqualTo("anthropic");
    assertThat(resolved.adapter().providerType()).isEqualTo("anthropic");
  }

  @Test
  void unmappedModelFallsBackToDefaultProvider() {
    ProviderRegistry registry = registryWith("zhipu", "anthropic");
    ModelRouter router = new ModelRouter(registry, properties("zhipu", Map.of()));

    ResolvedProvider resolved = router.resolve("unknown-model");

    assertThat(resolved.config().name()).isEqualTo("zhipu");
    assertThat(resolved.adapter().providerType()).isEqualTo("openai-compatible");
  }

  @Test
  void defaultModelUsesConfiguredDefaultProvider() {
    ProviderRegistry registry = registryWith("zhipu", "anthropic");
    ModelRouter router = new ModelRouter(registry, properties("anthropic", Map.of("default", "zhipu")));

    ResolvedProvider resolved = router.resolve("default");

    assertThat(resolved.config().name()).isEqualTo("zhipu");
    assertThat(resolved.adapter().providerType()).isEqualTo("openai-compatible");
  }

  private ProviderRegistry registryWith(String... providerNames) {
    ProviderRegistry registry = new ProviderRegistry(List.of(
        adapter("openai-compatible"),
        adapter("anthropic")));
    for (String providerName : providerNames) {
      String type = providerName.equals("anthropic") ? "anthropic" : "openai-compatible";
      registry.register(new ProviderConfig(providerName, type, "https://example.test/" + providerName, "key", List.of(providerName + "-model"), Map.of()), providerName.equals("zhipu"));
    }
    return registry;
  }

  private ProviderProperties properties(String defaultProvider, Map<String, String> routes) {
    ProviderProperties properties = new ProviderProperties(new ProviderRegistry(List.of()));
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault(defaultProvider);
    router.setRoutes(routes);
    properties.setModelRouter(router);
    return properties;
  }

  private ProviderAdapter adapter(String providerType) {
    return new ProviderAdapter() {
      @Override
      public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
        throw new UnsupportedOperationException("not used");
      }

      @Override
      public String providerType() {
        return providerType;
      }
    };
  }
}
