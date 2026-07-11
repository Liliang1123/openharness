package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.PrintStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.openharness.backend.service.provider.CodexProcessSupervisor.State;
import org.openharness.backend.service.provider.CodexProcessSupervisor.StateSnapshot;

class CodexOperatorCommandTest {
  private static final String SECRET_CANARY = "Bearer oauth-secret-canary";

  @Test
  void statusPrintsOnlyTheApprovedFiveFields() throws Exception {
    RecordingInvoker invoker = new RecordingInvoker(0, SECRET_CANARY);
    CodexOperatorCommand command = command(invoker, State.READY, List.of("gpt-5", "gpt-5-mini"));
    ByteArrayOutputStream output = new ByteArrayOutputStream();

    int exitCode = command.execute("status", new PrintStream(output, true, StandardCharsets.UTF_8));

    assertThat(exitCode).isZero();
    assertThat(output.toString(StandardCharsets.UTF_8)).isEqualTo("""
        providerId=openai-codex
        readiness=ready
        processState=READY
        modelAvailability=available
        needsLogin=false
        """);
    assertThat(output.toString(StandardCharsets.UTF_8)).doesNotContain(SECRET_CANARY);
    assertThat(invoker.commands).containsExactly(List.of("codex", "login", "status"));
  }

  @Test
  void failedOfficialStatusReportsNeedsLoginWithoutLeakingChildOutput() throws Exception {
    RecordingInvoker invoker = new RecordingInvoker(1, SECRET_CANARY);
    CodexOperatorCommand command = command(invoker, State.READY, List.of("gpt-5"));
    ByteArrayOutputStream output = new ByteArrayOutputStream();

    int exitCode = command.execute("status", new PrintStream(output, true, StandardCharsets.UTF_8));

    assertThat(exitCode).isEqualTo(1);
    assertThat(output.toString(StandardCharsets.UTF_8)).contains(
        "readiness=unavailable",
        "processState=READY",
        "modelAvailability=unavailable",
        "needsLogin=true");
    assertThat(output.toString(StandardCharsets.UTF_8)).doesNotContain(SECRET_CANARY);
  }

  @Test
  void loginAndLogoutDelegateToOfficialCodexWithoutReprintingOutput() throws Exception {
    RecordingInvoker invoker = new RecordingInvoker(0, SECRET_CANARY);
    CodexOperatorCommand command = command(invoker, State.STOPPED, List.of("gpt-5"));
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    PrintStream printStream = new PrintStream(output, true, StandardCharsets.UTF_8);

    assertThat(command.execute("login", printStream)).isZero();
    assertThat(command.execute("logout", printStream)).isZero();

    assertThat(invoker.commands).containsExactly(
        List.of("codex", "login"),
        List.of("codex", "logout"));
    assertThat(output.toString(StandardCharsets.UTF_8)).isEqualTo("""
        operation=login
        result=delegated
        operation=logout
        result=delegated
        """);
    assertThat(output.toString(StandardCharsets.UTF_8)).doesNotContain(SECRET_CANARY);
  }

  @Test
  void unknownOperationFailsClosedWithoutLaunchingAProcess() {
    RecordingInvoker invoker = new RecordingInvoker(0, "ignored");
    CodexOperatorCommand command = command(invoker, State.STOPPED, List.of("gpt-5"));

    assertThatThrownBy(() -> command.execute("whoami", System.out))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("supported Codex operator commands are login, status, and logout");
    assertThat(invoker.commands).isEmpty();
  }

  @Test
  void nonReadySupervisorCannotReportModelAvailability() throws Exception {
    RecordingInvoker invoker = new RecordingInvoker(0, "synthetic status");
    CodexOperatorCommand command = command(invoker, State.DEGRADED, List.of("gpt-5"));
    ByteArrayOutputStream output = new ByteArrayOutputStream();

    int exitCode = command.execute("status", new PrintStream(output, true, StandardCharsets.UTF_8));

    assertThat(exitCode).isEqualTo(1);
    assertThat(output.toString(StandardCharsets.UTF_8)).contains(
        "readiness=unavailable",
        "processState=DEGRADED",
        "modelAvailability=unavailable",
        "needsLogin=false");
  }

  @Test
  void statusNeverPrintsConfiguredModelNamesOrInjectedLines() throws Exception {
    RecordingInvoker invoker = new RecordingInvoker(0, SECRET_CANARY);
    CodexOperatorCommand command = command(
        invoker,
        State.READY,
        List.of("gpt-5\naccessToken=synthetic-secret"));
    ByteArrayOutputStream output = new ByteArrayOutputStream();

    int exitCode = command.execute("status", new PrintStream(output, true, StandardCharsets.UTF_8));

    assertThat(exitCode).isZero();
    assertThat(output.toString(StandardCharsets.UTF_8)).contains("modelAvailability=available");
    assertThat(output.toString(StandardCharsets.UTF_8)).doesNotContain(
        "gpt-5",
        "accessToken",
        "synthetic-secret");
    assertThat(output.toString(StandardCharsets.UTF_8).lines()).hasSize(5);
  }

  @Test
  void defaultProcessBoundaryDiscardsSyntheticChildOutputWithoutReadingIt() throws Exception {
    AtomicReference<ProcessBuilder> observedBuilder = new AtomicReference<>();
    SyntheticProcess process = new SyntheticProcess(SECRET_CANARY);
    CodexOperatorCommand.ProcessInvoker invoker = CodexOperatorCommand.processInvoker(builder -> {
      observedBuilder.set(builder);
      return process;
    });

    CodexOperatorCommand.ProcessResult result = invoker.invoke(List.of("codex", "login", "status"));

    assertThat(result.exitCode()).isZero();
    assertThat(observedBuilder.get().redirectOutput()).isEqualTo(ProcessBuilder.Redirect.DISCARD);
    assertThat(observedBuilder.get().redirectError()).isEqualTo(ProcessBuilder.Redirect.DISCARD);
    assertThat(process.outputRead).isFalse();
    assertThat(process.errorRead).isFalse();
  }

  @Test
  void rejectsProviderIdsThatCouldInjectAdditionalStatusFields() {
    ProviderConfig config = new ProviderConfig(
        "openai-codex\naccessToken=synthetic-secret",
        "codex-app-server",
        null,
        null,
        List.of("gpt-5"),
        Map.of(),
        "codex",
        List.of("app-server"),
        "stdio://");
    StateSnapshot snapshot = new StateSnapshot(
        State.READY, null, null, Instant.EPOCH, Instant.EPOCH, 0, 0, 0);

    assertThatThrownBy(() -> new CodexOperatorCommand(
        config,
        () -> snapshot,
        new RecordingInvoker(0, SECRET_CANARY)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("safe provider id");
  }

  private static CodexOperatorCommand command(
      RecordingInvoker invoker,
      State state,
      List<String> models) {
    ProviderConfig config = new ProviderConfig(
        "openai-codex",
        "codex-app-server",
        null,
        null,
        models,
        Map.of(),
        "codex",
        List.of("app-server"),
        "stdio://");
    StateSnapshot snapshot = new StateSnapshot(
        state,
        null,
        null,
        Instant.EPOCH,
        state == State.READY ? Instant.EPOCH : null,
        0,
        0,
        0);
    return new CodexOperatorCommand(config, () -> snapshot, invoker);
  }

  private static final class RecordingInvoker implements CodexOperatorCommand.ProcessInvoker {
    private final int exitCode;
    private final String syntheticOutput;
    private final List<List<String>> commands = new ArrayList<>();

    private RecordingInvoker(int exitCode, String syntheticOutput) {
      this.exitCode = exitCode;
      this.syntheticOutput = syntheticOutput;
    }

    @Override
    public CodexOperatorCommand.ProcessResult invoke(List<String> command) {
      commands.add(List.copyOf(command));
      assertThat(syntheticOutput).isNotBlank();
      return new CodexOperatorCommand.ProcessResult(exitCode);
    }
  }

  private static final class SyntheticProcess extends Process {
    private final byte[] canary;
    private final AtomicBoolean alive = new AtomicBoolean();
    private boolean outputRead;
    private boolean errorRead;

    private SyntheticProcess(String canary) {
      this.canary = canary.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public OutputStream getOutputStream() {
      return OutputStream.nullOutputStream();
    }

    @Override
    public InputStream getInputStream() {
      outputRead = true;
      return new ByteArrayInputStream(canary);
    }

    @Override
    public InputStream getErrorStream() {
      errorRead = true;
      return new ByteArrayInputStream(canary);
    }

    @Override
    public int waitFor() {
      return 0;
    }

    @Override
    public boolean waitFor(long timeout, TimeUnit unit) {
      return true;
    }

    @Override
    public int exitValue() {
      return 0;
    }

    @Override
    public void destroy() {
      alive.set(false);
    }

    @Override
    public Process destroyForcibly() {
      alive.set(false);
      return this;
    }

    @Override
    public boolean isAlive() {
      return alive.get();
    }
  }
}
