package org.openharness.backend.service.provider;

import java.util.List;
import java.util.Map;

public record ProviderConfig(
    String name,
    String type,
    String baseUrl,
    String apiKey,
    List<String> models,
    Map<String, Pricing> pricing,
    String command,
    List<String> appServerArgs,
    String endpoint,
    String reasoningEffort) {

  public ProviderConfig(
      String name,
      String type,
      String baseUrl,
      String apiKey,
      List<String> models,
      Map<String, Pricing> pricing) {
    this(name, type, baseUrl, apiKey, models, pricing, null, List.of(), null);
  }

  public ProviderConfig(
      String name,
      String type,
      String baseUrl,
      String apiKey,
      List<String> models,
      Map<String, Pricing> pricing,
      String command,
      List<String> appServerArgs,
      String endpoint) {
    this(
        name,
        type,
        baseUrl,
        apiKey,
        models,
        pricing,
        command,
        appServerArgs,
        endpoint,
        "codex-app-server".equals(type) ? "medium" : null);
  }

  public ProviderConfig {
    models = models != null ? List.copyOf(models) : List.of();
    pricing = pricing != null ? Map.copyOf(pricing) : Map.of();
    appServerArgs = appServerArgs != null ? List.copyOf(appServerArgs) : List.of();
  }
}
