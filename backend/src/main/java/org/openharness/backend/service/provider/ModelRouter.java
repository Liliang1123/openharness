package org.openharness.backend.service.provider;

import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ModelRouter {
  private final ProviderRegistry registry;
  private final ProviderProperties properties;

  public ModelRouter(ProviderRegistry registry, ProviderProperties properties) {
    this.registry = registry;
    this.properties = properties;
  }

  public ResolvedProvider resolve(String model) {
    ProviderProperties.ModelRouterEntry router = properties.getModelRouter();
    Map<String, String> routes = router != null ? router.getRoutes() : Map.of();
    String providerName = routes.get(model);
    if (providerName == null) {
      providerName = router != null ? router.getDefault() : properties.getDefaultProvider();
    }
    ProviderConfig config = registry.configByName(providerName);
    return new ResolvedProvider(registry.adapterForConfig(config), config);
  }
}
