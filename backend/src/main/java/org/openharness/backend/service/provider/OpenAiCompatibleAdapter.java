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
public class OpenAiCompatibleAdapter implements ProviderAdapter {

  private final HttpClient http = HttpClient.newHttpClient();
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final Map<String, Thread> activeRequests = new java.util.concurrent.ConcurrentHashMap<>();

  @Override
  public String providerType() { return "openai-compatible"; }

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
      List<Map<String, Object>> messages = toOpenAiMessages(request.messages());
      List<Map<String, Object>> tools = toOpenAiTools(request.tools());

      // Use the actual model name from config if request model is a routing alias
      String modelName = isRealModel(request.model(), config)
          ? request.model()
          : config.models().stream().filter(m -> !m.equals("default")).findFirst().orElse(request.model());

      boolean stream = request.stream();
      Map<String, Object> body = new java.util.HashMap<>();
      body.put("model", modelName);
      body.put("messages", messages);
      if (request.meta() != null && request.meta().get("maxOutputTokens") instanceof Number maxOutputTokens) {
        body.put("max_tokens", maxOutputTokens.longValue());
      }
      if (stream) {
        body.put("stream", true);
      }
      if (!tools.isEmpty()) {
        body.put("tools", tools);
        body.put("tool_choice", "auto");
      }

      String url = config.baseUrl().endsWith("/")
          ? config.baseUrl() + "chat/completions"
          : config.baseUrl() + "/chat/completions";

      long timeoutMs = 60000;
      if (request.meta() != null && request.meta().get("timeoutMs") != null) {
        timeoutMs = ((Number) request.meta().get("timeoutMs")).longValue();
      }

      String jsonBody = objectMapper.writeValueAsString(body);
      HttpResponse<String> httpResponse = callWithRetry(request.requestId(), url, config.apiKey(), jsonBody, stream, timeoutMs);

      if (httpResponse.statusCode() != 200) {
        throw new RuntimeException("Provider error " + httpResponse.statusCode() + ": " + httpResponse.body());
      }

      OaiResponse response = objectMapper.readValue(httpResponse.body(), OaiResponse.class);
      OaiChoice choice = response.choices().get(0);
      OaiMessage msg = choice.message();

      List<Map<String, Object>> reasoningBlocks = null;
      if (msg.reasoningContent() != null && !msg.reasoningContent().isEmpty()) {
        reasoningBlocks = List.of(Map.of("type", "thinking", "text", msg.reasoningContent()));
      }

      AgentMessage agentMessage;
      if (msg.toolCalls() != null && !msg.toolCalls().isEmpty()) {
        List<ToolCall> toolCalls = msg.toolCalls().stream()
            .map(tc -> new ToolCall(tc.id(), tc.function().name(), tc.function().arguments()))
            .toList();
        agentMessage = new AgentMessage("assistant", msg.content() != null ? msg.content() : "",
            toolCalls, null, reasoningBlocks, null, null, null, null, null, null, null, null);
      } else {
        agentMessage = new AgentMessage("assistant", msg.content() != null ? msg.content() : "",
            null, null, reasoningBlocks, null, null, null, null, null, null, null, null);
      }

      OaiUsage u = response.usage();
      Map<String, Object> rawUsage = new LinkedHashMap<>();
      rawUsage.put("promptTokens", (long) (u == null ? 0 : u.promptTokens()));
      rawUsage.put("completionTokens", (long) (u == null ? 0 : u.completionTokens()));
      org.openharness.backend.qualification.QualificationExchangeCapture.merge(request.requestId(), Map.of(
          "status", "http-200", "protocol", "openai-chat-completions", "rawProviderUsage", rawUsage));
      Usage usage = u != null
          ? new Usage(u.promptTokens(), u.completionTokens(), u.totalTokens(), null, null, false, null)
          : new Usage(0, 0, 0, null, null, false, null);

      return new ModelChatResponse(request.requestId(), request.conversationId(), agentMessage, usage, config.name(), null);

    } catch (ProviderUnavailableException e) {
      throw e;
    } catch (Exception e) {
      throw new RuntimeException("OpenAI-compatible call failed: " + e.getMessage(), e);
    } finally {
      activeRequests.remove(request.requestId());
    }
  }

  private HttpResponse<String> callWithRetry(String requestId, String url, String apiKey, String jsonBody, boolean stream, long timeoutMs) throws Exception {
    Map<String, String> hs = new TreeMap<>();
    hs.put("Authorization", "Bearer [REDACTED]");
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
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", "application/json")
          .timeout(java.time.Duration.ofMillis(remainingMs))
          .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
          .build();

      try {
        if (stream) {
          HttpResponse<java.io.InputStream> httpResponse = http.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());
          if (httpResponse.statusCode() != 503) {
            if (httpResponse.statusCode() == 200) {
              String mergedBody = mergeOpenAiStream(requestId, httpResponse.body());
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

    throw new ProviderUnavailableException("Provider returned 503 after 3 retries");
  }

  private String mergeOpenAiStream(String requestId, java.io.InputStream is) throws Exception {
    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(is, java.nio.charset.StandardCharsets.UTF_8));
    StringBuilder contentBuilder = new StringBuilder();
    List<OaiStreamToolCall> toolCalls = new ArrayList<>();
    OaiUsage usage = null;
    String line;
    boolean doneReceived = false;
    int deltaCount = 0;
    while ((line = reader.readLine()) != null) {
      line = line.trim();
      if (line.isEmpty() || !line.startsWith("data:")) continue;
      String data = line.substring(5).trim();
      if ("[DONE]".equals(data)) {
        doneReceived = true;
        break;
      }
      try {
        OaiStreamChunk chunk = objectMapper.readValue(data, OaiStreamChunk.class);
        if (chunk.usage() != null) {
          usage = chunk.usage();
        }
        if (chunk.choices() != null && !chunk.choices().isEmpty()) {
          OaiStreamChoice choice = chunk.choices().get(0);
          OaiStreamDelta delta = choice.delta();
          if (delta != null) {
            if (delta.content() != null) {
              contentBuilder.append(delta.content());
              deltaCount++;
            }
            if (delta.toolCalls() != null) {
              for (OaiStreamToolCall tc : delta.toolCalls()) {
                int idx = tc.index();
                while (toolCalls.size() <= idx) {
                  toolCalls.add(new OaiStreamToolCall(idx, null, null, new OaiStreamFunction(null, new StringBuilder())));
                }
                OaiStreamToolCall existing = toolCalls.get(idx);
                if (tc.id() != null) {
                  existing.setId(tc.id());
                }
                if (tc.type() != null) {
                  existing.setType(tc.type());
                }
                if (tc.function() != null) {
                  if (tc.function().name() != null) {
                    existing.function().setName(tc.function().name());
                  }
                  if (tc.function().arguments() != null) {
                    existing.function().arguments().append(tc.function().arguments());
                  }
                }
              }
            }
          }
        }
      } catch (Exception e) {
        throw new RuntimeException("Stream chunk parse failed: " + e.getMessage() + " for data: " + data, e);
      }
    }

    if (!doneReceived) {
      throw new RuntimeException("Stream terminated unexpectedly without [DONE] marker");
    }
    org.openharness.backend.qualification.QualificationExchangeCapture.merge(requestId, Map.of(
        "streamParser", "openai-sse", "parserRequestId", requestId,
        "parserStreamEvents", List.of("stream-start", "delta", "stream-end"),
        "streamDeltaCount", deltaCount, "streamMergeComplete", true));

    Map<String, Object> responseMap = new java.util.HashMap<>();
    Map<String, Object> messageMap = new java.util.HashMap<>();
    messageMap.put("role", "assistant");
    messageMap.put("content", contentBuilder.toString());
    if (!toolCalls.isEmpty()) {
      List<Map<String, Object>> tcs = new ArrayList<>();
      for (OaiStreamToolCall tc : toolCalls) {
        tcs.add(Map.of(
            "id", tc.id() != null ? tc.id() : "",
            "type", tc.type() != null ? tc.type() : "function",
            "function", Map.of(
                "name", tc.function().name() != null ? tc.function().name() : "",
                "arguments", tc.function().arguments().toString()
            )
        ));
      }
      messageMap.put("tool_calls", tcs);
    }
    responseMap.put("choices", List.of(Map.of("message", messageMap)));
    if (usage != null) {
      responseMap.put("usage", Map.of(
          "prompt_tokens", usage.promptTokens(),
          "completion_tokens", usage.completionTokens(),
          "total_tokens", usage.totalTokens()
      ));
    }
    return objectMapper.writeValueAsString(responseMap);
  }

  // ── Format conversion ─────────────────────────────────────────────────────

  private List<Map<String, Object>> toOpenAiMessages(List<AgentMessage> messages) {
    List<Map<String, Object>> result = new ArrayList<>();
    if (messages == null) return result;
    for (AgentMessage m : messages) {
      if ("tool".equals(m.role())) {
        result.add(Map.of("role", "tool", "tool_call_id", m.toolCallId() != null ? m.toolCallId() : "", "content", str(m.content())));
      } else if (m.toolCalls() != null && !m.toolCalls().isEmpty()) {
        List<Map<String, Object>> tcs = m.toolCalls().stream()
            .map(tc -> Map.<String, Object>of("id", tc.id(), "type", "function", "function", Map.of("name", tc.name(), "arguments", tc.argumentsRaw())))
            .toList();
        result.add(Map.of("role", "assistant", "content", "", "tool_calls", tcs));
      } else {
        result.add(Map.of("role", m.role(), "content", str(m.content())));
      }
    }
    return result;
  }

  private List<Map<String, Object>> toOpenAiTools(List<ToolDefinition> tools) {
    if (tools == null) return List.of();
    return tools.stream()
        .map(t -> Map.<String, Object>of("type", "function", "function", Map.of("name", t.name(), "description", t.description(), "parameters", t.parameters())))
        .toList();
  }

  private String str(Object content) { return content != null ? String.valueOf(content) : ""; }

  private boolean isRealModel(String model, ProviderConfig config) {
    // "default" and "mock" are routing aliases, not real provider model names
    return model != null && !model.equals("default") && !model.equals("mock") && config.models().contains(model);
  }

  // ── DTOs ───────────────────────────────────────────────────────────────────

  @JsonIgnoreProperties(ignoreUnknown = true) record OaiResponse(List<OaiChoice> choices, OaiUsage usage) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiChoice(OaiMessage message) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiMessage(
      String role,
      String content,
      @JsonProperty("reasoning_content") String reasoningContent,
      @JsonProperty("tool_calls") List<OaiToolCall> toolCalls) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiToolCall(String id, String type, OaiFunction function) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiFunction(String name, String arguments) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiUsage(@JsonProperty("prompt_tokens") int promptTokens, @JsonProperty("completion_tokens") int completionTokens, @JsonProperty("total_tokens") int totalTokens) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  private static class OaiStreamChunk {
    private List<OaiStreamChoice> choices;
    private OaiUsage usage;
    public List<OaiStreamChoice> choices() { return choices; }
    public void setChoices(List<OaiStreamChoice> choices) { this.choices = choices; }
    public OaiUsage usage() { return usage; }
    public void setUsage(OaiUsage usage) { this.usage = usage; }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private static class OaiStreamChoice {
    private OaiStreamDelta delta;
    public OaiStreamDelta delta() { return delta; }
    public void setDelta(OaiStreamDelta delta) { this.delta = delta; }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private static class OaiStreamDelta {
    private String content;
    @JsonProperty("tool_calls") private List<OaiStreamToolCall> toolCalls;
    public String content() { return content; }
    public void setContent(String content) { this.content = content; }
    public List<OaiStreamToolCall> toolCalls() { return toolCalls; }
    public void setToolCalls(List<OaiStreamToolCall> toolCalls) { this.toolCalls = toolCalls; }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private static class OaiStreamToolCall {
    private int index;
    private String id;
    private String type;
    private OaiStreamFunction function;

    public OaiStreamToolCall() {}
    public OaiStreamToolCall(int index, String id, String type, OaiStreamFunction function) {
      this.index = index;
      this.id = id;
      this.type = type;
      this.function = function;
    }
    public int index() { return index; }
    public void setIndex(int index) { this.index = index; }
    public String id() { return id; }
    public void setId(String id) { this.id = id; }
    public String type() { return type; }
    public void setType(String type) { this.type = type; }
    public OaiStreamFunction function() { return function; }
    public void setFunction(OaiStreamFunction function) { this.function = function; }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private static class OaiStreamFunction {
    private String name;
    private StringBuilder arguments;

    public OaiStreamFunction() { this.arguments = new StringBuilder(); }
    public OaiStreamFunction(String name, StringBuilder arguments) {
      this.name = name;
      this.arguments = arguments;
    }
    public String name() { return name; }
    public void setName(String name) { this.name = name; }
    public StringBuilder arguments() { return arguments; }
    public void setArguments(StringBuilder arguments) { this.arguments = arguments; }
  }

  public static String calculateCanonicalRequestHash(String url, String apiKey, String jsonBody) {
    Map<String, String> hs = new TreeMap<>();
    hs.put("Authorization", "Bearer [REDACTED]");
    hs.put("Content-Type", "application/json");

    String canonicalBody;
    try {
      ObjectMapper mapper = new ObjectMapper();
      Object parsedBody = mapper.readValue(jsonBody, Object.class);
      Object sortedBody = sortKeys(parsedBody);
      canonicalBody = mapper.writeValueAsString(sortedBody);
    } catch (Exception e) {
      throw new RuntimeException("Failed to canonicalize outbound JSON body for hash", e);
    }

    Map<String, Object> outboundRequest = new LinkedHashMap<>();
    outboundRequest.put("url", url);
    outboundRequest.put("headers", hs);
    outboundRequest.put("body", canonicalBody);

    return computeSha256(outboundRequest);
  }

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
