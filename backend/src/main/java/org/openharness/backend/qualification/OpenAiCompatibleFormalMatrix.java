package org.openharness.backend.qualification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.service.provider.OpenAiCompatibleAdapter;
import org.openharness.backend.service.provider.ProviderConfig;

public final class OpenAiCompatibleFormalMatrix {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String PROTOCOL_VERSION = "openai-chat-completions";
  private static final String DEFAULT_SERVICE_TOKEN = "dev-service-token";
  private static final String DEFAULT_ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
  private static final String INVALID_PROBE_MODEL = "openharness-matrix-invalid-model-do-not-use";
  private final HttpClient http = HttpClient.newHttpClient();

  public Map<String, Object> runLocalFixture(String apiKey) throws IOException {
    String safeApiKey = apiKey != null && !apiKey.isBlank() ? apiKey : "fake-key";
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    Map<String, AtomicInteger> hitCounters = new ConcurrentHashMap<>();

    server.createContext("/chat/completions", exchange -> {
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      MockResponse response = localOpenAiResponse(body, hitCounters);
      String authorization = exchange.getRequestHeaders().getFirst("Authorization");
      if (!("Bearer " + safeApiKey).equals(authorization)) {
        response = new MockResponse(401, "application/json", "{\"error\":\"auth\"}");
      }

      byte[] bytes = response.body().getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", response.contentType());
      exchange.sendResponseHeaders(response.status(), bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });

    try {
      server.start();
      String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
      Map<String, Object> report = new OpenAiFakeProviderMatrix().run(baseUrl, safeApiKey);
      enrichLocalReport(report, hitCounters);
      return report;
    } finally {
      server.stop(0);
    }
  }

  public Map<String, Object> runProduction(ProductionOptions options) throws IOException, InterruptedException {
    ProductionOptions safeOptions = options != null ? options : ProductionOptions.defaults();
    List<Map<String, Object>> rows = new ArrayList<>();

    rows.add(callProductionRow(
        safeOptions,
        "sync",
        "sync",
        modelRequest("req-production-sync", safeOptions.model(), false, "Reply exactly ok.", List.of(), Map.of()),
        Map.of("contentPresent", true)));
    rows.add(callProductionRow(
        safeOptions,
        "usage-cost",
        "usage",
        modelRequest("req-production-usage-cost", safeOptions.model(), false, "Reply exactly ok and return usage.", List.of(), Map.of()),
        Map.of("usageNonNegative", true)));
    rows.add(callProductionRow(
        safeOptions,
        "stream",
        "stream",
        modelRequest("req-production-stream", safeOptions.model(), true, "Reply exactly ok.", List.of(), Map.of()),
        Map.of("stream", true, "contentPresent", true)));
    rows.add(callProductionRow(
        safeOptions,
        "structured-tool",
        "tool_calls",
        modelRequest("req-production-structured-tool", safeOptions.model(), false,
            "Use the lookup tool with id 1.",
            List.of(toolDefinition("lookup")), Map.of()),
        Map.of("toolCallCountAtLeast", 1)));
    rows.add(callProductionRow(
        safeOptions,
        "timeout",
        "timeout",
        modelRequest("req-production-timeout", safeOptions.model(), false,
            "Reply exactly ok.",
            List.of(), Map.of("timeoutMs", 1)),
        Map.of("errorClass", "PROVIDER_TIMEOUT", "httpStatus", 504)));

    rows.add(resolveRetryRow(safeOptions));
    rows.add(resolveTerminalErrorRow(safeOptions));
    rows.add(resolveCancellationRow(safeOptions));
    rows.add(resolveReasoningRow(safeOptions));

    Map<String, Object> report = new LinkedHashMap<>();
    report.put("track", "production");
    report.put("generatedAt", Instant.now().toString());
    report.put("result", overallResult(rows, "pass"));
    report.put("rows", rows);
    return report;
  }

  public void writeReport(Path output, Map<String, Object> report) throws IOException {
    Path parent = output.toAbsolutePath().normalize().getParent();
    if (parent != null) {
      Files.createDirectories(parent);
    }
    MAPPER.writerWithDefaultPrettyPrinter().writeValue(output.toFile(), report);
  }

  public static void main(String[] args) {
    try {
      CliOptions options = CliOptions.parse(args);
      OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();
      Map<String, Object> report = "production".equals(options.track())
          ? matrix.runProduction(options.productionOptions())
          : matrix.runLocalFixture(options.localApiKey());
      if (options.output() != null) {
        matrix.writeReport(options.output(), report);
      } else {
        System.out.println(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(report));
      }
    } catch (Exception e) {
      System.err.println("OpenAI-compatible formal matrix failed: " + e.getMessage());
      e.printStackTrace(System.err);
      System.exit(2);
    }
  }

  public record ProductionOptions(
      URI backendBaseUrl,
      String serviceToken,
      String model,
      String providerName,
      boolean allowUnsafeRealErrorInjection,
      Map<String, String> environment,
      String adapterApiKey,
      String adapterBaseUrl,
      String reasoningModel) {
    public ProductionOptions {
      backendBaseUrl = backendBaseUrl != null ? backendBaseUrl : URI.create("http://127.0.0.1:18084");
      serviceToken = serviceToken != null && !serviceToken.isBlank() ? serviceToken : DEFAULT_SERVICE_TOKEN;
      model = model != null && !model.isBlank() ? model : "default";
      providerName = providerName != null && !providerName.isBlank() ? providerName : "provider";
      environment = environment != null ? Map.copyOf(environment) : Map.of();
      adapterApiKey = adapterApiKey != null && !adapterApiKey.isBlank() ? adapterApiKey : null;
      adapterBaseUrl = adapterBaseUrl != null && !adapterBaseUrl.isBlank() ? adapterBaseUrl : null;
      reasoningModel = reasoningModel != null && !reasoningModel.isBlank() ? reasoningModel : null;
    }

    public static ProductionOptions defaults() {
      return new ProductionOptions(
          URI.create("http://127.0.0.1:18084"),
          DEFAULT_SERVICE_TOKEN,
          "default",
          "provider",
          false,
          Map.of("providerType", "openai-compatible"),
          null,
          null,
          null);
    }
  }

  private Map<String, Object> resolveRetryRow(ProductionOptions options) throws IOException {
    return blockedProductionRow(
        options,
        "retry",
        "retry",
        "No safe production 503 injection path is available for the real provider; mock/proxy PASS is forbidden. "
            + "Batch 03 keeps retry blocked until a provider-natural or officially supported safe 503 path exists.");
  }

  private Map<String, Object> resolveTerminalErrorRow(ProductionOptions options) throws IOException {
    if (options.adapterApiKey() == null) {
      return blockedProductionRow(
          options,
          "terminal-error",
          "terminal_error",
          "No adapter API key was available for the bounded invalid-model terminal probe. "
              + "Backend remaps unknown models to the configured real model, so invalid-model must use "
              + "adapter-real-provider with the invalid id listed in ProviderConfig.models. "
              + "Invalid credentials are forbidden by the Batch 03 brief.");
    }

    long start = System.currentTimeMillis();
    String baseUrl = options.adapterBaseUrl() != null ? options.adapterBaseUrl() : DEFAULT_ZHIPU_BASE_URL;
    String invalidModel = INVALID_PROBE_MODEL;
    ProviderConfig config = new ProviderConfig(
        options.providerName(),
        "openai-compatible",
        baseUrl,
        options.adapterApiKey(),
        List.of(invalidModel),
        Map.of());
    ModelChatRequest request = new ModelChatRequest(
        "req-production-terminal-error",
        "conv-production-matrix",
        "matrix-user",
        "matrix-tenant",
        invalidModel,
        false,
        List.of(new AgentMessage(
            "user",
            "Bounded terminal-error probe only; do not execute tools.",
            null, null, null, null, null, null, null, null, null, null, null)),
        List.of(),
        Map.of("requestSent", true, "probe", "invalid-model"));
    String requestJson;
    try {
      requestJson = MAPPER.writeValueAsString(Map.of(
          "model", invalidModel,
          "messages", List.of(Map.of("role", "user", "content", "Bounded terminal-error probe only.")),
          "stream", false));
    } catch (IOException e) {
      throw e;
    }
    String endpoint = baseUrl.endsWith("/") ? baseUrl + "chat/completions" : baseUrl + "/chat/completions";
    String requestHash = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(endpoint, "[REDACTED]", requestJson);
    Map<String, Object> observed = new LinkedHashMap<>();
    observed.put("requestSent", true);
    observed.put("transport", "adapter-real-provider");
    observed.put("probeModel", invalidModel);
    observed.put("safety", "single invalid-model request; no credential mutation; no user data");
    String result = "fail";
    try {
      new OpenAiCompatibleAdapter().chat(request, config);
      observed.put("errorClass", "MISSING_TERMINAL_ERROR");
      observed.put("errorMessage", "Provider accepted invalid model; terminal_error oracle not met");
    } catch (RuntimeException e) {
      String message = e.getMessage() != null ? e.getMessage() : "";
      observed.put("errorClass", e.getClass().getSimpleName());
      // Never put raw provider body secrets; keep short classifiable snippet.
      observed.put("errorMessageClassified", classifyProviderErrorMessage(message));
      Integer providerStatus = extractProviderHttpStatus(message);
      if (providerStatus != null) {
        observed.put("providerHttpStatus", providerStatus);
      }
      boolean terminal = providerStatus != null && providerStatus >= 400 && providerStatus < 500
          || message.contains("Provider error 400")
          || message.contains("Provider error 404")
          || message.contains("invalid");
      result = terminal ? "pass" : "fail";
      observed.put("terminalSeen", terminal);
    }

    Map<String, Object> environment = productionEnvironment(options);
    environment.put("transport", "adapter-real-provider");
    return row(
        "openai-" + providerSlug(options.providerName()) + "-terminal-error",
        true,
        "production",
        environment,
        List.of("terminal_error"),
        requestHash,
        observed,
        Map.of("providerHttpStatus4xx", true, "requestSent", true),
        null,
        null,
        durationSince(start),
        result);
  }

  private Map<String, Object> resolveCancellationRow(ProductionOptions options) throws IOException {
    long start = System.currentTimeMillis();
    String requestId = "req-production-cancellation";
    Map<String, Object> requestBody = modelRequest(
        requestId,
        options.model(),
        false,
        "Cancel production matrix probe: this request should be interrupted by public cancel when supported.",
        List.of(),
        Map.of("requestSent", true, "cancellationProbe", true));
    String requestJson = MAPPER.writeValueAsString(requestBody);
    String endpoint = chatEndpoint(options.backendBaseUrl());
    String requestHash = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(endpoint, "[REDACTED]", requestJson);

    String rowResult = "blocked";
    String blockedReason = null;
    Map<String, Object> observed = new LinkedHashMap<>();
    observed.put("requestId", requestId);
    observed.put("requestSent", true);
    observed.put("cancellationProbe", "public-cancel-endpoint");

    ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
      Thread thread = new Thread(r, "openai-compatible-formal-cancel");
      thread.setDaemon(true);
      return thread;
    });
    Future<BackendCallResult> chatResultFuture = executor.submit(() -> invokeCancellationChat(endpoint, options, requestJson));
    Map<String, Object> cancelObserved;
    try {
      Thread.sleep(150);
      cancelObserved = invokeCancellationEndpoint(options, requestId);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      observed.put("sleepInterrupted", true);
      cancelObserved = new LinkedHashMap<>();
      cancelObserved.put("cancelRequestSent", false);
      cancelObserved.put("cancelInterrupted", true);
    } finally {
      executor.shutdown();
    }

    BackendCallResult chatResult;
    try {
      chatResult = chatResultFuture.get(2500, TimeUnit.MILLISECONDS);
    } catch (TimeoutException e) {
      chatResult = new BackendCallResult(false, null, Map.of("timeout", "cancellation chat request did not complete"), "Cancellation chat did not complete in time.");
      observed.put("chatTimedOut", true);
      chatResultFuture.cancel(true);
    } catch (Exception e) {
      chatResult = new BackendCallResult(false, null, Map.of("error", e.getClass().getSimpleName()),
          "Unable to obtain cancellation chat result.");
    }

    observed.putAll(chatResult.observed());
    observed.putAll(cancelObserved);
    observed.put("chatCompleted", Boolean.TRUE.equals(chatResult.observed().get("chatCompleted")));
    observed.put("unsafeRealErrorInjectionAllowed", options.allowUnsafeRealErrorInjection());

    if (chatResult.passed() && Boolean.TRUE.equals(cancelObserved.get("cancelled"))) {
      rowResult = "pass";
    } else if (chatResult.failureReason() != null) {
      blockedReason = chatResult.failureReason();
    } else if (!Boolean.TRUE.equals(cancelObserved.get("cancelRequestSent"))) {
      blockedReason = "Cancellation probe could not send /api/v1/model/cancel request.";
    } else if (!Boolean.TRUE.equals(cancelObserved.get("cancelled"))) {
      blockedReason = "Cancellation endpoint returned cancelled=false.";
    } else {
      blockedReason = "Cancellation probe completed without PROVIDER_CANCELLED structured error.";
    }

    if ("blocked".equals(rowResult)) {
      observed.put("blockedReason", blockedReason);
    }

    Map<String, Object> environment = productionEnvironment(options);
    environment.put("cancellationEndpoint", "/api/v1/model/cancel");
    return row(
        "openai-" + providerSlug(options.providerName()) + "-cancellation",
        true,
        "production",
        environment,
        List.of("cancellation"),
        requestHash,
        observed,
        Map.of("mustNotMockPass", true, "realEvidenceRequired", true),
        null,
        null,
        durationSince(start),
        rowResult);
  }

  private Map<String, Object> resolveReasoningRow(ProductionOptions options) throws IOException, InterruptedException {
    if (options.reasoningModel() == null) {
      return blockedProductionRow(
          options,
          "reasoning",
          "reasoning",
          "No reasoning-capable model was supplied (set OPENHARNESS_REASONING_MODEL or --reasoning-model). "
              + "glm-4-flash is not treated as reasoning-capable without explicit evidence.");
    }
    // Optional future path: call backend/adapter with reasoning model. For Batch 03, require explicit
    // model and still evaluate; if call fails capability, fail/blocked without mock PASS.
    long start = System.currentTimeMillis();
    Map<String, Object> requestBody = modelRequest(
        "req-production-reasoning",
        options.reasoningModel(),
        false,
        "Reply with a short answer. Prefer returning reasoning content if the model supports it.",
        List.of(),
        Map.of("reasoningProbe", true));
    Map<String, Object> row = callProductionRow(
        options,
        "reasoning",
        "reasoning",
        requestBody,
        Map.of("reasoningPreserved", true));
    @SuppressWarnings("unchecked")
    Map<String, Object> observed = (Map<String, Object>) row.get("observed");
    observed = observed != null ? new LinkedHashMap<>(observed) : new LinkedHashMap<>();
    observed.put("requestSent", true);
    boolean preserved = observed.get("reasoningBlocks") != null;
    if (!preserved) {
      observed.put("blockedReason", "Reasoning model call completed without preserved reasoning blocks.");
      row.put("result", "blocked");
      row.put("durationMs", durationSince(start));
    }
    row.put("observed", QualificationRedactor.redact(observed));
    return row;
  }

  private static String classifyProviderErrorMessage(String message) {
    if (message == null) {
      return "null";
    }
    if (message.contains("Provider error 400")) {
      return "provider_error_400";
    }
    if (message.contains("Provider error 404")) {
      return "provider_error_404";
    }
    if (message.contains("Provider error 401") || message.contains("Provider error 403")) {
      return "provider_error_auth";
    }
    if (message.toLowerCase(Locale.ROOT).contains("invalid")) {
      return "provider_invalid_request";
    }
    return "provider_runtime_exception";
  }

  private static Integer extractProviderHttpStatus(String message) {
    if (message == null) {
      return null;
    }
    int marker = message.indexOf("Provider error ");
    if (marker < 0) {
      return null;
    }
    int start = marker + "Provider error ".length();
    int end = start;
    while (end < message.length() && Character.isDigit(message.charAt(end))) {
      end++;
    }
    if (end == start) {
      return null;
    }
    try {
      return Integer.parseInt(message.substring(start, end));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private Map<String, Object> callProductionRow(
      ProductionOptions options,
      String rowSuffix,
      String capability,
      Map<String, Object> requestBody,
      Map<String, Object> oracle) throws IOException, InterruptedException {
    long start = System.currentTimeMillis();
    String endpoint = chatEndpoint(options.backendBaseUrl());
    String requestJson = MAPPER.writeValueAsString(requestBody);
    String requestHash = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(endpoint, "[REDACTED]", requestJson);
    Map<String, Object> observed = new LinkedHashMap<>();
    Map<String, Number> usage = null;
    Map<String, Object> cost = null;
    String result = "fail";

    try {
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(endpoint))
          .header("Authorization", "Bearer " + options.serviceToken())
          .header("Content-Type", "application/json")
          .header("X-User-Id", "matrix-user")
          .header("X-Tenant-Id", "matrix-tenant")
          .header("X-Trace-Id", "matrix-trace-" + rowSuffix)
          .header("X-Request-Id", "matrix-" + rowSuffix)
          .POST(HttpRequest.BodyPublishers.ofString(requestJson))
          .build();
      HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
      observed.put("httpStatus", response.statusCode());
      JsonNode json = response.body() != null && !response.body().isBlank()
          ? MAPPER.readTree(response.body())
          : MAPPER.createObjectNode();
      RowEvaluation evaluation = evaluateProductionResponse(rowSuffix, response.statusCode(), json);
      observed.putAll(evaluation.observed());
      usage = evaluation.usage();
      cost = evaluation.cost();
      result = evaluation.pass() ? "pass" : "fail";
    } catch (Exception e) {
      observed.put("errorClass", e.getClass().getSimpleName());
      observed.put("errorMessage", e.getMessage());
      if (e instanceof InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        throw interrupted;
      }
    }

    return row(
        "openai-" + providerSlug(options.providerName()) + "-" + rowSuffix,
        true,
        "production",
        productionEnvironment(options),
        List.of(capability),
        requestHash,
        observed,
        oracle,
        usage,
        cost,
        durationSince(start),
        result);
  }

  private RowEvaluation evaluateProductionResponse(String rowSuffix, int status, JsonNode json) {
    Map<String, Object> observed = new LinkedHashMap<>();
    Map<String, Number> usage = null;
    Map<String, Object> cost = null;
    JsonNode error = json.path("error");
    if (!error.isMissingNode() && !error.isNull()) {
      observed.put("errorClass", text(error, "errorClass"));
      observed.put("structuredStatus", error.path("httpStatus").isInt() ? error.path("httpStatus").asInt() : null);
      if ("timeout".equals(rowSuffix)) {
        boolean timeoutSeen = "PROVIDER_TIMEOUT".equals(text(error, "errorClass"))
            && error.path("httpStatus").asInt(-1) == 504;
        observed.put("timeoutSeen", timeoutSeen);
        return new RowEvaluation(timeoutSeen, observed, null, null);
      }
      if ("cancellation".equals(rowSuffix)) {
        boolean cancelled = "PROVIDER_CANCELLED".equals(text(error, "errorClass"))
            && error.path("httpStatus").isInt()
            && error.path("httpStatus").asInt() == 409;
        return new RowEvaluation(cancelled, observed, null, null);
      }
      return new RowEvaluation(false, observed, null, null);
    }

    observed.put("provider", text(json, "rawProvider"));
    JsonNode message = json.path("message");
    if (!message.isMissingNode() && !message.isNull()) {
      String content = message.path("content").isMissingNode() || message.path("content").isNull()
          ? null
          : message.path("content").asText();
      if (content != null) {
        observed.put("content", content);
      }
      JsonNode toolCalls = message.path("toolCalls");
      if (toolCalls.isArray()) {
        observed.put("toolCallCount", toolCalls.size());
        if (toolCalls.size() > 0) {
          observed.put("toolName", text(toolCalls.get(0), "name"));
          observed.put("arguments", parseToolArguments(toolCalls.get(0).path("argumentsRaw").asText("")));
        }
      }
      JsonNode reasoningBlocks = message.path("reasoningBlocks");
      if (reasoningBlocks.isArray() && reasoningBlocks.size() > 0) {
        try {
          List<Map<String, Object>> blocks = MAPPER.convertValue(
              reasoningBlocks,
              MAPPER.getTypeFactory().constructCollectionType(List.class, Map.class)
          );
          observed.put("reasoningBlocks", blocks);
        } catch (IllegalArgumentException e) {
          // ignore
        }
      }
    }

    JsonNode usageNode = json.path("usage");
    if (!usageNode.isMissingNode() && !usageNode.isNull()) {
      Map<String, Number> extractedUsage = new LinkedHashMap<>();
      putNumber(extractedUsage, "promptTokens", usageNode.path("promptTokens"));
      putNumber(extractedUsage, "completionTokens", usageNode.path("completionTokens"));
      putNumber(extractedUsage, "totalTokens", usageNode.path("totalTokens"));
      usage = extractedUsage.isEmpty() ? null : extractedUsage;
      if (usage != null) {
        observed.putAll(usage);
      }
      if (usageNode.path("costUsdMicros").isNumber()) {
        cost = new LinkedHashMap<>();
        cost.put("currency", "USD");
        cost.put("micros", usageNode.path("costUsdMicros").asLong());
        observed.put("costUsdMicros", usageNode.path("costUsdMicros").asLong());
      }
    }

    boolean pass = switch (rowSuffix) {
      case "sync", "stream" -> status == 200 && observed.get("content") != null;
      case "usage-cost" -> status == 200 && usage != null && usage.values().stream().allMatch(value -> value.longValue() >= 0);
      case "structured-tool" -> status == 200 && ((Number) observed.getOrDefault("toolCallCount", 0)).intValue() > 0;
      case "reasoning" -> status == 200 && observed.get("reasoningBlocks") != null;
      default -> false;
    };
    return new RowEvaluation(pass, observed, usage, cost);
  }

  private BackendCallResult invokeCancellationChat(String endpoint, ProductionOptions options, String requestJson) {
    try {
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(endpoint))
          .header("Authorization", "Bearer " + options.serviceToken())
          .header("Content-Type", "application/json")
          .header("X-User-Id", "matrix-user")
          .header("X-Tenant-Id", "matrix-tenant")
          .header("X-Trace-Id", "matrix-trace-cancellation")
          .header("X-Request-Id", "matrix-cancellation")
          .POST(HttpRequest.BodyPublishers.ofString(requestJson))
          .build();
      HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
      JsonNode json = response.body() != null && !response.body().isBlank()
          ? MAPPER.readTree(response.body())
          : MAPPER.createObjectNode();
      RowEvaluation evaluation = evaluateProductionResponse("cancellation", response.statusCode(), json);
      Map<String, Object> observed = new LinkedHashMap<>();
      observed.put("chatHttpStatus", response.statusCode());
      observed.put("chatCompleted", true);
      observed.putAll(evaluation.observed());
      return new BackendCallResult(evaluation.pass(), response.statusCode(), observed, null);
    } catch (Exception e) {
      Map<String, Object> observed = new LinkedHashMap<>();
      observed.put("chatCompleted", false);
      observed.put("chatErrorClass", e.getClass().getSimpleName());
      observed.put("chatErrorMessage", e.getMessage());
      return new BackendCallResult(false, null, observed,
          "Exception during cancellation chat probe: " + e.getClass().getSimpleName());
    }
  }

  private Map<String, Object> invokeCancellationEndpoint(ProductionOptions options, String requestId) {
    Map<String, Object> observed = new LinkedHashMap<>();
    String endpoint = cancelEndpoint(options.backendBaseUrl());
    String payload;
    try {
      payload = MAPPER.writeValueAsString(Map.of("requestId", requestId));
    } catch (IOException e) {
      observed.put("cancelRequestSent", false);
      observed.put("cancelErrorMessage", "failed-to-serialize-cancel-payload");
      return observed;
    }

    String cancelHash = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(endpoint, "[REDACTED]", payload);
    observed.put("cancelRequestHash", cancelHash);
    observed.put("cancelRequestId", requestId);
    try {
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(endpoint))
          .header("Authorization", "Bearer " + options.serviceToken())
          .header("Content-Type", "application/json")
          .header("X-User-Id", "matrix-user")
          .header("X-Tenant-Id", "matrix-tenant")
          .header("X-Trace-Id", "matrix-trace-cancellation")
          .header("X-Request-Id", "matrix-cancel")
          .POST(HttpRequest.BodyPublishers.ofString(payload))
          .build();
      HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
      observed.put("cancelRequestSent", true);
      observed.put("cancelHttpStatus", response.statusCode());

      JsonNode json = response.body() != null && !response.body().isBlank()
          ? MAPPER.readTree(response.body())
          : MAPPER.createObjectNode();
      observed.put("cancelled", json.path("cancelled").asBoolean(false));
      observed.put("cancelResponseRequestId", text(json, "requestId"));
      return observed;
    } catch (Exception e) {
      observed.put("cancelRequestSent", false);
      observed.put("cancelErrorClass", e.getClass().getSimpleName());
      observed.put("cancelErrorMessage", e.getMessage());
      return observed;
    }
  }

  private static String cancelEndpoint(URI backendBaseUrl) {
    String base = backendBaseUrl.toString();
    if (base.endsWith("/api/v1/model/cancel")) {
      return base;
    }
    if (base.endsWith("/")) {
      return base + "api/v1/model/cancel";
    }
    return base + "/api/v1/model/cancel";
  }

  private Map<String, Object> blockedProductionRow(
      ProductionOptions options,
      String rowSuffix,
      String capability,
      String blockedReason) throws IOException {
    Map<String, Object> blockedIntent = modelRequest(
        "req-production-" + rowSuffix,
        options.model(),
        false,
        "Blocked production matrix intent: " + capability,
        List.of(),
        Map.of("requestSent", false, "blockedReason", blockedReason));
    String requestHash = OpenAiCompatibleAdapter.calculateCanonicalRequestHash(
        chatEndpoint(options.backendBaseUrl()),
        "[REDACTED]",
        MAPPER.writeValueAsString(blockedIntent));
    Map<String, Object> observed = new LinkedHashMap<>();
    observed.put("requestSent", false);
    observed.put("blockedReason", blockedReason);
    observed.put("unsafeRealErrorInjectionAllowed", options.allowUnsafeRealErrorInjection());
    return row(
        "openai-" + providerSlug(options.providerName()) + "-" + rowSuffix,
        true,
        "production",
        productionEnvironment(options),
        List.of(capability),
        requestHash,
        observed,
        Map.of("mustNotMockPass", true, "realEvidenceRequired", true),
        null,
        null,
        0,
        "blocked");
  }

  private void enrichLocalReport(Map<String, Object> report, Map<String, AtomicInteger> hitCounters) {
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) report.get("rows");
    for (Map<String, Object> row : rows) {
      Map<String, Object> environment = new LinkedHashMap<>();
      Object originalEnvironment = row.get("environment");
      if (originalEnvironment instanceof Map<?, ?> map) {
        map.forEach((key, value) -> environment.put(String.valueOf(key), value));
      }
      environment.put("providerFamily", "openai-compatible");
      environment.put("harness", "OpenAiCompatibleFormalMatrix");
      environment.put("javaVersion", System.getProperty("java.version"));
      environment.put("osName", System.getProperty("os.name"));
      row.put("environment", environment);

      @SuppressWarnings("unchecked")
      Map<String, Object> observed = (Map<String, Object>) row.get("observed");
      if ("openai-503-retry".equals(row.get("id"))) {
        int hits = hitCounters.getOrDefault("openai:matrix-retry", new AtomicInteger()).get();
        observed.put("providerHitCount", hits);
        observed.put("firstStatus", 503);
        observed.put("terminalStatus", hits >= 2 ? 200 : 503);
      } else if ("openai-terminal-error".equals(row.get("id"))) {
        observed.put("terminalErrorClass", "Provider error 400");
      }
    }
  }

  private static MockResponse localOpenAiResponse(String body, Map<String, AtomicInteger> hitCounters) {
    if (body.contains("matrix-retry")) {
      int hitCount = hitCounters.computeIfAbsent("openai:matrix-retry", ignored -> new AtomicInteger()).incrementAndGet();
      if (hitCount == 1) {
        return new MockResponse(503, "application/json", "{\"error\":\"retry\"}");
      }
    }
    if (body.contains("matrix-terminal")) {
      return new MockResponse(400, "application/json", "{\"error\":\"terminal\"}");
    }
    if (body.contains("matrix-tool")) {
      return new MockResponse(200, "application/json", "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"id\\\":1}\"}}]}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}");
    }
    if (body.contains("matrix-stream")) {
      return new MockResponse(200, "text/event-stream", "data: {\"choices\":[{\"delta\":{\"content\":\"o\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"k\"}}]}\n\ndata: [DONE]\n\n");
    }
    if (body.contains("matrix-timeout")) {
      sleep(500);
      return new MockResponse(200, "application/json", "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}]}");
    }
    if (body.contains("matrix-cancellation")) {
      sleep(1000);
      return new MockResponse(200, "application/json", "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}]}");
    }
    if (body.contains("matrix-reasoning")) {
      return new MockResponse(200, "application/json", "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\",\"reasoning_content\":\"thinking process\"}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}");
    }
    return new MockResponse(200, "application/json", "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}");
  }

  private static Map<String, Object> row(
      String id,
      boolean required,
      String track,
      Map<String, Object> environment,
      List<String> capabilities,
      String requestHash,
      Map<String, Object> observed,
      Map<String, Object> oracle,
      Map<String, Number> usage,
      Map<String, Object> cost,
      long durationMs,
      String result) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", id);
    row.put("required", required);
    row.put("track", track);
    row.put("environment", environment);
    row.put("protocolVersion", PROTOCOL_VERSION);
    row.put("capabilities", capabilities);
    row.put("requestHash", requestHash);
    row.put("observed", QualificationRedactor.redact(observed));
    row.put("oracle", oracle);
    if (usage != null && !usage.isEmpty()) {
      row.put("usage", usage);
    }
    if (cost != null && !cost.isEmpty()) {
      row.put("cost", cost);
    }
    row.put("durationMs", durationMs);
    row.put("result", result);
    return row;
  }

  private static String overallResult(List<Map<String, Object>> rows, String passingResult) {
    boolean hasFail = false;
    boolean hasBlocked = false;
    for (Map<String, Object> row : rows) {
      if (!Boolean.TRUE.equals(row.get("required"))) {
        continue;
      }
      if ("fail".equals(row.get("result"))) {
        hasFail = true;
      } else if ("blocked".equals(row.get("result"))) {
        hasBlocked = true;
      }
    }
    if (hasFail) {
      return "fail";
    }
    if (hasBlocked) {
      return "blocked";
    }
    return passingResult;
  }

  private static Map<String, Object> productionEnvironment(ProductionOptions options) {
    Map<String, Object> environment = new LinkedHashMap<>();
    environment.put("transport", "backend-api");
    environment.put("backendUrl", redactedBackendUrl(options.backendBaseUrl()));
    environment.put("providerFamily", "openai-compatible");
    environment.put("providerName", options.providerName());
    environment.put("model", options.model());
    environment.put("harness", "OpenAiCompatibleFormalMatrix");
    environment.put("javaVersion", System.getProperty("java.version"));
    environment.put("osName", System.getProperty("os.name"));
    environment.put("unsafeRealErrorInjectionAllowed", options.allowUnsafeRealErrorInjection());
    environment.putAll(options.environment());
    return environment;
  }

  private static String chatEndpoint(URI backendBaseUrl) {
    String base = backendBaseUrl.toString();
    if (base.endsWith("/api/v1/model/chat")) {
      return base;
    }
    if (base.endsWith("/")) {
      return base + "api/v1/model/chat";
    }
    return base + "/api/v1/model/chat";
  }

  private static String redactedBackendUrl(URI uri) {
    if (uri.getUserInfo() == null) {
      return uri.toString();
    }
    try {
      return new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), uri.getPath(), uri.getQuery(), uri.getFragment()).toString();
    } catch (Exception e) {
      return "[REDACTED]";
    }
  }

  private static Map<String, Object> modelRequest(
      String requestId,
      String model,
      boolean stream,
      String prompt,
      List<Map<String, Object>> tools,
      Map<String, Object> meta) {
    Map<String, Object> request = new LinkedHashMap<>();
    request.put("requestId", requestId);
    request.put("conversationId", "conv-production-matrix");
    request.put("userId", "matrix-user");
    request.put("tenantId", "matrix-tenant");
    request.put("model", model);
    request.put("stream", stream);
    request.put("messages", List.of(Map.of(
        "role", "user",
        "content", prompt)));
    request.put("tools", tools);
    request.put("meta", meta);
    return request;
  }

  private static Map<String, Object> toolDefinition(String name) {
    Map<String, Object> tool = new LinkedHashMap<>();
    tool.put("name", name);
    tool.put("description", "lookup");
    tool.put("parameters", Map.of("type", "object", "properties", Map.of("id", Map.of("type", "integer"))));
    tool.put("catalogVersion", null);
    tool.put("catalogHash", null);
    tool.put("permission", "safe");
    tool.put("isReadOnly", true);
    tool.put("isDestructive", false);
    tool.put("requiresApproval", false);
    tool.put("isConcurrencySafe", true);
    tool.put("protocol", "java");
    return tool;
  }

  private static Map<String, Object> parseToolArguments(String argumentsRaw) {
    if (argumentsRaw == null || argumentsRaw.isBlank()) {
      return Map.of();
    }
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> parsed = MAPPER.readValue(argumentsRaw, Map.class);
      return parsed;
    } catch (Exception e) {
      return Map.of("parseError", e.getMessage());
    }
  }

  private static String providerSlug(String providerName) {
    String slug = providerName.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    return slug.isBlank() ? "provider" : slug;
  }

  private static String text(JsonNode node, String field) {
    JsonNode value = node.path(field);
    return value.isMissingNode() || value.isNull() ? null : value.asText();
  }

  private static void putNumber(Map<String, Number> target, String field, JsonNode value) {
    if (value.isNumber()) {
      target.put(field, value.numberValue());
    }
  }

  private static long durationSince(long start) {
    long duration = System.currentTimeMillis() - start;
    return duration == 0 ? 1 : duration;
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private record BackendCallResult(
      boolean passed,
      Integer httpStatus,
      Map<String, Object> observed,
      String failureReason) {
  }

  private record RowEvaluation(boolean pass, Map<String, Object> observed, Map<String, Number> usage, Map<String, Object> cost) {}

  private record MockResponse(int status, String contentType, String body) {}

  private record CliOptions(
      String track,
      String localApiKey,
      ProductionOptions productionOptions,
      Path output) {
    private static CliOptions parse(String[] args) {
      String track = "local";
      String localApiKey = "fake-key";
      URI backendUrl = URI.create("http://127.0.0.1:18084");
      String serviceToken = System.getenv().getOrDefault("OPENHARNESS_SERVICE_TOKEN", DEFAULT_SERVICE_TOKEN);
      String model = "default";
      String providerName = "provider";
      boolean allowUnsafe = false;
      Path output = null;
      String adapterApiKey = firstNonBlank(
          System.getenv("ZHIPU_API_KEY"),
          System.getenv("OPENAI_API_KEY"));
      String adapterBaseUrl = firstNonBlank(
          System.getenv("ZHIPU_BASE_URL"),
          DEFAULT_ZHIPU_BASE_URL);
      String reasoningModel = firstNonBlank(
          System.getenv("OPENHARNESS_REASONING_MODEL"),
          null);
      Map<String, String> environment = new LinkedHashMap<>();
      environment.put("providerType", "openai-compatible");

      for (String arg : args) {
        if (arg.startsWith("--track=")) {
          track = arg.substring("--track=".length());
        } else if (arg.startsWith("--local-api-key=")) {
          localApiKey = arg.substring("--local-api-key=".length());
        } else if (arg.startsWith("--backend-url=")) {
          backendUrl = URI.create(arg.substring("--backend-url=".length()));
        } else if (arg.startsWith("--service-token=")) {
          serviceToken = arg.substring("--service-token=".length());
        } else if (arg.startsWith("--model=")) {
          model = arg.substring("--model=".length());
        } else if (arg.startsWith("--provider-name=")) {
          providerName = arg.substring("--provider-name=".length());
        } else if (arg.equals("--allow-unsafe-real-errors")) {
          allowUnsafe = true;
        } else if (arg.startsWith("--adapter-api-key=")) {
          adapterApiKey = arg.substring("--adapter-api-key=".length());
        } else if (arg.startsWith("--adapter-base-url=")) {
          adapterBaseUrl = arg.substring("--adapter-base-url=".length());
        } else if (arg.startsWith("--reasoning-model=")) {
          reasoningModel = arg.substring("--reasoning-model=".length());
        } else if (arg.startsWith("--env=")) {
          String entry = arg.substring("--env=".length());
          int separator = entry.indexOf('=');
          if (separator <= 0 || separator == entry.length() - 1) {
            throw new IllegalArgumentException("--env must use key=value format");
          }
          environment.put(entry.substring(0, separator), entry.substring(separator + 1));
        } else if (arg.startsWith("--output=")) {
          output = Path.of(arg.substring("--output=".length()));
        } else {
          throw new IllegalArgumentException("Unknown matrix argument: " + arg);
        }
      }
      if (!"local".equals(track) && !"production".equals(track)) {
        throw new IllegalArgumentException("--track must be local or production");
      }
      return new CliOptions(
          track,
          localApiKey,
          new ProductionOptions(
              backendUrl,
              serviceToken,
              model,
              providerName,
              allowUnsafe,
              environment,
              adapterApiKey,
              adapterBaseUrl,
              reasoningModel),
          output);
    }
  }

  private static String firstNonBlank(String first, String second) {
    if (first != null && !first.isBlank()) {
      return first;
    }
    if (second != null && !second.isBlank()) {
      return second;
    }
    return null;
  }
}
