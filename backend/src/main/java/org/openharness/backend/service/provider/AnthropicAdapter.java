package org.openharness.backend.service.provider;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.*;
import org.openharness.backend.model.Contracts.*;
import org.springframework.stereotype.Component;

@Component
public class AnthropicAdapter implements ProviderAdapter {

  private static final String API_VERSION = "2023-06-01";
  private final HttpClient http = HttpClient.newHttpClient();
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final Map<String, Thread> activeRequests = new java.util.concurrent.ConcurrentHashMap<>();

  @Override
  public String providerType() { return "anthropic"; }

  @Override
  public void cancel(String requestId) {
    Thread thread = activeRequests.get(requestId);
    if (thread != null) {
      thread.interrupt();
    }
  }

  @Override
  public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
    activeRequests.put(request.requestId(), Thread.currentThread());
    try {
      String systemPrompt = extractSystem(request.messages());
      List<Map<String, Object>> messages = toAnthropicMessages(request.messages());
      applyCacheHints(messages, request.meta());
      List<Map<String, Object>> tools = toAnthropicTools(request.tools());

      boolean stream = request.stream();
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("model", request.model());
      body.put("max_tokens", 4096);
      if (systemPrompt != null) body.put("system", systemPrompt);
      body.put("messages", messages);
      if (!tools.isEmpty()) body.put("tools", tools);
      if (stream) body.put("stream", true);

      String url = config.baseUrl().endsWith("/")
          ? config.baseUrl() + "v1/messages"
          : config.baseUrl() + "/v1/messages";

      long timeoutMs = 60000;
      if (request.meta() != null && request.meta().get("timeoutMs") != null) {
        timeoutMs = ((Number) request.meta().get("timeoutMs")).longValue();
      }

      String jsonBody = objectMapper.writeValueAsString(body);
      HttpResponse<String> httpResponse = callWithRetry(request.requestId(), url, config.apiKey(), jsonBody, stream, timeoutMs);

      if (httpResponse.statusCode() != 200) {
        throw new RuntimeException("Anthropic error " + httpResponse.statusCode() + ": " + httpResponse.body());
      }

      AnthropicResponse response = objectMapper.readValue(httpResponse.body(), AnthropicResponse.class);
      return toModelChatResponse(request, response, config.name());

    } catch (ProviderUnavailableException e) {
      throw e;
    } catch (Exception e) {
      throw new RuntimeException("Anthropic call failed: " + e.getMessage(), e);
    } finally {
      activeRequests.remove(request.requestId());
    }
  }

  // ── Cache Hints ────────────────────────────────────────────────────────────

  @SuppressWarnings("unchecked")
  private void applyCacheHints(List<Map<String, Object>> messages, Map<String, Object> meta) {
    if (meta == null) return;
    Object hintsObj = meta.get("cacheHints");
    if (!(hintsObj instanceof List<?> hints) || hints.isEmpty()) return;

    int totalMessages = messages.size();
    for (Object hintObj : hints) {
      if (!(hintObj instanceof Map<?, ?> hint)) continue;
      Object idxObj = hint.get("messageIndexFromTail");
      if (!(idxObj instanceof Number idx)) continue;

      int targetIndex = totalMessages - idx.intValue();
      if (targetIndex < 0 || targetIndex >= totalMessages) continue;

      Map<String, Object> msg = messages.get(targetIndex);
      Object contentObj = msg.get("content");
      if (contentObj instanceof List<?> contentList && !contentList.isEmpty()) {
        // Add cache_control to last content block
        List<Map<String, Object>> blocks = (List<Map<String, Object>>) contentList;
        Map<String, Object> lastBlock = new LinkedHashMap<>(blocks.get(blocks.size() - 1));
        lastBlock.put("cache_control", Map.of("type", "ephemeral"));
        blocks.set(blocks.size() - 1, lastBlock);
      } else if (contentObj instanceof String text) {
        // Convert string content to block format with cache_control
        msg.put("content", List.of(Map.of("type", "text", "text", text, "cache_control", Map.of("type", "ephemeral"))));
      }
    }
  }

  // ── Format conversion ─────────────────────────────────────────────────────

  private String extractSystem(List<AgentMessage> messages) {
    if (messages == null) return null;
    for (AgentMessage m : messages) {
      if ("system".equals(m.role())) return str(m.content());
    }
    return null;
  }

  private List<Map<String, Object>> toAnthropicMessages(List<AgentMessage> messages) {
    List<Map<String, Object>> result = new ArrayList<>();
    if (messages == null) return result;
    for (AgentMessage m : messages) {
      if ("system".equals(m.role())) continue;
      if ("tool".equals(m.role())) {
        result.add(Map.of("role", "user", "content", List.of(
            new LinkedHashMap<>(Map.of("type", "tool_result", "tool_use_id", m.toolCallId() != null ? m.toolCallId() : "", "content", str(m.content()))))));
      } else if (m.toolCalls() != null && !m.toolCalls().isEmpty()) {
        List<Map<String, Object>> blocks = new ArrayList<>();
        if (m.content() != null && !str(m.content()).isEmpty()) {
          blocks.add(new LinkedHashMap<>(Map.of("type", "text", "text", str(m.content()))));
        }
        for (ToolCall tc : m.toolCalls()) {
          Map<String, Object> block = new LinkedHashMap<>();
          block.put("type", "tool_use");
          block.put("id", tc.id());
          block.put("name", tc.name());
          try { block.put("input", objectMapper.readValue(tc.argumentsRaw(), Map.class)); }
          catch (Exception e) { block.put("input", Map.of()); }
          blocks.add(block);
        }
        result.add(Map.of("role", "assistant", "content", blocks));
      } else {
        result.add(new LinkedHashMap<>(Map.of("role", m.role(), "content", str(m.content()))));
      }
    }
    return result;
  }

  private List<Map<String, Object>> toAnthropicTools(List<ToolDefinition> tools) {
    if (tools == null) return List.of();
    return tools.stream()
        .map(t -> Map.<String, Object>of("name", t.name(), "description", t.description(), "input_schema", t.parameters()))
        .toList();
  }

  private ModelChatResponse toModelChatResponse(ModelChatRequest request, AnthropicResponse response, String providerName) {
    List<ToolCall> toolCalls = new ArrayList<>();
    StringBuilder textContent = new StringBuilder();
    List<Map<String, Object>> reasoningBlocks = new ArrayList<>();

    if (response.content() != null) {
      for (AnthropicContentBlock block : response.content()) {
        if ("text".equals(block.type())) {
          textContent.append(block.text() != null ? block.text() : "");
        } else if ("thinking".equals(block.type())) {
          Map<String, Object> rb = new LinkedHashMap<>();
          rb.put("type", "thinking");
          rb.put("text", block.thinking());
          if (block.signature() != null) {
            rb.put("signature", block.signature());
          }
          reasoningBlocks.add(rb);
        } else if ("redacted_thinking".equals(block.type())) {
          Map<String, Object> rb = new LinkedHashMap<>();
          rb.put("type", "redacted_thinking");
          rb.put("data", block.data());
          reasoningBlocks.add(rb);
        } else if ("tool_use".equals(block.type())) {
          String argsRaw;
          try { argsRaw = objectMapper.writeValueAsString(block.input()); }
          catch (Exception e) { argsRaw = "{}"; }
          toolCalls.add(new ToolCall(block.id(), block.name(), argsRaw));
        }
      }
    }

    AgentMessage message = new AgentMessage("assistant", textContent.toString(),
        toolCalls.isEmpty() ? null : toolCalls, null,
        reasoningBlocks.isEmpty() ? null : reasoningBlocks,
        null, null, null, null, null, null, null, null);

    Usage usage = response.usage() != null
        ? new Usage(response.usage().inputTokens(), response.usage().outputTokens(),
            response.usage().inputTokens() + response.usage().outputTokens(),
            response.usage().cacheReadInputTokens(), response.usage().cacheCreationInputTokens(), true, null)
        : new Usage(0, 0, 0, null, null, true, null);

    return new ModelChatResponse(request.requestId(), request.conversationId(), message, usage, providerName, null);
  }

  // ── HTTP with retry ────────────────────────────────────────────────────────

  private HttpResponse<String> callWithRetry(String requestId, String url, String apiKey, String jsonBody, boolean stream, long timeoutMs) throws Exception {
    Map<String, String> hs = new TreeMap<>();
    hs.put("x-api-key", "[REDACTED]");
    hs.put("anthropic-version", API_VERSION);
    hs.put("Content-Type", "application/json");

    String canonicalBody;
    try {
      Object parsedBody = objectMapper.readValue(jsonBody, Object.class);
      Object sortedBody = sortKeys(parsedBody);
      canonicalBody = objectMapper.writeValueAsString(sortedBody);
    } catch (Exception e) {
      throw new RuntimeException("Failed to canonicalize outbound JSON body for hash", e);
    }

    Map<String, Object> outboundRequest = new LinkedHashMap<>();
    outboundRequest.put("url", url);
    outboundRequest.put("headers", hs);
    outboundRequest.put("body", canonicalBody);

    String requestHash = computeSha256(outboundRequest);
    org.openharness.backend.qualification.OutboundRequestTracker.setRequestHash(requestId, requestHash);

    int[] delays = {200, 400, 800};
    HttpResponse<?> lastResponse = null;
    long deadline = System.currentTimeMillis() + timeoutMs;

    for (int attempt = 0; attempt <= 3; attempt++) {
      long remainingMs = deadline - System.currentTimeMillis();
      if (remainingMs <= 0) {
        throw new java.net.http.HttpTimeoutException("Total timeout deadline exceeded across retries");
      }

      HttpRequest httpRequest = HttpRequest.newBuilder()
          .uri(URI.create(url))
          .header("x-api-key", apiKey)
          .header("anthropic-version", API_VERSION)
          .header("Content-Type", "application/json")
          .timeout(java.time.Duration.ofMillis(remainingMs))
          .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
          .build();

      try {
        if (stream) {
          HttpResponse<java.io.InputStream> httpResponse = http.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());
          if (httpResponse.statusCode() != 503) {
            if (httpResponse.statusCode() == 200) {
              String mergedBody = mergeAnthropicStream(httpResponse.body());
              return new SimpleHttpResponse<>(200, mergedBody);
            } else {
              String errBody = new String(httpResponse.body().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
              return new SimpleHttpResponse<>(httpResponse.statusCode(), errBody);
            }
          }
          lastResponse = httpResponse;
        } else {
          HttpResponse<String> httpResponse = http.send(httpRequest, HttpResponse.BodyHandlers.ofString());
          if (httpResponse.statusCode() != 503) return httpResponse;
          lastResponse = httpResponse;
        }
      } catch (java.io.IOException e) {
        if (e.getCause() instanceof InterruptedException) {
          throw (InterruptedException) e.getCause();
        }
        if (e instanceof java.net.http.HttpTimeoutException) {
          throw e;
        }
        throw e;
      }

      if (attempt < 3) {
        long sleepTime = delays[attempt];
        long timeLeft = deadline - System.currentTimeMillis();
        if (timeLeft <= 0) {
          throw new java.net.http.HttpTimeoutException("Total timeout deadline exceeded during retry wait");
        }
        Thread.sleep(Math.min(sleepTime, timeLeft));
      }
    }

    throw new ProviderUnavailableException("Anthropic returned 503 after 3 retries");
  }

  private String mergeAnthropicStream(java.io.InputStream is) throws Exception {
    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(is, java.nio.charset.StandardCharsets.UTF_8));
    StringBuilder textContent = new StringBuilder();
    Map<Integer, Map<String, Object>> contentBlocks = new java.util.TreeMap<>();
    int inputTokens = 0;
    int outputTokens = 0;
    Integer cacheReadTokens = null;
    Integer cacheWriteTokens = null;
    String stopReason = null;
    boolean doneReceived = false;

    String line;
    while ((line = reader.readLine()) != null) {
      line = line.trim();
      if (line.isEmpty() || !line.startsWith("data:")) continue;
      String data = line.substring(5).trim();
      if (data.isEmpty()) continue;
      try {
        Map<String, Object> chunk = objectMapper.readValue(data, Map.class);
        String type = (String) chunk.get("type");
        if ("message_stop".equals(type)) {
          doneReceived = true;
          break;
        }
        if ("message_start".equals(type)) {
          Map<String, Object> message = (Map<String, Object>) chunk.get("message");
          if (message != null && message.get("usage") != null) {
            Map<String, Object> usage = (Map<String, Object>) message.get("usage");
            if (usage.get("input_tokens") != null) inputTokens = ((Number) usage.get("input_tokens")).intValue();
            if (usage.get("output_tokens") != null) outputTokens = ((Number) usage.get("output_tokens")).intValue();
            if (usage.get("cache_read_input_tokens") != null) cacheReadTokens = ((Number) usage.get("cache_read_input_tokens")).intValue();
            if (usage.get("cache_creation_input_tokens") != null) cacheWriteTokens = ((Number) usage.get("cache_creation_input_tokens")).intValue();
          }
        } else if ("content_block_start".equals(type)) {
          int index = ((Number) chunk.get("index")).intValue();
          Map<String, Object> block = (Map<String, Object>) chunk.get("content_block");
          Map<String, Object> newBlock = new java.util.HashMap<>(block);
          if ("text".equals(block.get("type"))) {
            newBlock.put("text", new StringBuilder(block.get("text") != null ? (String) block.get("text") : ""));
          } else if ("thinking".equals(block.get("type"))) {
            newBlock.put("thinking", new StringBuilder(block.get("thinking") != null ? (String) block.get("thinking") : ""));
          } else if ("redacted_thinking".equals(block.get("type"))) {
            newBlock.put("data", new StringBuilder(block.get("data") != null ? (String) block.get("data") : ""));
          } else if ("tool_use".equals(block.get("type"))) {
            newBlock.put("input", new StringBuilder());
          }
          contentBlocks.put(index, newBlock);
        } else if ("content_block_delta".equals(type)) {
          int index = ((Number) chunk.get("index")).intValue();
          Map<String, Object> block = contentBlocks.get(index);
          if (block != null) {
            Map<String, Object> delta = (Map<String, Object>) chunk.get("delta");
            if (delta != null) {
              String deltaType = (String) delta.get("type");
              if ("text_delta".equals(deltaType)) {
                StringBuilder sb = (StringBuilder) block.get("text");
                if (sb != null) sb.append(delta.get("text"));
              } else if ("thinking_delta".equals(deltaType)) {
                StringBuilder sb = (StringBuilder) block.get("thinking");
                if (sb != null) sb.append(delta.get("thinking"));
              } else if ("signature_delta".equals(deltaType)) {
                block.put("signature", delta.get("signature"));
              } else if ("input_json_delta".equals(deltaType)) {
                StringBuilder sb = (StringBuilder) block.get("input");
                if (sb != null) sb.append(delta.get("partial_json"));
              }
            }
          }
        } else if ("message_delta".equals(type)) {
          Map<String, Object> delta = (Map<String, Object>) chunk.get("delta");
          if (delta != null && delta.get("stop_reason") != null) {
            stopReason = (String) delta.get("stop_reason");
          }
          if (chunk.get("usage") != null) {
            Map<String, Object> usage = (Map<String, Object>) chunk.get("usage");
            if (usage.get("output_tokens") != null) outputTokens = ((Number) usage.get("output_tokens")).intValue();
          }
        }
      } catch (Exception e) {
        throw new RuntimeException("Stream chunk parse failed: " + e.getMessage() + " for data: " + data, e);
      }
    }

    if (!doneReceived) {
      throw new RuntimeException("Stream terminated unexpectedly without message_stop marker");
    }

    Map<String, Object> responseMap = new java.util.HashMap<>();
    responseMap.put("id", "msg-stream");
    responseMap.put("type", "message");
    responseMap.put("role", "assistant");
    if (stopReason != null) {
      responseMap.put("stop_reason", stopReason);
    }

    List<Map<String, Object>> contentList = new ArrayList<>();
    for (Map<String, Object> block : contentBlocks.values()) {
      Map<String, Object> finalBlock = new java.util.HashMap<>();
      String blockType = (String) block.get("type");
      finalBlock.put("type", blockType);
      if ("text".equals(blockType)) {
        finalBlock.put("text", block.get("text").toString());
      } else if ("thinking".equals(blockType)) {
        finalBlock.put("thinking", block.get("thinking").toString());
        if (block.get("signature") != null) {
          finalBlock.put("signature", block.get("signature"));
        }
      } else if ("redacted_thinking".equals(blockType)) {
        finalBlock.put("data", block.get("data").toString());
      } else if ("tool_use".equals(blockType)) {
        finalBlock.put("id", block.get("id"));
        finalBlock.put("name", block.get("name"));
        try {
          finalBlock.put("input", objectMapper.readValue(block.get("input").toString(), Map.class));
        } catch (Exception e) {
          finalBlock.put("input", Map.of());
        }
      }
      contentList.add(finalBlock);
    }
    responseMap.put("content", contentList);

    Map<String, Object> usageMap = new java.util.HashMap<>();
    usageMap.put("input_tokens", inputTokens);
    usageMap.put("output_tokens", outputTokens);
    if (cacheReadTokens != null) usageMap.put("cache_read_input_tokens", cacheReadTokens);
    if (cacheWriteTokens != null) usageMap.put("cache_creation_input_tokens", cacheWriteTokens);
    responseMap.put("usage", usageMap);

    return objectMapper.writeValueAsString(responseMap);
  }

  private String str(Object content) { return content != null ? String.valueOf(content) : ""; }

  // ── DTOs ───────────────────────────────────────────────────────────────────

  @JsonIgnoreProperties(ignoreUnknown = true)
  record AnthropicResponse(String id, String type, String role, List<AnthropicContentBlock> content, AnthropicUsage usage, @JsonProperty("stop_reason") String stopReason) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record AnthropicContentBlock(
      String type,
      String text,
      String id,
      String name,
      Object input,
      String thinking,
      String signature,
      String data) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record AnthropicUsage(@JsonProperty("input_tokens") int inputTokens, @JsonProperty("output_tokens") int outputTokens,
      @JsonProperty("cache_read_input_tokens") Integer cacheReadInputTokens, @JsonProperty("cache_creation_input_tokens") Integer cacheCreationInputTokens) {}

  private static Object sortKeys(Object obj) {
    if (obj instanceof Map<?, ?> map) {
      Map<String, Object> sorted = new TreeMap<>();
      map.forEach((k, v) -> sorted.put(String.valueOf(k), sortKeys(v)));
      return sorted;
    }
    if (obj instanceof List<?> list) {
      List<Object> sortedList = new ArrayList<>();
      for (Object item : list) {
        sortedList.add(sortKeys(item));
      }
      return sortedList;
    }
    return obj;
  }

  private static String computeSha256(Object obj) {
    try {
      ObjectMapper mapper = new ObjectMapper();
      String json = mapper.writeValueAsString(obj);
      java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      StringBuilder hexString = new StringBuilder();
      for (byte b : hash) {
        String hex = Integer.toHexString(0xff & b);
        if (hex.length() == 1) hexString.append('0');
        hexString.append(hex);
      }
      return hexString.toString();
    } catch (Exception e) {
      throw new RuntimeException("Failed to compute SHA-256 request hash", e);
    }
  }

  private static class SimpleHttpResponse<T> implements java.net.http.HttpResponse<T> {
    private final int statusCode;
    private final T body;

    public SimpleHttpResponse(int statusCode, T body) {
      this.statusCode = statusCode;
      this.body = body;
    }

    @Override public int statusCode() { return statusCode; }
    @Override public java.net.http.HttpRequest request() { return null; }
    @Override public java.util.Optional<java.net.http.HttpResponse<T>> previousResponse() { return java.util.Optional.empty(); }
    @Override public java.net.http.HttpHeaders headers() { return null; }
    @Override public T body() { return body; }
    @Override public java.net.URI uri() { return null; }
    @Override public java.util.Optional<javax.net.ssl.SSLSession> sslSession() { return java.util.Optional.empty(); }
    @Override public java.net.http.HttpClient.Version version() { return null; }
  }
}
