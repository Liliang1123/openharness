package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class QualificationReportWriterTest {
  @TempDir Path tempDir;

  @Test
  void existingTargetIsNeverOverwritten() throws Exception {
    Path target = tempDir.resolve("report.json");
    byte[] original = "original".getBytes(StandardCharsets.UTF_8);
    Files.write(target, original);

    assertThatThrownBy(() -> QualificationReportWriter.write(target, report(), config()))
        .isInstanceOf(java.nio.file.FileAlreadyExistsException.class);
    assertThat(Files.readAllBytes(target)).isEqualTo(original);
    assertThat(tempFiles()).isZero();
  }

  @Test
  void concurrentWritersHaveExactlyOneWinnerAndLeaveNoTemp() throws Exception {
    Path target = tempDir.resolve("race.json");
    CountDownLatch start = new CountDownLatch(1);
    AtomicInteger winners = new AtomicInteger();
    Runnable writer = () -> {
      try {
        start.await();
        QualificationReportWriter.write(target, report(), config());
        winners.incrementAndGet();
      } catch (Exception ignored) {
        // One writer must lose with FileAlreadyExistsException.
      }
    };
    Thread first = Thread.ofPlatform().start(writer);
    Thread second = Thread.ofPlatform().start(writer);
    start.countDown();
    first.join();
    second.join();

    assertThat(winners).hasValue(1);
    assertThat(Files.readString(target)).contains("\"track\" : \"production\"");
    assertThat(tempFiles()).isZero();
  }

  @Test
  void validationAndRedactionFailClosedBeforePublishing() throws Exception {
    Path invalidTarget = tempDir.resolve("invalid.json");
    assertThatThrownBy(() -> QualificationReportWriter.write(invalidTarget, Map.of("track", "production"), config()))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(invalidTarget).doesNotExist();

    Path secretTarget = tempDir.resolve("secret.json");
    Map<String, Object> secret = report();
    rows(secret).get(0).put("observed", Map.of("Authorization", "Bearer qualification-canary"));
    QualificationReportWriter.write(secretTarget, secret, config());
    assertThat(Files.readString(secretTarget)).doesNotContain("qualification-canary").doesNotContain("Bearer");
    assertThat(tempFiles()).isZero();
  }

  @Test
  void rejectsForgedRowCostAndTotalAboveConfiguredBudget() {
    Map<String, Object> forged = report();
    rows(forged).forEach(row -> {
      row.put("usage", Map.of("promptTokens", 1L, "completionTokens", 1L));
      row.put("cost", Map.of("currency", "USD", "micros", 1000L));
    });
    Path target = tempDir.resolve("forged.json");

    assertThatThrownBy(() -> QualificationReportWriter.write(target, forged, config()))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(target).doesNotExist();
  }

  @Test
  void rejectsPassReportWhenRawAndAdapterUsageEvidenceDiffer() {
    Map<String, Object> forged = reportWithValidSyncPass();
    rows(forged).get(0).put("observed", Map.of(
        "rawProviderUsage", Map.of("promptTokens", 2L, "completionTokens", 1L),
        "adapterUsage", Map.of("promptTokens", 1L, "completionTokens", 1L)));
    Path target = tempDir.resolve("usage-mismatch.json");

    assertThatThrownBy(() -> QualificationReportWriter.write(target, forged, config()))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("usage mismatch");
    assertThat(target).doesNotExist();
  }

  @Test
  void nonCooperatingTargetCreationWinsWithoutOverwrite() throws Exception {
    Path target = tempDir.resolve("attacker-race.json");
    byte[] attacker = "attacker-original".getBytes(StandardCharsets.UTF_8);

    assertThatThrownBy(() -> QualificationReportWriter.write(target, report(), config(), temp -> Files.write(target, attacker)))
        .isInstanceOf(java.nio.file.FileAlreadyExistsException.class);
    assertThat(Files.readAllBytes(target)).isEqualTo(attacker);
    assertThat(tempFiles()).isZero();
  }

  @Test
  void fixedCanaryInNestedCandidateReportIsRejectedEvenWhenNegativeScanIsClaimed() throws Exception {
    Map<String, Object> attacked = report();
    Map<String, Object> redaction = rows(attacked).get(12);
    redaction.put("observed", Map.of("negativeScan", true,
        "leakedPayload", Map.of("nested", java.util.List.of("OH-QUALIFICATION-REDACTION-CANARY-V1"))));
    Path target = tempDir.resolve("canary-attack.json");

    assertThatThrownBy(() -> QualificationReportWriter.write(target, attacked, config(), closeout("response", "capture", "stdout", "stderr")))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("canary");
    assertThat(target).doesNotExist();
    assertThat(tempFiles()).isZero();
  }

  @Test
  void writerPromotesRedactionOnlyAfterAllActualSurfacesAreScanned() throws Exception {
    Map<String, Object> candidate = report();
    Path target = tempDir.resolve("redaction-closeout.json");

    QualificationReportWriter.WrittenReport result = QualificationReportWriter.write(target, candidate, config(),
        closeout("sanitized response", "sanitized capture", "sanitized stdout", "sanitized stderr"));

    Map<?, ?> written = new com.fasterxml.jackson.databind.ObjectMapper().readValue(target.toFile(), Map.class);
    byte[] published = Files.readAllBytes(target);
    Map<?, ?> redaction = (Map<?, ?>) ((java.util.List<?>) written.get("rows")).get(12);
    assertThat(redaction.get("result")).isEqualTo("pass");
    assertThat(result.result()).isEqualTo(written.get("result"));
    assertThat(result.bytes()).isEqualTo(published);
    assertThat(result.sha256()).isEqualTo(RealProviderQualificationRunner.sha256(published));
    assertThat(Files.readString(target)).doesNotContain(RealProviderQualificationMatrix.redactionCanary());
  }

  @Test
  void canaryInAnyActualSurfacePreventsPublication() throws Exception {
    String canary = RealProviderQualificationMatrix.redactionCanary().toUpperCase(java.util.Locale.ROOT);
    for (int surface = 0; surface < 4; surface++) {
      Map<String, Object> candidate = report();
      String response = surface == 0 ? canary : "sanitized response";
      String capture = surface == 1 ? canary : "sanitized capture";
      String stdout = surface == 2 ? canary : "sanitized stdout";
      String stderr = surface == 3 ? canary : "sanitized stderr";
      Path target = tempDir.resolve("surface-" + surface + ".json");

      assertThatThrownBy(() -> QualificationReportWriter.write(target, candidate, config(),
          closeout(response, capture, stdout, stderr)))
          .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("canary");
      assertThat(target).doesNotExist();
    }
    assertThat(tempFiles()).isZero();
  }

  private Map<String, Object> report() {
    return RealProviderQualificationMatrix.blockedReport(config(), "blocked");
  }

  private QualificationReportWriter.CloseoutEvidence closeout(String response, String capture,
      String stdout, String stderr) {
    return QualificationReportWriter.CloseoutEvidence.production(response, capture, stdout, "", stderr);
  }

  private RealProviderQualificationConfig config() { return TestConfigs.openAi(tempDir.resolve("unused.json")); }

  private Map<String, Object> reportWithValidSyncPass() {
    Map<String, Object> report = report();
    Map<String, Long> usage = Map.of("promptTokens", 1L, "completionTokens", 1L);
    Map<String, Object> sync = rows(report).get(0);
    sync.put("result", "pass");
    sync.put("usage", usage);
    sync.put("observed", Map.of("responseReceived", true, "contentPresent", true,
        "observedSequence", java.util.List.of("request", "response"),
        "rawProviderUsage", usage, "adapterUsage", usage));
    sync.put("cost", Map.of("currency", "USD", "micros", 2L));
    return report;
  }

  @SuppressWarnings("unchecked")
  private static java.util.List<Map<String, Object>> rows(Map<String, Object> report) {
    return (java.util.List<Map<String, Object>>) report.get("rows");
  }

  private long tempFiles() throws Exception {
    try (var paths = Files.list(tempDir)) {
      return paths.filter(path -> path.getFileName().toString().contains(".tmp-")).count();
    }
  }
}
