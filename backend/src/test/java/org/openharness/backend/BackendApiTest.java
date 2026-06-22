package org.openharness.backend;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static java.util.Map.entry;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(classes = OpenHarnessBackendApplication.class)
@AutoConfigureMockMvc
class BackendApiTest {
  private static final String AUTH = "Bearer dev-service-token";

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper objectMapper;

  @Test
  void healthDoesNotRequireServiceHeaders() throws Exception {
    mvc.perform(get("/actuator/health")).andExpect(status().isOk());
  }

  @Test
  void catalogRequiresUserHeader() throws Exception {
    mvc.perform(
            get("/api/v1/tools/catalog")
                .header("Authorization", AUTH)
                .header("X-Tenant-Id", "tenant-001")
                .header("X-Trace-Id", "trace-001")
                .header("X-Request-Id", "req-001"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.errorClass", equalTo("AUTH_MISSING_HEADER")));
  }

  @Test
  void catalogReturnsVersionHashAndSafeTools() throws Exception {
    mvc.perform(valid(get("/api/v1/tools/catalog")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.catalogVersion", notNullValue()))
        .andExpect(jsonPath("$.catalogHash", notNullValue()))
        .andExpect(jsonPath("$.tools", hasSize(6)))
        .andExpect(jsonPath("$.tools[0].permission", equalTo("safe")))
        .andExpect(jsonPath("$.tools[0].isReadOnly", equalTo(true)))
        .andExpect(jsonPath("$.tools[0].isDestructive", equalTo(false)))
        .andExpect(jsonPath("$.tools[0].requiresApproval", equalTo(false)))
        .andExpect(jsonPath("$.tools[0].isConcurrencySafe", equalTo(true)))
        .andExpect(jsonPath("$.tools[3].protocol", equalTo("read_file")))
        .andExpect(jsonPath("$.tools[4].protocol", equalTo("search")))
        .andExpect(jsonPath("$.tools[5].protocol", equalTo("run_command")));
  }

  @Test
  void protocolToolsExecuteWithBounds() throws Exception {
    Path dir = Files.createTempDirectory("openharness-tool-protocol-test");
    Files.writeString(dir.resolve("note.txt"), "alpha\nneedle line\nomega\n");
    System.setProperty("TOOL_WORKSPACE_DIR", dir.toString());
    try {
      JsonNode catalog = catalog();
      executeProtocol(catalog, "read_file", Map.of("path", "note.txt"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.result.content", equalTo("alpha\nneedle line\nomega\n")))
          .andExpect(jsonPath("$.result.truncated", equalTo(false)));
      executeProtocol(catalog, "search", Map.of("query", "needle"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.result.matches[0].path", equalTo("note.txt")))
          .andExpect(jsonPath("$.result.matches[0].line", equalTo(2)));
      executeProtocol(catalog, "run_command", Map.of("command", "echo", "args", new String[] {"hello"}))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.result.exitCode", equalTo(0)))
          .andExpect(jsonPath("$.result.stdout", equalTo("hello\n")));
    } finally {
      System.clearProperty("TOOL_WORKSPACE_DIR");
    }
  }

  @Test
  void protocolToolsRejectUnsafeInputs() throws Exception {
    Path dir = Files.createTempDirectory("openharness-tool-protocol-test");
    System.setProperty("TOOL_WORKSPACE_DIR", dir.toString());
    try {
      JsonNode catalog = catalog();
      executeProtocol(catalog, "read_file", Map.of("path", "../escape.txt"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error.errorClass", equalTo("TOOL_USER_ERROR")));
      executeProtocol(catalog, "run_command", Map.of("command", "sh", "args", new String[] {"-c", "echo bad"}))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error.errorClass", equalTo("TOOL_USER_ERROR")));
    } finally {
      System.clearProperty("TOOL_WORKSPACE_DIR");
    }
  }

  @Test
  void executeCurrentTimeReturnsOk() throws Exception {
    JsonNode catalog = catalog();
    mvc.perform(
            valid(post("/api/v1/tools/execute"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json(
                        Map.of(
                            "requestId", "req-time-001",
                            "conversationId", "conv-001",
                            "userId", "user-001",
                            "tenantId", "tenant-001",
                            "toolCallId", "call-time-001",
                            "toolName", "get_current_time",
                            "arguments", Map.of("timezone", "Asia/Shanghai"),
                            "catalogVersion", catalog.get("catalogVersion").asText(),
                            "catalogHash", catalog.get("catalogHash").asText(),
                            "idempotencyKey", "req-time-001:call-time-001"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status", equalTo("ok")))
        .andExpect(jsonPath("$.result.isoTime", notNullValue()));
  }

  @Test
  void executeWithStaleCatalogReturnsCatalogOutdated() throws Exception {
    mvc.perform(
            valid(post("/api/v1/tools/execute"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json(
                        Map.of(
                            "requestId", "req-stale-001",
                            "conversationId", "conv-001",
                            "userId", "user-001",
                            "tenantId", "tenant-001",
                            "toolCallId", "call-stale-001",
                            "toolName", "echo",
                            "arguments", Map.of("text", "hello"),
                            "catalogVersion", "stale",
                            "catalogHash", "sha256:stale",
                            "idempotencyKey", "req-stale-001:call-stale-001"))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.errorClass", equalTo("CATALOG_OUTDATED")));
  }

  @Test
  void duplicateToolExecutionReturnsIdempotentReplay() throws Exception {
    JsonNode catalog = catalog();
    String payload =
        json(
            Map.of(
                "requestId", "req-replay-001",
                "conversationId", "conv-001",
                "userId", "user-001",
                "tenantId", "tenant-001",
                "toolCallId", "call-replay-001",
                "toolName", "echo",
                "arguments", Map.of("text", "first"),
                "catalogVersion", catalog.get("catalogVersion").asText(),
                "catalogHash", catalog.get("catalogHash").asText(),
                "idempotencyKey", "idem-replay-001"));

    mvc.perform(valid(post("/api/v1/tools/execute")).contentType(MediaType.APPLICATION_JSON).content(payload))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.idempotentReplay").doesNotExist());
    mvc.perform(valid(post("/api/v1/tools/execute")).contentType(MediaType.APPLICATION_JSON).content(payload))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.idempotentReplay", equalTo(true)))
        .andExpect(jsonPath("$.result.echo", equalTo("first")));
  }

  @Test
  void duplicateToolExecutionDifferentPayloadReturnsConflict() throws Exception {
    JsonNode catalog = catalog();
    Map<String, Object> base =
        Map.of(
            "requestId", "req-conflict-001",
            "conversationId", "conv-001",
            "userId", "user-001",
            "tenantId", "tenant-001",
            "toolCallId", "call-conflict-001",
            "toolName", "echo",
            "catalogVersion", catalog.get("catalogVersion").asText(),
            "catalogHash", catalog.get("catalogHash").asText(),
            "idempotencyKey", "idem-conflict-001");

    mvc.perform(
            valid(post("/api/v1/tools/execute"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(withArguments(base, "first"))))
        .andExpect(status().isOk());
    mvc.perform(
            valid(post("/api/v1/tools/execute"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(withArguments(base, "second"))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.errorClass", equalTo("IDEMPOTENCY_CONFLICT")));
  }

  @Test
  void mockModelReturnsToolCallForTimeQuestion() throws Exception {
    JsonNode catalog = catalog();
    mvc.perform(
            valid(post("/api/v1/model/chat"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json(
                        Map.of(
                            "requestId", "req-model-001",
                            "conversationId", "conv-001",
                            "userId", "user-001",
                            "tenantId", "tenant-001",
                            "model", "mock",
                            "stream", false,
                            "messages", new Object[] {Map.of("role", "user", "content", "现在几点？")},
                            "tools", catalog.get("tools"),
                            "meta",
                                Map.of(
                                    "cacheEnabled", false,
                                    "catalogVersion", catalog.get("catalogVersion").asText(),
                                    "catalogHash", catalog.get("catalogHash").asText())))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.message.role", equalTo("assistant")))
        .andExpect(jsonPath("$.message.toolCalls[0].name", equalTo("get_current_time")))
        .andExpect(jsonPath("$.message.toolCalls[0].argumentsRaw", notNullValue()));
  }

  @Test
  void mockModelFixtureReturnsDeterministicResponse() throws Exception {
    JsonNode catalog = catalog();
    mvc.perform(
            valid(post("/api/v1/model/chat"))
                .header("X-Mock-Fixture", "tool-time")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json(
                        Map.of(
                            "requestId", "req-fixture-001",
                            "conversationId", "conv-001",
                            "userId", "user-001",
                            "tenantId", "tenant-001",
                            "model", "mock",
                            "stream", false,
                            "messages", new Object[] {Map.of("role", "user", "content", "fixture")},
                            "tools", catalog.get("tools"),
                            "meta", Map.of("cacheEnabled", false)))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.message.toolCalls[0].id", equalTo("call-fixture-time")));
  }

  @Test
  void traceEventIsAccepted() throws Exception {
    mvc.perform(
            valid(post("/api/v1/trace/events"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json(
                        Map.ofEntries(
                            entry("traceId", "trace-001"),
                            entry("spanId", "span-001"),
                            entry("requestId", "req-001"),
                            entry("conversationId", "conv-001"),
                            entry("userId", "user-001"),
                            entry("tenantId", "tenant-001"),
                            entry("runtime", "backend"),
                            entry("eventType", "MODEL_CALL_END"),
                            entry("name", "model call end"),
                            entry("status", "ok"),
                            entry("startTime", 1780000000000L)))))
        .andExpect(status().isAccepted());
  }

  private JsonNode catalog() throws Exception {
    MvcResult result = mvc.perform(valid(get("/api/v1/tools/catalog"))).andExpect(status().isOk()).andReturn();
    return objectMapper.readTree(result.getResponse().getContentAsString());
  }

  private org.springframework.test.web.servlet.ResultActions executeProtocol(JsonNode catalog, String toolName, Map<String, Object> arguments) throws Exception {
    return mvc.perform(
        valid(post("/api/v1/tools/execute"))
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                json(
                    Map.of(
                        "requestId", "req-" + toolName,
                        "conversationId", "conv-protocol",
                        "userId", "user-001",
                        "tenantId", "tenant-001",
                        "toolCallId", "call-" + toolName,
                        "toolName", toolName,
                        "arguments", arguments,
                        "catalogVersion", catalog.get("catalogVersion").asText(),
                        "catalogHash", catalog.get("catalogHash").asText(),
                        "idempotencyKey", "req-" + toolName + ":" + System.nanoTime()))));
  }

  private String json(Object value) throws Exception {
    return objectMapper.writeValueAsString(value);
  }

  private Map<String, Object> withArguments(Map<String, Object> base, String text) {
    var copy = new java.util.LinkedHashMap<>(base);
    copy.put("arguments", Map.of("text", text));
    return copy;
  }

  private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder valid(
      org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
    return request
        .header("Authorization", AUTH)
        .header("X-User-Id", "user-001")
        .header("X-Tenant-Id", "tenant-001")
        .header("X-Trace-Id", "trace-001")
        .header("X-Request-Id", "req-001");
  }
}
