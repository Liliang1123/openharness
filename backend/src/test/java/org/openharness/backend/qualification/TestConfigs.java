package org.openharness.backend.qualification;

import java.nio.file.Path;
import java.util.Map;

final class TestConfigs {
  private TestConfigs() {}

  static RealProviderQualificationConfig openAi(Path report) {
    return RealProviderQualificationConfig.parse(new String[] {"--real", "--provider", "openai-compatible",
        "--endpoint", "https://provider.example/v1", "--model", "model-1", "--report-path", report.toString(),
        "--cost-budget-usd-micros", "1000", "--max-output-tokens", "64",
        "--input-cost-usd-micros-per-million-tokens", "1",
        "--output-cost-usd-micros-per-million-tokens", "2"}, Map.of());
  }
}
