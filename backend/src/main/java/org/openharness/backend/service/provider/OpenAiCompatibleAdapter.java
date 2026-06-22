package org.openharness.backend.service.provider;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.openharness.backend.model.Contracts.*;
import org.springframework.stereotype.Component;

@Component
public class OpenAiCompatibleAdapter implements ProviderAdapter {

  private final HttpClient http = HttpClient.newHttpClient();
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public String providerType() { return "openai-compatible"; }

  @Override
  public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
    try {
      List<Map<String, Object>> messages = toOpenAiMessages(request.messages());
      List<Map<String, Object>> tools = toOpenAiTools(request.tools());

      // Use the actual model name from config if request model is a routing alias
      String modelName = isRealModel(request.model(), config)
          ? request.model()
          : config.models().stream().filter(m -> !m.equals("default")).findFirst().orElse(request.model());

      Map<String, Object> body = tools.isEmpty()
          ? Map.of("model", modelName, "messages", messages)
          : Map.of("model", modelName, "messages", messages, "tools", tools, "tool_choice", "auto");

      String url = config.baseUrl().endsWith("/")
          ? config.baseUrl() + "chat/completions"
          : config.baseUrl() + "/chat/completions";

      String jsonBody = objectMapper.writeValueAsString(body);
      HttpResponse<String> httpResponse = callWithRetry(url, config.apiKey(), jsonBody);

      if (httpResponse.statusCode() != 200) {
        throw new RuntimeException("Provider error " + httpResponse.statusCode() + ": " + httpResponse.body());
      }

      OaiResponse response = objectMapper.readValue(httpResponse.body(), OaiResponse.class);
      OaiChoice choice = response.choices().get(0);
      OaiMessage msg = choice.message();

      AgentMessage agentMessage;
      if (msg.toolCalls() != null && !msg.toolCalls().isEmpty()) {
        List<ToolCall> toolCalls = msg.toolCalls().stream()
            .map(tc -> new ToolCall(tc.id(), tc.function().name(), tc.function().arguments()))
            .toList();
        agentMessage = new AgentMessage("assistant", msg.content() != null ? msg.content() : "",
            toolCalls, null, null, null, null, null, null, null, null, null, null);
      } else {
        agentMessage = new AgentMessage("assistant", msg.content() != null ? msg.content() : "",
            null, null, null, null, null, null, null, null, null, null, null);
      }

      OaiUsage u = response.usage();
      Usage usage = u != null
          ? new Usage(u.promptTokens(), u.completionTokens(), u.totalTokens(), null, null, false, null)
          : new Usage(0, 0, 0, null, null, false, null);

      return new ModelChatResponse(request.requestId(), request.conversationId(), agentMessage, usage, config.name(), null);

    } catch (ProviderUnavailableException e) {
      throw e;
    } catch (Exception e) {
      throw new RuntimeException("OpenAI-compatible call failed: " + e.getMessage(), e);
    }
  }

  private HttpResponse<String> callWithRetry(String url, String apiKey, String jsonBody) throws Exception {
    int[] delays = {200, 400, 800};
    HttpResponse<String> lastResponse = null;

    for (int attempt = 0; attempt <= 3; attempt++) {
      HttpRequest httpRequest = HttpRequest.newBuilder()
          .uri(URI.create(url))
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
          .build();

      lastResponse = http.send(httpRequest, HttpResponse.BodyHandlers.ofString());

      if (lastResponse.statusCode() != 503) return lastResponse;
      if (attempt < 3) Thread.sleep(delays[attempt]);
    }

    throw new ProviderUnavailableException("Provider returned 503 after 3 retries");
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
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiMessage(String role, String content, @JsonProperty("tool_calls") List<OaiToolCall> toolCalls) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiToolCall(String id, String type, OaiFunction function) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiFunction(String name, String arguments) {}
  @JsonIgnoreProperties(ignoreUnknown = true) record OaiUsage(@JsonProperty("prompt_tokens") int promptTokens, @JsonProperty("completion_tokens") int completionTokens, @JsonProperty("total_tokens") int totalTokens) {}
}
