package org.openharness.backend.model;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.model.Contracts.CodexTurnCancelRequest;
import org.openharness.backend.model.Contracts.PendingCodexTurn;

class ContractsTest {

  @Test
  void canonicalNumbersMatchEcmaScriptBoundarySpellings() {
    String[] canonical = {
        "5e-324",
        "-5e-324",
        "1e-323",
        "-1e-323",
        "5e-323",
        "-5e-323",
        "6e-323",
        "-6e-323",
        "7e-323",
        "-7e-323",
        "8e-323",
        "-8e-323",
        "9e-323",
        "-9e-323",
        "1e-320",
        "-1e-320",
        "2.2250738585072014e-308",
        "1e-7",
        "0.000001",
        "100000000000000000000",
        "1e+21",
        "1.7976931348623157e+308",
        "333333333.3333333",
        "1e+23"
    };
    String[] nonCanonical = {
        "4.9e-324",
        "-4.9e-324",
        "1.0e-320",
        "-1.0e-320",
        "0.0000001",
        "1e-6",
        "1e20",
        "1000000000000000000000",
        "1.0e+21",
        "1.79769313486231570e+308",
        "333333333.33333329",
        "9.999999999999999e+22"
    };

    for (String number : canonical) newPendingWithNumber(number);
    for (String number : nonCanonical) {
      assertThatThrownBy(() -> newPendingWithNumber(number))
          .as(number)
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void acceptsDeterministicEcmaScriptNumberCorpusAndRejectsEveryTwin() throws IOException {
    int checked = 0;
    int rejected = 0;
    try (BufferedReader fixture = new BufferedReader(new InputStreamReader(
        getClass().getResourceAsStream("/ecmascript-canonical-numbers.tsv"), StandardCharsets.UTF_8))) {
      for (String line; (line = fixture.readLine()) != null;) {
        if (line.isBlank() || line.startsWith("#")) continue;
        String[] columns = line.split(" ", 2);
        String canonical = columns[1];
        newPendingWithNumber(canonical);
        checked++;
        assertThatThrownBy(() -> newPendingWithNumber(nonCanonicalNumberTwin(canonical)))
            .as(columns[0])
            .isInstanceOf(IllegalArgumentException.class);
        rejected++;
      }
    }

    org.assertj.core.api.Assertions.assertThat(checked).isEqualTo(1_034);
    org.assertj.core.api.Assertions.assertThat(rejected).isEqualTo(1_034);
  }

  @Test
  void pendingCodexTurnEnforcesWireContractBounds() {
    new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"value\":1}",
        "2026-07-11T10:00:00Z");
    new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"value\":1}",
        "2026-07-11T10:00:00.123Z");
    new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo",
        "{\"10\":\"ten\",\"2\":\"two\",\"emoji\":\"😀\",\"nested\":[{\"x\":true}]}",
        "2026-07-11T10:00:00Z");

    assertThatThrownBy(() -> new PendingCodexTurn(
        "", "thread-001", "turn-001", "call-001", "echo", "{}", "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "x".repeat(257), "{}",
        "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"z\":1,\"a\":2}",
        "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"value\":-0}",
        "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"a\":1,\"a\":2}",
        "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"bad\":\"\\ud800\"}",
        "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{\"overflow\":1e400}",
        "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo",
        "{\"value\":" + "[".repeat(129) + "0" + "]".repeat(129) + "}",
        "2026-07-11T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{}",
        "2026-07-11T18:00:00+08:00"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{}",
        "2026-07-11T10:00:00.1Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{}",
        "2026-02-30T10:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{}",
        "2026-07-11T24:00:00Z"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "echo", "{}",
        "2026-07-11T23:59:60Z"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void toolResultSubmissionEnforcesIdentifiersStatusAndContentBounds() {
    new CodexToolResultSubmission(
        "req-001", "conv-001", "thread-001", "turn-001", "call-001", "idem-001", "ok", "");

    assertThatThrownBy(() -> new CodexToolResultSubmission(
        "", "conv-001", "thread-001", "turn-001", "call-001", "idem-001", "ok", "value"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new CodexToolResultSubmission(
        "req-001", "conv-001", "thread-001", "turn-001", "call-001", "idem-001", "cancelled", "value"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new CodexToolResultSubmission(
        "req-001", "conv-001", "thread-001", "turn-001", "call-001", "idem-001", "ok",
        "x".repeat(65_537)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new CodexToolResultSubmission(
        "req-001", "conv-001", "thread-001", "turn-001", "call-001", "idem-001", "ok", null))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void cancelRequestEnforcesIdentifierBounds() {
    new CodexTurnCancelRequest("req-001", "conv-001", "thread-001", "turn-001", "call-001");

    assertThatThrownBy(() -> new CodexTurnCancelRequest(
        "req-001", "conv-001", "thread-001", "turn-001", "x".repeat(257)))
        .isInstanceOf(IllegalArgumentException.class);
  }

  private PendingCodexTurn newPendingWithNumber(String number) {
    return new PendingCodexTurn(
        "bridge-001", "thread-001", "turn-001", "call-001", "number_probe",
        "{\"value\":" + number + "}", "2026-07-11T10:00:00Z");
  }

  private String nonCanonicalNumberTwin(String canonical) {
    int exponent = canonical.indexOf('e');
    if (exponent >= 0) {
      String coefficient = canonical.substring(0, exponent);
      return (coefficient.contains(".") ? coefficient + "0" : coefficient + ".0")
          + canonical.substring(exponent);
    }
    return canonical.contains(".") ? canonical + "0" : canonical + ".0";
  }
}
