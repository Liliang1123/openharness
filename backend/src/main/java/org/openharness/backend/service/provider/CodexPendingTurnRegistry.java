package org.openharness.backend.service.provider;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.time.temporal.ChronoUnit;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.model.Contracts.CodexTurnCancelRequest;
import org.openharness.backend.model.Contracts.PendingCodexTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;
import org.openharness.backend.service.provider.CodexAppServerClient.TurnResult;

/** In-memory owner of one unresolved Codex dynamic tool call per app-server turn. */
public final class CodexPendingTurnRegistry {
  public enum State { ACTIVE, PENDING_TOOL, COMPLETED, CANCELLING, TIMED_OUT, FAILED, ORPHANED }

  public record Identity(String tenantId, String userId, String requestId, String conversationId) {
    public Identity {
      require(tenantId); require(userId); require(requestId); require(conversationId);
    }
  }

  public interface TurnBridge {
    TurnResult complete(String status, String content);
    TurnResult terminate(String status);
  }

  public static TurnBridge clientBridge(CodexAppServerClient client, PendingToolCall initialCall) {
    Objects.requireNonNull(client, "client");
    AtomicReference<PendingToolCall> current = new AtomicReference<>(
        Objects.requireNonNull(initialCall, "initialCall"));
    return new TurnBridge() {
      @Override public TurnResult complete(String status, String content) {
        TurnResult result = client.resumeToolCall(current.get(), status,
            java.util.List.of(new CodexAppServerClient.ContentItem("inputText", content)));
        if (result instanceof PendingToolCall pending) current.set(pending);
        return result;
      }

      @Override public TurnResult terminate(String status) {
        return client.interruptToolCall(current.get(), status);
      }
    };
  }

  public record RegistryResult(
      State state,
      TurnResult turnResult,
      PendingCodexTurn pendingTurn,
      boolean idempotentReplay) {}

  public static final class BridgeException extends RuntimeException {
    private final String code;
    public BridgeException(String code) {
      super(safeMessage(code));
      this.code = code;
    }
    public String code() { return code; }
    private static String safeMessage(String code) {
      return "BRIDGE_RESULT_CONFLICT".equals(code) ? "Codex bridge result conflicts with recorded outcome"
          : "Codex bridge turn is unavailable";
    }
  }

  public record Snapshot(State state, Instant expiresAt, Instant retainedUntil) {
    @Override public String toString() {
      return "Snapshot[state=" + state + ", expiresAt=" + expiresAt + ", retainedUntil=" + retainedUntil + "]";
    }
  }

  private static final Base64.Encoder BRIDGE_ENCODER = Base64.getUrlEncoder().withoutPadding();
  private final Clock clock;
  private final Duration pendingTtl;
  private final Duration retention;
  private final SecureRandom random;
  private final Map<String, Entry> entries = new ConcurrentHashMap<>();
  private final Map<TurnKey, String> unresolvedTurns = new ConcurrentHashMap<>();

  public CodexPendingTurnRegistry(Clock clock, Duration pendingTtl, Duration retention) {
    this(clock, pendingTtl, retention, new SecureRandom());
  }

  CodexPendingTurnRegistry(Clock clock, Duration pendingTtl, Duration retention, SecureRandom random) {
    this.clock = Objects.requireNonNull(clock, "clock");
    this.pendingTtl = positive(pendingTtl, "pendingTtl");
    this.retention = positive(retention, "retention");
    this.random = Objects.requireNonNull(random, "random");
  }

  public PendingCodexTurn register(Identity identity, PendingToolCall call, TurnBridge bridge) {
    Objects.requireNonNull(identity, "identity");
    Objects.requireNonNull(call, "call");
    Objects.requireNonNull(bridge, "bridge");
    expireDue();
    purgeExpiredTerminal();
    TurnKey turnKey = new TurnKey(call.threadId(), call.turnId());
    String bridgeId = newBridgeId();
    if (unresolvedTurns.putIfAbsent(turnKey, bridgeId) != null) throw conflict();
    Instant expiresAt = normalizedExpiry();
    entries.put(bridgeId, new Entry(identity, new Correlation(
        call.threadId(), call.turnId(), call.callId()), bridge, State.PENDING_TOOL, expiresAt));
    return new PendingCodexTurn(bridgeId, call.threadId(), call.turnId(), call.callId(),
        call.toolName(), call.argumentsRaw(), DateTimeFormatter.ISO_INSTANT.format(expiresAt));
  }

  public RegistryResult complete(
      Identity identity, String bridgeId, CodexToolResultSubmission submission) {
    purgeExpiredTerminal();
    Entry entry = requireEntry(identity, bridgeId);
    expireEntry(entry, clock.instant());
    String payloadHash = payloadHash(submission);
    TurnBridge bridge = null;
    synchronized (entry) {
      if (isReplay(entry, submission, payloadHash)) {
        PendingCodexTurn pending = entry.cachedResult instanceof PendingToolCall next
            ? pendingEnvelope(bridgeId, next, entry.expiresAt)
            : null;
        return new RegistryResult(entry.state, entry.cachedResult, pending, true);
      }
      if (isAnsweredCorrelation(entry, submission)) throw conflict();
      requireSubmission(entry, submission);
      if (entry.state == State.PENDING_TOOL) {
        entry.state = State.ACTIVE;
        bridge = entry.bridge;
      } else {
        if (entry.state == State.COMPLETED) throw conflict();
        else throw gone();
      }
    }
    TurnResult result;
    try {
      result = bridge.complete(submission.status(), submission.content());
    } catch (RuntimeException failure) {
      CompletableFuture<TurnResult> winnerOutcome;
      State winnerState;
      synchronized (entry) {
        if (entry.state == State.ACTIVE) {
          unavailableTerminal(entry, State.FAILED);
          throw gone();
        }
        winnerOutcome = entry.terminalOutcome;
        winnerState = entry.state;
      }
      return recordedTerminal(winnerState, winnerOutcome);
    }
    CompletableFuture<TurnResult> winnerOutcome = null;
    State winnerState = null;
    synchronized (entry) {
      if (entry.state != State.ACTIVE) {
        winnerOutcome = entry.terminalOutcome;
        winnerState = entry.state;
      } else {
        entry.idempotencyKey = submission.idempotencyKey();
        entry.payloadHash = payloadHash;
        entry.submissionCorrelation = new Correlation(
            submission.threadId(), submission.turnId(), submission.callId());
        entry.cachedResult = result;
        if (result instanceof PendingToolCall next) {
          if (!entry.correlation.threadId().equals(next.threadId())
              || !entry.correlation.turnId().equals(next.turnId())) {
            unavailableTerminal(entry, State.FAILED);
            throw gone();
          }
          entry.correlation = new Correlation(next.threadId(), next.turnId(), next.callId());
          entry.expiresAt = normalizedExpiry();
          entry.state = State.PENDING_TOOL;
          return new RegistryResult(
              entry.state, result, pendingEnvelope(bridgeId, next, entry.expiresAt), false);
        }
        if (result instanceof CodexAppServerClient.FinalTurn) terminal(entry, State.COMPLETED, result);
        else terminal(entry, State.FAILED, result);
        return new RegistryResult(entry.state, result, null, false);
      }
    }
    return recordedTerminal(winnerState, winnerOutcome);
  }

  public RegistryResult cancel(
      Identity identity, String bridgeId, CodexTurnCancelRequest request) {
    purgeExpiredTerminal();
    Entry entry = requireEntry(identity, bridgeId);
    expireEntry(entry, clock.instant());
    TurnBridge bridge = null;
    CompletableFuture<TurnResult> recorded = null;
    State recordedState = null;
    synchronized (entry) {
      requireCancel(entry, request);
      if (entry.state == State.PENDING_TOOL || entry.state == State.ACTIVE) {
        entry.state = State.CANCELLING;
        entry.terminalOutcome = new CompletableFuture<>();
        removeUnresolved(entry);
        bridge = entry.bridge;
        entry.bridge = null;
      } else if (entry.terminalOutcome != null) {
        recorded = entry.terminalOutcome;
        recordedState = entry.state;
      } else throw gone();
    }
    if (recorded != null) return new RegistryResult(recordedState, recorded.join(), null, true);
    TurnResult result = safeTerminate(entry, bridge, "cancelled");
    State finalState;
    synchronized (entry) {
      entry.cachedResult = result;
      entry.retainedUntil = clock.instant().plus(retention);
      finalState = entry.state;
    }
    entry.terminalOutcome.complete(result);
    return new RegistryResult(finalState, result, null, false);
  }

  public void expireDue() {
    Instant now = clock.instant();
    List<Termination> terminations = new ArrayList<>();
    for (Entry entry : entries.values()) {
      Termination termination = claimExpiry(entry, now);
      if (termination != null) terminations.add(termination);
    }
    for (Termination termination : terminations) {
      Thread.ofVirtual().name("openharness-codex-expiry").start(
          () -> finishTermination(termination, "timeout"));
    }
    purgeExpiredTerminal();
  }

  public void purgeExpiredTerminal() {
    Instant now = clock.instant();
    for (Map.Entry<String, Entry> mapped : entries.entrySet()) {
      Entry entry = mapped.getValue();
      synchronized (entry) {
        if (entry.retainedUntil != null && !now.isBefore(entry.retainedUntil)) {
          entries.remove(mapped.getKey(), entry);
        }
      }
    }
  }

  public void orphanAll() {
    Instant now = clock.instant();
    for (Entry entry : entries.values()) {
      synchronized (entry) {
        if (entry.state == State.PENDING_TOOL || entry.state == State.ACTIVE) {
          unavailableTerminal(entry, State.ORPHANED);
        }
      }
    }
  }

  public Optional<Snapshot> inspect(String bridgeId) {
    expireDue();
    Entry entry = entries.get(bridgeId);
    if (entry == null) return Optional.empty();
    synchronized (entry) {
      return Optional.of(new Snapshot(entry.state, entry.expiresAt, entry.retainedUntil));
    }
  }

  private Entry requireEntry(Identity identity, String bridgeId) {
    Entry entry = bridgeId == null ? null : entries.get(bridgeId);
    if (entry == null || !entry.identity.equals(identity)) throw notFound();
    return entry;
  }

  private void expireEntry(Entry entry, Instant now) {
    Termination termination = claimExpiry(entry, now);
    if (termination != null) {
      Thread.ofVirtual().name("openharness-codex-expiry").start(
          () -> finishTermination(termination, "timeout"));
    }
  }

  private Termination claimExpiry(Entry entry, Instant now) {
    synchronized (entry) {
      if ((entry.state == State.PENDING_TOOL || entry.state == State.ACTIVE)
          && !now.isBefore(entry.expiresAt)) {
        entry.state = State.TIMED_OUT;
        entry.terminalOutcome = new CompletableFuture<>();
        removeUnresolved(entry);
        TurnBridge bridge = entry.bridge;
        entry.bridge = null;
        entry.retainedUntil = now.plus(retention);
        return new Termination(entry, bridge, entry.terminalOutcome);
      }
      return null;
    }
  }

  private void finishTermination(Termination termination, String status) {
    TurnResult result = safeTerminate(termination.entry(), termination.bridge(), status);
    synchronized (termination.entry()) {
      termination.entry().cachedResult = result;
    }
    termination.outcome().complete(result);
  }

  private static void requireSubmission(Entry entry, CodexToolResultSubmission submission) {
    if (submission == null || !entry.identity.requestId.equals(submission.requestId())
        || !entry.identity.conversationId.equals(submission.conversationId())
        || !entry.correlation.threadId().equals(submission.threadId())
        || !entry.correlation.turnId().equals(submission.turnId())
        || !entry.correlation.callId().equals(submission.callId())) throw notFound();
  }

  private static void requireCancel(Entry entry, CodexTurnCancelRequest request) {
    if (request == null || !entry.identity.requestId.equals(request.requestId())
        || !entry.identity.conversationId.equals(request.conversationId())
        || !entry.correlation.threadId().equals(request.threadId())
        || !entry.correlation.turnId().equals(request.turnId())
        || !entry.correlation.callId().equals(request.callId())) throw notFound();
  }

  private static String payloadHash(CodexToolResultSubmission submission) {
    String canonical = lengthPrefix(submission.requestId()) + lengthPrefix(submission.conversationId())
        + lengthPrefix(submission.threadId()) + lengthPrefix(submission.turnId())
        + lengthPrefix(submission.callId()) + lengthPrefix(submission.idempotencyKey())
        + lengthPrefix(submission.status()) + lengthPrefix(submission.content());
    try {
      return java.util.HexFormat.of().formatHex(
          MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 unavailable");
    }
  }

  private static TurnResult safeTerminate(Entry entry, TurnBridge bridge, String status) {
    try {
      return bridge.terminate(status);
    } catch (RuntimeException failure) {
      return new CodexAppServerClient.ErrorTurn("BRIDGE_TERMINATED", "Codex turn terminated");
    }
  }

  private static boolean isReplay(
      Entry entry, CodexToolResultSubmission submission, String payloadHash) {
    return entry.idempotencyKey != null && entry.payloadHash != null
        && entry.submissionCorrelation != null
        && entry.idempotencyKey.equals(submission.idempotencyKey())
        && entry.payloadHash.equals(payloadHash)
        && entry.submissionCorrelation.equals(new Correlation(
            submission.threadId(), submission.turnId(), submission.callId()));
  }

  private static boolean isAnsweredCorrelation(
      Entry entry, CodexToolResultSubmission submission) {
    return entry.submissionCorrelation != null
        && entry.submissionCorrelation.equals(new Correlation(
            submission.threadId(), submission.turnId(), submission.callId()));
  }

  private static RegistryResult recordedTerminal(
      State state, CompletableFuture<TurnResult> outcome) {
    if (outcome == null) throw gone();
    return new RegistryResult(state, outcome.join(), null, false);
  }

  private static PendingCodexTurn pendingEnvelope(
      String bridgeId, PendingToolCall call, Instant expiresAt) {
    return new PendingCodexTurn(
        bridgeId,
        call.threadId(),
        call.turnId(),
        call.callId(),
        call.toolName(),
        call.argumentsRaw(),
        DateTimeFormatter.ISO_INSTANT.format(expiresAt));
  }

  private void terminal(Entry entry, State state, TurnResult result) {
    Objects.requireNonNull(result, "result");
    removeUnresolved(entry);
    entry.state = state;
    entry.bridge = null;
    entry.cachedResult = result;
    entry.retainedUntil = clock.instant().plus(retention);
    entry.terminalOutcome = CompletableFuture.completedFuture(result);
  }

  private void unavailableTerminal(Entry entry, State state) {
    removeUnresolved(entry);
    entry.state = state;
    entry.bridge = null;
    entry.cachedResult = null;
    entry.retainedUntil = clock.instant().plus(retention);
    entry.terminalOutcome = null;
  }

  private Instant normalizedExpiry() {
    return clock.instant().plus(pendingTtl).truncatedTo(ChronoUnit.MILLIS);
  }

  private static String lengthPrefix(String value) {
    byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
    return bytes.length + ":" + value;
  }

  private String newBridgeId() {
    byte[] bytes = new byte[32];
    String id;
    do { random.nextBytes(bytes); id = BRIDGE_ENCODER.encodeToString(bytes); } while (entries.containsKey(id));
    return id;
  }

  private void removeUnresolved(Entry entry) {
    unresolvedTurns.remove(new TurnKey(entry.correlation.threadId(), entry.correlation.turnId()));
  }

  private static Duration positive(Duration value, String name) {
    if (value == null || value.isZero() || value.isNegative()) throw new IllegalArgumentException(name + " must be positive");
    return value;
  }

  private static void require(String value) {
    if (value == null || value.isEmpty() || value.length() > 256) throw new IllegalArgumentException("identity must be bounded");
  }

  private static BridgeException gone() { return new BridgeException("BRIDGE_TURN_GONE"); }
  private static BridgeException notFound() { return new BridgeException("BRIDGE_TURN_NOT_FOUND"); }
  private static BridgeException conflict() { return new BridgeException("BRIDGE_RESULT_CONFLICT"); }
  private record TurnKey(String threadId, String turnId) {}
  private record Correlation(String threadId, String turnId, String callId) {}
  private record Termination(
      Entry entry, TurnBridge bridge, CompletableFuture<TurnResult> outcome) {}

  private static final class Entry {
    final Identity identity;
    Correlation correlation;
    TurnBridge bridge;
    State state;
    Instant expiresAt;
    Instant retainedUntil;
    String idempotencyKey;
    String payloadHash;
    Correlation submissionCorrelation;
    TurnResult cachedResult;
    CompletableFuture<TurnResult> terminalOutcome;
    Entry(Identity identity, Correlation correlation, TurnBridge bridge, State state, Instant expiresAt) {
      this.identity = identity; this.correlation = correlation; this.bridge = bridge; this.state = state; this.expiresAt = expiresAt;
    }
  }
}
