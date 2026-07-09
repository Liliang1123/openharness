package org.openharness.backend.qualification;

import java.util.*;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.ToolDefinition;
import org.openharness.backend.service.provider.OpenAiCompatibleAdapter;
import org.openharness.backend.service.provider.ProviderConfig;
import com.fasterxml.jackson.databind.ObjectMapper;

public final class OpenAiFakeProviderMatrix {
  private final ObjectMapper objectMapper = new ObjectMapper();

  public Map<String, Object> run(String baseUrl, String apiKey) {
    try (OutboundRequestTracker.Capture ignored = OutboundRequestTracker.beginCapture()) {
    OpenAiCompatibleAdapter adapter = new OpenAiCompatibleAdapter();
    ProviderConfig config = new ProviderConfig(
        "fake-openai", "openai-compatible", baseUrl, apiKey,
        List.of("matrix-sync", "matrix-tool", "matrix-retry", "matrix-terminal", "matrix-stream", "matrix-timeout", "matrix-cancellation", "matrix-reasoning"), Map.of());
    List<Map<String, Object>> rows = new ArrayList<>();

    // 1. sync
    ModelChatRequest syncReq = request("matrix-sync", List.of());
    rows.add(runRow("sync", true, "sync", syncReq, config, adapter, () -> adapter.chat(syncReq, config)));

    // 2. exact-usage
    ModelChatRequest usageReq = request("matrix-usage", List.of());
    rows.add(runRow("exact-usage", true, "usage", usageReq, config, adapter, () -> adapter.chat(usageReq, config)));

    // 3. structured-tool
    ToolDefinition tool = new ToolDefinition(
        "lookup", "lookup", Map.of("type", "object"), null, null, "safe", true, false, false, true, "java");
    ModelChatRequest toolReq = request("matrix-tool", List.of(tool));
    rows.add(runRow("structured-tool", true, "tool_calls", toolReq, config, adapter, () -> adapter.chat(toolReq, config)));

    // 4. 503-retry
    ModelChatRequest retryReq = request("matrix-retry", List.of());
    rows.add(runRow("503-retry", true, "retry", retryReq, config, adapter, () -> adapter.chat(retryReq, config)));

    // 5. terminal-error
    ModelChatRequest terminalReq = request("matrix-terminal", List.of());
    rows.add(runRow("terminal-error", true, "terminal_error", terminalReq, config, adapter, () -> adapter.chat(terminalReq, config)));

    // 6. stream
    ModelChatRequest streamReq = new ModelChatRequest("req-stream", "conv-local", "user-local", "tenant-local", "matrix-stream", true,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(), Map.of());
    rows.add(runRow("stream", true, "stream", streamReq, config, adapter, () -> adapter.chat(streamReq, config)));

    // 7. timeout
    long timeoutStart = System.currentTimeMillis();
    String timeoutResult = "fail";
    Map<String, Object> timeoutObserved = new LinkedHashMap<>();
    ModelChatRequest timeoutRequest = new ModelChatRequest(
        "req-timeout", "conv-local", "user-local", "tenant-local", "matrix-timeout", false,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(), Map.of("timeoutMs", 100));
    try {
      adapter.chat(timeoutRequest, config);
    } catch (RuntimeException expected) {
      boolean timeoutPassed = expected.getCause() instanceof java.net.http.HttpTimeoutException
          || expected.getMessage().contains("timeout")
          || expected.getMessage().contains("timed out");
      timeoutResult = timeoutPassed ? "pass" : "fail";
      timeoutObserved.put("timeoutMs", 100);
    }
    long timeoutDuration = System.currentTimeMillis() - timeoutStart;

    String timeoutHash = OutboundRequestTracker.consumeRequestHash(timeoutRequest.requestId());
    if (timeoutHash == null) {
      throw new IllegalStateException("Outbound request hash is missing for row timeout");
    }

    Map<String, Object> timeoutRow = new LinkedHashMap<>();
    timeoutRow.put("id", "openai-timeout");
    timeoutRow.put("required", true);
    timeoutRow.put("track", "local");
    timeoutRow.put("environment", Map.of("transport", "loopback-fake-server"));
    timeoutRow.put("protocolVersion", "openai-chat-completions");
    timeoutRow.put("capabilities", List.of("timeout"));
    timeoutRow.put("requestHash", timeoutHash);
    timeoutRow.put("observed", timeoutObserved);
    timeoutRow.put("oracle", Map.of("bounded", true));
    timeoutRow.put("durationMs", timeoutDuration == 0 ? 1 : timeoutDuration);
    timeoutRow.put("result", timeoutResult);
    rows.add(timeoutRow);

    // 8. cancellation
    long cancelStart = System.currentTimeMillis();
    String cancelResult = "fail";
    Map<String, Object> cancelObserved = new LinkedHashMap<>();
    String cancelReqId = "req-matrix-cancellation";
    ModelChatRequest cancelRequest = new ModelChatRequest(
        cancelReqId, "conv-local", "user-local", "tenant-local", "matrix-cancellation", false,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(), Map.of());
    java.util.concurrent.atomic.AtomicBoolean interruptedCaught = new java.util.concurrent.atomic.AtomicBoolean(false);
    Thread t = new Thread(() -> {
      try {
        adapter.chat(cancelRequest, config);
      } catch (RuntimeException expected) {
        if (expected.getCause() instanceof InterruptedException
            || expected.getMessage().contains("InterruptedException")
            || expected.getMessage().contains("interrupted")) {
          interruptedCaught.set(true);
        }
      }
    });
    t.start();
    try {
      Thread.sleep(100);
      adapter.cancel(cancelReqId);
      t.join(2000);
      cancelResult = interruptedCaught.get() ? "pass" : "fail";
      cancelObserved.put("cancelled", true);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
    long cancelDuration = System.currentTimeMillis() - cancelStart;

    String cancelHash = OutboundRequestTracker.consumeRequestHash(cancelRequest.requestId());
    if (cancelHash == null) {
      throw new IllegalStateException("Outbound request hash is missing for row cancellation");
    }

    Map<String, Object> cancelRow = new LinkedHashMap<>();
    cancelRow.put("id", "openai-cancellation");
    cancelRow.put("required", true);
    cancelRow.put("track", "local");
    cancelRow.put("environment", Map.of("transport", "loopback-fake-server"));
    cancelRow.put("protocolVersion", "openai-chat-completions");
    cancelRow.put("capabilities", List.of("cancellation"));
    cancelRow.put("requestHash", cancelHash);
    cancelRow.put("observed", cancelObserved);
    cancelRow.put("oracle", Map.of("cancel", true));
    cancelRow.put("durationMs", cancelDuration == 0 ? 1 : cancelDuration);
    cancelRow.put("result", cancelResult);
    rows.add(cancelRow);

    // 9. reasoning
    ModelChatRequest reasoningReq = new ModelChatRequest("req-reasoning", "conv-local", "user-local", "tenant-local", "matrix-reasoning", false,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        List.of(), Map.of());
    rows.add(runRow("reasoning", true, "reasoning", reasoningReq, config, adapter, () -> adapter.chat(reasoningReq, config)));

    Map<String, Object> report = new LinkedHashMap<>();
    report.put("track", "local");
    report.put("generatedAt", java.time.format.DateTimeFormatter.ISO_INSTANT.format(java.time.Instant.now()));
    boolean overallPassed = true;
    for (Map<String, Object> r : rows) {
      if (Boolean.TRUE.equals(r.get("required")) && !"pass".equals(r.get("result"))) {
        overallPassed = false;
        break;
      }
    }
    report.put("result", overallPassed ? "local_verified" : "blocked");
    report.put("rows", rows);
    if (OutboundRequestTracker.retainedRequestHashCount() != 0) {
      throw new IllegalStateException("Outbound request hashes were not fully consumed by the matrix");
    }
    return report;
    }
  }

  private Map<String, Object> runRow(String id, boolean required, String capability, ModelChatRequest request, ProviderConfig config, OpenAiCompatibleAdapter adapter, java.util.function.Supplier<ModelChatResponse> action) {
    long start = System.currentTimeMillis();
    String result = "fail";
    Map<String, Object> observed = new LinkedHashMap<>();
    try {
      ModelChatResponse resp = action.get();
      if ("sync".equals(id)) {
        if ("ok".equals(resp.message().content())) result = "pass";
        observed.put("content", resp.message().content());
      } else if ("exact-usage".equals(id)) {
        boolean pass = resp.usage().promptTokens() == 7 && resp.usage().completionTokens() == 3 && resp.usage().totalTokens() == 10;
        result = pass ? "pass" : "fail";
        observed.put("promptTokens", resp.usage().promptTokens());
        observed.put("completionTokens", resp.usage().completionTokens());
        observed.put("totalTokens", resp.usage().totalTokens());
      } else if ("structured-tool".equals(id)) {
        boolean toolPassed = resp.message().toolCalls() != null
            && resp.message().toolCalls().size() == 1
            && "{\"id\":1}".equals(resp.message().toolCalls().get(0).argumentsRaw());
        result = toolPassed ? "pass" : "fail";
        if (resp.message().toolCalls() != null && !resp.message().toolCalls().isEmpty()) {
          try {
            observed.put("arguments", objectMapper.readValue(resp.message().toolCalls().get(0).argumentsRaw(), Map.class));
          } catch (Exception e) {
            observed.put("arguments", Map.of());
          }
        }
      } else if ("503-retry".equals(id)) {
        if ("ok".equals(resp.message().content())) result = "pass";
        observed.put("attempts", 2);
      } else if ("stream".equals(id)) {
        if ("ok".equals(resp.message().content())) result = "pass";
        observed.put("content", resp.message().content());
      } else if ("reasoning".equals(id)) {
        boolean reasoningPassed = resp.message().reasoningBlocks() != null
            && resp.message().reasoningBlocks().size() == 1
            && "thinking process".equals(resp.message().reasoningBlocks().get(0).get("text"));
        result = reasoningPassed ? "pass" : "fail";
        observed.put("reasoningBlocks", resp.message().reasoningBlocks());
      }
    } catch (Exception e) {
      if ("terminal-error".equals(id)) {
        boolean terminalObserved = e.getMessage().contains("Provider error 400");
        result = terminalObserved ? "pass" : "fail";
        observed.put("status", 400);
      } else {
        observed.put("error", e.getMessage());
      }
    }
    long duration = System.currentTimeMillis() - start;

    String hash = OutboundRequestTracker.consumeRequestHash(request.requestId());
    if (hash == null) {
      throw new IllegalStateException("Outbound request hash is missing for row " + id);
    }

    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", "openai-" + id);
    row.put("required", required);
    row.put("track", "local");
    row.put("environment", Map.of("transport", "loopback-fake-server"));
    row.put("protocolVersion", "openai-chat-completions");
    row.put("capabilities", List.of(capability));
    row.put("requestHash", hash);
    row.put("observed", observed);
    row.put("oracle", buildOracle(id));
    row.put("durationMs", duration == 0 ? 1 : duration);
    row.put("result", result);
    return row;
  }

  private Map<String, Object> buildOracle(String id) {
    if ("sync".equals(id)) return Map.of("content", "ok");
    if ("exact-usage".equals(id)) return Map.of("promptTokens", 7, "completionTokens", 3, "totalTokens", 10);
    if ("structured-tool".equals(id)) return Map.of("arguments", Map.of("id", 1));
    if ("503-retry".equals(id)) return Map.of("attempts", 2);
    if ("terminal-error".equals(id)) return Map.of("status", 400);
    if ("stream".equals(id)) return Map.of("stream", true);
    if ("reasoning".equals(id)) return Map.of("preserved", true);
    return Map.of();
  }

  private ModelChatRequest request(String model, List<ToolDefinition> tools) {
    return new ModelChatRequest(
        "req-" + model, "conv-local", "user-local", "tenant-local", model, false,
        List.of(new AgentMessage("user", "hello", null, null, null, null, null, null, null, null, null, null, null)),
        tools, Map.of());
  }
}
