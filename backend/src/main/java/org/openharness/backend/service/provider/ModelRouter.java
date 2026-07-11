package org.openharness.backend.service.provider;

import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ModelRouter {
  private static final String CODEX_ROUTE_PREFIX = "openai-codex/";
  private static final String CODEX_PROVIDER_TYPE = "codex-app-server";

  private final ProviderRegistry registry;
  private final ProviderProperties properties;

  public ModelRouter(ProviderRegistry registry, ProviderProperties properties) {
    this.registry = registry;
    this.properties = properties;
  }

  public ResolvedProvider resolve(String model) {
    ProviderProperties.ModelRouterEntry router = properties.getModelRouter();
    Map<String, String> routes = router != null ? router.getRoutes() : Map.of();
    boolean codexRoute = model != null && model.startsWith(CODEX_ROUTE_PREFIX);
    String providerName = routes.get(model);
    if (codexRoute && providerName == null) {
      throw new ProviderUnavailableException(
          "Codex model requires an explicit route: " + model);
    }
    if (providerName == null) {
      providerName = router != null ? router.getDefault() : properties.getDefaultProvider();
    }
    ProviderConfig config = registry.configByName(providerName);
    if (codexRoute) {
      if (!CODEX_PROVIDER_TYPE.equals(config.type())) {
        throw new ProviderUnavailableException(
            "Codex route must target a codex-app-server provider: " + model);
      }
      String bareModel = model.substring(CODEX_ROUTE_PREFIX.length());
      if (bareModel.isBlank() || !config.models().contains(bareModel)) {
        throw new ProviderUnavailableException(
            "Codex model is not in the provider allow-list: " + model);
      }
    } else if (CODEX_PROVIDER_TYPE.equals(config.type())) {
      throw new ProviderUnavailableException(
          "Codex providers require an openai-codex/ model route");
    }
    return new ResolvedProvider(registry.adapterForConfig(config), config);
  }
}
