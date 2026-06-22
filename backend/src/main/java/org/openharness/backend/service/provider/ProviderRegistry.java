package org.openharness.backend.service.provider;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class ProviderRegistry {

  private final Map<String, ProviderAdapter> adaptersByType = new HashMap<>();
  private final Map<String, ProviderConfig> configByModel = new HashMap<>();
  private final Map<String, ProviderConfig> configByName = new HashMap<>();
  private ProviderConfig defaultConfig;

  public ProviderRegistry(List<ProviderAdapter> adapters) {
    for (ProviderAdapter adapter : adapters) {
      adaptersByType.put(adapter.providerType(), adapter);
    }
  }

  public void register(ProviderConfig config, boolean isDefault) {
    configByName.put(config.name(), config);
    for (String model : config.models()) {
      configByModel.put(model, config);
    }
    if (isDefault || defaultConfig == null) {
      defaultConfig = config;
    }
  }

  public ProviderAdapter adapterFor(String model) {
    ProviderConfig config = configFor(model);
    return adapterForConfig(config);
  }

  public ProviderAdapter adapterForConfig(ProviderConfig config) {
    ProviderAdapter adapter = adaptersByType.get(config.type());
    if (adapter == null) {
      throw new IllegalStateException("No adapter for provider type: " + config.type());
    }
    return adapter;
  }

  public ProviderConfig configFor(String model) {
    return configByModel.getOrDefault(model, defaultConfig);
  }

  public ProviderConfig configByName(String providerName) {
    ProviderConfig config = configByName.get(providerName);
    if (config == null) {
      throw new IllegalArgumentException("Unknown provider: " + providerName);
    }
    return config;
  }

  public ProviderConfig defaultConfig() {
    return defaultConfig;
  }
}
