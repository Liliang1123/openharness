package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class CostCalculatorTest {

  @Test
  void calculatesMicrosWithCeiling() {
    CostCalculator calculator = new CostCalculator(Map.of(
        "zhipu", Map.of("glm-4-flash", new Pricing(100L, 300L))));

    Long cost = calculator.calculate("zhipu", "glm-4-flash", 1200, 500);

    assertThat(cost).isEqualTo(1L);
  }

  @Test
  void returnsNullWhenPricingMissing() {
    CostCalculator calculator = new CostCalculator(Map.of());

    Long cost = calculator.calculate("zhipu", "unknown", 1200, 500);

    assertThat(cost).isNull();
  }
}
