package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RealProviderQualificationMatrixTest {
  @Test
  void blockedReportHasExactOrderedProductionRowsAndCompleteEvidence() {
    Map<String, Object> report = RealProviderQualificationMatrix.blockedReport(config("openai-compatible"), "missing credential");

    assertThat(report).containsEntry("track", "production").containsEntry("result", "blocked");
    List<Map<String, Object>> rows = rows(report);
    assertThat(rows).extracting(row -> row.get("id")).containsExactly(
        "openai-compatible-sync", "openai-compatible-stream", "openai-compatible-single-tool-call",
        "openai-compatible-multi-step-tool-call", "openai-compatible-structured-arguments",
        "openai-compatible-reasoning", "openai-compatible-usage", "openai-compatible-cost",
        "openai-compatible-503-retry", "openai-compatible-timeout", "openai-compatible-cancellation",
        "openai-compatible-terminal-error", "openai-compatible-redaction");
    assertThat(rows).allSatisfy(row -> {
      assertThat(row).containsKeys("track", "environment", "protocolVersion", "capabilities", "requestHash",
          "observed", "oracle", "usage", "cost", "durationMs", "result");
      assertThat(row.get("track")).isEqualTo("production");
      assertThat((String) row.get("requestHash")).matches("^[a-f0-9]{64}$");
    });
    RealProviderQualificationMatrix.validateReport(report, "openai-compatible");
  }

  @Test
  void anthropicRowsPreserveRawAndAdapterCacheUsage() {
    Map<String, Object> report = RealProviderQualificationMatrix.blockedReport(config("anthropic"), "unsupported");
    Map<?, ?> usage = (Map<?, ?>) rows(report).get(0).get("usage");

    assertThat(usage.keySet()).map(String::valueOf).contains("promptTokens", "completionTokens", "cacheReadInputTokens",
        "cacheCreationInputTokens");
    assertThat(usage.values()).allSatisfy(value -> assertThat(value).isInstanceOf(Number.class));
    RealProviderQualificationMatrix.validateReport(report, "anthropic");
  }

  @Test
  void missingDuplicateOrReorderedRowsAreRejected() {
    Map<String, Object> missing = mutableReport("openai-compatible");
    rows(missing).remove(0);
    assertThatThrownBy(() -> RealProviderQualificationMatrix.validateReport(missing, "openai-compatible"))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("exact ordered rows");

    Map<String, Object> duplicate = mutableReport("openai-compatible");
    rows(duplicate).set(1, new LinkedHashMap<>(rows(duplicate).get(0)));
    assertThatThrownBy(() -> RealProviderQualificationMatrix.validateReport(duplicate, "openai-compatible"))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("exact ordered rows");

    Map<String, Object> reordered = mutableReport("openai-compatible");
    java.util.Collections.swap(rows(reordered), 0, 1);
    assertThatThrownBy(() -> RealProviderQualificationMatrix.validateReport(reordered, "openai-compatible"))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("exact ordered rows");
  }

  @Test
  void unsupportedRequiredCapabilityBlocksAndAnyNonPassVetoesOverallPass() {
    Map<String, Object> report = mutableReport("openai-compatible");
    report.put("result", "pass");
    rows(report).forEach(row -> row.put("result", "pass"));
    assertThatThrownBy(() -> RealProviderQualificationMatrix.validateReport(report, "openai-compatible"))
        .isInstanceOf(IllegalArgumentException.class);

    report.put("result", "blocked");
    rows(report).forEach(row -> row.put("result", "blocked"));
    RealProviderQualificationMatrix.validateReport(report, "openai-compatible");
  }

  @Test
  void recomputesCeilingCostWithoutOverflowAndRequiresExactUsageEquality() {
    assertThat(RealProviderQualificationMatrix.costMicros(Long.MAX_VALUE, Long.MAX_VALUE)).isPositive();
    assertThat(RealProviderQualificationMatrix.costMicros(1, 1)).isEqualTo(1);
    assertThatThrownBy(() -> RealProviderQualificationMatrix.requireUsageEquality(
        Map.of("promptTokens", 2), Map.of("promptTokens", 1)))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("usage mismatch");
  }

  @Test
  void budgetExhaustionBlocksUnscheduledRowsWithoutDispatch() {
    AtomicInteger calls = new AtomicInteger();
    RealProviderQualificationMatrix.RowTransport transport = (rowId, requestId, deadlineNanos) -> {
      calls.incrementAndGet();
      return RealProviderQualificationMatrix.RowOutcome.pass(Map.of(), Map.of(), Map.of());
    };

    Map<String, Object> report = RealProviderQualificationMatrix.execute(
        config("openai-compatible", 1, 1_000_000_000L), transport, Duration.ofMillis(100));

    assertThat(calls).hasValue(0);
    assertThat(rows(report)).allSatisfy(row -> assertThat(row.get("result")).isEqualTo("blocked"));
    assertThat(report.get("result")).isEqualTo("blocked");
  }

  @Test
  void sharedDeadlineCancelsAndJoinsRequestAndClearsCapture() {
    AtomicBoolean active = new AtomicBoolean();
    AtomicBoolean interrupted = new AtomicBoolean();
    RealProviderQualificationMatrix.RowTransport transport = (rowId, requestId, deadlineNanos) -> {
      active.set(true);
      QualificationExchangeCapture.record(requestId, Map.of("status", "started"));
      try {
        Thread.sleep(10_000);
        return RealProviderQualificationMatrix.RowOutcome.pass(Map.of(), Map.of(), Map.of());
      } catch (InterruptedException e) {
        interrupted.set(true);
        Thread.currentThread().interrupt();
        throw e;
      } finally {
        active.set(false);
      }
    };

    Map<String, Object> report = RealProviderQualificationMatrix.execute(
        config("openai-compatible"), transport, Duration.ofMillis(30));

    assertThat(rows(report).get(0).get("result")).isEqualTo("blocked");
    assertThat(interrupted).isTrue();
    assertThat(active).isFalse();
    assertThat(QualificationExchangeCapture.retainedCount()).isZero();
  }

  @Test
  void rejectsRawAdapterUsageMismatchAndRecomputesCostInternally() {
    AtomicInteger calls = new AtomicInteger();
    RealProviderQualificationMatrix.RowTransport mismatch = (rowId, requestId, deadlineNanos) -> {
      calls.incrementAndGet();
      return RealProviderQualificationMatrix.RowOutcome.pass(Map.of(),
          Map.of("promptTokens", 2L, "completionTokens", 1L),
          Map.of("promptTokens", 1L, "completionTokens", 1L));
    };

    Map<String, Object> report = RealProviderQualificationMatrix.execute(
        config("openai-compatible"), mismatch, Duration.ofMillis(100));

    assertThat(rows(report).get(0).get("result")).isEqualTo("fail");
    assertThat(report.get("result")).isEqualTo("fail");
  }

  @Test
  void genericEvidenceCannotMakeThirteenRequiredRowsPass() {
    RealProviderQualificationMatrix.RowTransport generic = (rowId, requestId, deadlineNanos) -> {
      Map<String, Long> usage = Map.of("promptTokens", 1L, "completionTokens", 1L);
      return RealProviderQualificationMatrix.RowOutcome.pass(Map.of("status", "generic-only"), usage, usage);
    };

    Map<String, Object> report = RealProviderQualificationMatrix.execute(
        config("openai-compatible"), generic, Duration.ofMillis(100));

    assertThat(report.get("result")).isNotEqualTo("pass");
    assertThat(rows(report)).filteredOn(row -> "pass".equals(row.get("result"))).isEmpty();
    assertThat(rows(report)).allSatisfy(row -> assertThat(((Map<?, ?>) row.get("oracle")).keySet())
        .map(String::valueOf).contains("rowId", "requiredEvidence"));
  }

  @Test
  void redactionCannotPassWithoutFixedCanaryAndNegativeScanEvidence() {
    RealProviderQualificationMatrix.RowTransport missingOracle = (rowId, requestId, deadlineNanos) -> {
      Map<String, Long> usage = Map.of("promptTokens", 1L, "completionTokens", 1L);
      Map<String, Object> observed = rowId.equals("redaction")
          ? Map.of("responseReceived", true, "contentPresent", true)
          : validTestEvidence(rowId);
      return RealProviderQualificationMatrix.RowOutcome.pass(observed, usage, usage);
    };

    Map<String, Object> report = RealProviderQualificationMatrix.execute(
        config("openai-compatible"), missingOracle, Duration.ofMillis(100));
    Map<String, Object> redaction = rows(report).get(12);

    assertThat(redaction.get("result")).isNotEqualTo("pass");
    assertThat(((Map<?, ?>) redaction.get("oracle")).get("requiredEvidence").toString())
        .contains("canary", "negativeScan");
  }

  @Test
  void matrixPassesOnlyOraclesWhoseProvenanceIsAvailableBeforeWriterCloseout() {
    RealProviderQualificationMatrix.RowTransport evidenceTransport = (rowId, requestId, deadlineNanos) -> {
      Map<String, Long> usage = Map.of("promptTokens", 1L, "completionTokens", 1L);
      return RealProviderQualificationMatrix.RowOutcome.pass(validTestEvidence(rowId), usage, usage);
    };

    Map<String, Object> report = RealProviderQualificationMatrix.execute(
        config("openai-compatible"), evidenceTransport, Duration.ofMillis(100));

    assertThat(rows(report)).filteredOn(row -> "pass".equals(row.get("result")))
        .extracting(row -> row.get("id")).containsExactly(
            "openai-compatible-sync", "openai-compatible-usage", "openai-compatible-cost");
    assertThat(report.toString()).doesNotContain(RealProviderQualificationMatrix.redactionCanary());
  }

  @Test
  void declaredStreamSequenceWithoutActualParserCaptureCannotPass() {
    RealProviderQualificationMatrix.RowTransport attacker = (rowId, requestId, deadlineNanos) -> {
      Map<String, Long> usage = Map.of("promptTokens", 1L, "completionTokens", 1L);
      Map<String, Object> observed = rowId.equals("stream")
          ? Map.of("streamObserved", true, "contentPresent", true,
              "observedSequence", List.of("stream-start", "delta", "stream-end"),
              "actualTransportEvents", List.of())
          : Map.of();
      return RealProviderQualificationMatrix.RowOutcome.pass(observed, usage, usage);
    };

    Map<String, Object> report = RealProviderQualificationMatrix.execute(
        config("openai-compatible"), attacker, Duration.ofMillis(100));

    assertThat(rows(report).get(1).get("result")).isEqualTo("blocked");
  }

  private static Map<String, Object> validTestEvidence(String rowId) {
    return switch (rowId) {
      case "sync" -> Map.of("responseReceived", true, "contentPresent", true,
          "observedSequence", List.of("request", "response"));
      case "stream" -> Map.of("streamObserved", true, "contentPresent", true,
          "observedSequence", List.of("stream-start", "delta", "stream-end"));
      case "usage" -> Map.of("usageObserved", true);
      case "cost" -> Map.of("costObserved", true);
      case "redaction" -> Map.of("canaryHash", RealProviderQualificationMatrix.redactionCanaryHash(),
          "negativeScan", true, "scanSurfaces", List.of("response", "capture", "stdout", "stderr", "report"));
      default -> Map.of("status", "unsupported");
    };
  }

  private Map<String, Object> mutableReport(String provider) {
    Map<String, Object> original = RealProviderQualificationMatrix.blockedReport(config(provider), "blocked");
    Map<String, Object> copy = new LinkedHashMap<>(original);
    List<Map<String, Object>> copiedRows = new ArrayList<>();
    rows(original).forEach(row -> copiedRows.add(new LinkedHashMap<>(row)));
    copy.put("rows", copiedRows);
    return copy;
  }

  private RealProviderQualificationConfig config(String provider) {
    return config(provider, 1000, 2);
  }

  private RealProviderQualificationConfig config(String provider, long budget, long outputPrice) {
    java.nio.file.Path path;
    try { path = java.nio.file.Files.createTempDirectory("matrix-test").resolve(provider + ".json"); }
    catch (java.io.IOException e) { throw new RuntimeException(e); }
    java.util.List<String> args = new ArrayList<>(List.of("--real", "--provider", provider, "--endpoint",
        "https://provider.example/v1", "--model", "model-1", "--report-path", path.toString(),
        "--cost-budget-usd-micros", Long.toString(budget), "--max-output-tokens", "64",
        "--input-cost-usd-micros-per-million-tokens", "1", "--output-cost-usd-micros-per-million-tokens", Long.toString(outputPrice)));
    if (provider.equals("anthropic")) args.addAll(List.of("--cache-read-cost-usd-micros-per-million-tokens", "3",
        "--cache-write-cost-usd-micros-per-million-tokens", "4"));
    return RealProviderQualificationConfig.parse(args.toArray(String[]::new), Map.of());
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> rows(Map<String, Object> report) {
    return (List<Map<String, Object>>) report.get("rows");
  }
}
