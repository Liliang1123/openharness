package org.openharness.backend.qualification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.service.provider.CodexAppServerClient;
import org.openharness.backend.service.provider.CodexAppServerClient.ContentItem;
import org.openharness.backend.service.provider.CodexAppServerClient.ErrorTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.FinalTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.BridgeException;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.Identity;

/** Deterministic local contract evidence. It intentionally cannot qualify real OAuth. */
public final class CodexFakeProviderMatrix {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Identity ID = new Identity("tenant", "user", "request", "conversation");

  public Map<String, Object> run() {
    List<Map<String, Object>> rows = new ArrayList<>();
    rows.add(row("handshake-no-fallback", "handshake", this::syncScenario));
    rows.add(row("sync", "sync", this::syncScenario));
    rows.add(row("stream", "stream", this::richScenario));
    rows.add(row("reasoning", "reasoning", this::richScenario));
    rows.add(row("usage", "usage", this::richScenario));
    rows.add(row("pending", "pending_tool", this::pendingScenario));
    rows.add(row("sequential", "sequential_tool", this::sequentialScenario));
    rows.add(row("cancellation", "cancellation", () -> interruptScenario("cancelled")));
    rows.add(row("approval-timeout", "approval_timeout", () -> interruptScenario("timeout")));
    rows.add(row("replay-conflict", "idempotency", this::replayConflictScenario));
    rows.add(row("restart-orphan", "restart_orphan", this::orphanScenario));
    rows.add(row("auth-failure", "auth_failure", this::authScenario));
    rows.add(row("malformed", "malformed_response", this::malformedScenario));
    rows.add(blockedLoginRow());
    return Map.of(
        "track", "local",
        "generatedAt", "2026-07-12T00:00:00Z",
        "result", "blocked",
        "rows", rows);
  }

  private Map<String, Object> row(String suffix, String capability, CheckedScenario scenario) {
    long started = System.nanoTime();
    String result = "pass";
    Map<String, Object> observed = Map.of("verified", true);
    try {
      scenario.run();
    } catch (Exception failure) {
      result = "fail";
      observed = Map.of("verified", false, "errorClass", "CONTRACT_FAILURE");
    }
    return matrixRow(
        "codex-" + suffix, capability, observed, Map.of("expected", true), result,
        Math.max(1, Duration.ofNanos(System.nanoTime() - started).toMillis()));
  }

  private Map<String, Object> blockedLoginRow() {
    return matrixRow(
        "codex-real-oauth-login", "real_oauth", Map.of("status", "needs_login"),
        Map.of("realLoginRequired", true, "mockPassForbidden", true), "blocked", 1);
  }

  private Map<String, Object> matrixRow(
      String id,
      String capability,
      Map<String, Object> observed,
      Map<String, Object> oracle,
      String result,
      long durationMs) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", id);
    row.put("required", true);
    row.put("track", "local");
    row.put("environment", Map.of(
        "transport", "in-memory-jsonl-fake",
        "provider", "codex-app-server",
        "model", "gpt-fake",
        "credentialState", "synthetic-none"));
    row.put("protocolVersion", "codex-app-server-v2-experimental");
    row.put("capabilities", List.of(capability));
    row.put("requestHash", sha256(id));
    row.put("observed", observed);
    row.put("oracle", oracle);
    row.put("durationMs", durationMs);
    row.put("result", result);
    return row;
  }

  private void syncScenario() throws Exception {
    try (Peer peer = new Peer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.startTurn();
        peer.send(peer.delta("hello"));
        peer.send(peer.completed());
      });
      FinalTurn result = requireType(client.startTurn("gpt-fake", "hello"), FinalTurn.class);
      require("hello".equals(result.message()));
      server.get(1, TimeUnit.SECONDS);
    }
  }

  private void richScenario() throws Exception {
    try (Peer peer = new Peer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.startTurn();
        peer.send(peer.delta("a"));
        peer.send(peer.delta("b"));
        peer.send("{\"method\":\"item/reasoning/textDelta\",\"params\":{\"threadId\":\"thread\",\"turnId\":\"turn\",\"delta\":\"why\"}}");
        peer.send(peer.usage(5, 3, 2));
        peer.send(peer.completed());
      });
      FinalTurn result = requireType(client.startTurn("gpt-fake", "rich"), FinalTurn.class);
      require("ab".equals(result.message()));
      require("why".equals(result.reasoning()));
      require(result.usage().inputTokens() == 5 && result.usage().outputTokens() == 3
          && result.usage().cachedInputTokens() == 2);
      server.get(1, TimeUnit.SECONDS);
    }
  }

  private void pendingScenario() throws Exception {
    try (Peer peer = new Peer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.startTurn();
        peer.send(peer.toolCall(71, "call-1"));
        JsonNode response = peer.read();
        require(response.path("id").asLong() == 71 && response.at("/result/success").asBoolean());
        peer.send(peer.delta("done"));
        peer.send(peer.completed());
      });
      PendingToolCall pending = requireType(client.startTurn("gpt-fake", "pending"), PendingToolCall.class);
      FinalTurn finalTurn = requireType(client.resumeToolCall(
          pending, "ok", List.of(new ContentItem("inputText", "safe"))), FinalTurn.class);
      require("done".equals(finalTurn.message()));
      server.get(1, TimeUnit.SECONDS);
    }
  }

  private void sequentialScenario() throws Exception {
    try (Peer peer = new Peer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.startTurn();
        peer.send(peer.toolCall(71, "call-1"));
        require(peer.read().path("id").asLong() == 71);
        peer.send(peer.toolCall(72, "call-2"));
        require(peer.read().path("id").asLong() == 72);
        peer.send(peer.completed());
      });
      PendingToolCall first = requireType(client.startTurn("gpt-fake", "sequential"), PendingToolCall.class);
      PendingToolCall second = requireType(client.resumeToolCall(
          first, "ok", List.of(new ContentItem("inputText", "one"))), PendingToolCall.class);
      require("call-2".equals(second.callId()));
      requireType(client.resumeToolCall(
          second, "error", List.of(new ContentItem("inputText", "two"))), FinalTurn.class);
      server.get(1, TimeUnit.SECONDS);
    }
  }

  private void interruptScenario(String reason) throws Exception {
    try (Peer peer = new Peer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.startTurn();
        peer.send(peer.toolCall(71, "call-1"));
        require(!peer.read().at("/result/success").asBoolean());
        JsonNode interrupt = peer.read();
        require("turn/interrupt".equals(interrupt.path("method").asText()));
        peer.send("{\"id\":" + interrupt.path("id").asLong() + ",\"result\":{}}");
      });
      PendingToolCall pending = requireType(client.startTurn("gpt-fake", "interrupt"), PendingToolCall.class);
      ErrorTurn error = client.interruptToolCall(pending, reason);
      require(("timeout".equals(reason) && "TIMEOUT".equals(error.code()))
          || ("cancelled".equals(reason) && "BRIDGE_CANCELLED".equals(error.code())));
      server.get(1, TimeUnit.SECONDS);
    }
  }

  private void replayConflictScenario() {
    CodexPendingTurnRegistry registry = registry();
    PendingToolCall pending = new PendingToolCall(1, "thread", "turn", "call", "echo", "{}");
    String bridge = registry.register(ID, pending, new FixedBridge()).bridgeId();
    CodexToolResultSubmission submission = submission("key", "safe");
    require(!registry.complete(ID, bridge, submission).idempotentReplay());
    require(registry.complete(ID, bridge, submission).idempotentReplay());
    try {
      registry.complete(ID, bridge, submission("other", "safe"));
      throw new IllegalStateException("conflict accepted");
    } catch (BridgeException expected) {
      require("BRIDGE_RESULT_CONFLICT".equals(expected.code()));
    }
  }

  private void orphanScenario() {
    CodexPendingTurnRegistry registry = registry();
    String bridge = registry.register(
        ID, new PendingToolCall(1, "thread", "turn", "call", "echo", "{}"), new FixedBridge()).bridgeId();
    registry.orphanAll();
    try {
      registry.complete(ID, bridge, submission("key", "safe"));
      throw new IllegalStateException("orphan accepted");
    } catch (BridgeException expected) {
      require("BRIDGE_TURN_GONE".equals(expected.code()));
    }
  }

  private void authScenario() throws Exception {
    try (Peer peer = new Peer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        JsonNode request = peer.read();
        peer.send("{\"id\":" + request.path("id").asLong()
            + ",\"error\":{\"code\":401,\"message\":\"synthetic auth failure\"}}");
      });
      ErrorTurn error = requireType(client.startTurn("gpt-fake", "auth"), ErrorTurn.class);
      require("AUTH_FAILED".equals(error.code()));
    }
  }

  private void malformedScenario() throws Exception {
    try (Peer peer = new Peer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        peer.startTurn();
        peer.send("{not-json");
      });
      ErrorTurn error = requireType(client.startTurn("gpt-fake", "malformed"), ErrorTurn.class);
      require("PROTOCOL_FAILURE".equals(error.code()));
    }
  }

  private static CodexPendingTurnRegistry registry() {
    return new CodexPendingTurnRegistry(
        Clock.fixed(Instant.parse("2026-07-12T00:00:00Z"), java.time.ZoneOffset.UTC),
        Duration.ofMinutes(65), Duration.ofMinutes(5));
  }

  private static CodexToolResultSubmission submission(String key, String content) {
    return new CodexToolResultSubmission(
        "request", "conversation", "thread", "turn", "call", key, "ok", content);
  }

  private static String sha256(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception impossible) {
      throw new IllegalStateException("SHA-256 unavailable");
    }
  }

  private static <T> T requireType(Object value, Class<T> type) {
    if (!type.isInstance(value)) throw new IllegalStateException("unexpected outcome");
    return type.cast(value);
  }

  private static void require(boolean condition) {
    if (!condition) throw new IllegalStateException("contract assertion failed");
  }

  @FunctionalInterface
  private interface CheckedScenario { void run() throws Exception; }

  private static final class FixedBridge implements CodexPendingTurnRegistry.TurnBridge {
    public CodexAppServerClient.TurnResult complete(String status, String content) {
      return new FinalTurn("thread", "turn", "done", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
    }
    public CodexAppServerClient.TurnResult terminate(String status) {
      return new ErrorTurn("BRIDGE_TERMINATED", "terminated");
    }
  }

  private static final class Peer implements Closeable {
    private final PipedInputStream clientInput = new PipedInputStream();
    private final PipedOutputStream peerOutput;
    private final PipedInputStream peerInput = new PipedInputStream();
    private final PipedOutputStream clientOutput;
    private final BufferedReader reader;
    private final BufferedWriter writer;

    Peer() throws Exception {
      peerOutput = new PipedOutputStream(clientInput);
      clientOutput = new PipedOutputStream(peerInput);
      reader = new BufferedReader(new InputStreamReader(peerInput, StandardCharsets.UTF_8));
      writer = new BufferedWriter(new OutputStreamWriter(peerOutput, StandardCharsets.UTF_8));
    }

    CodexAppServerClient client() { return new CodexAppServerClient(clientInput, clientOutput, Duration.ofSeconds(1)); }

    CompletableFuture<Void> run(Runnable script) { return CompletableFuture.runAsync(script); }

    void startTurn() {
      JsonNode initialize = read();
      require("initialize".equals(initialize.path("method").asText()));
      send("{\"id\":" + initialize.path("id").asLong() + ",\"result\":{}}");
      JsonNode thread = read();
      require("thread/start".equals(thread.path("method").asText()));
      require(!thread.at("/params/allowProviderModelFallback").asBoolean(true));
      send("{\"id\":" + thread.path("id").asLong()
          + ",\"result\":{\"thread\":{\"id\":\"thread\"}}}");
      JsonNode turn = read();
      require("turn/start".equals(turn.path("method").asText()));
      send("{\"id\":" + turn.path("id").asLong()
          + ",\"result\":{\"turn\":{\"id\":\"turn\"}}}");
    }

    JsonNode read() {
      try { return JSON.readTree(reader.readLine()); }
      catch (Exception failure) { throw new IllegalStateException("fake peer read failed"); }
    }

    synchronized void send(String frame) {
      try { writer.write(frame); writer.newLine(); writer.flush(); }
      catch (Exception failure) { throw new IllegalStateException("fake peer write failed"); }
    }

    String delta(String value) {
      return "{\"method\":\"item/agentMessage/delta\",\"params\":{\"threadId\":\"thread\",\"turnId\":\"turn\",\"delta\":\"" + value + "\"}}";
    }

    String completed() {
      return "{\"method\":\"turn/completed\",\"params\":{\"threadId\":\"thread\",\"turn\":{\"id\":\"turn\",\"status\":\"completed\"}}}";
    }

    String usage(int input, int output, int cached) {
      return "{\"method\":\"thread/tokenUsage/updated\",\"params\":{\"threadId\":\"thread\",\"turnId\":\"turn\",\"tokenUsage\":{\"last\":{\"inputTokens\":"
          + input + ",\"outputTokens\":" + output + ",\"cachedInputTokens\":" + cached + "}}}}";
    }

    String toolCall(long id, String call) {
      return "{\"id\":" + id + ",\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread\",\"turnId\":\"turn\",\"callId\":\""
          + call + "\",\"tool\":\"echo\",\"arguments\":{}}}";
    }

    public void close() {
      try { reader.close(); } catch (Exception ignored) {}
      try { writer.close(); } catch (Exception ignored) {}
      try { clientInput.close(); } catch (Exception ignored) {}
      try { clientOutput.close(); } catch (Exception ignored) {}
    }
  }
}
