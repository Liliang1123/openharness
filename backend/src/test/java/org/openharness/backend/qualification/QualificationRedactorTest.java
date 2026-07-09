package org.openharness.backend.qualification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class QualificationRedactorTest {
  @Test
  void redactsNestedQualificationSecretsWithoutMutatingInput() {
    Map<String, Object> input = Map.of(
        "headers", Map.of("Authorization", "Bearer java-secret", "x-api-key", "sk-java-canary"),
        "trace", Map.of("attributes", Map.of("apiKey", "java-key", "promptTokens", 3)),
        "file", List.of(Map.of("token", "java-token", "status", "failed")),
        "message", "provider rejected Bearer java-secret");

    Object redacted = QualificationRedactor.redact(input);
    String serialized = redacted.toString();

    assertFalse(serialized.contains("java-secret"));
    assertFalse(serialized.contains("sk-java-canary"));
    assertFalse(serialized.contains("java-key"));
    assertFalse(serialized.contains("java-token"));
    assertEquals("Bearer java-secret", ((Map<?, ?>) input.get("headers")).get("Authorization"));
  }

  @Test
  void preservesOrdinaryValuesAndRedactsSecretBearingStrings() {
    assertEquals(Map.of("message", "ordinary failure", "count", 2),
        QualificationRedactor.redact(Map.of("message", "ordinary failure", "count", 2)));
    assertEquals("[REDACTED]", QualificationRedactor.redact("prefix sk-live-secret suffix"));
  }
}
