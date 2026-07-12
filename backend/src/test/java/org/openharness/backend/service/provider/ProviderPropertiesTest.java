package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.springframework.beans.BeanWrapperImpl;

class ProviderPropertiesTest {

  @Test
  void codexProviderBindsLocalProcessMetadataWithoutCredentials() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    properties.setProviders(List.of(entry));
    configureRoute(properties, "gpt-5.4");

    properties.init();

    ProviderConfig config = registry.configByName("openai-codex");
    assertThat(config.command()).isEqualTo("codex");
    assertThat(config.appServerArgs()).isEqualTo(List.of("app-server", "--listen", "stdio://"));
    assertThat(config.endpoint()).isEqualTo("stdio://");
    assertThat(config.baseUrl()).isNull();
    assertThat(config.apiKey()).isNull();
    assertThat(config.models()).containsExactly("gpt-5.4");
  }

  @Test
  void remoteCodexEndpointIsRejectedBeforeRegistration() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    properties.setProviders(List.of(codexEntry("ws://10.0.0.8:4711")));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("local endpoint");
  }

  @Test
  void credentialBearingCodexEndpointIsRejectedBeforeRegistration() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    properties.setProviders(List.of(codexEntry("ws://user:password@127.0.0.1:4711")));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("local endpoint");
  }

  @Test
  void tokenQueryOnLoopbackCodexEndpointIsRejectedBeforeRegistration() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    String endpoint = "ws://127.0.0.1:4711?token=oauth-canary";
    ProviderProperties.ProviderEntry entry = codexEntry(endpoint);
    entry.setAppServerArgs(List.of("app-server", "--listen", endpoint));
    properties.setProviders(List.of(entry));
    configureRoute(properties, "gpt-5.4");

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("local endpoint");
  }

  @Test
  void codexProviderRejectsApiKeyConfiguration() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    entry.setApiKey("must-not-enter-openharness");
    properties.setProviders(List.of(entry));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("apiKey");
  }

  @Test
  void codexProviderRejectsBlankCredentialSlotsInsteadOfPersistingThem() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    entry.setBaseUrl(" ");
    entry.setApiKey("");
    properties.setProviders(List.of(entry));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("baseUrl")
        .hasMessageContaining("apiKey");
  }

  @Test
  void codexProviderCannotBeConfiguredAsDefault() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    properties.setDefaultProvider("openai-codex");
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault("openai-codex");
    properties.setModelRouter(router);
    properties.setProviders(List.of(codexEntry("stdio://")));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("explicit route");
  }

  @Test
  void codexProviderRequiresExecutableCommand() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    entry.setCommand(" ");
    properties.setProviders(List.of(entry));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("command");
  }

  @Test
  void codexProviderRequiresAppServerArguments() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    entry.setAppServerArgs(List.of());
    properties.setProviders(List.of(entry));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("appServerArgs");
  }

  @Test
  void codexProviderRejectsListenArgumentThatDiffersFromValidatedEndpoint() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    entry.setAppServerArgs(List.of("app-server", "--listen", "ws://0.0.0.0:4711"));
    properties.setProviders(List.of(entry));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("--listen")
        .hasMessageContaining("endpoint");
  }

  @Test
  void codexProviderRequiresAtLeastOneExactAllowListedRoute() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    properties.setProviders(List.of(codexEntry("stdio://")));

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("explicit route");
  }

  @Test
  void codexProviderRejectsCredentialPathArguments() {
    ProviderRegistry registry = new ProviderRegistry(List.of(adapter("codex-app-server")));
    ProviderProperties properties = new ProviderProperties(registry);
    ProviderProperties.ProviderEntry entry = codexEntry("stdio://");
    entry.setAppServerArgs(List.of(
        "app-server",
        "--listen",
        "stdio://",
        "--ws-token-file",
        "/tmp/codex-oauth-token-canary"));
    properties.setProviders(List.of(entry));
    configureRoute(properties, "gpt-5.4");

    assertThatThrownBy(properties::init)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("unsupported appServerArgs");
  }

  private ProviderProperties.ProviderEntry codexEntry(String endpoint) {
    ProviderProperties.ProviderEntry entry = new ProviderProperties.ProviderEntry();
    entry.setName("openai-codex");
    entry.setType("codex-app-server");
    entry.setModels(List.of("gpt-5.4"));
    BeanWrapperImpl wrapper = new BeanWrapperImpl(entry);
    wrapper.setPropertyValue("command", "codex");
    wrapper.setPropertyValue("appServerArgs", List.of("app-server", "--listen", "stdio://"));
    wrapper.setPropertyValue("endpoint", endpoint);
    return entry;
  }

  private void configureRoute(ProviderProperties properties, String bareModel) {
    ProviderProperties.ModelRouterEntry router = new ProviderProperties.ModelRouterEntry();
    router.setDefault("zhipu");
    router.setRoutes(Map.of("openai-codex/" + bareModel, "openai-codex"));
    properties.setModelRouter(router);
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
