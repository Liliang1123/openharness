package org.openharness.backend.qualification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public final class QualificationReportPromoter {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OPENAI_REPORT = "2026-07-06-openai-compatible-local.json";
  private static final String ANTHROPIC_REPORT = "2026-07-06-anthropic-local.json";
  private static final Path AUDIT_FILE = Path.of("qualification-report-promotion-audit.jsonl");
  private static final Set<String> REPORT_RESULTS = Set.of("pass", "fail", "blocked", "local_verified");
  private static final Set<String> ROW_RESULTS = Set.of("pass", "fail", "blocked");
  private static final Set<String> TRACKS = Set.of("local", "production");
  private static final Set<String> REPORT_KEYS = Set.of("track", "generatedAt", "result", "rows");
  private static final Set<String> ROW_KEYS = Set.of(
      "id", "required", "track", "environment", "protocolVersion", "capabilities", "requestHash",
      "observed", "oracle", "usage", "cost", "durationMs", "result");
  private static final Set<String> COST_KEYS = Set.of("currency", "micros");

  private QualificationReportPromoter() {}

  public static void main(String[] args) {
    PromotionOptions options = parseOptions(args);
    System.out.println("Starting Qualification Report Promoter...");

    try {
      Path providerDirectory = findProviderDirectory();
      PromoterRunResult runResult = generateReportsWithLoopbackServer("fake-key");

      promoteReport(providerDirectory, OPENAI_REPORT, runResult.reports().get(OPENAI_REPORT), options);
      promoteReport(providerDirectory, ANTHROPIC_REPORT, runResult.reports().get(ANTHROPIC_REPORT), options);

      System.out.println("Qualification reports promoted successfully!");
      System.exit(0);
    } catch (Exception e) {
      System.err.println("Error during report promotion: " + e.getMessage());
      e.printStackTrace();
      System.exit(2);
    }
  }

  public static PromoterRunResult generateReportsWithLoopbackServer(String apiKey) throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    Map<String, AtomicInteger> retryHitCounters = new ConcurrentHashMap<>();

    server.createContext("/", exchange -> {
      String path = exchange.getRequestURI().getPath();
      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      MockResponse mockResponse;

      if (path.endsWith("/chat/completions")) {
        mockResponse = openAiResponse(body, retryHitCounters);
      } else if (path.endsWith("/v1/messages")) {
        mockResponse = anthropicResponse(body, retryHitCounters);
      } else {
        mockResponse = new MockResponse(404, "application/json", "{\"error\":\"not_found\"}");
      }

      byte[] bytes = mockResponse.body().getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", mockResponse.contentType());
      exchange.sendResponseHeaders(mockResponse.status(), bytes.length);
      exchange.getResponseBody().write(bytes);
      exchange.close();
    });

    try {
      server.start();
      String localUrl = "http://127.0.0.1:" + server.getAddress().getPort();
      System.out.println("Mock Provider Server started at: " + localUrl);

      Map<String, Map<String, Object>> reports = new LinkedHashMap<>();
      System.out.println("Running OpenAI Compatible Matrix...");
      reports.put(OPENAI_REPORT, new OpenAiFakeProviderMatrix().run(localUrl, apiKey));

      System.out.println("Running Anthropic Matrix...");
      reports.put(ANTHROPIC_REPORT, new AnthropicFakeProviderMatrix().run(localUrl, apiKey));

      Map<String, Integer> retryHitCounts = toHitCountMap(retryHitCounters);
      requireRetryHitCount(retryHitCounts, "openai:matrix-retry");
      requireRetryHitCount(retryHitCounts, "anthropic:matrix-retry");
      return new PromoterRunResult(reports, retryHitCounts);
    } finally {
      server.stop(0);
    }
  }

  public static PromotionResult promoteReport(
      Path providerDirectory,
      String filename,
      Map<String, Object> report,
      PromotionOptions options) throws IOException {
    if (providerDirectory == null) {
      throw new IllegalArgumentException("providerDirectory is required");
    }
    if (filename == null || filename.isBlank()) {
      throw new IllegalArgumentException("filename is required");
    }
    PromotionOptions safeOptions = options != null ? options : new PromotionOptions(false, Map.of(), null);
    validateQualificationReport(report);

    Files.createDirectories(providerDirectory);
    Path target = providerDirectory.resolve(filename);
    boolean exists = Files.exists(target);
    if (exists && !safeOptions.overwrite()) {
      throw new IllegalStateException("Error: promotion destination already exists: " + target.toAbsolutePath()
          + "\nTo overwrite the immutable evidence, run with --overwrite, --expected-old-sha, and --reason");
    }

    String oldSha256 = null;
    if (exists) {
      requireOverwriteAuditInputs(filename, safeOptions);
      oldSha256 = sha256(target);
      String expectedOldSha256 = safeOptions.expectedOldSha256().get(filename);
      if (!oldSha256.equalsIgnoreCase(expectedOldSha256)) {
        throw new IllegalStateException("old SHA-256 mismatch for " + filename
            + ": expected " + expectedOldSha256 + " but found " + oldSha256);
      }
    }

    Path tempFile = Files.createTempFile(providerDirectory, "." + filename + ".", ".tmp");
    try {
      MAPPER.writerWithDefaultPrettyPrinter().writeValue(tempFile.toFile(), report);
      validateQualificationReport(MAPPER.readValue(tempFile.toFile(), Map.class));
      String newSha256 = sha256(tempFile);
      moveAtomically(tempFile, target);
      PromotionResult result = new PromotionResult(filename, oldSha256, newSha256,
          exists ? providerDirectory.resolve(AUDIT_FILE) : null);
      if (exists) {
        appendAuditRecord(providerDirectory.resolve(AUDIT_FILE), result, safeOptions.reason());
      }
      System.out.println("Promoted report: " + target.toAbsolutePath());
      return result;
    } finally {
      Files.deleteIfExists(tempFile);
    }
  }

  public record PromotionOptions(boolean overwrite, Map<String, String> expectedOldSha256, String reason) {
    public PromotionOptions {
      expectedOldSha256 = expectedOldSha256 == null ? Map.of() : Map.copyOf(expectedOldSha256);
      reason = reason == null ? null : reason.trim();
    }
  }

  public record PromotionResult(String filename, String oldSha256, String newSha256, Path auditPath) {}

  public record PromoterRunResult(Map<String, Map<String, Object>> reports, Map<String, Integer> retryHitCounts) {}

  private static MockResponse openAiResponse(String body, Map<String, AtomicInteger> retryHitCounters) {
    if (body.contains("matrix-retry")) {
      int hitCount = retryHitCounters.computeIfAbsent("openai:matrix-retry", ignored -> new AtomicInteger()).incrementAndGet();
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

  private static MockResponse anthropicResponse(String body, Map<String, AtomicInteger> retryHitCounters) {
    if (body.contains("matrix-retry")) {
      int hitCount = retryHitCounters.computeIfAbsent("anthropic:matrix-retry", ignored -> new AtomicInteger()).incrementAndGet();
      if (hitCount == 1) {
        return new MockResponse(503, "application/json", "{\"error\":\"retry\"}");
      }
    }
    if (body.contains("matrix-terminal")) {
      return new MockResponse(400, "application/json", "{\"error\":\"terminal\"}");
    }
    if (body.contains("matrix-tool")) {
      return new MockResponse(200, "application/json", "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"call-1\",\"name\":\"lookup\",\"input\":{\"id\":1}}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"cache_read_input_tokens\":2,\"cache_creation_input_tokens\":1}}");
    }
    if (body.contains("matrix-stream")) {
      return new MockResponse(200, "text/event-stream", "event: message_start\ndata: {\"type\": \"message_start\", \"message\": {\"id\": \"msg-stream\", \"type\": \"message\", \"role\": \"assistant\", \"content\": [], \"model\": \"claude-3\", \"usage\": {\"input_tokens\": 9, \"output_tokens\": 1}}}\n\nevent: content_block_start\ndata: {\"type\": \"content_block_start\", \"index\": 0, \"content_block\": {\"type\": \"text\", \"text\": \"\"}}\n\nevent: content_block_delta\ndata: {\"type\": \"content_block_delta\", \"index\": 0, \"delta\": {\"type\": \"text_delta\", \"text\": \"o\"}}\n\nevent: content_block_delta\ndata: {\"type\": \"content_block_delta\", \"index\": 0, \"delta\": {\"type\": \"text_delta\", \"text\": \"k\"}}\n\nevent: message_delta\ndata: {\"type\": \"message_delta\", \"delta\": {\"stop_reason\": \"end_turn\"}, \"usage\": {\"output_tokens\": 4}}\n\nevent: message_stop\ndata: {\"type\": \"message_stop\"}\n\n");
    }
    if (body.contains("matrix-timeout")) {
      sleep(500);
      return new MockResponse(200, "application/json", "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"ok\"}]}");
    }
    if (body.contains("matrix-cancellation")) {
      sleep(1000);
      return new MockResponse(200, "application/json", "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"ok\"}]}");
    }
    if (body.contains("matrix-reasoning")) {
      return new MockResponse(200, "application/json", "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"thinking process\",\"signature\":\"sig\"},{\"type\":\"text\",\"text\":\"ok\"}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"cache_read_input_tokens\":2,\"cache_creation_input_tokens\":1}}");
    }
    return new MockResponse(200, "application/json", "{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"ok\"}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"cache_read_input_tokens\":2,\"cache_creation_input_tokens\":1}}");
  }

  private static PromotionOptions parseOptions(String[] args) {
    boolean overwrite = false;
    Map<String, String> expectedOldSha256 = new LinkedHashMap<>();
    String reason = null;
    for (int i = 0; i < args.length; i++) {
      String arg = args[i];
      if ("--overwrite".equals(arg)) {
        overwrite = true;
      } else if (arg.startsWith("--reason=")) {
        reason = arg.substring("--reason=".length());
      } else if ("--reason".equals(arg) && i + 1 < args.length) {
        reason = args[++i];
      } else if (arg.startsWith("--expected-old-sha=")) {
        putExpectedOldSha(expectedOldSha256, arg.substring("--expected-old-sha=".length()));
      } else if ("--expected-old-sha".equals(arg) && i + 1 < args.length) {
        putExpectedOldSha(expectedOldSha256, args[++i]);
      } else {
        throw new IllegalArgumentException("Unknown promoter argument: " + arg);
      }
    }
    return new PromotionOptions(overwrite, expectedOldSha256, reason);
  }

  private static void putExpectedOldSha(Map<String, String> expectedOldSha256, String value) {
    int separator = value.indexOf('=');
    if (separator <= 0 || separator == value.length() - 1) {
      throw new IllegalArgumentException("--expected-old-sha must use filename=sha256 format");
    }
    String filename = value.substring(0, separator);
    String hash = value.substring(separator + 1).toLowerCase();
    if (!hash.matches("^[a-f0-9]{64}$")) {
      throw new IllegalArgumentException("expected old SHA-256 must be a 64-character hex string for " + filename);
    }
    expectedOldSha256.put(filename, hash);
  }

  private static void requireOverwriteAuditInputs(String filename, PromotionOptions options) {
    if (!options.overwrite()) {
      return;
    }
    String expected = options.expectedOldSha256().get(filename);
    if (expected == null || expected.isBlank()) {
      throw new IllegalStateException("--overwrite requires --expected-old-sha=" + filename + "=<sha256>");
    }
    if (options.reason() == null || options.reason().isBlank()) {
      throw new IllegalStateException("--overwrite requires a non-empty --reason");
    }
  }

  private static void validateQualificationReport(Map<String, Object> report) {
    if (report == null) {
      throw new IllegalArgumentException("qualification report is required");
    }
    requireOnlyKeys(report, REPORT_KEYS, "report");
    String track = requireString(report, "track", "report");
    if (!TRACKS.contains(track)) {
      throw new IllegalArgumentException("invalid qualification report track: " + track);
    }
    String result = requireString(report, "result", "report");
    if (!REPORT_RESULTS.contains(result)) {
      throw new IllegalArgumentException("invalid qualification report result: " + result);
    }
    String generatedAt = requireString(report, "generatedAt", "report");
    try {
      Instant.parse(generatedAt);
    } catch (Exception e) {
      throw new IllegalArgumentException("generatedAt must be an ISO instant", e);
    }
    Object rowsObject = report.get("rows");
    if (!(rowsObject instanceof List<?> rows)) {
      throw new IllegalArgumentException("report.rows must be an array");
    }

    boolean requiredRowNotPass = false;
    for (Object rowObject : rows) {
      if (!(rowObject instanceof Map<?, ?> row)) {
        throw new IllegalArgumentException("report.rows must contain objects");
      }
      validateRow(track, row);
      if (Boolean.TRUE.equals(row.get("required")) && !"pass".equals(row.get("result"))) {
        requiredRowNotPass = true;
      }
    }

    if ("local".equals(track)) {
      if ("pass".equals(result)) {
        throw new IllegalArgumentException("local track report result cannot be 'pass'; must use 'local_verified', 'fail', or 'blocked'");
      }
      if ("local_verified".equals(result) && requiredRowNotPass) {
        throw new IllegalArgumentException("required blocked or failed rows prevent overall local_verified");
      }
    }
    if ("production".equals(track)) {
      if ("local_verified".equals(result)) {
        throw new IllegalArgumentException("production track report result cannot be 'local_verified'");
      }
      if ("pass".equals(result) && requiredRowNotPass) {
        throw new IllegalArgumentException("required blocked or failed rows prevent overall pass");
      }
    }
  }

  private static void validateRow(String reportTrack, Map<?, ?> row) {
    requireOnlyKeys(row, ROW_KEYS, "row");
    String id = requireString(row, "id", "row");
    if (id.isBlank()) {
      throw new IllegalArgumentException("row.id is required");
    }
    Object required = row.get("required");
    if (!(required instanceof Boolean)) {
      throw new IllegalArgumentException("row.required must be boolean");
    }
    String rowTrack = requireString(row, "track", "row");
    if (!reportTrack.equals(rowTrack)) {
      throw new IllegalArgumentException("row track must match report track");
    }
    if (!(row.get("environment") instanceof Map<?, ?>)) {
      throw new IllegalArgumentException("row.environment must be an object");
    }
    String protocolVersion = requireString(row, "protocolVersion", "row");
    if (protocolVersion.isBlank()) {
      throw new IllegalArgumentException("row.protocolVersion is required");
    }
    if (!(row.get("capabilities") instanceof List<?>)) {
      throw new IllegalArgumentException("row.capabilities must be an array");
    }
    String requestHash = requireString(row, "requestHash", "row");
    if (!requestHash.matches("^[a-fA-F0-9]{64}$")) {
      throw new IllegalArgumentException("row.requestHash must be a SHA-256 hex string");
    }
    if (!(row.get("observed") instanceof Map<?, ?>)) {
      throw new IllegalArgumentException("row.observed must be an object");
    }
    if (!(row.get("oracle") instanceof Map<?, ?>)) {
      throw new IllegalArgumentException("row.oracle must be an object");
    }
    Object durationMs = row.get("durationMs");
    if (!(durationMs instanceof Number number) || number.doubleValue() < 0) {
      throw new IllegalArgumentException("row.durationMs must be a non-negative number");
    }
    String result = requireString(row, "result", "row");
    if (!ROW_RESULTS.contains(result)) {
      throw new IllegalArgumentException("invalid qualification row result: " + result);
    }
    if (row.containsKey("usage")) {
      validateUsage(row.get("usage"));
    }
    if (row.containsKey("cost")) {
      validateCost(row.get("cost"));
    }
  }

  private static void validateUsage(Object usageObject) {
    if (!(usageObject instanceof Map<?, ?> usage)) {
      throw new IllegalArgumentException("row.usage must be an object");
    }
    for (Object value : usage.values()) {
      if (!(value instanceof Number number) || number.doubleValue() < 0) {
        throw new IllegalArgumentException("row.usage values must be non-negative numbers");
      }
    }
  }

  private static void validateCost(Object costObject) {
    if (!(costObject instanceof Map<?, ?> cost)) {
      throw new IllegalArgumentException("row.cost must be an object");
    }
    requireOnlyKeys(cost, COST_KEYS, "cost");
    String currency = requireString(cost, "currency", "cost");
    if (currency.isBlank()) {
      throw new IllegalArgumentException("row.cost.currency is required");
    }
    Object micros = cost.get("micros");
    if (!(micros instanceof Number number) || number.longValue() < 0 || number.doubleValue() % 1 != 0) {
      throw new IllegalArgumentException("row.cost.micros must be a non-negative integer");
    }
  }

  private static String requireString(Map<?, ?> map, String key, String label) {
    Object value = map.get(key);
    if (!(value instanceof String string)) {
      throw new IllegalArgumentException(label + "." + key + " must be a string");
    }
    return string;
  }

  private static void requireOnlyKeys(Map<?, ?> map, Set<String> allowedKeys, String label) {
    for (Object key : map.keySet()) {
      if (!(key instanceof String) || !allowedKeys.contains(key)) {
        throw new IllegalArgumentException("unknown " + label + " key: " + key);
      }
    }
    for (String key : allowedKeys) {
      if (!"usage".equals(key) && !"cost".equals(key) && !map.containsKey(key)) {
        throw new IllegalArgumentException(label + "." + key + " is required");
      }
    }
  }

  private static void requireRetryHitCount(Map<String, Integer> retryHitCounts, String key) {
    int count = retryHitCounts.getOrDefault(key, 0);
    if (count != 2) {
      throw new IllegalStateException("Expected exactly 2 hits for " + key + " but observed " + count);
    }
  }

  private static Map<String, Integer> toHitCountMap(Map<String, AtomicInteger> retryHitCounters) {
    Map<String, Integer> hitCounts = new LinkedHashMap<>();
    retryHitCounters.entrySet().stream()
        .sorted(Map.Entry.comparingByKey())
        .forEach(entry -> hitCounts.put(entry.getKey(), entry.getValue().get()));
    return hitCounts;
  }

  private static Path findProviderDirectory() throws IOException {
    Path dir = Path.of(".").toAbsolutePath().normalize();
    for (int i = 0; i < 6 && dir != null; i++) {
      Path candidate = dir.resolve("docs/verification/agent-runtime-v1/providers");
      if (Files.exists(candidate)) {
        return candidate;
      }
      dir = dir.getParent();
    }
    throw new IOException("Cannot locate verification docs provider directory");
  }

  private static void moveAtomically(Path source, Path target) throws IOException {
    try {
      Files.move(source, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } catch (AtomicMoveNotSupportedException e) {
      Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  private static void appendAuditRecord(Path auditPath, PromotionResult result, String reason) throws IOException {
    Map<String, Object> auditRecord = new LinkedHashMap<>();
    auditRecord.put("promotedAt", Instant.now().toString());
    auditRecord.put("file", result.filename());
    auditRecord.put("oldSha256", result.oldSha256());
    auditRecord.put("newSha256", result.newSha256());
    auditRecord.put("reason", reason);
    Files.writeString(auditPath, MAPPER.writeValueAsString(auditRecord) + "\n", StandardCharsets.UTF_8,
        StandardOpenOption.CREATE, StandardOpenOption.APPEND);
  }

  private static String sha256(Path path) throws IOException {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(Files.readAllBytes(path));
      StringBuilder hex = new StringBuilder();
      for (byte b : hash) {
        String value = Integer.toHexString(0xff & b);
        if (value.length() == 1) hex.append('0');
        hex.append(value);
      }
      return hex.toString();
    } catch (Exception e) {
      throw new IOException("Failed to compute SHA-256 for " + path, e);
    }
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private record MockResponse(int status, String contentType, String body) {}
}
