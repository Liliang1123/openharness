package org.openharness.backend.service;

import java.util.List;
import java.util.Map;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.ToolCall;
import org.openharness.backend.model.Contracts.Usage;
import org.openharness.backend.service.provider.ProviderAdapter;
import org.openharness.backend.service.provider.ProviderConfig;
import org.springframework.stereotype.Service;

@Service
public class MockModelService implements ProviderAdapter {

  @Override
  public String providerType() { return "mock"; }

  @Override
  public ModelChatResponse chat(ModelChatRequest request, ProviderConfig config) {
    return chat(request, (String) null);
  }

  public ModelChatResponse chat(ModelChatRequest request, String fixtureName) {
    AgentMessage message;
    if (lastToolMessage(request) != null) {
      message =
          new AgentMessage(
              "assistant",
              "当前时间工具已返回结果，我已完成回答。",
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null);
    } else if ("tool-time".equals(fixtureName)) {
      message = toolCallMessage("call-fixture-time", "Asia/Shanghai");
    } else if ("mcp-sum".equals(fixtureName)) {
      message = new AgentMessage(
          "assistant",
          "",
          List.of(new ToolCall("call-mcp-sum", "get-sum", "{\"a\":2,\"b\":3}")),
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null);
    } else if ("mcp-long".equals(fixtureName)) {
      message = new AgentMessage(
          "assistant",
          "",
          List.of(new ToolCall("call-mcp-long", "trigger-long-running-operation", "{\"duration\":5,\"steps\":5}")),
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null);
    } else if ("mcp-qualification-echo".equals(fixtureName)) {
      message = new AgentMessage(
          "assistant",
          "",
          List.of(new ToolCall(
              "call-mcp-qualification-echo",
              "mcp_call",
              "{\"server\":\"qualification\",\"tool\":\"qualification_echo\",\"arguments\":{}}")),
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null);
    } else if ("reasoning-tool-time".equals(fixtureName)) {
      message =
          new AgentMessage(
              "assistant",
              "",
              List.of(new ToolCall("call-reasoning-time", "get_current_time", "{\"timezone\":\"Asia/Shanghai\"}")),
              null,
              List.of(Map.of("type", "thinking", "text", "p0a reasoning", "signature", "sig-001")),
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null);
    } else if ("reasoning-block".equals(fixtureName)) {
      message =
          new AgentMessage(
              "assistant",
              "I preserved reasoning.",
              null,
              null,
              List.of(Map.of("type", "thinking", "text", "p0a reasoning", "signature", "sig-001")),
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null);
    } else if (lastUserContent(request).contains("现在几点") || lastUserContent(request).toLowerCase().contains("time")) {
      message = toolCallMessage("call-current-time", "Asia/Shanghai");
    } else {
      message =
          new AgentMessage(
              "assistant",
              "这是 P0a mock model 的普通回答。",
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null);
    }
    return new ModelChatResponse(
        request.requestId(),
        request.conversationId(),
        message,
        new Usage(10, 5, 15, null, null, true, 0),
        "mock",
        null);
  }

  private AgentMessage toolCallMessage(String id, String timezone) {
    return new AgentMessage(
        "assistant",
        "",
        List.of(new ToolCall(id, "get_current_time", "{\"timezone\":\"" + timezone + "\"}")),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private String lastUserContent(ModelChatRequest request) {
    if (request.messages() == null) return "";
    for (int i = request.messages().size() - 1; i >= 0; i--) {
      AgentMessage message = request.messages().get(i);
      if ("user".equals(message.role()) && message.content() != null) return String.valueOf(message.content());
    }
    return "";
  }

  private AgentMessage lastToolMessage(ModelChatRequest request) {
    if (request.messages() == null) return null;
    for (int i = request.messages().size() - 1; i >= 0; i--) {
      AgentMessage message = request.messages().get(i);
      if ("tool".equals(message.role())) return message;
    }
    return null;
  }
}
