package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;

class ProviderRegistryTest {

  @Test
  void providerConfigurationRequiresMatchingAdapterType() {
    ProviderRegistry registry = new ProviderRegistry(List.of());

    assertThatThrownBy(() -> registry.register(config("codex-app-server"), false))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("codex-app-server");
  }

  @Test
  void explicitFakeCodexAdapterCanBackCodexConfiguration() {
    ProviderAdapter adapter = adapter("codex-app-server");
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter));
    ProviderConfig config = config("codex-app-server");

    registry.register(config, false);

    assertThat(registry.adapterForConfig(config)).isSameAs(adapter);
    assertThat(registry.configByName("openai-codex")).isSameAs(config);
  }

  @Test
  void codexConfigurationDoesNotBecomeImplicitDefault() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));

    registry.register(config("codex-app-server"), false);

    assertThat(registry.configFor("unknown-model")).isNull();
  }

  @Test
  void legacyProviderRegistrationKeepsLazyMissingAdapterBehavior() {
    ProviderRegistry registry = new ProviderRegistry(List.of());
    ProviderConfig config = new ProviderConfig(
        "legacy-provider", "future-compatible", null, null, List.of("legacy-model"), Map.of());

    registry.register(config, false);

    assertThat(registry.configByName("legacy-provider")).isSameAs(config);
    assertThatThrownBy(() -> registry.adapterForConfig(config))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("future-compatible");
  }

  @Test
  void codexModelsCannotBypassModelRouterThroughRegistryLookup() {
    ProviderRegistry registry = new ProviderRegistry(List.of(
        adapter("openai-compatible"),
        adapter("codex-app-server")));
    ProviderConfig zhipu = new ProviderConfig(
        "zhipu", "openai-compatible", "https://example.test", "key", List.of("gpt-5.4"), Map.of());
    registry.register(zhipu, true);
    registry.register(config("codex-app-server"), false);

    assertThat(registry.configFor("gpt-5.4")).isSameAs(zhipu);
    assertThatThrownBy(() -> registry.configFor("openai-codex/gpt-5.4"))
        .isInstanceOf(ProviderUnavailableException.class)
        .hasMessageContaining("ModelRouter");
    assertThat(registry.configFor("ordinary-unknown-model")).isSameAs(zhipu);
  }

  private ProviderConfig config(String type) {
    return new ProviderConfig("openai-codex", type, null, null, List.of("gpt-5.4"), Map.of());
  }

  private ProviderAdapter adapter(String type) {
    return new ProviderAdapter() {
      @Override
      public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
        throw new UnsupportedOperationException("not used");
      }

      @Override
      public String providerType() {
        return type;
      }
    };
  }
}
