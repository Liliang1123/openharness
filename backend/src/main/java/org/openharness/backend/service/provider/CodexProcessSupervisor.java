package org.openharness.backend.service.provider;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class CodexProcessSupervisor {

  public enum State {
    STOPPED,
    STARTING,
    READY,
    DEGRADED,
    UNAVAILABLE,
    SHUTDOWN
  }

  public record StateSnapshot(
      State state,
      Integer pid,
      Integer exitCode,
      Instant startedAt,
      Instant readyAt,
      int restarts,
      long startupMs,
      long readyLatencyMs) {}

  @FunctionalInterface
  public interface ProcessLauncher {
    Process launch(String command, List<String> args) throws IOException;
  }

  @FunctionalInterface
  public interface ReadinessProbe {
    void waitUntilReady(Process process, Duration timeout) throws Exception;
  }

  @FunctionalInterface
  public interface Sleeper {
    void sleep(Duration duration) throws InterruptedException;
  }

  private static final Duration DEFAULT_STARTUP_TIMEOUT = Duration.ofSeconds(2);
  private static final Duration DEFAULT_SHUTDOWN_TIMEOUT = Duration.ofSeconds(1);
  private static final int DEFAULT_MAX_RESTARTS = 2;
  private static final Duration DEFAULT_RESTART_BACKOFF = Duration.ofMillis(250);

  private final ProviderConfig providerConfig;
  private final ProcessLauncher launcher;
  private final ReadinessProbe readinessProbe;
  private final Sleeper sleeper;
  private final Duration startupTimeout;
  private final Duration shutdownTimeout;
  private final int maxRestarts;
  private final Duration restartBackoff;

  private final Object lock = new Object();
  private CompletableFuture<Void> readySignal = new CompletableFuture<>();

  private volatile State state = State.STOPPED;
  private volatile Process process;
  private volatile Integer pid;
  private volatile Integer exitCode;
  private volatile Instant startedAt;
  private volatile Instant readyAt;
  private volatile int restartCount;
  private volatile Thread monitorThread;
  private volatile Thread stderrThread;
  private volatile boolean stopping;
  private volatile CodexAppServerClient client;

  public CodexProcessSupervisor(ProviderConfig providerConfig) {
    this(
        providerConfig,
        CodexProcessSupervisor::defaultLauncher,
        CodexProcessSupervisor::defaultProbe,
        DEFAULT_STARTUP_TIMEOUT,
        DEFAULT_SHUTDOWN_TIMEOUT,
        DEFAULT_MAX_RESTARTS,
        DEFAULT_RESTART_BACKOFF,
        Thread::sleep);
  }

  public CodexProcessSupervisor(
      ProviderConfig providerConfig,
      ProcessLauncher launcher,
      ReadinessProbe readinessProbe,
      Duration startupTimeout,
      Duration shutdownTimeout,
      int maxRestarts,
      Duration restartBackoff) {
    this(
        providerConfig,
        launcher,
        readinessProbe,
        startupTimeout,
        shutdownTimeout,
        maxRestarts,
        restartBackoff,
        Thread::sleep);
  }

  public CodexProcessSupervisor(
      ProviderConfig providerConfig,
      ProcessLauncher launcher,
      ReadinessProbe readinessProbe,
      Duration startupTimeout,
      Duration shutdownTimeout,
      int maxRestarts,
      Duration restartBackoff,
      Sleeper sleeper) {
    this.providerConfig = Objects.requireNonNull(providerConfig, "providerConfig");
    this.launcher = Objects.requireNonNull(launcher, "launcher");
    this.readinessProbe = Objects.requireNonNull(readinessProbe, "readinessProbe");
    this.sleeper = Objects.requireNonNull(sleeper, "sleeper");
    this.startupTimeout = requirePositive(startupTimeout, "startupTimeout");
    this.shutdownTimeout = requirePositive(shutdownTimeout, "shutdownTimeout");
    this.maxRestarts = requireNonNegative(maxRestarts, "maxRestarts");
    this.restartBackoff = requireNonNegative(restartBackoff, "restartBackoff");
    ensureLocalEndpoint(providerConfig.endpoint());
  }

  public State state() {
    return state;
  }

  public StateSnapshot snapshot() {
    long startupMs = startedAt == null ? 0L : System.currentTimeMillis() - startedAt.toEpochMilli();
    long readyLatencyMs = (readyAt == null || startedAt == null)
        ? 0L
        : Math.max(0L, readyAt.toEpochMilli() - startedAt.toEpochMilli());
    return new StateSnapshot(
        state,
        pid,
        exitCode,
        startedAt,
        readyAt,
        restartCount,
        startupMs,
        readyLatencyMs);
  }

  public CodexAppServerClient openClient(Duration requestTimeout) {
    synchronized (lock) {
      if (state != State.READY || process == null || !process.isAlive()) {
        throw new IllegalStateException("Codex process is not ready");
      }
      if (!"stdio://".equals(providerConfig.endpoint())) {
        throw new IllegalStateException("Codex transport is unavailable");
      }
      if (client != null) {
        throw new IllegalStateException("Codex process client already opened");
      }
      client = new CodexAppServerClient(process.getInputStream(), process.getOutputStream(), requestTimeout);
      return client;
    }
  }

  public void start() {
    synchronized (lock) {
      if (state == State.STARTING || state == State.READY || state == State.DEGRADED) {
        throw new IllegalStateException("Supervisor already started");
      }
      readySignal = new CompletableFuture<>();
      stopping = false;
      state = State.STARTING;
      restartCount = 0;
      exitCode = null;
      startedAt = null;
      readyAt = null;
      pid = null;
      monitorThread = new Thread(this::runMonitor, "openharness-codex-process-supervisor");
      monitorThread.setDaemon(true);
      monitorThread.start();
    }

    try {
      readySignal.get(startupTimeout.toMillis(), TimeUnit.MILLISECONDS);
    } catch (TimeoutException timeout) {
      stop();
      state = State.UNAVAILABLE;
      throw new IllegalStateException("Codex process start timeout", timeout);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      stop();
      state = State.UNAVAILABLE;
      throw new IllegalStateException("Codex process start interrupted", interrupted);
    } catch (Exception failure) {
      stop();
      Throwable cause = failure.getCause() == null ? failure : failure.getCause();
      state = State.UNAVAILABLE;
      if (cause instanceof RuntimeException runtime) {
        throw runtime;
      }
      throw new IllegalStateException("Codex process failed to become ready", cause);
    }
  }

  public void stop() {
    synchronized (lock) {
      stopping = true;
      if (state == State.STOPPED) {
        return;
      }
      state = State.SHUTDOWN;
      readySignal.completeExceptionally(new IllegalStateException("Stopped"));
    }

    Process runningProcess = process;
    closeClient();
    if (runningProcess != null) {
      terminate(runningProcess);
    }

    Thread currentMonitor = monitorThread;
    if (currentMonitor != null) {
      currentMonitor.interrupt();
      try {
        currentMonitor.join(shutdownTimeout.toMillis());
      } catch (InterruptedException exception) {
        Thread.currentThread().interrupt();
      }
    }
    Thread currentStderr = stderrThread;
    if (currentStderr != null) currentStderr.interrupt();

    clearStreams(runningProcess);
    state = State.STOPPED;
    process = null;
  }

  private void closeClient() {
    CodexAppServerClient current = client;
    client = null;
    if (current != null) current.close();
  }

  private void startErrorDrain(Process target) {
    Thread drain = new Thread(() -> {
      try {
        target.getErrorStream().transferTo(OutputStream.nullOutputStream());
      } catch (IOException ignored) {
        // Process diagnostics are intentionally discarded and never enter OpenHarness logs.
      }
    }, "openharness-codex-stderr-drain");
    drain.setDaemon(true);
    stderrThread = drain;
    drain.start();
  }

  private void runMonitor() {
    boolean reachedReady = false;

    while (!stopping) {
      Process current = launchProcess();
      process = current;
      startErrorDrain(current);
      startedAt = Instant.now();
      try {
        readinessProbe.waitUntilReady(current, startupTimeout);
        reachedReady = true;
        readyAt = Instant.now();
        pid = (int) current.pid();
        state = State.READY;
        readySignal.complete(null);

        int code = current.waitFor();
        exitCode = code;

        if (stopping) {
          process = null;
          state = State.SHUTDOWN;
          return;
        }

        if (code != 0 && !stopping && restartCount < maxRestarts) {
          state = State.DEGRADED;
          process = null;
          restartAndWait();
          continue;
        }

        process = null;
        state = State.UNAVAILABLE;
        return;
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        terminate(current);
        process = null;
        return;
      } catch (TimeoutException timeout) {
        exitCode = -1;
        terminate(current);
        process = null;
        if (!reachedReady) {
          state = State.UNAVAILABLE;
          readySignal.completeExceptionally(timeout);
          return;
        }
        if (restartCount < maxRestarts) {
          state = State.DEGRADED;
          restartAndWait();
        } else {
          state = State.UNAVAILABLE;
          return;
        }
      } catch (Exception failure) {
        exitCode = -1;
        terminate(current);
        process = null;
        if (!reachedReady) {
          state = State.UNAVAILABLE;
          readySignal.completeExceptionally(failure);
          return;
        }
        if (restartCount < maxRestarts) {
          state = State.DEGRADED;
          restartAndWait();
        } else {
          state = State.UNAVAILABLE;
          return;
        }
      }
    }

    state = State.STOPPED;
  }

  private void restartAndWait() {
    restartCount++;
    long delay = restartBackoff.toMillis() * restartCount;
    try {
      if (delay > 0) {
        sleeper.sleep(Duration.ofMillis(delay));
      }
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
    }
  }

  private Process launchProcess() {
    List<String> args = providerConfig.appServerArgs();
    try {
      return launcher.launch(providerConfig.command(), args);
    } catch (IOException launchFailure) {
      throw new IllegalStateException("Codex process launch failed", launchFailure);
    }
  }

  private void terminate(Process target) {
    if (target == null) {
      return;
    }
    if (!target.isAlive()) {
      return;
    }
    target.destroy();
    try {
      if (!target.waitFor(shutdownTimeout.toMillis(), TimeUnit.MILLISECONDS)) {
        target.destroyForcibly();
      }
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
    }
  }

  private void clearStreams(Process target) {
    if (target == null) return;
    closeQuiet(target.getInputStream());
    closeQuiet(target.getErrorStream());
    closeQuiet(target.getOutputStream());
  }

  private void closeQuiet(InputStream inputStream) {
    if (inputStream != null) {
      try {
        inputStream.close();
      } catch (IOException ignored) {
      }
    }
  }

  private void closeQuiet(OutputStream outputStream) {
    if (outputStream != null) {
      try {
        outputStream.close();
      } catch (IOException ignored) {
      }
    }
  }

  private static Process defaultLauncher(String command, List<String> args) throws IOException {
    ProcessBuilder builder = new ProcessBuilder();
    builder.command(command);
    builder.command().addAll(args);
    return builder.start();
  }

  private static void defaultProbe(Process process, Duration timeout) {
    if (!process.isAlive()) {
      throw new IllegalStateException("Process exited before handshake");
    }
    try {
      Thread.sleep(Math.min(20, timeout.toMillis()));
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Handshake probe interrupted", exception);
    }
  }

  private static void ensureLocalEndpoint(String endpoint) {
    if (!isLocalEndpoint(endpoint)) {
      throw new IllegalArgumentException("Codex process supervisor requires a local endpoint");
    }
  }

  private static boolean isLocalEndpoint(String endpoint) {
    if (endpoint == null || endpoint.isBlank()) {
      return false;
    }
    if ("stdio://".equals(endpoint) || endpoint.startsWith("unix://")) {
      return true;
    }
    URI uri;
    try {
      uri = URI.create(endpoint);
    } catch (IllegalArgumentException invalid) {
      return false;
    }
    if (!"ws".equalsIgnoreCase(uri.getScheme())
        || uri.getUserInfo() != null
        || uri.getRawQuery() != null
        || uri.getRawFragment() != null) {
      return false;
    }
    String host = uri.getHost();
    return "localhost".equalsIgnoreCase(host)
        || "127.0.0.1".equals(host)
        || "::1".equals(host)
        || "[::1]".equals(host);
  }

  private static Duration requirePositive(Duration timeout, String name) {
    if (timeout == null || timeout.isNegative() || timeout.isZero()) {
      throw new IllegalArgumentException(name + " must be positive");
    }
    return timeout;
  }

  private static int requireNonNegative(int value, String name) {
    if (value < 0) {
      throw new IllegalArgumentException(name + " must be >= 0");
    }
    return value;
  }

  private static Duration requireNonNegative(Duration value, String name) {
    if (value == null || value.isNegative()) {
      throw new IllegalArgumentException(name + " must be >= 0");
    }
    return value;
  }
}
