package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class QualificationReportPromoterTest {
  @TempDir
  Path providerDir;

  @Test
  void loopbackPromotionExercisesRetryOncePerProviderInSameProcess() throws Exception {
    QualificationReportPromoter.PromoterRunResult result =
        QualificationReportPromoter.generateReportsWithLoopbackServer("fake-key");

    assertThat(result.retryHitCounts())
        .containsEntry("openai:matrix-retry", 2)
        .containsEntry("anthropic:matrix-retry", 2);
    assertThat(result.reports().get("2026-07-06-openai-compatible-local.json").get("result"))
        .isEqualTo("local_verified");
    assertThat(result.reports().get("2026-07-06-anthropic-local.json").get("result"))
        .isEqualTo("local_verified");
  }

  @Test
  void overwriteRequiresExpectedOldHashAndAppendsAuditRecord() throws Exception {
    Path reportPath = providerDir.resolve("report.json");
    Files.writeString(reportPath, "{\"previous\":true}\n", StandardCharsets.UTF_8);
    String oldSha = sha256(reportPath);
    Map<String, Object> report = validReport("openai-sync");

    assertThatThrownBy(() -> QualificationReportPromoter.promoteReport(
        providerDir,
        "report.json",
        report,
        new QualificationReportPromoter.PromotionOptions(
            true,
            Map.of("report.json", "0".repeat(64)),
            "refresh local fake-provider evidence")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("old SHA-256 mismatch");
    assertThat(Files.readString(reportPath)).isEqualTo("{\"previous\":true}\n");

    QualificationReportPromoter.PromotionResult promoted = QualificationReportPromoter.promoteReport(
        providerDir,
        "report.json",
        report,
        new QualificationReportPromoter.PromotionOptions(
            true,
            Map.of("report.json", oldSha),
            "refresh local fake-provider evidence"));

    assertThat(promoted.oldSha256()).isEqualTo(oldSha);
    assertThat(promoted.newSha256()).isEqualTo(sha256(reportPath));
    assertThat(providerDir.resolve("qualification-report-promotion-audit.jsonl"))
        .content(StandardCharsets.UTF_8)
        .contains("\"file\":\"report.json\"")
        .contains("\"oldSha256\":\"" + oldSha + "\"")
        .contains("\"newSha256\":\"" + promoted.newSha256() + "\"")
        .contains("refresh local fake-provider evidence");
  }

  @Test
  void invalidReportIsRejectedBeforeReplacingExistingEvidence() throws Exception {
    Path reportPath = providerDir.resolve("report.json");
    Files.writeString(reportPath, "{\"previous\":true}\n", StandardCharsets.UTF_8);
    String oldSha = sha256(reportPath);
    Map<String, Object> invalid = validReport("openai-sync");
    invalid.put("result", "local_verified");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) invalid.get("rows");
    rows.get(0).put("result", "blocked");

    assertThatThrownBy(() -> QualificationReportPromoter.promoteReport(
        providerDir,
        "report.json",
        invalid,
        new QualificationReportPromoter.PromotionOptions(
            true,
            Map.of("report.json", oldSha),
            "try invalid evidence")))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("required blocked or failed rows prevent overall local_verified");

    assertThat(Files.readString(reportPath)).isEqualTo("{\"previous\":true}\n");
    assertThat(providerDir.resolve("qualification-report-promotion-audit.jsonl")).doesNotExist();
  }

  private static Map<String, Object> validReport(String rowId) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rowId);
    row.put("required", true);
    row.put("track", "local");
    row.put("environment", Map.of("transport", "loopback-fake-server"));
    row.put("protocolVersion", "openai-chat-completions");
    row.put("capabilities", List.of("sync"));
    row.put("requestHash", "a".repeat(64));
    row.put("observed", Map.of("content", "ok"));
    row.put("oracle", Map.of("content", "ok"));
    row.put("durationMs", 1);
    row.put("result", "pass");

    Map<String, Object> report = new LinkedHashMap<>();
    report.put("track", "local");
    report.put("generatedAt", "2026-07-06T08:00:00.000Z");
    report.put("result", "local_verified");
    report.put("rows", new java.util.ArrayList<>(List.of(row)));
    return report;
  }

  private static String sha256(Path path) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    byte[] hash = digest.digest(Files.readAllBytes(path));
    StringBuilder hex = new StringBuilder();
    for (byte b : hash) {
      String value = Integer.toHexString(0xff & b);
      if (value.length() == 1) hex.append('0');
      hex.append(value);
    }
    return hex.toString();
  }
}
