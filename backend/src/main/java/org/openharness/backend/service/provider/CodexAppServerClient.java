package org.openharness.backend.service.provider;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;
import org.openharness.backend.model.Contracts;

/** Narrow JSONL/JSON-RPC client for one local Codex app-server turn at a time. */
public final class CodexAppServerClient implements Closeable {
  private static final ObjectMapper JSON = new ObjectMapper(
      JsonFactory.builder()
          .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
          .build());
  private static final int MAX_TEXT = 65_536;
  private static final Set<String> FAILURE_STATUSES = Set.of("error", "rejected", "timeout");
  private static final Pattern SAFE_REASONING_EFFORT =
      Pattern.compile("[a-z][a-z0-9_-]{0,31}");
  private static final Pattern AUTHORIZATION = Pattern.compile(
      "(?i)(authorization\\s*:\\s*)?(bearer|token)\\s+[^\\s,;]+|authorization\\s*:[^\\r\\n]+", Pattern.CASE_INSENSITIVE);

  public sealed interface TurnResult permits FinalTurn, PendingToolCall, ErrorTurn {}

  public record ErrorTurn(String code, String message) implements TurnResult {
    public ErrorTurn {
      if (code == null || code.isBlank() || message == null || message.isBlank()) {
        throw new IllegalArgumentException("error code and message are required");
      }
    }
  }

  public record TokenUsage(int inputTokens, int outputTokens, int cachedInputTokens) {
    public TokenUsage {
      if (inputTokens < 0 || outputTokens < 0 || cachedInputTokens < 0) {
        throw new IllegalArgumentException("usage must be non-negative");
      }
    }
  }

  public record FinalTurn(
      String threadId,
      String turnId,
      String message,
      String reasoning,
      TokenUsage usage) implements TurnResult {}

  public record PendingToolCall(
      long responderId,
      String threadId,
      String turnId,
      String callId,
      String toolName,
      String argumentsRaw) implements TurnResult {}

  public record ContentItem(String type, String text) {}

  public record DynamicTool(String name, String description, Map<String, Object> inputSchema) {
    public DynamicTool {
      requireBounded(name, "tool name");
      requireBounded(description, "tool description");
      if (inputSchema == null) throw new IllegalArgumentException("tool input schema is required");
      inputSchema = Map.copyOf(inputSchema);
    }
  }

  private final BufferedReader reader;
  private final BufferedWriter writer;
  private final Duration timeout;
  private final AtomicLong requestIds = new AtomicLong();
  private final ConcurrentHashMap<Long, CompletableFuture<JsonNode>> responders = new ConcurrentHashMap<>();
  private final Set<Long> serverResponderIds = ConcurrentHashMap.newKeySet();
  private final Set<String> streamedReasoningItemIds = ConcurrentHashMap.newKeySet();
  private final BlockingQueue<Object> turnOutcomes = new LinkedBlockingQueue<>();
  private final AtomicBoolean closed = new AtomicBoolean();
  private final Thread readerThread;
  private final Object writeLock = new Object();
  private final Object turnLock = new Object();

  private volatile boolean activeTurn;
  private volatile boolean initialized;
  private volatile String threadId;
  private volatile String turnId;
  private volatile StringBuilder message = new StringBuilder();
  private volatile StringBuilder reasoning = new StringBuilder();
  private volatile TokenUsage usage = new TokenUsage(0, 0, 0);
  private volatile PendingState pending;
  private volatile boolean unidentifiedReasoningDelta;

  public CodexAppServerClient(InputStream input, OutputStream output, Duration timeout) {
    if (input == null || output == null) throw new IllegalArgumentException("transport streams are required");
    if (timeout == null || timeout.isZero() || timeout.isNegative()) {
      throw new IllegalArgumentException("timeout must be positive");
    }
    this.reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
    this.writer = new BufferedWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8));
    this.timeout = timeout;
    this.readerThread = new Thread(this::readLoop, "openharness-codex-app-server-reader");
    this.readerThread.setDaemon(true);
    this.readerThread.start();
  }

  public TurnResult startTurn(String model, String inputText) {
    return startTurn(model, inputText, List.of(), "medium");
  }

  public TurnResult startTurn(String model, String inputText, List<DynamicTool> dynamicTools) {
    return startTurn(model, inputText, dynamicTools, "medium");
  }

  public TurnResult startTurn(
      String model,
      String inputText,
      List<DynamicTool> dynamicTools,
      String reasoningEffort) {
    requireBounded(model, "model");
    requireBounded(inputText, "inputText");
    if (dynamicTools == null) throw new IllegalArgumentException("dynamicTools are required");
    if (reasoningEffort == null || !SAFE_REASONING_EFFORT.matcher(reasoningEffort).matches()) {
      throw new IllegalArgumentException(
          "reasoningEffort must be a bounded safe identifier");
    }
    try {
      synchronized (turnLock) {
        if (activeTurn) throw new IllegalStateException("Codex app-server turn already active");
        ensureInitialized();
        activeTurn = true;
        pending = null;
        threadId = null;
        turnId = null;
        message = new StringBuilder();
        reasoning = new StringBuilder();
        usage = new TokenUsage(0, 0, 0);
        serverResponderIds.clear();
        streamedReasoningItemIds.clear();
        unidentifiedReasoningDelta = false;
        turnOutcomes.clear();
      }
      ObjectNode threadParams = JSON.createObjectNode()
          .put("model", model)
          .put("allowProviderModelFallback", false)
          .put("sandbox", "read-only")
          .put("approvalPolicy", "untrusted");
      ArrayNode tools = threadParams.putArray("dynamicTools");
      for (DynamicTool tool : dynamicTools) {
        tools.addObject()
            .put("type", "function")
            .put("name", tool.name())
            .put("description", tool.description())
            .set("inputSchema", JSON.valueToTree(tool.inputSchema()));
      }
      JsonNode threadResponse = await(sendRequest("thread/start", threadParams));
      threadId = requiredText(threadResponse.at("/result/thread/id"));

      ObjectNode turnParams = JSON.createObjectNode()
          .put("threadId", threadId)
          .put("summary", "auto")
          .put("effort", reasoningEffort);
      ArrayNode input = turnParams.putArray("input");
      input.addObject().put("type", "text").put("text", inputText);
      JsonNode turnResponse = await(sendRequest("turn/start", turnParams));
      turnId = requiredText(turnResponse.at("/result/turn/id"));
      return awaitOutcome();
    } catch (RuntimeException failure) {
      activeTurn = false;
      return errorTurn(failure);
    }
  }

  public TurnResult resumeToolCall(PendingToolCall handle, String status, List<ContentItem> contentItems) {
    PendingState current = pending;
    if (current == null || handle == null || !current.handle.equals(handle)) {
      throw new IllegalStateException("pending tool call is not active");
    }
    if (current.answered.get()) throw new IllegalStateException("pending tool call already answered");
    if (!activeTurn) {
      try {
        return awaitOutcome();
      } catch (RuntimeException failure) {
        return errorTurn(failure);
      }
    }
    boolean success;
    if ("ok".equals(status)) success = true;
    else if (FAILURE_STATUSES.contains(status)) success = false;
    else throw new IllegalArgumentException("unsupported tool result status");
    if (contentItems == null || contentItems.size() != 1) {
      throw new IllegalArgumentException("one inputText content item is required");
    }
    ArrayNode responseItems = JSON.createArrayNode();
    for (ContentItem item : contentItems) {
      if (item == null || !"inputText".equals(item.type())) {
        throw new IllegalArgumentException("inputImage and non-inputText content are unsupported");
      }
      String text = redact(requireBoundedContent(item.text()));
      responseItems.addObject().put("type", "inputText").put("text", text);
    }
    if (!current.answered.compareAndSet(false, true)) {
      throw new IllegalStateException("pending tool call already answered");
    }
    try {
      ObjectNode result = JSON.createObjectNode().put("success", success).set("contentItems", responseItems);
      ObjectNode response = JSON.createObjectNode().put("id", handle.responderId()).set("result", result);
      writeFrame(response);
      return awaitOutcome();
    } catch (RuntimeException failure) {
      activeTurn = false;
      return errorTurn(failure);
    }
  }

  /** Fails an outstanding responder when needed, then interrupts the exact correlated turn. */
  public ErrorTurn interruptToolCall(PendingToolCall handle, String reason) {
    PendingState current = pending;
    if (current == null || handle == null || !current.handle.equals(handle)) {
      throw new IllegalStateException("pending tool call is not active");
    }
    if (!"timeout".equals(reason) && !"cancelled".equals(reason)) {
      throw new IllegalArgumentException("unsupported interrupt reason");
    }
    try {
      if (current.answered.compareAndSet(false, true)) {
        ArrayNode items = JSON.createArrayNode();
        items.addObject().put("type", "inputText").put("text", "Codex tool call terminated");
        ObjectNode result = JSON.createObjectNode().put("success", false).set("contentItems", items);
        writeFrame(JSON.createObjectNode().put("id", handle.responderId()).set("result", result));
      }
      ObjectNode params = JSON.createObjectNode()
          .put("threadId", handle.threadId())
          .put("turnId", handle.turnId());
      await(sendRequest("turn/interrupt", params));
      activeTurn = false;
      ErrorTurn error = "timeout".equals(reason)
          ? new ErrorTurn("TIMEOUT", "Codex app-server turn timed out")
          : new ErrorTurn("BRIDGE_CANCELLED", "Codex app-server turn cancelled");
      turnOutcomes.offer(error);
      return error;
    } catch (RuntimeException failure) {
      activeTurn = false;
      return errorTurn(failure);
    }
  }

  private CompletableFuture<JsonNode> sendRequest(String method, JsonNode params) {
    long id = requestIds.incrementAndGet();
    CompletableFuture<JsonNode> response = new CompletableFuture<>();
    responders.put(id, response);
    ObjectNode request = JSON.createObjectNode().put("id", id).put("method", method).set("params", params);
    try {
      writeFrame(request);
    } catch (RuntimeException failure) {
      responders.remove(id);
      response.completeExceptionally(failure);
    }
    return response;
  }

  private void ensureInitialized() {
    if (initialized) return;
    ObjectNode clientInfo = JSON.createObjectNode()
        .put("name", "openharness")
        .put("version", "0.0.0");
    ObjectNode capabilities = JSON.createObjectNode().put("experimentalApi", true);
    ObjectNode params = JSON.createObjectNode()
        .set("clientInfo", clientInfo);
    params.set("capabilities", capabilities);
    await(sendRequest("initialize", params));
    initialized = true;
  }

  private void readLoop() {
    try {
      for (String frame; !closed.get() && (frame = reader.readLine()) != null;) {
        JsonNode message;
        try {
          message = JSON.readTree(frame);
          if (message == null || !message.isObject()) throw new IOException("not an object");
        } catch (Exception malformed) {
          failTransport(new IllegalStateException("Codex app-server protocol failure"));
          return;
        }
        dispatch(message);
      }
      if (!closed.get()) failTransport(new IllegalStateException("Codex app-server transport closed"));
    } catch (IOException failure) {
      if (!closed.get()) failTransport(new IllegalStateException("Codex app-server transport failure"));
    } catch (RuntimeException failure) {
      failTransport(new IllegalStateException("Codex app-server protocol failure"));
    }
  }

  private void dispatch(JsonNode frame) {
    JsonNode id = frame.get("id");
    JsonNode method = frame.get("method");
    if (id != null && method == null) {
      completeClientResponse(id.asLong(), frame);
      return;
    }
    if (method == null || !method.isTextual()) throw new IllegalArgumentException("missing method");
    String name = method.asText();
    if (id != null) {
      if (!"item/tool/call".equals(name)) throw new IllegalArgumentException("unknown server request");
      handleToolCall(id.asLong(), frame.path("params"));
      return;
    }
    switch (name) {
      case "item/agentMessage/delta" -> append(message, correlatedDelta(frame.path("params")));
      case "item/reasoning/summaryTextDelta", "item/reasoning/textDelta" ->
          handleReasoningDelta(frame.path("params"));
      case "item/completed" -> handleItemCompleted(frame.path("params"));
      case "thread/tokenUsage/updated" -> handleUsage(frame.path("params"));
      case "turn/completed" -> handleTurnCompleted(frame.path("params"));
      default -> {
        // Forward-compatible notifications carry no responder and are intentionally ignored.
      }
    }
  }

  private void completeClientResponse(long id, JsonNode frame) {
    CompletableFuture<JsonNode> response = responders.remove(id);
    if (response == null) throw new IllegalArgumentException("unknown response id");
    JsonNode error = frame.get("error");
    if (error != null) {
      int code = error.path("code").asInt();
      String safe = code == 401 || code == 403
          ? "Codex app-server authentication failed"
          : "Codex app-server request failed";
      response.completeExceptionally(new IllegalStateException(safe));
    } else if (!frame.has("result")) {
      response.completeExceptionally(new IllegalStateException("Codex app-server protocol failure"));
    } else {
      JsonNode responseThreadId = frame.at("/result/thread/id");
      if (responseThreadId.isTextual()) threadId = requiredText(responseThreadId);
      JsonNode responseTurnId = frame.at("/result/turn/id");
      if (responseTurnId.isTextual()) turnId = requiredText(responseTurnId);
      response.complete(frame);
    }
  }

  private void handleToolCall(long responderId, JsonNode params) {
    if (!serverResponderIds.add(responderId)) {
      failTurn(new IllegalStateException("Codex app-server protocol failure"));
      return;
    }
    requireCorrelation(params);
    String callId = requiredText(params.get("callId"));
    String toolName = requiredText(params.get("tool"));
    JsonNode arguments = params.get("arguments");
    if (arguments == null || !arguments.isObject()) throw new IllegalArgumentException("tool arguments");
    String argumentsRaw = Contracts.canonicalizeCodexArguments(compact(arguments));
    PendingToolCall handle = new PendingToolCall(
        responderId, threadId, turnId, callId, toolName, argumentsRaw);
    PendingState state = new PendingState(handle);
    if (pending != null && !pending.answered.get()) {
      throw new IllegalStateException("multiple pending tool calls");
    }
    pending = state;
    turnOutcomes.add(handle);
  }

  private void handleTurnCompleted(JsonNode params) {
    requireThread(params);
    String completedTurn = requiredText(params.at("/turn/id"));
    if (!turnId.equals(completedTurn)) throw new IllegalArgumentException("turn correlation");
    String status = requiredText(params.at("/turn/status"));
    if (!"completed".equals(status)) {
      failTurn(new IllegalStateException("Codex app-server turn failed"));
      return;
    }
    activeTurn = false;
    turnOutcomes.add(new FinalTurn(threadId, turnId, message.toString(), reasoning.toString(), usage));
  }

  private void handleItemCompleted(JsonNode params) {
    requireCorrelation(params);
    JsonNode item = params.get("item");
    if (item == null || !item.isObject()) {
      throw new IllegalArgumentException("completed item is required");
    }
    String type = requiredText(item.get("type"));
    if (!"reasoning".equals(type)) return;
    String itemId = requiredText(item.get("id"));

    JsonNode summary = item.get("summary");
    if (summary == null || summary.isNull()) return;
    if (!summary.isArray()) throw new IllegalArgumentException("reasoning summary must be an array");
    StringBuilder completed = new StringBuilder();
    for (JsonNode entry : summary) {
      if (!entry.isTextual()) throw new IllegalArgumentException("reasoning summary must contain text");
      String text = entry.textValue();
      if (text.isEmpty()) continue;
      if (!completed.isEmpty()) append(completed, "\n");
      append(completed, text);
    }
    if (completed.isEmpty()
        || streamedReasoningItemIds.contains(itemId)
        || unidentifiedReasoningDelta) return;
    if (!reasoning.isEmpty()) append(reasoning, "\n");
    append(reasoning, completed.toString());
  }

  private void handleReasoningDelta(JsonNode params) {
    String delta = correlatedDelta(params);
    JsonNode itemId = params.get("itemId");
    if (itemId == null) unidentifiedReasoningDelta = true;
    else streamedReasoningItemIds.add(requiredText(itemId));
    append(reasoning, delta);
  }

  private void handleUsage(JsonNode params) {
    requireCorrelation(params);
    JsonNode last = params.at("/tokenUsage/last");
    usage = new TokenUsage(
        nonNegativeInt(last.get("inputTokens")),
        nonNegativeInt(last.get("outputTokens")),
        nonNegativeInt(last.get("cachedInputTokens")));
  }

  private String correlatedDelta(JsonNode params) {
    requireCorrelation(params);
    return requiredContentText(params.get("delta"));
  }

  private void requireCorrelation(JsonNode params) {
    requireThread(params);
    if (!requiredText(params.get("turnId")).equals(turnId)) {
      throw new IllegalArgumentException("turn correlation");
    }
  }

  private void requireThread(JsonNode params) {
    if (!activeTurn || !requiredText(params.get("threadId")).equals(threadId)) {
      throw new IllegalArgumentException("thread correlation");
    }
  }

  private void append(StringBuilder target, String delta) {
    if (target.length() + delta.length() > MAX_TEXT) {
      throw new IllegalArgumentException("aggregated text exceeds bound");
    }
    target.append(delta);
  }

  private TurnResult awaitOutcome() {
    try {
      Object outcome = turnOutcomes.poll(timeout.toMillis(), TimeUnit.MILLISECONDS);
      if (outcome == null) throw new IllegalStateException("Codex app-server response timeout");
      if (outcome instanceof RuntimeException failure) throw failure;
      return (TurnResult) outcome;
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Codex app-server wait interrupted");
    }
  }

  private JsonNode await(CompletableFuture<JsonNode> response) {
    try {
      return response.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
    } catch (java.util.concurrent.ExecutionException failure) {
      Throwable cause = failure.getCause();
      if (cause instanceof RuntimeException runtime) throw runtime;
      throw new IllegalStateException("Codex app-server request failed");
    } catch (java.util.concurrent.TimeoutException timeoutFailure) {
      throw new IllegalStateException("Codex app-server response timeout");
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Codex app-server wait interrupted");
    }
  }

  private void writeFrame(JsonNode frame) {
    if (closed.get()) throw new IllegalStateException("Codex app-server client is closed");
    synchronized (writeLock) {
      try {
        writer.write(JSON.writeValueAsString(frame));
        writer.newLine();
        writer.flush();
      } catch (IOException failure) {
        throw new IllegalStateException("Codex app-server transport failure");
      }
    }
  }

  private void failTransport(RuntimeException safeFailure) {
    responders.forEach((id, response) -> response.completeExceptionally(safeFailure));
    responders.clear();
    failTurn(safeFailure);
  }

  private void failTurn(RuntimeException safeFailure) {
    activeTurn = false;
    turnOutcomes.offer(safeFailure);
  }

  private static String compact(JsonNode value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (IOException impossible) {
      throw new IllegalStateException("Codex app-server protocol failure");
    }
  }

  private static int nonNegativeInt(JsonNode value) {
    if (value == null || !value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 0) {
      throw new IllegalArgumentException("invalid usage");
    }
    return value.intValue();
  }

  private static String requiredText(JsonNode value) {
    if (value == null || !value.isTextual() || value.textValue().isBlank()
        || value.textValue().length() > 256) {
      throw new IllegalArgumentException("missing or invalid protocol identifier");
    }
    return value.textValue();
  }

  private static String requiredContentText(JsonNode value) {
    if (value == null || !value.isTextual() || value.textValue().length() > MAX_TEXT) {
      throw new IllegalArgumentException("missing or invalid protocol text");
    }
    return value.textValue();
  }

  private static String requireBounded(String value, String name) {
    if (value == null || value.isBlank() || value.length() > MAX_TEXT) {
      throw new IllegalArgumentException(name + " must be bounded text");
    }
    return value;
  }

  private static String requireBoundedContent(String value) {
    if (value == null || value.length() > MAX_TEXT) {
      throw new IllegalArgumentException("content text must be bounded text");
    }
    return value;
  }

  private static String redact(String value) {
    return AUTHORIZATION.matcher(value).replaceAll("[REDACTED]");
  }

  private static ErrorTurn errorTurn(RuntimeException failure) {
    String message = failure.getMessage() == null ? "Codex app-server transport failed" : failure.getMessage();
    String code;
    if (message.contains("authentication failed")) code = "AUTH_FAILED";
    else if (message.contains("timeout")) code = "TIMEOUT";
    else if (message.contains("protocol")) code = "PROTOCOL_FAILURE";
    else code = "TRANSPORT_FAILURE";
    return new ErrorTurn(code, redact(message));
  }

  @Override
  public void close() {
    if (!closed.compareAndSet(false, true)) return;
    try { writer.close(); } catch (IOException ignored) { }
    readerThread.interrupt();
    failTransport(new IllegalStateException("Codex app-server client is closed"));
  }

  private static final class PendingState {
    private final PendingToolCall handle;
    private final AtomicBoolean answered = new AtomicBoolean();

    private PendingState(PendingToolCall handle) {
      this.handle = handle;
    }
  }
}
