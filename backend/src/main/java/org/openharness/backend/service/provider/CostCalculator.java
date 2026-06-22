package org.openharness.backend.service.provider;

import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class CostCalculator {
  private final Map<String, Map<String, Pricing>> pricingByProvider;

  @Autowired
  public CostCalculator(ProviderProperties properties) {
    this.pricingByProvider = properties.getProviders().stream()
        .collect(java.util.stream.Collectors.toUnmodifiableMap(
            ProviderProperties.ProviderEntry::getName,
            ProviderProperties.ProviderEntry::getPricing));
  }

  CostCalculator(Map<String, Map<String, Pricing>> pricingByProvider) {
    this.pricingByProvider = pricingByProvider;
  }

  public Long calculate(String providerName, String modelName, int promptTokens, int completionTokens) {
    Pricing pricing = pricingByProvider
        .getOrDefault(providerName, Map.of())
        .get(modelName);
    if (pricing == null) {
      return null;
    }
    long raw = promptTokens * pricing.inputPerMToken() + completionTokens * pricing.outputPerMToken();
    return (raw + 999_999L) / 1_000_000L;
  }
}
