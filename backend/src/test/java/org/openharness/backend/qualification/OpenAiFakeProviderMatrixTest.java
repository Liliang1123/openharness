package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.URI;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.service.provider.OpenAiCompatibleAdapter;
import org.openharness.backend.service.provider.ProviderConfig;

class OpenAiFakeProviderMatrixTest {
  private HttpServer server;
  private final AtomicInteger retryAttempts = new AtomicInteger();
  @TempDir
  Path tempDir;

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
  void formalLocalHarnessExposesAuditableFakeRetryTerminalAndCancellationEvidence() throws Exception {
    OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();

    Map<String, Object> report = matrix.runLocalFixture("fake-key");

    QualificationReportPromoter.promoteReport(
        tempDir,
        "formal-local.json",
        report,
        new QualificationReportPromoter.PromotionOptions(false, Map.of(), null));

    assertThat(report.get("track")).isEqualTo("local");
    assertThat(report.get("result")).isEqualTo("local_verified");
    Map<String, Map<String, Object>> rows = rowsById(report);

    Map<String, Object> retryObserved = observed(rows.get("openai-503-retry"));
    assertThat(retryObserved)
        .containsEntry("attempts", 2)
        .containsEntry("providerHitCount", 2)
        .containsEntry("firstStatus", 503)
        .containsEntry("terminalStatus", 200);

    Map<String, Object> terminalObserved = observed(rows.get("openai-terminal-error"));
    assertThat(terminalObserved)
        .containsEntry("status", 400)
        .containsEntry("terminalErrorClass", "Provider error 400");

    Map<String, Object> cancellationObserved = observed(rows.get("openai-cancellation"));
    assertThat(cancellationObserved)
        .containsEntry("cancelled", true)
        .containsEntry("interruptedCaught", true)
        .containsEntry("threadCompleted", true);

    assertThat(report.toString()).doesNotContain("fake-key");
  }

  @Test
  void formalProductionHarnessBlocksUnsafeRealInjectionRowsWithoutMockPass() throws Exception {
    List<String> requestBodies = new ArrayList<>();
    HttpServer backendServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    backendServer.createContext("/api/v1/model/chat", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      requestBodies.add(body);

      String authorization = exchange.getRequestHeaders().getFirst("Authorization");
      int status = "Bearer service-token".equals(authorization) ? 200 : 401;
      String response;
      if (status == 401) {
        response = "{\"error\":{\"errorClass\":\"AUTH_SERVICE_TOKEN_INVALID\",\"httpStatus\":401}}";
      } else if (body.contains("req-production-timeout")) {
        response = modelResponse(null, 0, 0, 0,
            "\"error\":{\"errorClass\":\"PROVIDER_TIMEOUT\",\"errorMessage\":\"Provider timed out.\",\"retriable\":true,\"retryOwner\":\"java\",\"maxRetries\":1,\"fallbackAllowed\":true,\"httpStatus\":504,\"recoveryHint\":null}");
      } else if (body.contains("lookup")) {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"\",\"toolCalls\":[{\"id\":\"call-1\",\"name\":\"lookup\",\"argumentsRaw\":\"{\\\"id\\\":1}\"}]}",
            7, 3, 10,
            "\"error\":null");
      } else {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
            7, 3, 10,
            "\"error\":null");
      }

      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(status, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    backendServer.start();

    try {
      OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();
      Map<String, Object> report = matrix.runProduction(new OpenAiCompatibleFormalMatrix.ProductionOptions(
          URI.create("http://127.0.0.1:" + backendServer.getAddress().getPort()),
          "service-token",
          "glm-4-flash",
          "zhipu",
          false,
          Map.of("providerType", "openai-compatible", "rawProvider", "zhipu"),
          null,
          null,
          null));

      QualificationReportPromoter.promoteReport(
          tempDir,
          "formal-production.json",
          report,
          new QualificationReportPromoter.PromotionOptions(false, Map.of(), null));

      assertThat(report.get("track")).isEqualTo("production");
      assertThat(report.get("result")).isEqualTo("blocked");
      assertThat(requestBodies).hasSize(6);

      Map<String, Map<String, Object>> rows = rowsById(report);
      assertThat(rows.get("openai-zhipu-timeout").get("result")).isEqualTo("pass");
      assertThat(observed(rows.get("openai-zhipu-timeout")))
          .containsEntry("errorClass", "PROVIDER_TIMEOUT")
          .containsEntry("structuredStatus", 504)
          .containsEntry("timeoutSeen", true);

      assertBlockedWithoutSending(rows.get("openai-zhipu-retry"));
      assertBlockedWithoutSending(rows.get("openai-zhipu-terminal-error"));
      assertThat(observed(rows.get("openai-zhipu-cancellation")).get("requestSent")).isEqualTo(true);
      assertThat(observed(rows.get("openai-zhipu-cancellation"))).containsKey("blockedReason");
      assertThat(observed(rows.get("openai-zhipu-cancellation")).get("cancelRequestSent")).isIn(false, true);

      assertThat(report.toString()).doesNotContain("service-token");
    } finally {
      backendServer.stop(0);
    }
  }

  @Test
  void formalProductionHarnessPassesCancellationRowWhenBackendProvidesPublicCancelEndpoint() throws Exception {
    AtomicBoolean cancelRequested = new AtomicBoolean(false);
    HttpServer backendServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    backendServer.createContext("/api/v1/model/chat", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      String response;
      if (body.contains("req-production-cancellation")) {
        int waits = 0;
        while (!cancelRequested.get() && waits < 40) {
          try {
            Thread.sleep(30);
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            break;
          }
          waits++;
        }
        if (cancelRequested.get()) {
          response = modelResponse(
              "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
              0,
              0,
              0,
              "\"error\":{\"errorClass\":\"PROVIDER_CANCELLED\",\"errorMessage\":\"Model request cancelled.\",\"retriable\":false,\"retryOwner\":\"none\",\"maxRetries\":0,\"fallbackAllowed\":false,\"httpStatus\":409}");
        } else {
          response = modelResponse(
              "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
              0,
              0,
              0,
              "\"error\":null");
        }
      } else if (body.contains("lookup")) {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"\",\"toolCalls\":[{\"id\":\"call-1\",\"name\":\"lookup\",\"argumentsRaw\":\"{\\\"id\\\":1}\"}]}",
            7, 3, 10,
            "\"error\":null");
      } else {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
            7, 3, 10,
            "\"error\":null");
      }
      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(200, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    backendServer.createContext("/api/v1/model/cancel", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      if (!body.contains("req-production-cancellation")) {
        exchange.sendResponseHeaders(400, 0);
        exchange.close();
        return;
      }
      cancelRequested.set(true);
      String response = "{\"requestId\":\"req-production-cancellation\",\"cancelled\":true}";
      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(200, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    backendServer.setExecutor(Executors.newCachedThreadPool());
    backendServer.start();

    try {
      OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();
      Map<String, Object> report = matrix.runProduction(new OpenAiCompatibleFormalMatrix.ProductionOptions(
          URI.create("http://127.0.0.1:" + backendServer.getAddress().getPort()),
          "service-token",
          "glm-4-flash",
          "zhipu",
          false,
          Map.of("providerType", "openai-compatible", "rawProvider", "zhipu"),
          null,
          null,
          null));

      Map<String, Map<String, Object>> rows = rowsById(report);
      Map<String, Object> cancellationRow = rows.get("openai-zhipu-cancellation");
      assertThat(cancellationRow.get("result")).isEqualTo("pass");
      assertThat(observed(cancellationRow))
          .containsEntry("cancelRequestSent", true)
          .containsEntry("cancelled", true)
          .containsEntry("chatCompleted", true)
          .containsEntry("errorClass", "PROVIDER_CANCELLED")
          .containsEntry("structuredStatus", 409);
      assertThat(cancelRequested.get()).isTrue();
      assertThat(report.toString()).doesNotContain("service-token");
    } finally {
      backendServer.stop(0);
    }
  }

  @Test
  void formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks() throws Exception {
    HttpServer backendServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    backendServer.createContext("/api/v1/model/chat", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      String response;
      if (body.contains("req-production-reasoning")) {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"ok\",\"reasoningBlocks\":[{\"type\":\"text\",\"text\":\"thinking process\"}]}",
            7, 3, 10,
            "\"error\":null");
      } else if (body.contains("req-production-timeout")) {
        response = modelResponse(null, 0, 0, 0,
            "\"error\":{\"errorClass\":\"PROVIDER_TIMEOUT\",\"errorMessage\":\"Provider timed out.\",\"retriable\":true,\"retryOwner\":\"java\",\"maxRetries\":1,\"fallbackAllowed\":true,\"httpStatus\":504,\"recoveryHint\":null}");
      } else if (body.contains("lookup")) {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"\",\"toolCalls\":[{\"id\":\"call-1\",\"name\":\"lookup\",\"argumentsRaw\":\"{\\\"id\\\":1}\"}]}",
            7, 3, 10,
            "\"error\":null");
      } else {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
            7, 3, 10,
            "\"error\":null");
      }

      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(200, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    backendServer.start();

    try {
      OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();
      Map<String, Object> report = matrix.runProduction(new OpenAiCompatibleFormalMatrix.ProductionOptions(
          URI.create("http://127.0.0.1:" + backendServer.getAddress().getPort()),
          "service-token",
          "glm-4-flash",
          "zhipu",
          false,
          Map.of("providerType", "openai-compatible", "rawProvider", "zhipu"),
          null,
          null,
          "glm-4.7-flash"));

      Map<String, Map<String, Object>> rows = rowsById(report);
      Map<String, Object> reasoningRow = rows.get("openai-zhipu-reasoning");

      assertThat(reasoningRow).isNotNull();
      assertThat(reasoningRow.get("result")).isEqualTo("pass");
      Map<String, Object> observed = observed(reasoningRow);
      assertThat(observed).containsEntry("requestSent", true);
      assertThat(observed).containsKey("reasoningBlocks");

      @SuppressWarnings("unchecked")
      List<Map<String, Object>> blocks = (List<Map<String, Object>>) observed.get("reasoningBlocks");
      assertThat(blocks).isNotEmpty();
      assertThat(blocks.get(0)).containsEntry("type", "text").containsEntry("text", "thinking process");
    } finally {
      backendServer.stop(0);
    }
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

  @Test
  void formalProductionHarnessPassesSafeTerminalErrorViaAdapterWhenProviderReturns400() throws Exception {
    HttpServer providerServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicInteger providerHits = new AtomicInteger();
    providerServer.createContext("/chat/completions", exchange -> {
      providerHits.incrementAndGet();
      byte[] bytes = "{\"error\":{\"message\":\"model not found\",\"code\":\"invalid_request_error\"}}"
          .getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(400, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    providerServer.start();

    HttpServer backendServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    backendServer.createContext("/api/v1/model/chat", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      String response;
      if (body.contains("req-production-timeout")) {
        response = modelResponse(null, 0, 0, 0,
            "\"error\":{\"errorClass\":\"PROVIDER_TIMEOUT\",\"errorMessage\":\"Provider timed out.\",\"retriable\":true,\"retryOwner\":\"java\",\"maxRetries\":1,\"fallbackAllowed\":true,\"httpStatus\":504,\"recoveryHint\":null}");
      } else if (body.contains("lookup")) {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"\",\"toolCalls\":[{\"id\":\"call-1\",\"name\":\"lookup\",\"argumentsRaw\":\"{\\\"id\\\":1}\"}]}",
            7, 3, 10,
            "\"error\":null");
      } else {
        response = modelResponse(
            "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
            7, 3, 10,
            "\"error\":null");
      }
      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(200, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    backendServer.start();

    try {
      OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();
      Map<String, Object> report = matrix.runProduction(new OpenAiCompatibleFormalMatrix.ProductionOptions(
          URI.create("http://127.0.0.1:" + backendServer.getAddress().getPort()),
          "service-token",
          "glm-4-flash",
          "zhipu",
          false,
          Map.of("providerType", "openai-compatible"),
          "adapter-probe-key",
          "http://127.0.0.1:" + providerServer.getAddress().getPort(),
          null));

      Map<String, Map<String, Object>> rows = rowsById(report);
      assertThat(rows.get("openai-zhipu-terminal-error").get("result")).isEqualTo("pass");
      assertThat(observed(rows.get("openai-zhipu-terminal-error")))
          .containsEntry("requestSent", true)
          .containsEntry("providerHttpStatus", 400)
          .containsEntry("transport", "adapter-real-provider");
      assertThat(providerHits.get()).isEqualTo(1);
      assertThat(report.toString()).doesNotContain("adapter-probe-key");
      assertBlockedWithoutSending(rows.get("openai-zhipu-retry"));
    } finally {
      providerServer.stop(0);
      backendServer.stop(0);
    }
  }

  @Test
  void formalProductionHarnessBlocksTerminalErrorWhenAdapterProbeKeyMissing() throws Exception {
    HttpServer backendServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    backendServer.createContext("/api/v1/model/chat", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      String response = body.contains("req-production-timeout")
          ? modelResponse(null, 0, 0, 0,
              "\"error\":{\"errorClass\":\"PROVIDER_TIMEOUT\",\"errorMessage\":\"Provider timed out.\",\"retriable\":true,\"retryOwner\":\"java\",\"maxRetries\":1,\"fallbackAllowed\":true,\"httpStatus\":504,\"recoveryHint\":null}")
          : modelResponse(
              "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
              7, 3, 10,
              "\"error\":null");
      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(200, bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });
    backendServer.start();
    try {
      OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();
      Map<String, Object> report = matrix.runProduction(new OpenAiCompatibleFormalMatrix.ProductionOptions(
          URI.create("http://127.0.0.1:" + backendServer.getAddress().getPort()),
          "service-token",
          "glm-4-flash",
          "zhipu",
          false,
          Map.of("providerType", "openai-compatible"),
          null,
          null,
          null));
      assertBlockedWithoutSending(rowsById(report).get("openai-zhipu-terminal-error"));
    } finally {
      backendServer.stop(0);
    }
  }

  private static void assertBlockedWithoutSending(Map<String, Object> row) {
    assertThat(row.get("result")).isEqualTo("blocked");
    assertThat(observed(row))
        .containsEntry("requestSent", false)
        .containsKey("blockedReason");
  }

  private static Map<String, Map<String, Object>> rowsById(Map<String, Object> report) {
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) report.get("rows");
    Map<String, Map<String, Object>> byId = new HashMap<>();
    for (Map<String, Object> row : rows) {
      byId.put((String) row.get("id"), row);
    }
    return byId;
  }

  private static Map<String, Object> observed(Map<String, Object> row) {
    @SuppressWarnings("unchecked")
    Map<String, Object> observed = (Map<String, Object>) row.get("observed");
    return observed;
  }

  private static String modelResponse(String messageJson, int promptTokens, int completionTokens, int totalTokens, String errorJson) {
    String messagePart = messageJson != null ? messageJson + "," : "\"message\":null,";
    return "{"
        + "\"requestId\":\"response-id\","
        + "\"conversationId\":\"conv-production\","
        + messagePart
        + "\"usage\":{\"promptTokens\":" + promptTokens
        + ",\"completionTokens\":" + completionTokens
        + ",\"totalTokens\":" + totalTokens
        + ",\"cacheReadTokens\":null,\"cacheWriteTokens\":null,\"totalIsPerTurn\":false,\"costUsdMicros\":123},"
        + "\"rawProvider\":\"zhipu\","
        + errorJson
        + "}";
  }
}
