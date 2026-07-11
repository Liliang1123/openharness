package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CodexProcessSupervisorTest {

  @Test
  void startTransitionsToReadyAndCapturesState() throws Exception {
    FakeProcess process = new FakeProcess();
    process.signalReady();

    CodexProcessSupervisor supervisor = new CodexProcessSupervisor(
        config("stdio://"),
        (cmd, args) -> process,
        (p, timeout) -> {},
        Duration.ofMillis(200),
        Duration.ofMillis(50),
        0,
        Duration.ZERO);

    supervisor.start();

    assertThat(supervisor.state()).isEqualTo(CodexProcessSupervisor.State.READY);
    assertThat(supervisor.snapshot().pid()).isEqualTo(process.pid);
    assertThat(supervisor.snapshot().startedAt()).isNotNull();
    assertThat(supervisor.snapshot().readyAt()).isNotNull();

    process.completeExit(0);
    supervisor.stop();
  }

  @Test
  void startTimeoutFailsBeforeReadinessBecomesAvailable() {
    FakeProcess process = new FakeProcess();

    CodexProcessSupervisor supervisor = new CodexProcessSupervisor(
        config("stdio://"),
        (cmd, args) -> process,
        (p, timeout) -> {
          Thread.sleep(timeout.toMillis() + 20);
        },
        Duration.ofMillis(20),
        Duration.ofMillis(50),
        0,
        Duration.ZERO);

    assertThatExceptionOfType(IllegalStateException.class)
        .isThrownBy(supervisor::start)
        .withMessageContaining("start timeout");

    assertThat(supervisor.state()).isEqualTo(CodexProcessSupervisor.State.UNAVAILABLE);
    assertThat(process.destroyCalled).isTrue();
  }

  @Test
  void handshakeTimeoutBubblesUpAndMarksUnavailable() {
    FakeProcess process = new FakeProcess();
    process.signalReady();

    CodexProcessSupervisor supervisor = new CodexProcessSupervisor(
        config("stdio://"),
        (cmd, args) -> process,
        (p, timeout) -> {
          throw new TimeoutException("handshake not returned");
        },
        Duration.ofMillis(100),
        Duration.ofMillis(50),
        0,
        Duration.ZERO);

    assertThatExceptionOfType(IllegalStateException.class)
        .isThrownBy(supervisor::start)
        .withMessageContaining("failed to become ready");

    assertThat(process.destroyCalled).isTrue();
    assertThat(supervisor.state()).isEqualTo(CodexProcessSupervisor.State.UNAVAILABLE);
  }

  @Test
  void processCrashTriggersRestartBackoffWithinBoundedRetryCount() throws Exception {
    FakeProcess first = new FakeProcess();
    FakeProcess second = new FakeProcess();
    first.signalReady();
    second.signalReady();
    RecordingSleeper sleeper = new RecordingSleeper();

    LinkedBlockingQueue<FakeProcess> queue = new LinkedBlockingQueue<>();
    queue.add(first);
    queue.add(second);

    CodexProcessSupervisor supervisor = new CodexProcessSupervisor(
        config("stdio://"),
        (cmd, args) -> {
          FakeProcess process = queue.poll();
          if (process == null) {
            throw new IllegalStateException("No process left");
          }
          return process;
        },
        (p, timeout) -> {},
        Duration.ofMillis(200),
        Duration.ofMillis(50),
        1,
        Duration.ofMillis(60),
        sleeper);

    supervisor.start();

    first.completeExit(1);
    second.completeExit(1);
    awaitState(supervisor, CodexProcessSupervisor.State.UNAVAILABLE, 300);

    assertThat(sleeper.intervals)
        .hasSize(1)
        .containsExactly(Duration.ofMillis(60));
    assertThat(first.isAlive()).isFalse();
    assertThat(second.isAlive()).isFalse();
    assertThat(supervisor.state()).isEqualTo(CodexProcessSupervisor.State.UNAVAILABLE);

    supervisor.stop();
  }

  @Test
  void gracefulStopTerminatesRunningProcess() {
    FakeProcess process = new FakeProcess();
    process.signalReady();

    CodexProcessSupervisor supervisor = new CodexProcessSupervisor(
        config("stdio://"),
        (cmd, args) -> process,
        (p, timeout) -> {},
        Duration.ofMillis(200),
        Duration.ofMillis(50),
        0,
        Duration.ZERO);

    supervisor.start();

    supervisor.stop();

    assertThat(supervisor.state()).isEqualTo(CodexProcessSupervisor.State.STOPPED);
    assertThat(process.destroyCalled).isTrue();
    assertThat(process.isAlive()).isFalse();
  }

  @Test
  void stopWhileRestartBackoffWaitClearsPendingProcesses() throws Exception {
    FakeProcess first = new FakeProcess();
    FakeProcess second = new FakeProcess();
    first.signalReady();
    second.signalReady();

    CountDownLatch backoffEntered = new CountDownLatch(1);
    CountDownLatch blockBackoff = new CountDownLatch(1);
    BlockingSleeper sleeper = new BlockingSleeper(backoffEntered, blockBackoff);

    List<FakeProcess> launched = new ArrayList<>();
    LinkedBlockingQueue<FakeProcess> queue = new LinkedBlockingQueue<>();
    queue.add(first);
    queue.add(second);

    CodexProcessSupervisor supervisor = new CodexProcessSupervisor(
        config("stdio://"),
        (cmd, args) -> {
          FakeProcess process = queue.poll();
          launched.add(process);
          return process;
        },
        (p, timeout) -> {},
        Duration.ofMillis(200),
        Duration.ofMillis(50),
        1,
        Duration.ofMillis(40),
        sleeper);

    supervisor.start();
    first.completeExit(1);

    assertThat(backoffEntered.await(300, TimeUnit.MILLISECONDS)).isTrue();
    supervisor.stop();
    blockBackoff.countDown();

    assertThat(launched).hasSize(1);
    assertThat(supervisor.state()).isEqualTo(CodexProcessSupervisor.State.STOPPED);
  }

  private static ProviderConfig config(String endpoint) {
    return new ProviderConfig(
        "openai-codex",
        "codex-app-server",
        null,
        null,
        List.of("gpt-4o-mini"),
        Map.of(),
        "codex",
        List.of("app-server"),
        endpoint);
  }

  private static void awaitState(CodexProcessSupervisor supervisor,
      CodexProcessSupervisor.State expected,
      int timeoutMs)
      throws InterruptedException {
    long deadline = System.currentTimeMillis() + timeoutMs;
    while (System.currentTimeMillis() < deadline) {
      if (supervisor.state() == expected) {
        return;
      }
      Thread.sleep(5);
    }
    throw new AssertionError("Expected state=" + expected + " but got=" + supervisor.state());
  }

  private static final class RecordingSleeper implements CodexProcessSupervisor.Sleeper {
    final List<Duration> intervals = new ArrayList<>();

    @Override
    public void sleep(Duration duration) {
      intervals.add(duration);
    }
  }

  private static final class BlockingSleeper implements CodexProcessSupervisor.Sleeper {
    private final CountDownLatch backoffEntered;
    private final CountDownLatch blockBackoff;

    private BlockingSleeper(CountDownLatch backoffEntered, CountDownLatch blockBackoff) {
      this.backoffEntered = backoffEntered;
      this.blockBackoff = blockBackoff;
    }

    @Override
    public void sleep(Duration duration) throws InterruptedException {
      backoffEntered.countDown();
      blockBackoff.await();
    }
  }

  private static final class FakeProcess extends Process {
    private static final AtomicInteger NEXT_PID = new AtomicInteger(ThreadLocalRandom.current().nextInt(10_000, 20_000));

    private final int pid = NEXT_PID.incrementAndGet();
    private final CompletableFuture<Integer> exitSignal = new CompletableFuture<>();
    private final InputStream inputStream = new ByteArrayInputStream(new byte[0]);
    private final InputStream errorStream = new ByteArrayInputStream(new byte[0]);
    private final OutputStream outputStream = new ByteArrayOutputStream();

    private volatile boolean destroyCalled;
    private volatile boolean destroyForciblyCalled;
    private volatile boolean terminated;

    void signalReady() {
      // no-op marker retained for test intent
    }

    void completeExit(int code) {
      exitSignal.complete(code);
    }

    @Override
    public OutputStream getOutputStream() {
      return outputStream;
    }

    @Override
    public InputStream getInputStream() {
      return inputStream;
    }

    @Override
    public InputStream getErrorStream() {
      return errorStream;
    }

    @Override
    public int waitFor() throws InterruptedException {
      return exitSignal.join();
    }

    @Override
    public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
      try {
        exitSignal.get(timeout, unit);
        return true;
      } catch (TimeoutException timeoutFailure) {
        return false;
      } catch (ExecutionException failure) {
        return true;
      }
    }

    @Override
    public int exitValue() {
      return exitSignal.join();
    }

    @Override
    public void destroy() {
      destroyCalled = true;
      terminated = true;
      exitSignal.complete(143);
    }

    @Override
    public Process destroyForcibly() {
      destroyForciblyCalled = true;
      destroy();
      return this;
    }

    @Override
    public boolean isAlive() {
      return !exitSignal.isDone();
    }

    @Override
    public long pid() {
      return pid;
    }

    public boolean getReadySignaled() {
      return terminated;
    }
  }
}
