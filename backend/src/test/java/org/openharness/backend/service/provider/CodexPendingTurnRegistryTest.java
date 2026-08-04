package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.model.Contracts.CodexTurnCancelRequest;
import org.openharness.backend.service.provider.CodexAppServerClient.ErrorTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.FinalTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.BridgeException;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.Identity;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.RegistryResult;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.State;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.TurnBridge;

class CodexPendingTurnRegistryTest {
  private static final Identity ID = new Identity("tenant", "user", "request", "conversation");
  private static final PendingToolCall CALL = new PendingToolCall(7, "thread", "turn", "call", "echo", "{\"secret\":\"ARG-CANARY\"}");

  @Test
  void bindsEveryIdentityAndCorrelationFieldWithoutMutatingResponder() {
    Fixture fixture = new Fixture();
    String bridge = fixture.register();
    List<Runnable> mismatches = List.of(
        () -> fixture.registry.complete(new Identity("other", "user", "request", "conversation"), bridge, result("key", "ok", "value")),
        () -> fixture.registry.complete(new Identity("tenant", "other", "request", "conversation"), bridge, result("key", "ok", "value")),
        () -> fixture.registry.complete(new Identity("tenant", "user", "other", "conversation"), bridge, result("key", "ok", "value")),
        () -> fixture.registry.complete(new Identity("tenant", "user", "request", "other"), bridge, result("key", "ok", "value")),
        () -> fixture.registry.complete(ID, bridge, new CodexToolResultSubmission("other", "conversation", "thread", "turn", "call", "key", "ok", "value")),
        () -> fixture.registry.complete(ID, bridge, new CodexToolResultSubmission("request", "other", "thread", "turn", "call", "key", "ok", "value")),
        () -> fixture.registry.complete(ID, bridge, new CodexToolResultSubmission("request", "conversation", "other", "turn", "call", "key", "ok", "value")),
        () -> fixture.registry.complete(ID, bridge, new CodexToolResultSubmission("request", "conversation", "thread", "other", "call", "key", "ok", "value")),
        () -> fixture.registry.complete(ID, bridge, new CodexToolResultSubmission("request", "conversation", "thread", "turn", "other", "key", "ok", "value")),
        () -> fixture.registry.complete(ID, "missing-bridge", result("key", "ok", "value")));
    mismatches.forEach(operation -> assertNotFound(operation));
    assertThat(fixture.bridge.mutations()).isZero();
  }

  @Test
  void crossIdentityCannotDistinguishActiveTerminalOrUnknownBridge() {
    Fixture fixture = new Fixture();
    Identity otherTenant = new Identity("other", "user", "request", "conversation");
    String active = fixture.register();

    assertNotFound(() -> fixture.registry.complete(
        otherTenant, active, result("key", "ok", "value")));
    assertThat(fixture.bridge.mutations()).isZero();

    fixture.registry.orphanAll();
    assertGone(() -> fixture.registry.complete(ID, active, result("key", "ok", "value")));
    assertNotFound(() -> fixture.registry.complete(
        otherTenant, active, result("key", "ok", "value")));
    assertNotFound(() -> fixture.registry.complete(
        otherTenant, "missing-bridge", result("key", "ok", "value")));
    assertThat(fixture.bridge.mutations()).isZero();
  }

  @Test
  void permitsOnlyOnePendingCallPerTurn() {
    Fixture fixture = new Fixture();
    fixture.register();
    assertThatThrownBy(() -> fixture.registry.register(ID,
        new PendingToolCall(8, "thread", "turn", "call-2", "echo", "{}"), new FakeBridge()))
        .isInstanceOf(BridgeException.class).extracting("code").isEqualTo("BRIDGE_RESULT_CONFLICT");
  }

  @Test
  void identicalReplayIsCachedButKeyOrPayloadConflictNeverWritesTwice() {
    Fixture fixture = new Fixture();
    String bridge = fixture.register();
    RegistryResult first = fixture.registry.complete(ID, bridge, result("key", "ok", "RESULT-CANARY"));
    RegistryResult replay = fixture.registry.complete(ID, bridge, result("key", "ok", "RESULT-CANARY"));
    assertThat(first.idempotentReplay()).isFalse();
    assertThat(replay.idempotentReplay()).isTrue();
    assertThat(replay.turnResult()).isEqualTo(first.turnResult());
    assertThat(fixture.bridge.completes).hasValue(1);
    assertConflict(() -> fixture.registry.complete(ID, bridge, result("other", "ok", "RESULT-CANARY")));
    assertConflict(() -> fixture.registry.complete(ID, bridge, result("key", "error", "different")));
    assertThat(fixture.bridge.completes).hasValue(1);
  }

  @Test
  void timeoutFailsAndInterruptsOnceThenRetainsOnlySafeTerminalData() {
    Fixture fixture = new Fixture();
    String bridge = fixture.register();
    fixture.clock.advance(Duration.ofSeconds(31));
    fixture.registry.expireDue();
    assertThat(awaitWithin(fixture.bridge.terminateCalled)).isTrue();
    assertThat(fixture.bridge.terminates).hasValue(1);
    assertThat(fixture.registry.inspect(bridge).orElseThrow().state()).isEqualTo(State.TIMED_OUT);
    assertThat(fixture.registry.inspect(bridge).orElseThrow().toString())
        .doesNotContain("ARG-CANARY").doesNotContain("RESULT-CANARY").doesNotContain(bridge);
    assertGone(() -> fixture.registry.complete(ID, bridge, result("key", "ok", "value")));
  }

  @Test
  void cancelAndCompleteEachWinWhenFirst() {
    Fixture cancelled = new Fixture();
    String cancelledBridge = cancelled.register();
    RegistryResult cancel = cancelled.registry.cancel(ID, cancelledBridge, cancelRequest());
    assertThat(cancel.state()).isEqualTo(State.CANCELLING);
    assertGone(() -> cancelled.registry.complete(ID, cancelledBridge, result("key", "ok", "value")));
    assertThat(cancelled.bridge.mutations()).isEqualTo(1);

    Fixture completed = new Fixture();
    String completedBridge = completed.register();
    completed.registry.complete(ID, completedBridge, result("key", "ok", "value"));
    RegistryResult after = completed.registry.cancel(ID, completedBridge, cancelRequest());
    assertThat(after.state()).isEqualTo(State.COMPLETED);
    assertThat(completed.bridge.mutations()).isEqualTo(1);
  }

  @Test
  void concurrentCancelCompleteRaceHasExactlyOneResponderMutation() throws Exception {
    Fixture fixture = new Fixture();
    String bridge = fixture.register();
    CountDownLatch start = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      Future<?> complete = pool.submit(() -> { await(start); runIgnoringBridge(() -> fixture.registry.complete(ID, bridge, result("key", "ok", "value"))); });
      Future<?> cancel = pool.submit(() -> { await(start); fixture.registry.cancel(ID, bridge, cancelRequest()); });
      start.countDown();
      complete.get();
      cancel.get();
    }
    assertThat(fixture.bridge.mutations()).isEqualTo(1);
    assertThat(fixture.registry.inspect(bridge).orElseThrow().state()).isIn(State.COMPLETED, State.CANCELLING);
  }

  @Test
  void retentionExpiryDeletesTerminalAndRestartOrphansActiveHandles() {
    Fixture fixture = new Fixture();
    String completed = fixture.register();
    fixture.registry.complete(ID, completed, result("key", "ok", "value"));
    fixture.clock.advance(Duration.ofMinutes(6));
    fixture.registry.purgeExpiredTerminal();
    assertThat(fixture.registry.inspect(completed)).isEmpty();
    assertNotFound(() -> fixture.registry.complete(ID, completed, result("key", "ok", "value")));

    String active = fixture.register("thread-2", "turn-2", "call-2");
    fixture.registry.orphanAll();
    assertThat(fixture.registry.inspect(active).orElseThrow().state()).isEqualTo(State.ORPHANED);
    assertThat(fixture.bridge.mutations()).isEqualTo(1);
    assertGone(() -> fixture.registry.complete(ID, active,
        new CodexToolResultSubmission("request", "conversation", "thread-2", "turn-2", "call-2", "key", "ok", "value")));
  }

  @Test
  void bridgeIdsAreOpaqueBoundedAndClockControlsExpiry() {
    Fixture fixture = new Fixture();
    String bridge = fixture.register();
    assertThat(bridge).hasSizeBetween(32, 128).doesNotContain("tenant", "thread", "turn", "call");
    assertThat(fixture.registry.inspect(bridge).orElseThrow().expiresAt()).isEqualTo(fixture.clock.instant().plusSeconds(30));
    assertThat(fixture.registry.inspect(bridge).orElseThrow().toString()).doesNotContain(bridge);
  }

  @Test
  void responderFailuresAreSanitizedAndTerminalRetentionRemainsBounded() {
    Fixture completion = new Fixture();
    completion.bridge.failComplete = true;
    String completedBridge = completion.register();
    assertThatThrownBy(() -> completion.registry.complete(ID, completedBridge,
        result("key", "ok", "RESULT-CANARY")))
        .isInstanceOf(BridgeException.class)
        .hasMessageNotContaining("RESULT-CANARY").hasMessageNotContaining("BRIDGE-CANARY");
    assertThat(completion.registry.inspect(completedBridge).orElseThrow().state()).isEqualTo(State.FAILED);
    assertThat(completion.registry.inspect(completedBridge).orElseThrow().retainedUntil()).isNotNull();

    Fixture timeout = new Fixture();
    timeout.bridge.failTerminate = true;
    String timedOutBridge = timeout.register();
    timeout.clock.advance(Duration.ofSeconds(31));
    timeout.registry.expireDue();
    assertThat(awaitWithin(timeout.bridge.terminateCalled)).isTrue();
    assertThat(timeout.registry.inspect(timedOutBridge).orElseThrow().state()).isEqualTo(State.TIMED_OUT);
    assertThat(timeout.registry.inspect(timedOutBridge).orElseThrow().retainedUntil()).isNotNull();
  }

  @Test
  void normalizesNanosecondExpiryToContractMilliseconds() {
    MutableClock nanos = new MutableClock(Instant.parse("2026-07-11T00:00:00.123456789Z"));
    CodexPendingTurnRegistry registry = new CodexPendingTurnRegistry(
        nanos, Duration.ofSeconds(30), Duration.ofMinutes(5));
    var pending = registry.register(ID, CALL, new FakeBridge());
    assertThat(pending.expiresAt()).isEqualTo("2026-07-11T00:00:30.123Z");

    MutableClock seconds = new MutableClock(Instant.parse("2026-07-11T00:00:00Z"));
    var secondPending = new CodexPendingTurnRegistry(seconds, Duration.ofSeconds(30), Duration.ofMinutes(5))
        .register(ID, CALL, new FakeBridge());
    assertThat(secondPending.expiresAt()).isEqualTo("2026-07-11T00:00:30Z");
  }

  @Test
  void sequentialPendingKeepsTurnOpenAndDropsPriorAndTerminalRawArguments() {
    Fixture fixture = new Fixture();
    fixture.bridge.nextResult = new PendingToolCall(
        8, "thread", "turn", "call-2", "echo", "{\"secret\":\"NEXT-CANARY\"}");
    String bridge = fixture.register();
    RegistryResult next = fixture.registry.complete(ID, bridge, result("key-1", "ok", "RESULT-CANARY"));
    assertThat(next.state()).isEqualTo(State.PENDING_TOOL);
    assertThat(((PendingToolCall) next.turnResult()).callId()).isEqualTo("call-2");
    assertThat(next.pendingTurn()).isEqualTo(new org.openharness.backend.model.Contracts.PendingCodexTurn(
        bridge, "thread", "turn", "call-2", "echo", "{\"secret\":\"NEXT-CANARY\"}",
        "2026-07-11T00:00:30Z"));

    fixture.bridge.nextResult = new FinalTurn(
        "thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    RegistryResult terminal = fixture.registry.complete(ID, bridge,
        new CodexToolResultSubmission("request", "conversation", "thread", "turn", "call-2",
            "key-2", "ok", "second-result"));
    assertThat(terminal.state()).isEqualTo(State.COMPLETED);
    assertThat(terminal.pendingTurn()).isNull();
    assertThat(fixture.registry.inspect(bridge).orElseThrow().toString())
        .doesNotContain("NEXT-CANARY").doesNotContain("RESULT-CANARY");
  }

  @Test
  void fiveSequentialPendingCallsReuseOneBridgeAndCompleteExactlyOnceEach() {
    Fixture fixture = new Fixture();
    String bridge = fixture.register("thread", "turn", "call-1");
    for (int call = 1; call < 5; call++) {
      String nextCall = "call-" + (call + 1);
      fixture.bridge.nextResult = new PendingToolCall(
          7 + call, "thread", "turn", nextCall, "echo", "{}");
      RegistryResult next = fixture.registry.complete(
          ID, bridge, submission("call-" + call, "key-" + call));
      assertThat(next.state()).isEqualTo(State.PENDING_TOOL);
      assertThat(next.pendingTurn().bridgeId()).isEqualTo(bridge);
      assertThat(next.pendingTurn().callId()).isEqualTo(nextCall);
    }
    fixture.bridge.nextResult = new FinalTurn(
        "thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    RegistryResult terminal = fixture.registry.complete(
        ID, bridge, submission("call-5", "key-5"));
    assertThat(terminal.state()).isEqualTo(State.COMPLETED);
    assertThat(fixture.bridge.completes).hasValue(5);
  }

  @Test
  void terminalRetentionExpiresOnNormalAccessWithoutManualPurge() {
    Fixture fixture = new Fixture();
    String bridge = fixture.register();
    fixture.registry.complete(ID, bridge, result("key", "ok", "value"));
    fixture.clock.advance(Duration.ofMinutes(6));
    assertNotFound(() -> fixture.registry.complete(ID, bridge, result("key", "ok", "value")));
    assertThat(fixture.registry.inspect(bridge)).isEmpty();
  }

  @Test
  void blockingTurnDoesNotBlockOtherTurnAndCancelInterruptsExactTurn() throws Exception {
    Fixture fixture = new Fixture();
    BlockingBridge blocked = new BlockingBridge();
    String first = fixture.registry.register(ID, CALL, blocked).bridgeId();
    fixture.clock.advance(Duration.ofSeconds(20));
    FakeBridge other = new FakeBridge();
    String second = fixture.registry.register(ID,
        new PendingToolCall(9, "thread-2", "turn-2", "call-2", "echo", "{}"), other).bridgeId();
    var pool = Executors.newFixedThreadPool(3);
    try {
      Future<?> firstCompletion = pool.submit(() -> fixture.registry.complete(ID, first, result("key", "ok", "value")));
      assertThat(blocked.entered.await(1, TimeUnit.SECONDS)).isTrue();
      Future<RegistryResult> otherCompletion = pool.submit(() -> fixture.registry.complete(ID, second,
          new CodexToolResultSubmission("request", "conversation", "thread-2", "turn-2", "call-2", "other-key", "ok", "value")));
      assertThat(otherCompletion.get(500, TimeUnit.MILLISECONDS).state()).isEqualTo(State.COMPLETED);

      Future<RegistryResult> cancellation = pool.submit(() -> fixture.registry.cancel(ID, first, cancelRequest()));
      assertThat(cancellation.get(500, TimeUnit.MILLISECONDS).state()).isEqualTo(State.CANCELLING);
      assertThat(blocked.terminates).hasValue(1);
      firstCompletion.get(1, TimeUnit.SECONDS);
    } finally {
      blocked.release.countDown();
      pool.shutdownNow();
    }
  }

  @Test
  void timeoutInterruptsOnlyExpiredBlockedTurn() throws Exception {
    Fixture fixture = new Fixture();
    BlockingBridge blocked = new BlockingBridge();
    String first = fixture.registry.register(ID, CALL, blocked).bridgeId();
    fixture.clock.advance(Duration.ofSeconds(20));
    FakeBridge other = new FakeBridge();
    String second = fixture.registry.register(ID,
        new PendingToolCall(9, "thread-2", "turn-2", "call-2", "echo", "{}"), other).bridgeId();
    var pool = Executors.newFixedThreadPool(2);
    try {
      Future<?> firstCompletion = pool.submit(() -> fixture.registry.complete(ID, first, result("key", "ok", "value")));
      assertThat(blocked.entered.await(1, TimeUnit.SECONDS)).isTrue();
      fixture.clock.advance(Duration.ofSeconds(11));
      Future<?> expiry = pool.submit(fixture.registry::expireDue);
      expiry.get(500, TimeUnit.MILLISECONDS);
      assertThat(blocked.terminates).hasValue(1);
      assertThat(other.terminates).hasValue(0);
      assertThat(fixture.registry.inspect(first).orElseThrow().state()).isEqualTo(State.TIMED_OUT);
      assertThat(fixture.registry.inspect(second).orElseThrow().state()).isEqualTo(State.PENDING_TOOL);
      firstCompletion.get(1, TimeUnit.SECONDS);
    } finally {
      blocked.release.countDown();
      pool.shutdownNow();
    }
  }

  @Test
  void cancelWinnerDuplicateCancelAndCompletionLoserShareRecordedOutcome() throws Exception {
    Fixture fixture = new Fixture();
    BlockingOutcomeBridge bridgeIo = new BlockingOutcomeBridge();
    String bridge = fixture.registry.register(ID, CALL, bridgeIo).bridgeId();
    var pool = Executors.newFixedThreadPool(3);
    try {
      Future<RegistryResult> completion = pool.submit(
          () -> fixture.registry.complete(ID, bridge, result("key", "ok", "value")));
      assertThat(bridgeIo.completeEntered.await(1, TimeUnit.SECONDS)).isTrue();
      Future<RegistryResult> cancellation = pool.submit(
          () -> fixture.registry.cancel(ID, bridge, cancelRequest()));
      assertThat(bridgeIo.terminateEntered.await(1, TimeUnit.SECONDS)).isTrue();
      bridgeIo.completeRelease.countDown();
      assertThat(completion.isDone()).isFalse();
      bridgeIo.terminateRelease.countDown();

      RegistryResult winner = cancellation.get(1, TimeUnit.SECONDS);
      RegistryResult loser = completion.get(1, TimeUnit.SECONDS);
      RegistryResult duplicate = fixture.registry.cancel(ID, bridge, cancelRequest());
      assertThat(winner.turnResult()).isNotNull().isSameAs(loser.turnResult()).isSameAs(duplicate.turnResult());
      assertThat(winner.state()).isEqualTo(State.CANCELLING);
      assertThat(bridgeIo.terminates).hasValue(1);
    } finally {
      bridgeIo.completeRelease.countDown();
      bridgeIo.terminateRelease.countDown();
      pool.shutdownNow();
    }
  }

  @Test
  void timeoutWinnerAndCompletionLoserShareRecordedOutcome() throws Exception {
    Fixture fixture = new Fixture();
    BlockingOutcomeBridge bridgeIo = new BlockingOutcomeBridge();
    String bridge = fixture.registry.register(ID, CALL, bridgeIo).bridgeId();
    var pool = Executors.newFixedThreadPool(2);
    try {
      Future<RegistryResult> completion = pool.submit(
          () -> fixture.registry.complete(ID, bridge, result("key", "ok", "value")));
      assertThat(bridgeIo.completeEntered.await(1, TimeUnit.SECONDS)).isTrue();
      fixture.clock.advance(Duration.ofSeconds(31));
      Future<?> expiry = pool.submit(fixture.registry::expireDue);
      assertThat(bridgeIo.terminateEntered.await(1, TimeUnit.SECONDS)).isTrue();
      bridgeIo.completeRelease.countDown();
      assertThat(completion.isDone()).isFalse();
      bridgeIo.terminateRelease.countDown();
      expiry.get(1, TimeUnit.SECONDS);
      RegistryResult loser = completion.get(1, TimeUnit.SECONDS);
      assertThat(loser.state()).isEqualTo(State.TIMED_OUT);
      assertThat(loser.turnResult()).isNotNull();
      assertThat(bridgeIo.terminates).hasValue(1);
    } finally {
      bridgeIo.completeRelease.countDown();
      bridgeIo.terminateRelease.countDown();
      pool.shutdownNow();
    }
  }

  @Test
  void cancelWinnerAndThrowingCompletionLoserShareRecordedOutcome() throws Exception {
    Fixture fixture = new Fixture();
    BlockingOutcomeBridge bridgeIo = new BlockingOutcomeBridge();
    bridgeIo.failComplete = true;
    String bridge = fixture.registry.register(ID, CALL, bridgeIo).bridgeId();
    var pool = Executors.newFixedThreadPool(2);
    try {
      Future<RegistryResult> completion = pool.submit(
          () -> fixture.registry.complete(ID, bridge, result("key", "ok", "RESULT-CANARY")));
      assertThat(bridgeIo.completeEntered.await(1, TimeUnit.SECONDS)).isTrue();
      Future<RegistryResult> cancellation = pool.submit(
          () -> fixture.registry.cancel(ID, bridge, cancelRequest()));
      assertThat(bridgeIo.terminateEntered.await(1, TimeUnit.SECONDS)).isTrue();
      bridgeIo.completeRelease.countDown();
      assertThat(completion.isDone()).isFalse();
      bridgeIo.terminateRelease.countDown();

      RegistryResult winner = cancellation.get(1, TimeUnit.SECONDS);
      RegistryResult loser = completion.get(1, TimeUnit.SECONDS);
      assertThat(winner.turnResult()).isNotNull().isSameAs(loser.turnResult());
      assertThat(loser.state()).isEqualTo(State.CANCELLING);
      assertThat(bridgeIo.terminates).hasValue(1);
    } finally {
      bridgeIo.completeRelease.countDown();
      bridgeIo.terminateRelease.countDown();
      pool.shutdownNow();
    }
  }

  @Test
  void timeoutWinnerAndThrowingCompletionLoserShareRecordedOutcome() throws Exception {
    Fixture fixture = new Fixture();
    BlockingOutcomeBridge bridgeIo = new BlockingOutcomeBridge();
    bridgeIo.failComplete = true;
    String bridge = fixture.registry.register(ID, CALL, bridgeIo).bridgeId();
    var pool = Executors.newFixedThreadPool(2);
    try {
      Future<RegistryResult> completion = pool.submit(
          () -> fixture.registry.complete(ID, bridge, result("key", "ok", "RESULT-CANARY")));
      assertThat(bridgeIo.completeEntered.await(1, TimeUnit.SECONDS)).isTrue();
      fixture.clock.advance(Duration.ofSeconds(31));
      fixture.registry.expireDue();
      assertThat(bridgeIo.terminateEntered.await(1, TimeUnit.SECONDS)).isTrue();
      bridgeIo.completeRelease.countDown();
      assertThat(completion.isDone()).isFalse();
      bridgeIo.terminateRelease.countDown();

      RegistryResult loser = completion.get(1, TimeUnit.SECONDS);
      assertThat(loser.state()).isEqualTo(State.TIMED_OUT);
      assertThat(loser.turnResult()).isNotNull();
      assertThat(bridgeIo.terminates).hasValue(1);
    } finally {
      bridgeIo.completeRelease.countDown();
      bridgeIo.terminateRelease.countDown();
      pool.shutdownNow();
    }
  }

  @Test
  void failedAndOrphanedTurnsFailClosedWithoutNullTerminalOutcome() {
    Fixture failed = new Fixture();
    failed.bridge.failComplete = true;
    String failedBridge = failed.register();
    assertGone(() -> failed.registry.complete(ID, failedBridge,
        result("key", "ok", "RESULT-CANARY")));
    assertGone(() -> failed.registry.cancel(ID, failedBridge, cancelRequest()));
    assertGone(() -> failed.registry.complete(ID, failedBridge,
        result("key", "ok", "RESULT-CANARY")));

    Fixture orphaned = new Fixture();
    String orphanedBridge = orphaned.register();
    orphaned.registry.orphanAll();
    assertGone(() -> orphaned.registry.cancel(ID, orphanedBridge, cancelRequest()));
    assertGone(() -> orphaned.registry.complete(ID, orphanedBridge,
        result("key", "ok", "RESULT-CANARY")));
    assertThat(orphaned.bridge.mutations()).isZero();
  }

  @Test
  void orphanWinnerAndNormallyReturningCompletionLoserFailClosed() throws Exception {
    Fixture fixture = new Fixture();
    BlockingOutcomeBridge bridgeIo = new BlockingOutcomeBridge();
    String bridge = fixture.registry.register(ID, CALL, bridgeIo).bridgeId();
    try (var pool = Executors.newSingleThreadExecutor()) {
      Future<RegistryResult> completion = pool.submit(
          () -> fixture.registry.complete(ID, bridge, result("key", "ok", "RESULT-CANARY")));
      assertThat(bridgeIo.completeEntered.await(1, TimeUnit.SECONDS)).isTrue();
      fixture.registry.orphanAll();
      bridgeIo.completeRelease.countDown();

      assertThatThrownBy(() -> completion.get(1, TimeUnit.SECONDS))
          .hasRootCauseInstanceOf(BridgeException.class)
          .hasRootCauseMessage("Codex bridge turn is unavailable")
          .hasMessageNotContaining("RESULT-CANARY");
      assertThat(bridgeIo.completes).hasValue(1);
      assertThat(bridgeIo.terminates).hasValue(0);
    } finally {
      bridgeIo.completeRelease.countDown();
    }
  }

  @Test
  void orphanWinnerAndThrowingCompletionLoserFailClosed() throws Exception {
    Fixture fixture = new Fixture();
    BlockingOutcomeBridge bridgeIo = new BlockingOutcomeBridge();
    bridgeIo.failComplete = true;
    String bridge = fixture.registry.register(ID, CALL, bridgeIo).bridgeId();
    try (var pool = Executors.newSingleThreadExecutor()) {
      Future<RegistryResult> completion = pool.submit(
          () -> fixture.registry.complete(ID, bridge, result("key", "ok", "RESULT-CANARY")));
      assertThat(bridgeIo.completeEntered.await(1, TimeUnit.SECONDS)).isTrue();
      fixture.registry.orphanAll();
      bridgeIo.completeRelease.countDown();

      assertThatThrownBy(() -> completion.get(1, TimeUnit.SECONDS))
          .hasRootCauseInstanceOf(BridgeException.class)
          .hasRootCauseMessage("Codex bridge turn is unavailable")
          .hasMessageNotContaining("RESULT-CANARY").hasMessageNotContaining("BRIDGE-CANARY");
      assertThat(bridgeIo.completes).hasValue(1);
      assertThat(bridgeIo.terminates).hasValue(0);
    } finally {
      bridgeIo.completeRelease.countDown();
    }
  }

  @Test
  void sequentialAnsweredCallReplayAndConflictsDoNotBlockCurrentCall() {
    Fixture fixture = new Fixture();
    PendingToolCall call2 = new PendingToolCall(8, "thread", "turn", "call-2", "echo", "{}");
    fixture.bridge.nextResult = call2;
    String bridge = fixture.register();
    CodexToolResultSubmission call1 = result("key-1", "ok", "value-1");
    RegistryResult next = fixture.registry.complete(ID, bridge, call1);

    RegistryResult replay = fixture.registry.complete(ID, bridge, call1);
    assertThat(replay.idempotentReplay()).isTrue();
    assertThat(replay.turnResult()).isSameAs(next.turnResult());
    assertThat(replay.pendingTurn()).isEqualTo(next.pendingTurn());
    assertConflict(() -> fixture.registry.complete(ID, bridge, result("different-key", "ok", "value-1")));
    assertConflict(() -> fixture.registry.complete(ID, bridge, result("key-1", "error", "different")));

    fixture.bridge.nextResult = new FinalTurn(
        "thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    RegistryResult terminal = fixture.registry.complete(ID, bridge,
        new CodexToolResultSubmission("request", "conversation", "thread", "turn", "call-2",
            "key-2", "ok", "value-2"));
    assertThat(terminal.state()).isEqualTo(State.COMPLETED);
    assertThat(fixture.bridge.completes).hasValue(2);
  }

  @Test
  void expiryClaimsAllDueTurnsBeforeIsolatedBlockingTerminates() throws Exception {
    Fixture fixture = new Fixture();
    BlockingTerminateBridge firstIo = new BlockingTerminateBridge();
    BlockingTerminateBridge secondIo = new BlockingTerminateBridge();
    String first = fixture.registry.register(ID, CALL, firstIo).bridgeId();
    String second = fixture.registry.register(ID,
        new PendingToolCall(9, "thread-2", "turn-2", "call-2", "echo", "{}"), secondIo).bridgeId();
    fixture.clock.advance(Duration.ofSeconds(31));

    var pool = Executors.newFixedThreadPool(3);
    try {
      Future<?> expiry = pool.submit(fixture.registry::expireDue);
      assertThat(firstIo.entered.await(1, TimeUnit.SECONDS)).isTrue();
      assertThat(secondIo.entered.await(1, TimeUnit.SECONDS)).isTrue();

      Future<RegistryResult> unrelatedOperation = pool.submit(() -> {
        FakeBridge unrelated = new FakeBridge();
        String third = fixture.registry.register(ID,
            new PendingToolCall(10, "thread-3", "turn-3", "call-3", "echo", "{}"), unrelated).bridgeId();
        return fixture.registry.complete(ID, third,
            new CodexToolResultSubmission("request", "conversation", "thread-3", "turn-3", "call-3",
                "key-3", "ok", "value"));
      });
      assertThat(unrelatedOperation.get(500, TimeUnit.MILLISECONDS).state()).isEqualTo(State.COMPLETED);
      firstIo.release.countDown();
      secondIo.release.countDown();
      expiry.get(1, TimeUnit.SECONDS);
      assertThat(fixture.registry.inspect(first).orElseThrow().state()).isEqualTo(State.TIMED_OUT);
      assertThat(fixture.registry.inspect(second).orElseThrow().state()).isEqualTo(State.TIMED_OUT);
    } finally {
      firstIo.release.countDown();
      secondIo.release.countDown();
      pool.shutdownNow();
    }
  }

  private static CodexToolResultSubmission result(String key, String status, String content) {
    return new CodexToolResultSubmission("request", "conversation", "thread", "turn", "call", key, status, content);
  }

  private static CodexToolResultSubmission submission(String callId, String key) {
    return new CodexToolResultSubmission(
        "request", "conversation", "thread", "turn", callId, key, "ok", "value");
  }

  private static CodexTurnCancelRequest cancelRequest() {
    return new CodexTurnCancelRequest("request", "conversation", "thread", "turn", "call");
  }

  private static void assertConflict(Runnable action) {
    assertThatThrownBy(action::run).isInstanceOf(BridgeException.class)
        .extracting("code").isEqualTo("BRIDGE_RESULT_CONFLICT");
  }

  private static void assertGone(Runnable action) {
    assertThatThrownBy(action::run).isInstanceOf(BridgeException.class)
        .extracting("code").isEqualTo("BRIDGE_TURN_GONE");
  }

  private static void assertNotFound(Runnable action) {
    assertThatThrownBy(action::run).isInstanceOf(BridgeException.class)
        .extracting("code").isEqualTo("BRIDGE_TURN_NOT_FOUND");
  }

  private static void await(CountDownLatch latch) {
    try { latch.await(); } catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
  }

  private static boolean awaitWithin(CountDownLatch latch) {
    try { return latch.await(1, TimeUnit.SECONDS); }
    catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
  }

  private static void runIgnoringBridge(Runnable action) {
    try { action.run(); } catch (BridgeException expectedRaceLoss) { }
  }

  private static final class Fixture {
    final MutableClock clock = new MutableClock(Instant.parse("2026-07-11T00:00:00Z"));
    final FakeBridge bridge = new FakeBridge();
    final CodexPendingTurnRegistry registry = new CodexPendingTurnRegistry(clock, Duration.ofSeconds(30), Duration.ofMinutes(5));

    String register() { return registry.register(ID, CALL, bridge).bridgeId(); }
    String register(String thread, String turn, String call) {
      return registry.register(ID, new PendingToolCall(9, thread, turn, call, "echo", "{}"), bridge).bridgeId();
    }
  }

  private static final class FakeBridge implements TurnBridge {
    final AtomicInteger completes = new AtomicInteger();
    final AtomicInteger terminates = new AtomicInteger();
    final CountDownLatch terminateCalled = new CountDownLatch(1);
    boolean failComplete;
    boolean failTerminate;
    CodexAppServerClient.TurnResult nextResult;
    public CodexAppServerClient.TurnResult complete(String status, String content) {
      completes.incrementAndGet();
      if (failComplete) throw new IllegalStateException("BRIDGE-CANARY " + content);
      return nextResult != null ? nextResult
          : new FinalTurn("thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    }
    public CodexAppServerClient.TurnResult terminate(String status) {
      terminates.incrementAndGet();
      terminateCalled.countDown();
      if (failTerminate) throw new IllegalStateException("BRIDGE-CANARY");
      return new ErrorTurn("BRIDGE_TERMINATED", "Codex turn terminated");
    }
    int mutations() { return completes.get() + terminates.get(); }
  }

  private static final class BlockingBridge implements TurnBridge {
    final CountDownLatch entered = new CountDownLatch(1);
    final CountDownLatch release = new CountDownLatch(1);
    final AtomicInteger terminates = new AtomicInteger();
    public CodexAppServerClient.TurnResult complete(String status, String content) {
      entered.countDown();
      await(release);
      return new FinalTurn("thread", "turn", "late", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    }
    public CodexAppServerClient.TurnResult terminate(String status) {
      terminates.incrementAndGet();
      release.countDown();
      return new ErrorTurn("BRIDGE_TERMINATED", "Codex turn terminated");
    }
  }

  private static final class BlockingOutcomeBridge implements TurnBridge {
    final CountDownLatch completeEntered = new CountDownLatch(1);
    final CountDownLatch completeRelease = new CountDownLatch(1);
    final CountDownLatch terminateEntered = new CountDownLatch(1);
    final CountDownLatch terminateRelease = new CountDownLatch(1);
    final AtomicInteger completes = new AtomicInteger();
    final AtomicInteger terminates = new AtomicInteger();
    boolean failComplete;
    public CodexAppServerClient.TurnResult complete(String status, String content) {
      completes.incrementAndGet();
      completeEntered.countDown();
      await(completeRelease);
      if (failComplete) throw new IllegalStateException("BRIDGE-CANARY " + content);
      return new FinalTurn("thread", "turn", "late", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    }
    public CodexAppServerClient.TurnResult terminate(String status) {
      terminates.incrementAndGet();
      terminateEntered.countDown();
      await(terminateRelease);
      return new ErrorTurn("BRIDGE_TERMINATED", "Codex turn terminated");
    }
  }

  private static final class BlockingTerminateBridge implements TurnBridge {
    final CountDownLatch entered = new CountDownLatch(1);
    final CountDownLatch release = new CountDownLatch(1);
    public CodexAppServerClient.TurnResult complete(String status, String content) {
      return new FinalTurn("thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    }
    public CodexAppServerClient.TurnResult terminate(String status) {
      entered.countDown();
      await(release);
      return new ErrorTurn("BRIDGE_TERMINATED", "Codex turn terminated");
    }
  }

  private static final class MutableClock extends Clock {
    private Instant now;
    MutableClock(Instant now) { this.now = now; }
    void advance(Duration duration) { now = now.plus(duration); }
    public ZoneId getZone() { return ZoneOffset.UTC; }
    public Clock withZone(ZoneId zone) { return this; }
    public Instant instant() { return now; }
  }
}
