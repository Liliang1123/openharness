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
import org.openharness.backend.service.provider.OpenAiCompatibleAdapter;
import org.openharness.backend.service.provider.ProviderConfig;

class OpenAiFakeProviderMatrixTest {
  private HttpServer server;
  private final AtomicInteger retryAttempts = new AtomicInteger();

  @BeforeEach
  void startServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/chat/completions", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      String authorization = exchange.getRequestHeaders().getFirst("Authorization");
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
        response = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"id\\\":1}\"}}]}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}";
      } else if (body.contains("matrix-stream-malformed")) {
        contentType = "text/event-stream";
        // 故意返回截断的不合法的 json 格式以进行 fail-closed 异常捕获
        response = "data: {\"choices\":[{\"delta\":{\"content\":\"o\"}}]}\n\ndata: {\"choices\":[{\"delta\":\n\n";
      } else if (body.contains("matrix-stream")) {
        contentType = "text/event-stream";
        response = "data: {\"choices\":[{\"delta\":{\"content\":\"o\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"k\"}}]}\n\ndata: [DONE]\n\n";
      } else if (body.contains("matrix-timeout")) {
        try { Thread.sleep(500); } catch (InterruptedException e) {}
        response = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}]}";
      } else if (body.contains("matrix-cancellation")) {
        try { Thread.sleep(1000); } catch (InterruptedException e) {}
        response = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}]}";
      } else if (body.contains("matrix-reasoning")) {
        response = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\",\"reasoning_content\":\"thinking process\"}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}";
      } else {
        response = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}";
      }
      if (!"Bearer fake-key".equals(authorization)) {
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
  void stopServer() {
    server.stop(0);
  }

  @Test
  void runsDeterministicLocalMatrixWithoutPromotingUnsupportedCapabilities() throws Exception {
    OpenAiFakeProviderMatrix matrix = new OpenAiFakeProviderMatrix();

    Map<String, Object> report = matrix.run(
        "http://127.0.0.1:" + server.getAddress().getPort(), "fake-key");


    String result = (String) report.get("result");
    assertThat(result).isEqualTo("local_verified");

    List<Map<String, Object>> rows = (List<Map<String, Object>>) report.get("rows");
    Map<String, String> rowResults = new java.util.HashMap<>();
    for (Map<String, Object> row : rows) {
      String fullId = (String) row.get("id");
      String id = fullId.substring("openai-".length());
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
    OpenAiCompatibleAdapter adapter = new OpenAiCompatibleAdapter();
    ProviderConfig config = new ProviderConfig(
        "fake-openai", "openai-compatible", "http://127.0.0.1:" + server.getAddress().getPort(), "fake-key",
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
    slowServer.createContext("/chat/completions", exchange -> {
      try { Thread.sleep(300); } catch (InterruptedException e) {}
      byte[] bytes = "{\"error\":\"retry\"}".getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(503, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    slowServer.start();

    try {
      OpenAiCompatibleAdapter adapter = new OpenAiCompatibleAdapter();
      ProviderConfig config = new ProviderConfig(
          "fake-openai", "openai-compatible", "http://127.0.0.1:" + slowServer.getAddress().getPort(), "fake-key",
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

  @Test
  void testOutboundRequestHashDeterminism() {
    String url = "http://127.0.0.1/chat/completions";
    String key = "test-secret-key";

    // 1. 测试 Map Key 乱序但内容相同的 JSON
    String json1 = "{\"model\":\"gpt-4\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}],\"temperature\":0.7}";
    String json2 = "{\"temperature\":0.7,\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}],\"model\":\"gpt-4\"}";

    String hash1 = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(url, key, json1);
    String hash2 = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(url, key, json2);

    // 两个乱序 JSON 应该计算出完全相同的 Hash 值（证明 deterministic 排序有效）
    assertThat(hash1).isEqualTo(hash2);

    // 2. 测试当 body 改变时哈希必定变化
    String jsonDifferentBody = "{\"model\":\"gpt-4\",\"messages\":[{\"role\":\"user\",\"content\":\"hello world\"}],\"temperature\":0.7}";
    String hashDiffBody = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(url, key, jsonDifferentBody);
    assertThat(hash1).isNotEqualTo(hashDiffBody);

    // 3. 测试当 header 字段（如 URL 路径不同）改变时哈希必定变化
    String hashDiffUrl = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(url + "/v2", key, json1);
    assertThat(hash1).isNotEqualTo(hashDiffUrl);

    // 4. 测试当非法 JSON 传入时，必定抛出异常（fail-closed）且绝不降级为 64 个零
    org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class, () -> {
      OpenAiCompatibleAdapter.calculateCanonicalRequestHash(url, key, "{invalid-json");
    });
  }
}
