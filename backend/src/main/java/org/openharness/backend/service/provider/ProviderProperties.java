package org.openharness.backend.service.provider;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "openharness")
public class ProviderProperties {

  private List<ProviderEntry> providers = new ArrayList<>();
  private String defaultProvider = "sensenova";
  private ModelRouterEntry modelRouter = new ModelRouterEntry();

  private final ProviderRegistry registry;

  public ProviderProperties(ProviderRegistry registry) {
    this.registry = registry;
  }

  @PostConstruct
  void init() {
    for (ProviderEntry entry : providers) {
      ProviderConfig config = new ProviderConfig(entry.name, entry.type, entry.baseUrl, entry.apiKey, entry.models, entry.pricing);
      registry.register(config, entry.name.equals(defaultProvider));
    }
  }

  public List<ProviderEntry> getProviders() { return providers; }
  public void setProviders(List<ProviderEntry> providers) { this.providers = providers; }
  public String getDefaultProvider() { return defaultProvider; }
  public void setDefaultProvider(String defaultProvider) { this.defaultProvider = defaultProvider; }
  public ModelRouterEntry getModelRouter() { return modelRouter; }
  public void setModelRouter(ModelRouterEntry modelRouter) { this.modelRouter = modelRouter; }

  public static class ProviderEntry {
    private String name;
    private String type = "openai-compatible";
    private String baseUrl;
    private String apiKey;
    private List<String> models = new ArrayList<>();
    private Map<String, Pricing> pricing = Map.of();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public List<String> getModels() { return models; }
    public void setModels(List<String> models) { this.models = models; }
    public Map<String, Pricing> getPricing() { return pricing; }
    public void setPricing(Map<String, Pricing> pricing) { this.pricing = pricing != null ? pricing : Map.of(); }
  }

  public static class ModelRouterEntry {
    private String defaultProvider = "zhipu";
    private Map<String, String> routes = Map.of();

    public String getDefault() { return defaultProvider; }
    public void setDefault(String defaultProvider) { this.defaultProvider = defaultProvider; }
    public Map<String, String> getRoutes() { return routes; }
    public void setRoutes(Map<String, String> routes) { this.routes = routes != null ? routes : Map.of(); }
  }
}
