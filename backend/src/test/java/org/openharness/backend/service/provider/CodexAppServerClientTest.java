package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.openharness.backend.service.provider.CodexAppServerClient.ContentItem;
import org.openharness.backend.service.provider.CodexAppServerClient.ErrorTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.DynamicTool;
import org.openharness.backend.service.provider.CodexAppServerClient.FinalTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;

class CodexAppServerClientTest {
  private static final ObjectMapper JSON = new ObjectMapper();

  @Test
  void returnsSynchronousFinalResponseWithUsage() throws Exception {
    try (FakePeer peer = new FakePeer();
        CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.initializeHandshake();
        JsonNode thread = peer.readRequest("thread/start");
        assertThat(thread.at("/params/allowProviderModelFallback").asBoolean()).isFalse();
        assertThat(thread.at("/params/sandbox").asText()).isEqualTo("read-only");
        assertThat(thread.at("/params/approvalPolicy").asText()).isEqualTo("untrusted");
        assertThat(thread.at("/params/dynamicTools").isArray()).isTrue();
        peer.send("{\"id\":" + thread.path("id").asLong()
            + ",\"result\":{\"thread\":{\"id\":\"thread-1\"}}}");
        JsonNode turn = peer.readRequest("turn/start");
        peer.send("{\"id\":" + turn.path("id").asLong()
            + ",\"result\":{\"turn\":{\"id\":\"turn-1\"}}}");
        peer.send("{\"method\":\"item/agentMessage/delta\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"delta\":\"hello\"}}");
        peer.send(peer.usageFrame(3, 4, 1));
        peer.send(peer.completedFrame());
      });

      FinalTurn result = (FinalTurn) client.startTurn("gpt-5.4", "hello");

      assertThat(result.threadId()).isEqualTo("thread-1");
      assertThat(result.turnId()).isEqualTo("turn-1");
      assertThat(result.message()).isEqualTo("hello");
      assertThat(result.usage()).isEqualTo(new CodexAppServerClient.TokenUsage(3, 4, 1));
      server.get(1, TimeUnit.SECONDS);
    }
  }

  @Test
  void sendsFrozenDynamicToolSpecsOnThreadStart() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        peer.initializeHandshake();
        JsonNode thread = peer.readRequest("thread/start");
        assertThat(thread.at("/params/dynamicTools/0/type").asText()).isEqualTo("function");
        assertThat(thread.at("/params/dynamicTools/0/name").asText()).isEqualTo("echo");
        assertThat(thread.at("/params/dynamicTools/0/description").asText()).isEqualTo("Echo text");
        assertThat(thread.at("/params/dynamicTools/0/inputSchema/type").asText()).isEqualTo("object");
        peer.send("{\"id\":" + thread.path("id").asLong()
            + ",\"result\":{\"thread\":{\"id\":\"thread-1\"}}}");
        JsonNode turn = peer.readRequest("turn/start");
        peer.send("{\"id\":" + turn.path("id").asLong()
            + ",\"result\":{\"turn\":{\"id\":\"turn-1\"}}}");
        peer.send(peer.completedFrame());
      });

      client.startTurn("gpt-5.4", "hello", List.of(new DynamicTool(
          "echo", "Echo text", Map.of("type", "object", "properties", Map.of()))));
    }
  }

  @Test
  void aggregatesStreamingMessageAndReasoningDeltas() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> peer.completeTurn(
          List.of(
              "{\"method\":\"item/agentMessage/delta\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"delta\":\"hel\"}}",
              "{\"method\":\"item/reasoning/summaryTextDelta\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"delta\":\"why \"}}",
              "{\"method\":\"item/agentMessage/delta\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"delta\":\"lo\"}}",
              "{\"method\":\"item/reasoning/textDelta\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"delta\":\"because\"}}")));

      FinalTurn result = (FinalTurn) client.startTurn("gpt-5.4", "hello");

      assertThat(result.message()).isEqualTo("hello");
      assertThat(result.reasoning()).isEqualTo("why because");
    }
  }

  @Test
  void requestsReasoningSummaryAndFallsBackToCompletedReasoningItem() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.initializeHandshake();
        JsonNode thread = peer.readRequest("thread/start");
        peer.send("{\"id\":" + thread.path("id").asLong()
            + ",\"result\":{\"thread\":{\"id\":\"thread-1\"}}}");
        JsonNode turn = peer.readRequest("turn/start");
        assertThat(turn.at("/params/summary").asText()).isEqualTo("auto");
        assertThat(turn.at("/params/effort").asText()).isEqualTo("medium");
        peer.send("{\"id\":" + turn.path("id").asLong()
            + ",\"result\":{\"turn\":{\"id\":\"turn-1\"}}}");
        peer.send("{\"method\":\"item/completed\",\"params\":{\"completedAtMs\":1,"
            + "\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"item\":{"
            + "\"id\":\"reasoning-1\",\"type\":\"reasoning\","
            + "\"summary\":[\"first summary\",\"second summary\"],\"content\":[]}}}");
        peer.send(peer.completedFrame());
      });

      FinalTurn result = (FinalTurn) client.startTurn("gpt-5.4", "reason");

      assertThat(result.reasoning()).isEqualTo("first summary\nsecond summary");
      server.get(1, TimeUnit.SECONDS);
    }
  }

  @Test
  void forwardsExplicitReasoningEffortOnTurnStart() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<Void> server = peer.run(() -> {
        peer.initializeHandshake();
        JsonNode thread = peer.readRequest("thread/start");
        peer.send("{\"id\":" + thread.path("id").asLong()
            + ",\"result\":{\"thread\":{\"id\":\"thread-1\"}}}");
        JsonNode turn = peer.readRequest("turn/start");
        assertThat(turn.at("/params/effort").asText()).isEqualTo("high");
        peer.send("{\"id\":" + turn.path("id").asLong()
            + ",\"result\":{\"turn\":{\"id\":\"turn-1\"}}}");
        peer.send(peer.completedFrame());
      });

      client.startTurn("gpt-5.6-sol", "hello", List.of(), "high");

      server.get(1, TimeUnit.SECONDS);
    }
  }

  @Test
  void deduplicatesStreamedReasoningPerItemAndKeepsLaterCompletedSummary() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> peer.completeTurn(List.of(
          "{\"method\":\"item/reasoning/summaryTextDelta\",\"params\":{"
              + "\"threadId\":\"thread-1\",\"turnId\":\"turn-1\","
              + "\"itemId\":\"reasoning-1\",\"summaryIndex\":0,\"delta\":\"streamed\"}}",
          "{\"method\":\"item/completed\",\"params\":{\"completedAtMs\":1,"
              + "\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"item\":{"
              + "\"id\":\"reasoning-1\",\"type\":\"reasoning\","
              + "\"summary\":[\"streamed\"],\"content\":[]}}}",
          "{\"method\":\"item/completed\",\"params\":{\"completedAtMs\":2,"
              + "\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"item\":{"
              + "\"id\":\"reasoning-2\",\"type\":\"reasoning\","
              + "\"summary\":[\"fallback\"],\"content\":[]}}}")));

      FinalTurn result = (FinalTurn) client.startTurn("gpt-5.4", "reason twice");

      assertThat(result.reasoning()).isEqualTo("streamed\nfallback");
    }
  }

  @Test
  void acceptsIndividualMessageAndReasoningDeltasWithinAggregateBound() throws Exception {
    String message = "m".repeat(300);
    String reasoning = "r".repeat(300);
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> peer.completeTurn(List.of(
          "{\"method\":\"item/agentMessage/delta\",\"params\":{"
              + "\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"delta\":\""
              + message + "\"}}",
          "{\"method\":\"item/reasoning/summaryTextDelta\",\"params\":{"
              + "\"threadId\":\"thread-1\",\"turnId\":\"turn-1\","
              + "\"itemId\":\"reasoning-1\",\"summaryIndex\":0,\"delta\":\""
              + reasoning + "\"}}")));

      FinalTurn result = (FinalTurn) client.startTurn("gpt-5.4", "bounded deltas");

      assertThat(result.message()).isEqualTo(message);
      assertThat(result.reasoning()).isEqualTo(reasoning);
    }
  }

  @Test
  void holdsServerRequestUntilOneToolResultResumesSameTurn() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<JsonNode> response = new CompletableFuture<>();
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send("{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":{\"value\":1}}}");
        response.complete(peer.readAny());
        peer.send("{\"method\":\"item/agentMessage/delta\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"delta\":\"continued\"}}");
        peer.send(peer.completedFrame());
      });

      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");
      assertThat(pending.callId()).isEqualTo("call-1");
      assertThat(pending.toolName()).isEqualTo("echo");
      assertThat(pending.argumentsRaw()).isEqualTo("{\"value\":1}");
      assertThat(response.isDone()).isFalse();

      FinalTurn result = (FinalTurn) client.resumeToolCall(
          pending, "ok", List.of(new ContentItem("inputText", "done")));

      JsonNode sent = response.get(1, TimeUnit.SECONDS);
      assertThat(sent.path("id").asLong()).isEqualTo(77);
      assertThat(sent.at("/result/success").asBoolean()).isTrue();
      assertThat(sent.at("/result/contentItems/0/type").asText()).isEqualTo("inputText");
      assertThat(sent.at("/result/contentItems/0/text").asText()).isEqualTo("done");
      assertThat(result.message()).isEqualTo("continued");
      assertThatThrownBy(() -> client.resumeToolCall(
          pending, "ok", List.of(new ContentItem("inputText", "again"))))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("already answered");
    }
  }

  @Test
  void mapsNonOkStatusesToFailureAndRedactsSensitiveContent() throws Exception {
    for (String status : List.of("error", "rejected", "timeout")) {
      try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
        CompletableFuture<JsonNode> response = new CompletableFuture<>();
        peer.run(() -> {
          peer.startTurnHandshake();
          peer.send("{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":{}}}");
          response.complete(peer.readAny());
          peer.send(peer.completedFrame());
        });
        PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");
        client.resumeToolCall(pending, status,
            List.of(new ContentItem("inputText", "Authorization: Bearer secret-canary")));
        String wire = response.get(1, TimeUnit.SECONDS).toString();
        assertThat(wire).contains("\"success\":false").contains("[REDACTED]");
        assertThat(wire).doesNotContain("secret-canary");
      }
    }
  }

  @Test
  void rejectsInputImageWithoutAnsweringServerRequest() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<JsonNode> response = new CompletableFuture<>();
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send("{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":{}}}");
        try { response.complete(peer.readAny()); } catch (RuntimeException ignored) { }
      });
      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");

      assertThatThrownBy(() -> client.resumeToolCall(
          pending, "ok", List.of(new ContentItem("inputImage", "data"))))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("inputImage");
      assertThat(response.isDone()).isFalse();
    }
  }

  @Test
  void rejectsMultipleContentItemsWithoutAnsweringServerRequest() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<JsonNode> response = new CompletableFuture<>();
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send("{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":{}}}");
        try { response.complete(peer.readAny()); } catch (RuntimeException ignored) { }
      });
      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");

      assertThatThrownBy(() -> client.resumeToolCall(pending, "ok", List.of(
          new ContentItem("inputText", "one"), new ContentItem("inputText", "two"))))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("one inputText");
      assertThat(response.isDone()).isFalse();
    }
  }

  @Test
  void canonicalizesUnorderedNestedToolArgumentsWithEcmaScriptNumbers() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send("{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":{\"z\":1,\"a\":{\"y\":1e-320,\"x\":\"line\\n\"}}}}");
      });

      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");

      assertThat(pending.argumentsRaw())
          .isEqualTo("{\"a\":{\"x\":\"line\\n\",\"y\":1e-320},\"z\":1}");
    }
  }

  @Test
  void rejectsNonObjectAndOversizedToolArguments() throws Exception {
    for (String arguments : List.of("[]", "\"value\"", "null", "{\"value\":\"" + "x".repeat(65_537) + "\"}")) {
      try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
        peer.run(() -> {
          peer.startTurnHandshake();
          peer.send("{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":"
              + arguments + "}}");
        });
        ErrorTurn error = (ErrorTurn) client.startTurn("gpt-5.4", "call tool");
        assertThat(error.code()).as(arguments.substring(0, Math.min(arguments.length(), 20)))
            .isEqualTo("PROTOCOL_FAILURE");
      }
    }
  }

  @Test
  void rejectsDuplicateArgumentKeysInCompleteJsonlFrameWithoutLeakingContent() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send("{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":{\"duplicate-secret\":\"first-secret\",\"duplicate-secret\":\"second-secret\"}}}");
      });

      ErrorTurn error = (ErrorTurn) client.startTurn("gpt-5.4", "call tool");

      assertThat(error.code()).isEqualTo("PROTOCOL_FAILURE");
      assertThat(error.message()).isEqualTo("Codex app-server protocol failure");
      assertThat(error.message())
          .doesNotContain("duplicate-secret")
          .doesNotContain("first-secret")
          .doesNotContain("second-secret");
    }
  }

  @Test
  void rejectsDuplicateResponderIdBeforeAndAfterAnswerButAllowsSequentialIds() throws Exception {
    try (FakePeer before = new FakePeer(); CodexAppServerClient client = before.client()) {
      before.run(() -> {
        before.startTurnHandshake();
        String call = "{\"id\":77,\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\"call-1\",\"tool\":\"echo\",\"arguments\":{}}}";
        before.send(call);
        before.send(call);
      });
      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");
      Thread.sleep(20);
      ErrorTurn error = (ErrorTurn) client.resumeToolCall(
          pending, "ok", List.of(new ContentItem("inputText", "done")));
      assertThat(error.code()).isEqualTo("PROTOCOL_FAILURE");
      assertThat(before.availableClientResponses()).isZero();
    }

    try (FakePeer after = new FakePeer(); CodexAppServerClient client = after.client()) {
      CompletableFuture<JsonNode> firstResponse = new CompletableFuture<>();
      after.run(() -> {
        after.startTurnHandshake();
        after.send(after.toolCallFrame(77, "call-1"));
        firstResponse.complete(after.readAny());
        after.send(after.toolCallFrame(77, "call-2"));
      });
      PendingToolCall first = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");
      ErrorTurn error = (ErrorTurn) client.resumeToolCall(
          first, "ok", List.of(new ContentItem("inputText", "done")));
      assertThat(firstResponse.get(1, TimeUnit.SECONDS).path("id").asLong()).isEqualTo(77);
      assertThat(error.code()).isEqualTo("PROTOCOL_FAILURE");
      assertThat(after.availableClientResponses()).isZero();
    }

    try (FakePeer sequential = new FakePeer(); CodexAppServerClient client = sequential.client()) {
      sequential.run(() -> {
        sequential.startTurnHandshake();
        sequential.send(sequential.toolCallFrame(77, "call-1"));
        sequential.readAny();
        sequential.send(sequential.toolCallFrame(78, "call-2"));
        sequential.readAny();
        sequential.send(sequential.completedFrame());
      });
      PendingToolCall first = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");
      PendingToolCall second = (PendingToolCall) client.resumeToolCall(
          first, "ok", List.of(new ContentItem("inputText", "one")));
      FinalTurn done = (FinalTurn) client.resumeToolCall(
          second, "ok", List.of(new ContentItem("inputText", "two")));
      assertThat(second.responderId()).isEqualTo(78);
      assertThat(done.turnId()).isEqualTo("turn-1");
    }
  }

  @Test
  void rejectsFractionalNegativeOverflowMissingAndStringUsage() throws Exception {
    for (String inputTokens : List.of("1.5", "-1", "2147483648", "null", "\"1\"")) {
      try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
        peer.run(() -> {
          peer.startTurnHandshake();
          peer.send(peer.rawUsageFrame(inputTokens));
        });
        ErrorTurn error = (ErrorTurn) client.startTurn("gpt-5.4", "hello");
        assertThat(error.code()).as(inputTokens).isEqualTo("PROTOCOL_FAILURE");
      }
    }
  }

  @Test
  void acceptsMaximumIntegralUsage() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send(peer.rawUsageFrame(Integer.toString(Integer.MAX_VALUE)));
        peer.send(peer.completedFrame());
      });

      FinalTurn result = (FinalTurn) client.startTurn("gpt-5.4", "hello");

      assertThat(result.usage().inputTokens()).isEqualTo(Integer.MAX_VALUE);
    }
  }

  @Test
  void acceptsEmptyTerminalInputText() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<JsonNode> response = new CompletableFuture<>();
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send(peer.toolCallFrame(77, "call-1"));
        response.complete(peer.readAny());
        peer.send(peer.completedFrame());
      });
      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");

      client.resumeToolCall(pending, "error", List.of(new ContentItem("inputText", "")));

      assertThat(response.get(1, TimeUnit.SECONDS).at("/result/contentItems/0/text").asText()).isEmpty();
    }
  }

  @Test
  void responderWriteFailureReturnsErrorTurnAndCannotWriteAgain() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send(peer.toolCallFrame(77, "call-1"));
      });
      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");
      peer.breakClientWrites();

      ErrorTurn error = (ErrorTurn) client.resumeToolCall(
          pending, "ok", List.of(new ContentItem("inputText", "secret-canary")));

      assertThat(error.code()).isEqualTo("TRANSPORT_FAILURE");
      assertThat(error.message()).doesNotContain("secret-canary");
      assertThatThrownBy(() -> client.resumeToolCall(
          pending, "ok", List.of(new ContentItem("inputText", "again"))))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("already answered");
    }
  }

  @Test
  void failsClosedOnMalformedFrameAndSanitizesAuthError() throws Exception {
    try (FakePeer malformed = new FakePeer(); CodexAppServerClient client = malformed.client()) {
      malformed.run(() -> {
        malformed.readRequest("initialize");
        malformed.send("{not-json Authorization: Bearer secret-canary");
      });
      ErrorTurn error = (ErrorTurn) client.startTurn("gpt-5.4", "hello");
      assertThat(error.code()).isEqualTo("PROTOCOL_FAILURE");
      assertThat(error.message()).doesNotContain("secret-canary");
    }

    try (FakePeer auth = new FakePeer(); CodexAppServerClient client = auth.client()) {
      auth.run(() -> {
        JsonNode request = auth.readRequest("initialize");
        auth.send("{\"id\":" + request.path("id").asLong()
            + ",\"error\":{\"code\":401,\"message\":\"Bearer secret-canary\"}}");
      });
      ErrorTurn error = (ErrorTurn) client.startTurn("gpt-5.4", "hello");
      assertThat(error.code()).isEqualTo("AUTH_FAILED");
      assertThat(error.message()).doesNotContain("secret-canary");
    }
  }

  @Test
  void singleReaderRoutesResponsesAroundNotificationsAndFailsClosedOnCorrelationDrift() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      peer.run(() -> {
        peer.initializeHandshake();
        JsonNode thread = peer.readRequest("thread/start");
        peer.send("{\"method\":\"server/heartbeat\",\"params\":{}}");
        peer.send("{\"id\":" + thread.path("id").asLong()
            + ",\"result\":{\"thread\":{\"id\":\"thread-1\"}}}");
        JsonNode turn = peer.readRequest("turn/start");
        peer.send("{\"id\":" + turn.path("id").asLong()
            + ",\"result\":{\"turn\":{\"id\":\"turn-1\"}}}");
        peer.send("{\"method\":\"item/agentMessage/delta\",\"params\":{\"threadId\":\"other-thread\",\"turnId\":\"turn-1\",\"delta\":\"secret-canary\"}}");
      });

      ErrorTurn error = (ErrorTurn) client.startTurn("gpt-5.4", "hello");
      assertThat(error.code()).isEqualTo("PROTOCOL_FAILURE");
      assertThat(error.message()).doesNotContain("secret-canary");
    }
  }

  @Test
  void exactPendingTurnInterruptFailsResponderThenInterruptsCorrelatedTurn() throws Exception {
    try (FakePeer peer = new FakePeer(); CodexAppServerClient client = peer.client()) {
      CompletableFuture<List<JsonNode>> frames = new CompletableFuture<>();
      peer.run(() -> {
        peer.startTurnHandshake();
        peer.send(peer.toolCallFrame(77, "call-1"));
        JsonNode failedResponder = peer.readAny();
        JsonNode interrupt = peer.readRequest("turn/interrupt");
        peer.send("{\"id\":" + interrupt.path("id").asLong() + ",\"result\":{}}");
        frames.complete(List.of(failedResponder, interrupt));
      });
      PendingToolCall pending = (PendingToolCall) client.startTurn("gpt-5.4", "call tool");

      ErrorTurn error = client.interruptToolCall(pending, "timeout");

      List<JsonNode> sent = frames.get(1, TimeUnit.SECONDS);
      assertThat(sent.get(0).path("id").asLong()).isEqualTo(77);
      assertThat(sent.get(0).at("/result/success").asBoolean()).isFalse();
      assertThat(sent.get(1).at("/params/threadId").asText()).isEqualTo("thread-1");
      assertThat(sent.get(1).at("/params/turnId").asText()).isEqualTo("turn-1");
      assertThat(error.code()).isEqualTo("TIMEOUT");
    }
  }

  private static final class FakePeer implements Closeable {
    private final PipedInputStream clientInput = new PipedInputStream();
    private final PipedOutputStream peerOutput;
    private final PipedInputStream peerInput = new PipedInputStream();
    private final PipedOutputStream clientOutput;
    private final BufferedReader reader;
    private final BufferedWriter writer;

    private FakePeer() throws Exception {
      peerOutput = new PipedOutputStream(clientInput);
      clientOutput = new PipedOutputStream(peerInput);
      reader = new BufferedReader(new InputStreamReader(peerInput, StandardCharsets.UTF_8));
      writer = new BufferedWriter(new OutputStreamWriter(peerOutput, StandardCharsets.UTF_8));
    }

    private CodexAppServerClient client() {
      return new CodexAppServerClient(clientInput, clientOutput, Duration.ofSeconds(1));
    }

    private CompletableFuture<Void> run(Runnable script) {
      return CompletableFuture.runAsync(script);
    }

    private JsonNode readRequest(String method) {
      JsonNode request = readAny();
      assertThat(request.path("method").asText()).isEqualTo(method);
      return request;
    }

    private JsonNode readAny() {
      try {
        return JSON.readTree(reader.readLine());
      } catch (Exception exception) {
        throw new IllegalStateException(exception);
      }
    }

    private synchronized void send(String frame) {
      try {
        writer.write(frame);
        writer.newLine();
        writer.flush();
      } catch (Exception exception) {
        throw new IllegalStateException(exception);
      }
    }

    private void startTurnHandshake() {
      initializeHandshake();
      JsonNode thread = readRequest("thread/start");
      send("{\"id\":" + thread.path("id").asLong()
          + ",\"result\":{\"thread\":{\"id\":\"thread-1\"}}}");
      JsonNode turn = readRequest("turn/start");
      send("{\"id\":" + turn.path("id").asLong()
          + ",\"result\":{\"turn\":{\"id\":\"turn-1\"}}}");
    }

    private void initializeHandshake() {
      JsonNode initialize = readRequest("initialize");
      assertThat(initialize.at("/params/clientInfo/name").asText()).isEqualTo("openharness");
      assertThat(initialize.at("/params/capabilities/experimentalApi").asBoolean()).isTrue();
      send("{\"id\":" + initialize.path("id").asLong() + ",\"result\":{}}");
    }

    private void completeTurn(List<String> frames) {
      startTurnHandshake();
      frames.forEach(this::send);
      send(completedFrame());
    }

    private String completedFrame() {
      return "{\"method\":\"turn/completed\",\"params\":{\"threadId\":\"thread-1\",\"turn\":{\"id\":\"turn-1\",\"status\":\"completed\"}}}";
    }

    private String usageFrame(int inputTokens, int outputTokens, int cachedInputTokens) {
      return "{\"method\":\"thread/tokenUsage/updated\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"tokenUsage\":{\"last\":{\"inputTokens\":"
          + inputTokens + ",\"outputTokens\":" + outputTokens + ",\"cachedInputTokens\":"
          + cachedInputTokens + ",\"reasoningOutputTokens\":0,\"totalTokens\":"
          + (inputTokens + outputTokens) + "},\"total\":{\"inputTokens\":" + inputTokens
          + ",\"outputTokens\":" + outputTokens + ",\"cachedInputTokens\":" + cachedInputTokens
          + ",\"reasoningOutputTokens\":0,\"totalTokens\":" + (inputTokens + outputTokens) + "}}}}";
    }

    private String rawUsageFrame(String inputTokens) {
      return "{\"method\":\"thread/tokenUsage/updated\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"tokenUsage\":{\"last\":{\"inputTokens\":"
          + inputTokens + ",\"outputTokens\":0,\"cachedInputTokens\":0}}}}";
    }

    private String toolCallFrame(long id, String callId) {
      return "{\"id\":" + id + ",\"method\":\"item/tool/call\",\"params\":{\"threadId\":\"thread-1\",\"turnId\":\"turn-1\",\"callId\":\""
          + callId + "\",\"tool\":\"echo\",\"arguments\":{}}}";
    }

    private int availableClientResponses() throws Exception {
      return peerInput.available();
    }

    private void breakClientWrites() throws Exception {
      peerInput.close();
    }

    @Override
    public void close() throws java.io.IOException {
      reader.close();
      writer.close();
      clientInput.close();
      clientOutput.close();
    }
  }
}
