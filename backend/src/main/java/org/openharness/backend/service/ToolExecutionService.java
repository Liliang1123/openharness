package org.openharness.backend.service;

import static org.openharness.backend.api.StructuredErrorHandler.error;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.openharness.backend.model.Contracts.ToolCallRequest;
import org.openharness.backend.model.Contracts.ToolCallResponse;
import org.openharness.backend.model.Contracts.ToolCancelRequest;
import org.openharness.backend.model.Contracts.ToolCancelResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class ToolExecutionService {
  private static final int OUTPUT_CAP_BYTES = 4096;
  private static final long DEFAULT_COMMAND_TIMEOUT_MS = 2_000;
  private static final long MAX_COMMAND_TIMEOUT_MS = 10_000;
  private static final List<String> ALLOWED_COMMANDS = List.of("echo", "pwd", "sleep");
  private final CatalogService catalogService;
  private final PolicyService policyService;
  private final ObjectMapper objectMapper;
  private final TraceService traceService;
  private final Map<String, IdempotencyRecord> idempotency = new ConcurrentHashMap<>();
  private final Map<String, ActiveCommand> activeCommands = new ConcurrentHashMap<>();

  public ToolExecutionService(CatalogService catalogService, PolicyService policyService, ObjectMapper objectMapper, TraceService traceService) {
    this.catalogService = catalogService;
    this.policyService = policyService;
    this.objectMapper = objectMapper;
    this.traceService = traceService;
  }

  public synchronized ToolCallResponse execute(
      String tenantId, String traceId, String requestHeaderId, String userId, ToolCallRequest request) {
    String key = tenantId + ":" + request.idempotencyKey();
    String payload = canonical(request);
    IdempotencyRecord existing = idempotency.get(key);
    if (existing != null) {
      if (!existing.payload().equals(payload)) {
        throw error(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Same idempotency key used with different payload.", false, "ts");
      }
      ToolCallResponse first = existing.response();
      ToolCallResponse replay =
          new ToolCallResponse(
          first.requestId(),
          first.conversationId(),
          first.toolCallId(),
          first.toolName(),
          first.result(),
          first.status(),
          true,
          first.error(),
          first.provenance());
      traceService.backendEvent(
          traceId,
          requestHeaderId,
          request.conversationId(),
          userId,
          tenantId,
          "TOOL_CALL_END",
          "tool call replay end",
          Map.of("toolName", request.toolName(), "idempotentReplay", true));
      return replay;
    }

    traceService.backendEvent(
        traceId,
        requestHeaderId,
        request.conversationId(),
        userId,
        tenantId,
        "TOOL_CALL_START",
        "tool call start",
        Map.of("toolName", request.toolName()));
    try {
      ToolCallResponse response = executeFresh(request);
      idempotency.put(key, new IdempotencyRecord(payload, response, System.currentTimeMillis()));
      traceService.backendEvent(
          traceId,
          requestHeaderId,
          request.conversationId(),
          userId,
          tenantId,
          "TOOL_CALL_END",
          "tool call end",
          Map.of("toolName", request.toolName(), "idempotentReplay", false, "status", response.status()));
      return response;
    } catch (RuntimeException exception) {
      traceService.backendEvent(
          traceId,
          requestHeaderId,
          request.conversationId(),
          userId,
          tenantId,
          "TOOL_CALL_END",
          "tool call end",
          Map.of("toolName", request.toolName(), "status", "error"));
      throw exception;
    }
  }

  public ToolCancelResponse cancel(ToolCancelRequest request) {
    ActiveCommand active = activeCommands.get(activeCommandKey(request.requestId(), request.toolCallId()));
    if (active == null) {
      return new ToolCancelResponse(request.requestId(), request.toolCallId(), false);
    }
    active.cancel();
    return new ToolCancelResponse(request.requestId(), request.toolCallId(), true);
  }

  private ToolCallResponse executeFresh(ToolCallRequest request) {
    if (!catalogService.matches(request.catalogVersion(), request.catalogHash())) {
      throw error(HttpStatus.CONFLICT, "CATALOG_OUTDATED", "Tool catalog changed; refresh session.", false, "ts");
    }
    if (!catalogService.hasTool(request.toolName())) {
      throw error(HttpStatus.NOT_FOUND, "CATALOG_TOOL_NOT_FOUND", "Tool not found: " + request.toolName(), false, "ts");
    }

    // P0b defense: sensitive/destructive tools require policy allow record
    String permission = catalogService.getPermission(request.toolName());
    if (!"safe".equals(permission)) {
      if (!policyService.hasAllowRecord(request.tenantId(), request.toolCallId())) {
        throw error(HttpStatus.FORBIDDEN, "POLICY_DENY",
            "Sensitive tool '" + request.toolName() + "' requires policy approval before execution.", false, "none");
      }
    }

    Object result =
        switch (request.toolName()) {
          case "get_current_time" -> currentTime(request.arguments());
          case "echo" -> echo(request.arguments());
          case "submit_payment" -> submitPayment(request.arguments());
          case "read_file" -> readFile(request.arguments());
          case "search" -> search(request.arguments());
          case "run_command" -> runCommand(request);
          default -> throw error(HttpStatus.INTERNAL_SERVER_ERROR, "TOOL_INTERNAL_ERROR", "Unhandled tool.", true, "ts");
        };

    return new ToolCallResponse(
        request.requestId(), request.conversationId(), request.toolCallId(), request.toolName(), result, "ok", null, null, "trusted");
  }

  private Map<String, Object> currentTime(Map<String, Object> arguments) {
    String timezone = String.valueOf(arguments.getOrDefault("timezone", "UTC"));
    try {
      ZoneId zoneId = ZoneId.of(timezone);
      return Map.of("timezone", timezone, "isoTime", OffsetDateTime.now(zoneId).toString());
    } catch (RuntimeException exception) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Invalid timezone: " + timezone, false, "none");
    }
  }

  private Map<String, Object> echo(Map<String, Object> arguments) {
    Object text = arguments.get("text");
    if (text == null) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Missing text argument.", false, "none");
    }
    return Map.of("echo", text);
  }

  private Map<String, Object> submitPayment(Map<String, Object> arguments) {
    Object amount = arguments.get("amount");
    Object to = arguments.get("to");
    if (amount == null || to == null) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Missing amount or to argument.", false, "none");
    }
    return Map.of("status", "submitted", "amount", amount, "to", to, "txId", "tx-" + System.currentTimeMillis());
  }

  private Map<String, Object> readFile(Map<String, Object> arguments) {
    Path path = resolveWorkspacePath(requiredString(arguments, "path"));
    if (!Files.isRegularFile(path)) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "File not found: " + arguments.get("path"), false, "none");
    }
    try {
      byte[] bytes = Files.readAllBytes(path);
      boolean truncated = bytes.length > OUTPUT_CAP_BYTES;
      int length = Math.min(bytes.length, OUTPUT_CAP_BYTES);
      return Map.of(
          "path", workspace().relativize(path).toString(),
          "content", new String(bytes, 0, length, StandardCharsets.UTF_8),
          "truncated", truncated);
    } catch (IOException exception) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Cannot read file: " + arguments.get("path"), false, "none");
    }
  }

  private Map<String, Object> search(Map<String, Object> arguments) {
    String query = requiredString(arguments, "query");
    List<Map<String, Object>> matches = new ArrayList<>();
    try (var paths = Files.walk(workspace())) {
      for (Path path : paths.filter(Files::isRegularFile).toList()) {
        List<String> lines = Files.readAllLines(path, StandardCharsets.UTF_8);
        for (int i = 0; i < lines.size() && matches.size() < 50; i++) {
          if (lines.get(i).contains(query)) {
            matches.add(Map.of(
                "path", workspace().relativize(path).toString(),
                "line", i + 1,
                "text", cap(lines.get(i))));
          }
        }
      }
      return Map.of("query", query, "matches", matches, "truncated", matches.size() >= 50);
    } catch (IOException exception) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Search failed.", false, "none");
    }
  }

  private Map<String, Object> runCommand(ToolCallRequest request) {
    Map<String, Object> arguments = request.arguments();
    String command = requiredString(arguments, "command");
    if (!ALLOWED_COMMANDS.contains(command)) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Command is not allow-listed: " + command, false, "none");
    }
    List<String> cmd = new ArrayList<>();
    cmd.add(command);
    Object rawArgs = arguments.get("args");
    if (rawArgs instanceof List<?> args) {
      for (Object arg : args) cmd.add(String.valueOf(arg));
    }
    Process process = null;
    ActiveCommand active = null;
    String activeKey = activeCommandKey(request.requestId(), request.toolCallId());
    try {
      process = new ProcessBuilder(cmd).directory(workspace().toFile()).start();
      active = new ActiveCommand(process);
      activeCommands.put(activeKey, active);
      boolean finished = process.waitFor(commandTimeoutMs(arguments), TimeUnit.MILLISECONDS);
      if (active.cancelled()) {
        throw error(HttpStatus.BAD_REQUEST, "TOOL_CANCELLED", "Command cancelled.", false, "none");
      }
      if (!finished) {
        process.destroyForcibly();
        throw error(HttpStatus.BAD_REQUEST, "TOOL_TIMEOUT", "Command timed out.", false, "none");
      }
      CappedText stdout = capText(new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
      CappedText stderr = capText(new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8));
      return Map.of(
          "exitCode", process.exitValue(),
          "stdout", stdout.value(),
          "stderr", stderr.value(),
          "truncated", stdout.truncated() || stderr.truncated());
    } catch (IOException | InterruptedException exception) {
      if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
      if (active != null && active.cancelled()) {
        throw error(HttpStatus.BAD_REQUEST, "TOOL_CANCELLED", "Command cancelled.", false, "none");
      }
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Command failed: " + command, false, "none");
    } finally {
      activeCommands.remove(activeKey);
      if (process != null && process.isAlive()) {
        process.destroyForcibly();
      }
    }
  }

  private String requiredString(Map<String, Object> arguments, String key) {
    Object value = arguments.get(key);
    if (value == null || String.valueOf(value).isBlank()) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Missing " + key + " argument.", false, "none");
    }
    return String.valueOf(value);
  }

  private Path resolveWorkspacePath(String rawPath) {
    Path root = workspace();
    Path resolved = root.resolve(rawPath).normalize();
    if (!resolved.startsWith(root)) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Path escapes tool workspace.", false, "none");
    }
    return resolved;
  }

  private Path workspace() {
    String configured = System.getProperty("TOOL_WORKSPACE_DIR");
    if (configured == null || configured.isBlank()) configured = System.getenv("TOOL_WORKSPACE_DIR");
    if (configured == null || configured.isBlank()) configured = ".";
    return Path.of(configured).toAbsolutePath().normalize();
  }

  private String cap(String value) {
    return capText(value).value();
  }

  private CappedText capText(String value) {
    if (value.getBytes(StandardCharsets.UTF_8).length <= OUTPUT_CAP_BYTES) return new CappedText(value, false);
    return new CappedText(value.substring(0, Math.min(value.length(), OUTPUT_CAP_BYTES)), true);
  }

  private long commandTimeoutMs(Map<String, Object> arguments) {
    Object raw = arguments.get("timeoutMs");
    if (raw == null) return DEFAULT_COMMAND_TIMEOUT_MS;
    long parsed;
    if (raw instanceof Number number) {
      parsed = number.longValue();
    } else {
      try {
        parsed = Long.parseLong(String.valueOf(raw));
      } catch (NumberFormatException exception) {
        throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Invalid timeoutMs.", false, "none");
      }
    }
    if (parsed <= 0) {
      throw error(HttpStatus.BAD_REQUEST, "TOOL_USER_ERROR", "Invalid timeoutMs.", false, "none");
    }
    return Math.min(parsed, MAX_COMMAND_TIMEOUT_MS);
  }

  private String activeCommandKey(String requestId, String toolCallId) {
    return requestId + ":" + toolCallId;
  }

  private String canonical(ToolCallRequest request) {
    try {
      return objectMapper.writeValueAsString(request);
    } catch (JsonProcessingException exception) {
      throw error(HttpStatus.INTERNAL_SERVER_ERROR, "TOOL_INTERNAL_ERROR", "Cannot serialize idempotency payload.", true, "ts");
    }
  }

  private record IdempotencyRecord(String payload, ToolCallResponse response, long createdAt) {}
  private record CappedText(String value, boolean truncated) {}

  private static final class ActiveCommand {
    private final Process process;
    private volatile boolean cancelled;

    private ActiveCommand(Process process) {
      this.process = process;
    }

    private void cancel() {
      cancelled = true;
      process.destroyForcibly();
    }

    private boolean cancelled() {
      return cancelled;
    }
  }
}
