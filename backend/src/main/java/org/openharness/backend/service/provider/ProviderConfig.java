package org.openharness.backend.service.provider;

import java.util.List;
import java.util.Map;

public record ProviderConfig(
    String name,
    String type,
    String baseUrl,
    String apiKey,
    List<String> models,
    Map<String, Pricing> pricing) {}
