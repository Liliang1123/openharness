package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.service.provider.AnthropicAdapter;
import org.openharness.backend.service.provider.ProviderConfig;

class AnthropicFakeProviderMatrixTest {
  private HttpServer server;
  private final AtomicInteger retryAttempts = new AtomicInteger();

  @BeforeEach
  void startServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/v1/messages", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      String apiKey = exchange.getRequestHeaders().getFirst("x-api-key");
      String version = exchange.getRequestHeaders().getFirst("anthropic-version");
      int status = 200;
      String response;
      String contentType = "application/json";
      if (body.contains("matrix-retry") && retryAttempts.getAndIncrement() == 0) {
        status = 503;
        response = "{\"error\":\"retry\"}";
      } else if (body.contains("matrix-terminal")) {
        status = 400;
        response = "{\"error\":\"terminal\"}";
      } else if (body.contains("matrix-tool")) {
        response = "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"call-1\",\"name\":\"lookup\",\"input\":{\"id\":1}}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"cache_read_input_tokens\":2,\"cache_creation_input_tokens\":1}}";
      } else if (body.contains("matrix-stream-malformed")) {
        contentType = "text/event-stream";
        response = "event: message_start\ndata: {\"type\": \"message_start\"}\n\nevent: content_block_start\ndata: {\"type\": \"content_block_start\"\n\n";
      } else if (body.contains("matrix-stream")) {
        contentType = "text/event-stream";
        response = "event: message_start\ndata: {\"type\": \"message_start\", \"message\": {\"id\": \"msg-stream\", \"type\": \"message\", \"role\": \"assistant\", \"content\": [], \"model\": \"claude-3\", \"usage\": {\"input_tokens\": 9, \"output_tokens\": 1}}}\n\nevent: content_block_start\ndata: {\"type\": \"content_block_start\", \"index\": 0, \"content_block\": {\"type\": \"text\", \"text\": \"\"}}\n\nevent: content_block_delta\ndata: {\"type\": \"content_block_delta\", \"index\": 0, \"delta\": {\"type\": \"text_delta\", \"text\": \"o\"}}\n\nevent: content_block_delta\ndata: {\"type\": \"content_block_delta\", \"index\": 0, \"delta\": {\"type\": \"text_delta\", \"text\": \"k\"}}\n\nevent: message_delta\ndata: {\"type\": \"message_delta\", \"delta\": {\"stop_reason\": \"end_turn\"}, \"usage\": {\"output_tokens\": 4}}\n\nevent: message_stop\ndata: {\"type\": \"message_stop\"}\n\n";
      } else if (body.contains("matrix-timeout")) {
        try { Thread.sleep(500); } catch (InterruptedException e) {}
        response = "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"ok\"}]}";
      } else if (body.contains("matrix-cancellation")) {
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
        response = "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"ok\"}]}";
      } else if (body.contains("matrix-reasoning")) {
        response = "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"thinking process\",\"signature\":\"sig\"},{\"type\":\"text\",\"text\":\"ok\"}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"cache_read_input_tokens\":2,\"cache_creation_input_tokens\":1}}";
      } else {
        response = "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"ok\"}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"cache_read_input_tokens\":2,\"cache_creation_input_tokens\":1}}";
      }
      if (!"fake-key".equals(apiKey) || !"2023-06-01".equals(version)) {
        status = 401;
        response = "{\"error\":\"auth\"}";
        contentType = "application/json";
      }
      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", contentType);
      exchange.sendResponseHeaders(status, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    server.start();
  }

  @AfterEach
  void stopServer() { server.stop(0); }

  @Test
  void runsDeterministicLocalMatrixWithoutPromotingUnsupportedCapabilities() throws Exception {
    AnthropicFakeProviderMatrix matrix = new AnthropicFakeProviderMatrix();

    Map<String, Object> report = matrix.run(
        "http://127.0.0.1:" + server.getAddress().getPort(), "fake-key");


    String result = (String) report.get("result");
    assertThat(result).isEqualTo("local_verified");

    List<Map<String, Object>> rows = (List<Map<String, Object>>) report.get("rows");
    Map<String, String> rowResults = new java.util.HashMap<>();
    for (Map<String, Object> row : rows) {
      String fullId = (String) row.get("id");
      String id = fullId.substring("anthropic-".length());
      rowResults.put(id, (String) row.get("result"));
    }

    assertThat(rowResults).containsEntry("sync", "pass")
        .containsEntry("structured-tool", "pass")
        .containsEntry("exact-usage", "pass")
        .containsEntry("503-retry", "pass")
        .containsEntry("terminal-error", "pass")
        .containsEntry("stream", "pass")
        .containsEntry("timeout", "pass")
        .containsEntry("cancellation", "pass")
        .containsEntry("reasoning", "pass");
    assertThat(retryAttempts.get()).isEqualTo(2);
    assertThat(report.toString()).doesNotContain("fake-key");
  }

  @Test
  void throwsExceptionOnMalformedStreamJson() {
    AnthropicAdapter adapter = new AnthropicAdapter();
    ProviderConfig config = new ProviderConfig(
        "fake-anthropic", "anthropic", "http://127.0.0.1:" + server.getAddress().getPort(), "fake-key",
        List.of("matrix-stream-malformed"), Map.of());

    ModelChatRequest req = new ModelChatRequest("req-stream-malformed", "conv-local", "user-local", "tenant-local", "matrix-stream-malformed", true,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(), Map.of());

    org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class, () -> {
      adapter.chat(req, config);
    });
  }

  @Test
  void callWithRetryEnforcesOverallWallClockDeadlineOnSlow503() throws IOException {
    HttpServer slowServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    slowServer.createContext("/v1/messages", exchange -> {
      try { Thread.sleep(300); } catch (InterruptedException e) {}
      byte[] bytes = "{\"error\":\"retry\"}".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(503, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    slowServer.start();

    try {
      AnthropicAdapter adapter = new AnthropicAdapter();
      ProviderConfig config = new ProviderConfig(
          "fake-anthropic", "anthropic", "http://127.0.0.1:" + slowServer.getAddress().getPort(), "fake-key",
          List.of("matrix-sync"), Map.of());

      ModelChatRequest request = new ModelChatRequest(
          "req-slow-timeout", "conv-local", "user-local", "tenant-local", "matrix-sync", false,
          List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
          List.of(), Map.of("timeoutMs", 400));

      org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class, () -> {
        adapter.chat(request, config);
      });
    } finally {
      slowServer.stop(0);
    }
  }

}
