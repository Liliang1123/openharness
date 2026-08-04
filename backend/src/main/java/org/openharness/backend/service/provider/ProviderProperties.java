package org.openharness.backend.service.provider;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "openharness")
public class ProviderProperties {

  private static final Pattern SAFE_REASONING_EFFORT =
      Pattern.compile("[a-z][a-z0-9_-]{0,31}");

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
      validate(entry);
      ProviderConfig config = new ProviderConfig(
          entry.name,
          entry.type,
          entry.baseUrl,
          entry.apiKey,
          entry.models,
          entry.pricing,
          entry.command,
          entry.appServerArgs,
          entry.endpoint,
          entry.reasoningEffort);
      registry.register(config, entry.name.equals(defaultProvider));
    }
  }

  private void validate(ProviderEntry entry) {
    if (!"codex-app-server".equals(entry.type)) {
      if (hasText(entry.reasoningEffort)) {
        throw new IllegalArgumentException(
            "reasoning-effort is supported only for codex-app-server providers");
      }
      return;
    }
    if (!hasText(entry.reasoningEffort)) {
      entry.reasoningEffort = "medium";
    } else if (!SAFE_REASONING_EFFORT.matcher(entry.reasoningEffort).matches()) {
      throw new IllegalArgumentException(
          "codex-app-server reasoning-effort must be a bounded safe identifier");
    }
    if (entry.baseUrl != null || entry.apiKey != null) {
      throw new IllegalArgumentException(
          "codex-app-server provider must not configure baseUrl or apiKey");
    }
    if (!hasText(entry.command)) {
      throw new IllegalArgumentException(
          "codex-app-server provider requires a command");
    }
    if (entry.appServerArgs == null || entry.appServerArgs.isEmpty()) {
      throw new IllegalArgumentException(
          "codex-app-server provider requires appServerArgs");
    }
    if (!isLocalEndpoint(entry.endpoint)) {
      throw new IllegalArgumentException(
          "codex-app-server provider requires a local endpoint");
    }
    validateSafeAppServerArgs(entry.appServerArgs);
    validateListenEndpoint(entry.appServerArgs, entry.endpoint);
    String routerDefault = modelRouter != null ? modelRouter.getDefault() : null;
    if (entry.name != null
        && (entry.name.equals(defaultProvider) || entry.name.equals(routerDefault))) {
      throw new IllegalArgumentException(
          "codex-app-server provider requires an explicit route and cannot be the default");
    }
    Map<String, String> routes = modelRouter != null ? modelRouter.getRoutes() : Map.of();
    boolean hasExplicitRoute = entry.models != null && entry.models.stream()
        .anyMatch(model -> entry.name != null
            && entry.name.equals(routes.get("openai-codex/" + model)));
    if (!hasExplicitRoute) {
      throw new IllegalArgumentException(
          "codex-app-server provider requires an explicit route for an allow-listed model");
    }
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  private boolean isLocalEndpoint(String endpoint) {
    if (!hasText(endpoint)) {
      return false;
    }
    if ("stdio://".equals(endpoint) || endpoint.startsWith("unix://")) {
      return true;
    }
    try {
      URI uri = URI.create(endpoint);
      if (!"ws".equalsIgnoreCase(uri.getScheme())
          || uri.getUserInfo() != null
          || uri.getRawQuery() != null
          || uri.getRawFragment() != null) {
        return false;
      }
      String host = uri.getHost();
      return "localhost".equalsIgnoreCase(host)
          || "127.0.0.1".equals(host)
          || "::1".equals(host)
          || "[::1]".equals(host);
    } catch (IllegalArgumentException ignored) {
      return false;
    }
  }

  private void validateListenEndpoint(List<String> args, String endpoint) {
    int listenCount = 0;
    String listenEndpoint = null;
    for (int index = 0; index < args.size(); index++) {
      String argument = args.get(index);
      if ("--listen".equals(argument)) {
        listenCount++;
        if (index + 1 < args.size()) {
          listenEndpoint = args.get(++index);
        }
      } else if (argument != null && argument.startsWith("--listen=")) {
        listenCount++;
        listenEndpoint = argument.substring("--listen=".length());
      }
    }
    if (listenCount == 0 && "stdio://".equals(endpoint)) {
      return;
    }
    if (listenCount != 1 || !endpoint.equals(listenEndpoint)) {
      throw new IllegalArgumentException(
          "codex-app-server appServerArgs --listen must match endpoint");
    }
  }

  private void validateSafeAppServerArgs(List<String> args) {
    if (args.isEmpty() || !"app-server".equals(args.getFirst())) {
      throw new IllegalArgumentException(
          "codex-app-server has unsupported appServerArgs");
    }
    for (int index = 1; index < args.size(); index++) {
      String argument = args.get(index);
      if ("--listen".equals(argument)) {
        index++;
      } else if (argument == null || !argument.startsWith("--listen=")) {
        throw new IllegalArgumentException(
            "codex-app-server has unsupported appServerArgs");
      }
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
    private String command;
    private List<String> appServerArgs = new ArrayList<>();
    private String endpoint;
    private String reasoningEffort;

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
    public String getCommand() { return command; }
    public void setCommand(String command) { this.command = command; }
    public List<String> getAppServerArgs() { return appServerArgs; }
    public void setAppServerArgs(List<String> appServerArgs) { this.appServerArgs = appServerArgs != null ? appServerArgs : List.of(); }
    public String getEndpoint() { return endpoint; }
    public void setEndpoint(String endpoint) { this.endpoint = endpoint; }
    public String getReasoningEffort() { return reasoningEffort; }
    public void setReasoningEffort(String reasoningEffort) { this.reasoningEffort = reasoningEffort; }
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
