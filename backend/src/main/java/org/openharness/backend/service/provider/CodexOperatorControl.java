package org.openharness.backend.service.provider;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

/** Local operator boundary for delegating authentication lifecycle to the official Codex CLI. */
public final class CodexOperatorControl {

  static final String PROVIDER_ID = "openai-codex";

  @FunctionalInterface
  interface CommandRunner {
    int run(List<String> command) throws Exception;
  }

  public record Status(
      String providerId,
      String readiness,
      String processState,
      String modelAvailability,
      boolean needsLogin) {

    public Status {
      boolean valid = PROVIDER_ID.equals(providerId)
          && List.of("ready", "needs_login", "unavailable").contains(readiness)
          && List.of("stopped", "unavailable").contains(processState)
          && List.of("available", "unavailable").contains(modelAvailability)
          && needsLogin == "needs_login".equals(readiness);
      if (!valid) {
        throw new IllegalArgumentException("Invalid Codex operator status");
      }
    }

    public String render() {
      return "providerId=" + providerId
          + " readiness=" + readiness
          + " processState=" + processState
          + " modelAvailability=" + modelAvailability
          + " needsLogin=" + needsLogin;
    }
  }

  private final String command;
  private final boolean modelAvailable;
  private final CommandRunner runner;

  CodexOperatorControl(String command, boolean modelAvailable, CommandRunner runner) {
    if (command == null || command.isBlank()) {
      throw new IllegalArgumentException("Codex command is required");
    }
    this.command = command;
    this.modelAvailable = modelAvailable;
    this.runner = Objects.requireNonNull(runner, "runner");
  }

  public CodexOperatorControl(String command, boolean modelAvailable) {
    this(command, modelAvailable, new ProcessCommandRunner(Duration.ofMinutes(5)));
  }

  public Status execute(String requestedAction) {
    String action = requestedAction == null
        ? ""
        : requestedAction.toLowerCase(Locale.ROOT);
    List<String> invocation = switch (action) {
      case "login" -> List.of(command, "login");
      case "status" -> List.of(command, "login", "status");
      case "logout" -> List.of(command, "logout");
      default -> throw new IllegalArgumentException(
          "Supported actions are login, status, and logout");
    };

    try {
      int exitCode = runner.run(invocation);
      return statusFor(action, exitCode == 0);
    } catch (Exception failure) {
      if (failure instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      return new Status(
          PROVIDER_ID,
          "unavailable",
          "unavailable",
          modelAvailability(),
          false);
    }
  }

  private Status statusFor(String action, boolean success) {
    if ("logout".equals(action) && success) {
      return new Status(PROVIDER_ID, "needs_login", "stopped", modelAvailability(), true);
    }
    if (success) {
      return new Status(PROVIDER_ID, "ready", "stopped", modelAvailability(), false);
    }
    return new Status(PROVIDER_ID, "needs_login", "stopped", modelAvailability(), true);
  }

  private String modelAvailability() {
    return modelAvailable ? "available" : "unavailable";
  }

  public static void main(String[] args) {
    if (args.length != 1) {
      System.err.println("Usage: CodexOperatorControl <login|status|logout>");
      System.exit(2);
      return;
    }
    String configuredCommand = System.getenv().getOrDefault("OPENHARNESS_CODEX_COMMAND", "codex");
    boolean configuredModel = Boolean.parseBoolean(
        System.getenv().getOrDefault("OPENHARNESS_CODEX_MODEL_AVAILABLE", "true"));
    Status status = new CodexOperatorControl(configuredCommand, configuredModel).execute(args[0]);
    System.out.println(status.render());
  }

  private static final class ProcessCommandRunner implements CommandRunner {
    private final Duration timeout;

    private ProcessCommandRunner(Duration timeout) {
      this.timeout = timeout;
    }

    @Override
    public int run(List<String> command) throws Exception {
      Process process = new ProcessBuilder(command)
          .redirectInput(ProcessBuilder.Redirect.INHERIT)
          .redirectOutput(ProcessBuilder.Redirect.DISCARD)
          .redirectError(ProcessBuilder.Redirect.DISCARD)
          .start();
      if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
        process.destroy();
        if (!process.waitFor(2, TimeUnit.SECONDS)) {
          process.destroyForcibly();
        }
        throw new IllegalStateException("Codex operator command timed out");
      }
      return process.exitValue();
    }
  }
}
