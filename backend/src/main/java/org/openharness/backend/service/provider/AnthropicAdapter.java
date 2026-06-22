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

  @Override
  public String providerType() { return "anthropic"; }

  @Override
  public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
    try {
      String systemPrompt = extractSystem(request.messages());
      List<Map<String, Object>> messages = toAnthropicMessages(request.messages());
      applyCacheHints(messages, request.meta());
      List<Map<String, Object>> tools = toAnthropicTools(request.tools());

      Map<String, Object> body = new LinkedHashMap<>();
      body.put("model", request.model());
      body.put("max_tokens", 4096);
      if (systemPrompt != null) body.put("system", systemPrompt);
      body.put("messages", messages);
      if (!tools.isEmpty()) body.put("tools", tools);

      String url = config.baseUrl().endsWith("/")
          ? config.baseUrl() + "v1/messages"
          : config.baseUrl() + "/v1/messages";

      String jsonBody = objectMapper.writeValueAsString(body);
      HttpResponse<String> httpResponse = callWithRetry(url, config.apiKey(), jsonBody);

      if (httpResponse.statusCode() != 200) {
        throw new RuntimeException("Anthropic error " + httpResponse.statusCode() + ": " + httpResponse.body());
      }

      AnthropicResponse response = objectMapper.readValue(httpResponse.body(), AnthropicResponse.class);
      return toModelChatResponse(request, response, config.name());

    } catch (ProviderUnavailableException e) {
      throw e;
    } catch (Exception e) {
      throw new RuntimeException("Anthropic call failed: " + e.getMessage(), e);
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

    if (response.content() != null) {
      for (AnthropicContentBlock block : response.content()) {
        if ("text".equals(block.type())) {
          textContent.append(block.text() != null ? block.text() : "");
        } else if ("tool_use".equals(block.type())) {
          String argsRaw;
          try { argsRaw = objectMapper.writeValueAsString(block.input()); }
          catch (Exception e) { argsRaw = "{}"; }
          toolCalls.add(new ToolCall(block.id(), block.name(), argsRaw));
        }
      }
    }

    AgentMessage message = toolCalls.isEmpty()
        ? new AgentMessage("assistant", textContent.toString(), null, null, null, null, null, null, null, null, null, null, null)
        : new AgentMessage("assistant", textContent.toString(), toolCalls, null, null, null, null, null, null, null, null, null, null);

    Usage usage = response.usage() != null
        ? new Usage(response.usage().inputTokens(), response.usage().outputTokens(),
            response.usage().inputTokens() + response.usage().outputTokens(),
            response.usage().cacheReadInputTokens(), response.usage().cacheCreationInputTokens(), true, null)
        : new Usage(0, 0, 0, null, null, true, null);

    return new ModelChatResponse(request.requestId(), request.conversationId(), message, usage, providerName, null);
  }

  // ── HTTP with retry ────────────────────────────────────────────────────────

  private HttpResponse<String> callWithRetry(String url, String apiKey, String jsonBody) throws Exception {
    int[] delays = {200, 400, 800};
    HttpResponse<String> lastResponse = null;

    for (int attempt = 0; attempt <= 3; attempt++) {
      HttpRequest httpRequest = HttpRequest.newBuilder()
          .uri(URI.create(url))
          .header("x-api-key", apiKey)
          .header("anthropic-version", API_VERSION)
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
          .build();

      lastResponse = http.send(httpRequest, HttpResponse.BodyHandlers.ofString());
      if (lastResponse.statusCode() != 503) return lastResponse;
      if (attempt < 3) Thread.sleep(delays[attempt]);
    }

    throw new ProviderUnavailableException("Anthropic returned 503 after 3 retries");
  }

  private String str(Object content) { return content != null ? String.valueOf(content) : ""; }

  // ── DTOs ───────────────────────────────────────────────────────────────────

  @JsonIgnoreProperties(ignoreUnknown = true)
  record AnthropicResponse(String id, String type, String role, List<AnthropicContentBlock> content, AnthropicUsage usage, @JsonProperty("stop_reason") String stopReason) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record AnthropicContentBlock(String type, String text, String id, String name, Object input) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record AnthropicUsage(@JsonProperty("input_tokens") int inputTokens, @JsonProperty("output_tokens") int outputTokens,
      @JsonProperty("cache_read_input_tokens") Integer cacheReadInputTokens, @JsonProperty("cache_creation_input_tokens") Integer cacheCreationInputTokens) {}
}
