package org.openharness.backend.service.provider;

import java.io.IOException;
import java.io.PrintStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/** Local operator command surface that delegates authentication ownership to the official Codex CLI. */
public final class CodexOperatorCommand {
  private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
  private static final Duration LOGIN_TIMEOUT = Duration.ofMinutes(5);
  private static final Pattern SAFE_PROVIDER_ID = Pattern.compile("[A-Za-z0-9._-]{1,128}");

  @FunctionalInterface
  public interface ProcessInvoker {
    ProcessResult invoke(List<String> command) throws IOException, InterruptedException;
  }

  @FunctionalInterface
  interface ProcessLauncher {
    Process launch(ProcessBuilder builder) throws IOException;
  }

  public record ProcessResult(int exitCode) {
    public ProcessResult {
      if (exitCode < 0) {
        throw new IllegalArgumentException("exitCode must be non-negative");
      }
    }
  }

  private final ProviderConfig providerConfig;
  private final Supplier<CodexProcessSupervisor.StateSnapshot> snapshotSource;
  private final ProcessInvoker processInvoker;

  public CodexOperatorCommand(
      ProviderConfig providerConfig,
      CodexProcessSupervisor supervisor) {
    this(providerConfig, supervisor::snapshot, processInvoker(ProcessBuilder::start));
  }

  CodexOperatorCommand(
      ProviderConfig providerConfig,
      Supplier<CodexProcessSupervisor.StateSnapshot> snapshotSource,
      ProcessInvoker processInvoker) {
    this.providerConfig = requireCodexProvider(providerConfig);
    this.snapshotSource = Objects.requireNonNull(snapshotSource, "snapshotSource");
    this.processInvoker = Objects.requireNonNull(processInvoker, "processInvoker");
  }

  public int execute(String operation, PrintStream output) throws IOException, InterruptedException {
    Objects.requireNonNull(output, "output");
    return switch (operation) {
      case "login", "logout" -> delegate(operation, output);
      case "status" -> status(output);
      default -> throw new IllegalArgumentException(
          "supported Codex operator commands are login, status, and logout");
    };
  }

  private int delegate(String operation, PrintStream output) throws IOException, InterruptedException {
    ProcessResult result = processInvoker.invoke(command(operation));
    output.println("operation=" + operation);
    output.println("result=" + (result.exitCode() == 0 ? "delegated" : "failed"));
    return result.exitCode();
  }

  private int status(PrintStream output) throws IOException, InterruptedException {
    ProcessResult authStatus = processInvoker.invoke(command("login", "status"));
    CodexProcessSupervisor.State state = snapshotSource.get().state();
    boolean needsLogin = authStatus.exitCode() != 0;
    boolean ready = state == CodexProcessSupervisor.State.READY && !needsLogin;
    String modelAvailability = ready && !providerConfig.models().isEmpty()
        ? "available"
        : "unavailable";

    output.println("providerId=" + providerConfig.name());
    output.println("readiness=" + (ready ? "ready" : "unavailable"));
    output.println("processState=" + state.name());
    output.println("modelAvailability=" + modelAvailability);
    output.println("needsLogin=" + needsLogin);
    return ready && !providerConfig.models().isEmpty() ? 0 : 1;
  }

  private List<String> command(String... args) {
    List<String> command = new ArrayList<>();
    command.add(providerConfig.command());
    command.addAll(List.of(args));
    return List.copyOf(command);
  }

  static ProcessInvoker processInvoker(ProcessLauncher launcher) {
    Objects.requireNonNull(launcher, "launcher");
    return command -> {
      ProcessBuilder builder = new ProcessBuilder(command);
      builder.redirectInput(ProcessBuilder.Redirect.INHERIT);
      builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
      builder.redirectError(ProcessBuilder.Redirect.DISCARD);
      Process process = launcher.launch(builder);
      Duration timeout = command.size() == 2 && "login".equals(command.get(1))
          ? LOGIN_TIMEOUT
          : DEFAULT_TIMEOUT;
      if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
        process.destroy();
        if (!process.waitFor(1, TimeUnit.SECONDS)) {
          process.destroyForcibly();
        }
        return new ProcessResult(1);
      }
      return new ProcessResult(process.exitValue());
    };
  }

  private static ProviderConfig requireCodexProvider(ProviderConfig providerConfig) {
    Objects.requireNonNull(providerConfig, "providerConfig");
    if (!"codex-app-server".equals(providerConfig.type())
        || providerConfig.name() == null
        || !SAFE_PROVIDER_ID.matcher(providerConfig.name()).matches()
        || providerConfig.command() == null
        || providerConfig.command().isBlank()) {
      throw new IllegalArgumentException(
          "a codex-app-server provider with a safe provider id and command is required");
    }
    return providerConfig;
  }
}
