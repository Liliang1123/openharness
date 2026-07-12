package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CodexFakeProviderMatrixTest {
  @Test
  void runsDeterministicContractMatrixButKeepsRealOauthBlocked() throws Exception {
    Map<String, Object> report = new CodexFakeProviderMatrix().run();

    assertThat(report).containsEntry("track", "local").containsEntry("result", "blocked");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) report.get("rows");
    assertThat(rows).extracting(row -> row.get("id")).containsExactly(
        "codex-handshake-no-fallback", "codex-sync", "codex-stream", "codex-reasoning",
        "codex-usage", "codex-pending", "codex-sequential", "codex-cancellation",
        "codex-approval-timeout", "codex-replay-conflict", "codex-restart-orphan",
        "codex-auth-failure", "codex-malformed", "codex-real-oauth-login");
    assertThat(rows.subList(0, rows.size() - 1)).allMatch(row -> "pass".equals(row.get("result")));
    assertThat(rows.getLast()).containsEntry("result", "blocked");
    assertThat(rows.getLast().get("observed").toString()).contains("needs_login");

    var output = Files.createTempDirectory("codex-fake-matrix");
    QualificationReportPromoter.promoteReport(
        output, "codex-fake.json", report,
        new QualificationReportPromoter.PromotionOptions(false, Map.of(), null));
    String serialized = new ObjectMapper().writeValueAsString(report);
    assertThat(serialized).doesNotContain(
        "AUTH-CANARY", "ARG-CANARY", "RESULT-CANARY", "BRIDGE-CANARY", "Bearer ", "accessToken", "refreshToken");

    @SuppressWarnings("unchecked")
    Map<String, Object> immutable = new ObjectMapper().readValue(
        Path.of("..", "docs", "verification", "agent-runtime-v1", "providers",
            "2026-07-12-codex-app-server-fake.json").toFile(),
        Map.class);
    var immutableOutput = Files.createTempDirectory("codex-fake-immutable");
    QualificationReportPromoter.promoteReport(
        immutableOutput, "codex-fake.json", immutable,
        new QualificationReportPromoter.PromotionOptions(false, Map.of(), null));
    assertThat(immutable).containsEntry("result", "blocked");
    assertThat(new ObjectMapper().writeValueAsString(immutable)).doesNotContain(
        "AUTH-CANARY", "ARG-CANARY", "RESULT-CANARY", "Bearer ", "accessToken", "refreshToken");
  }
}
