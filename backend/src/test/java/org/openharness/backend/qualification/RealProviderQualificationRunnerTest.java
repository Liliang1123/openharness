package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RealProviderQualificationRunnerTest {
  @TempDir Path tempDir;

  @Test
  void missingCredentialWritesBlockedReportAndConstructsNoTransport() throws Exception {
    AtomicInteger constructions = new AtomicInteger();
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    Path report = tempDir.resolve("blocked.json");

    int exit = RealProviderQualificationRunner.run(args(report), Map.of(), config -> {
      constructions.incrementAndGet();
      throw new AssertionError("transport must not be constructed");
    }, new PrintStream(stdout), new PrintStream(stderr));

    assertThat(exit).isNotZero();
    assertThat(constructions).hasValue(0);
    Map<?, ?> parsed = new ObjectMapper().readValue(report.toFile(), Map.class);
    assertThat(parsed.get("track")).isEqualTo("production");
    assertThat(parsed.get("result")).isEqualTo("blocked");
    assertThat((java.util.List<?>) parsed.get("rows")).hasSize(13);
    assertThat(stdout.toString(StandardCharsets.UTF_8)).contains("result=blocked").doesNotContain("Authorization");
    assertThat(stderr.toString(StandardCharsets.UTF_8)).doesNotContain("Authorization");
  }

  @Test
  void missingCredentialNeverLeaksCanaryFromUnrelatedEnvironment() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    Path report = tempDir.resolve("blocked-canary.json");
    String canary = "sk-qualification-canary";

    RealProviderQualificationRunner.run(args(report), Map.of("ANTHROPIC_API_KEY", canary), config -> {
      throw new AssertionError("transport must not be constructed");
    }, new PrintStream(stdout), new PrintStream(stderr));

    assertThat(stdout.toString(StandardCharsets.UTF_8)).doesNotContain(canary);
    assertThat(stderr.toString(StandardCharsets.UTF_8)).doesNotContain(canary);
    assertThat(Files.readString(report)).doesNotContain(canary).doesNotContain("Bearer");
  }

  @Test
  void credentialPresentExecutesTypedThirteenRowMatrixAndPublishesReport() throws Exception {
    AtomicInteger constructions = new AtomicInteger();
    AtomicInteger calls = new AtomicInteger();
    Path report = tempDir.resolve("credential-present.json");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    int exit = RealProviderQualificationRunner.run(args(report),
        Map.of("OPENAI_COMPATIBLE_API_KEY", "synthetic-test-credential"), config -> {
          constructions.incrementAndGet();
          return (rowId, requestId, deadlineNanos) -> {
            calls.incrementAndGet();
            Map<String, Long> usage = Map.of("promptTokens", 1L, "completionTokens", 1L);
            return RealProviderQualificationMatrix.RowOutcome.pass(Map.of("status", "fixture"), usage, usage);
          };
        }, new PrintStream(stdout), new PrintStream(stderr));

    assertThat(exit).isNotZero();
    assertThat(constructions).hasValue(1);
    assertThat(calls).hasValue(13);
    Map<?, ?> parsed = new ObjectMapper().readValue(report.toFile(), Map.class);
    assertThat(parsed.get("result")).isEqualTo("blocked");
    assertThat((java.util.List<?>) parsed.get("rows")).hasSize(13);
    assertThat(stdout.toString(StandardCharsets.UTF_8)).contains("result=blocked").doesNotContain("synthetic-test-credential");
    assertThat(stderr.toString(StandardCharsets.UTF_8)).doesNotContain("synthetic-test-credential");
  }

  @Test
  void injectedTransportCannotForgeProductionStreamOrRedactionEvidence() throws Exception {
    Path report = tempDir.resolve("forged-production-evidence.json");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    int exit = RealProviderQualificationRunner.run(args(report),
        Map.of("OPENAI_COMPATIBLE_API_KEY", "synthetic-test-credential"), config ->
          (rowId, requestId, deadlineNanos) -> {
            Map<String, Long> usage = Map.of("promptTokens", 1L, "completionTokens", 1L);
            if (rowId.equals("stream")) {
              QualificationExchangeCapture.merge(requestId, Map.of(
                  "streamParser", "openai-sse", "parserRequestId", requestId,
                  "parserStreamEvents", java.util.List.of("stream-start", "delta", "stream-end"),
                  "streamDeltaCount", 1, "streamMergeComplete", true));
            }
            Map<String, Object> observed = rowId.equals("redaction")
                ? Map.of("_actualResponseSurface", "sanitized response",
                    "_actualCaptureSurface", "sanitized capture")
                : Map.of();
            return RealProviderQualificationMatrix.RowOutcome.pass(observed, usage, usage);
          }, new PrintStream(stdout), new PrintStream(stderr));

    Map<?, ?> parsed = new ObjectMapper().readValue(report.toFile(), Map.class);
    byte[] published = Files.readAllBytes(report);
    java.util.List<?> rows = (java.util.List<?>) parsed.get("rows");
    assertThat(((Map<?, ?>) rows.get(1)).get("result")).isEqualTo("blocked");
    assertThat(((Map<?, ?>) rows.get(12)).get("result")).isEqualTo("blocked");
    assertThat(exit).isEqualTo("pass".equals(parsed.get("result")) ? 0 : 3);
    assertThat(stdout.toString(StandardCharsets.UTF_8))
        .contains("result=" + parsed.get("result"))
        .contains("sha256=" + RealProviderQualificationRunner.sha256(published))
        .doesNotContain("_actualResponseSurface")
        .doesNotContain("_actualCaptureSurface");
    assertThat(Files.readString(report))
        .doesNotContain("_actualResponseSurface")
        .doesNotContain("_actualCaptureSurface");
  }

  private String[] args(Path report) {
    return new String[] {"--real", "--provider", "openai-compatible", "--endpoint", "https://provider.example/v1",
        "--model", "model-1", "--report-path", report.toString(), "--cost-budget-usd-micros", "1000",
        "--max-output-tokens", "64", "--input-cost-usd-micros-per-million-tokens", "1",
        "--output-cost-usd-micros-per-million-tokens", "2"};
  }
}
