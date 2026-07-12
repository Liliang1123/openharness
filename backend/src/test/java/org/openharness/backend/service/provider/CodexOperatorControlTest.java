package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CodexOperatorControlTest {

  @Test
  void statusDelegatesToOfficialCliAndPrintsOnlyWhitelistedMetadata() {
    RecordingRunner runner = new RecordingRunner(0, "access_token=TOKEN-CANARY", "refresh_token=REFRESH-CANARY");
    CodexOperatorControl control = new CodexOperatorControl("codex", true, runner);

    String output = control.execute("status").render();

    assertThat(runner.commands).containsExactly(List.of("codex", "login", "status"));
    assertThat(output).isEqualTo(
        "providerId=openai-codex readiness=ready processState=stopped "
            + "modelAvailability=available needsLogin=false");
    assertThat(output).doesNotContain("TOKEN-CANARY", "REFRESH-CANARY", "access_token", "refresh_token");
  }

  @Test
  void failedStatusMapsToNeedsLoginWithoutLeakingCliOutput() {
    RecordingRunner runner = new RecordingRunner(1, "Bearer TOKEN-CANARY", "authorization failed REFRESH-CANARY");
    CodexOperatorControl control = new CodexOperatorControl("codex", false, runner);

    String output = control.execute("status").render();

    assertThat(output).isEqualTo(
        "providerId=openai-codex readiness=needs_login processState=stopped "
            + "modelAvailability=unavailable needsLogin=true");
    assertThat(output).doesNotContain("TOKEN-CANARY", "REFRESH-CANARY", "Bearer", "authorization");
  }

  @Test
  void loginAndLogoutUseOnlyFixedOfficialCommands() {
    RecordingRunner runner = new RecordingRunner(0, "TOKEN-CANARY", "REFRESH-CANARY");
    CodexOperatorControl control = new CodexOperatorControl("/opt/codex/bin/codex", true, runner);

    assertThat(control.execute("login").render()).contains("needsLogin=false");
    assertThat(control.execute("logout").render()).contains("needsLogin=true");

    assertThat(runner.commands).containsExactly(
        List.of("/opt/codex/bin/codex", "login"),
        List.of("/opt/codex/bin/codex", "logout"));
  }

  @Test
  void rejectsUnknownActionAndUnsafeCommand() {
    RecordingRunner runner = new RecordingRunner(0, "", "");

    assertThatThrownBy(() -> new CodexOperatorControl(" ", true, runner))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Codex command is required");
    CodexOperatorControl control = new CodexOperatorControl("codex", true, runner);
    assertThatThrownBy(() -> control.execute("token"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Supported actions are login, status, and logout");
    assertThat(runner.commands).isEmpty();
  }

  @Test
  void processFailureReturnsFixedUnavailableStatus() {
    CodexOperatorControl control = new CodexOperatorControl(
        "codex",
        true,
        command -> {
          throw new IllegalStateException("Bearer TOKEN-CANARY REFRESH-CANARY");
        });

    String output = control.execute("status").render();

    assertThat(output).isEqualTo(
        "providerId=openai-codex readiness=unavailable processState=unavailable "
            + "modelAvailability=available needsLogin=false");
    assertThat(output).doesNotContain("TOKEN-CANARY", "REFRESH-CANARY", "Bearer");
  }

  @Test
  void statusRecordRejectsValuesOutsideTheNonSecretVocabulary() {
    assertThatThrownBy(() -> new CodexOperatorControl.Status(
        "TOKEN-CANARY", "ready", "stopped", "available", false))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Invalid Codex operator status");
    assertThatThrownBy(() -> new CodexOperatorControl.Status(
        "openai-codex", "REFRESH-CANARY", "stopped", "available", false))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Invalid Codex operator status");
  }

  private static final class RecordingRunner implements CodexOperatorControl.CommandRunner {
    private final int exitCode;
    @SuppressWarnings("unused")
    private final String stdout;
    @SuppressWarnings("unused")
    private final String stderr;
    private final List<List<String>> commands = new ArrayList<>();

    private RecordingRunner(int exitCode, String stdout, String stderr) {
      this.exitCode = exitCode;
      this.stdout = stdout;
      this.stderr = stderr;
    }

    @Override
    public int run(List<String> command) {
      commands.add(List.copyOf(command));
      return exitCode;
    }
  }
}
