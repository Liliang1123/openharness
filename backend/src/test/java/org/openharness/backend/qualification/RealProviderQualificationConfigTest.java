package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RealProviderQualificationConfigTest {
  @TempDir Path tempDir;

  @Test
  void parsesDocumentedOpenAiContractAndOnlyItsCredential() {
    RealProviderQualificationConfig config = RealProviderQualificationConfig.parse(args("openai-compatible"), Map.of(
        "OPENAI_COMPATIBLE_API_KEY", "sk-qualification-canary",
        "ANTHROPIC_API_KEY", "must-not-be-read",
        "UNRELATED_SECRET", "must-not-be-read"));

    assertThat(config.provider()).isEqualTo(RealProviderQualificationConfig.ProviderKind.OPENAI_COMPATIBLE);
    assertThat(config.hasCredential()).isTrue();
    assertThat(config.toString()).doesNotContain("sk-qualification-canary").doesNotContain("must-not-be-read");
    assertThat(config.protocolVersion()).isEqualTo("openai-chat-completions");
  }

  @Test
  void parsesAnthropicCachePricingAndFixedProtocol() {
    String[] args = args("anthropic");
    RealProviderQualificationConfig config = RealProviderQualificationConfig.parse(args, Map.of("ANTHROPIC_API_KEY", "value"));

    assertThat(config.protocolVersion()).isEqualTo("2023-06-01");
    assertThat(config.cacheReadCostUsdMicrosPerMillionTokens()).contains(3L);
    assertThat(config.cacheWriteCostUsdMicrosPerMillionTokens()).contains(4L);
  }

  @Test
  void rejectsCredentialFlagsUnsafeEndpointsAndUnknownArguments() {
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(append(args("openai-compatible"), "--api-key", "secret"), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Unsupported argument");
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(replaceEndpoint(args("openai-compatible"), "http://example.test"), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("HTTPS");
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(replaceEndpoint(args("openai-compatible"), "https://user@example.test/path?x=1"), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("userinfo, query, or fragment");
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(append(args("openai-compatible"), "--unknown", "x"), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Unsupported argument");
  }

  @Test
  void rejectsMissingRealFlagInvalidBudgetsExistingReportsAndIncompleteAnthropicPricing() throws Exception {
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(drop(args("openai-compatible"), "--real"), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("--real");
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(replace(args("openai-compatible"), "--cost-budget-usd-micros", "0"), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("positive");
    Path existing = tempDir.resolve("existing.json");
    java.nio.file.Files.writeString(existing, "old");
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(replace(args("openai-compatible"), "--report-path", existing.toString()), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("already exists");
    assertThatThrownBy(() -> RealProviderQualificationConfig.parse(dropPair(args("anthropic"), "--cache-write-cost-usd-micros-per-million-tokens"), Map.of()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("cache pricing");
  }

  private String[] args(String provider) {
    return new String[] {"--real", "--provider", provider, "--endpoint", "https://provider.example/v1",
        "--model", "model-1", "--report-path", tempDir.resolve(provider + ".json").toString(),
        "--cost-budget-usd-micros", "1000", "--max-output-tokens", "64",
        "--input-cost-usd-micros-per-million-tokens", "1",
        "--output-cost-usd-micros-per-million-tokens", "2",
        "--cache-read-cost-usd-micros-per-million-tokens", "3",
        "--cache-write-cost-usd-micros-per-million-tokens", "4"};
  }

  private static String[] append(String[] source, String... suffix) {
    String[] result = java.util.Arrays.copyOf(source, source.length + suffix.length);
    System.arraycopy(suffix, 0, result, source.length, suffix.length);
    return result;
  }

  private static String[] replaceEndpoint(String[] source, String value) { return replace(source, "--endpoint", value); }
  private static String[] replace(String[] source, String flag, String value) {
    String[] result = source.clone();
    for (int i = 0; i < result.length - 1; i++) if (result[i].equals(flag)) result[i + 1] = value;
    return result;
  }
  private static String[] drop(String[] source, String value) {
    return java.util.Arrays.stream(source).filter(item -> !item.equals(value)).toArray(String[]::new);
  }
  private static String[] dropPair(String[] source, String flag) {
    java.util.List<String> result = new java.util.ArrayList<>();
    for (int i = 0; i < source.length; i++) {
      if (source[i].equals(flag)) { i++; continue; }
      result.add(source[i]);
    }
    return result.toArray(String[]::new);
  }
}
