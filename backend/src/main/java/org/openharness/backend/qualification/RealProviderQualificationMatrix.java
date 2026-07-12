package org.openharness.backend.qualification;

import java.math.BigInteger;
import java.time.Instant;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public final class RealProviderQualificationMatrix {
  public static final List<String> ROW_IDS = List.of("sync", "stream", "single-tool-call", "multi-step-tool-call",
      "structured-arguments", "reasoning", "usage", "cost", "503-retry", "timeout", "cancellation",
      "terminal-error", "redaction");
  private static final Set<String> ROW_RESULTS = Set.of("pass", "fail", "blocked");
  private static final Set<String> REQUIRED_ROW_KEYS = Set.of("id", "required", "track", "environment",
      "protocolVersion", "capabilities", "requestHash", "observed", "oracle", "usage", "cost", "durationMs", "result");
  private static final String REDACTION_CANARY = "oh-qualification-redaction-canary-v1";
  private static final ProductionBoundary PRODUCTION_BOUNDARY = new ProductionBoundary();

  private static final class ProductionBoundary { private ProductionBoundary() {} }

  private RealProviderQualificationMatrix() {}

  @FunctionalInterface
  public interface RowTransport {
    RowOutcome dispatch(String rowId, String requestId, long deadlineNanos) throws Exception;
  }

  public record RowOutcome(Map<String, Object> observed, Map<String, Long> rawProviderUsage,
      Map<String, Long> adapterUsage, String result) {
    public RowOutcome {
      if (!ROW_RESULTS.contains(result)) throw new IllegalArgumentException("invalid row result");
      observed = observed == null ? Map.of() : Map.copyOf(observed);
      rawProviderUsage = rawProviderUsage == null ? Map.of() : Map.copyOf(rawProviderUsage);
      adapterUsage = adapterUsage == null ? Map.of() : Map.copyOf(adapterUsage);
    }

    public static RowOutcome pass(Map<String, Object> observed, Map<String, Long> rawProviderUsage,
        Map<String, Long> adapterUsage) {
      return new RowOutcome(observed, rawProviderUsage, adapterUsage, "pass");
    }
  }

  public static Map<String, Object> execute(RealProviderQualificationConfig config, RowTransport transport,
      Duration rowDeadline) {
    return execute(config, transport, rowDeadline, null);
  }

  static Map<String, Object> executeProduction(RealProviderQualificationConfig config, RowTransport transport,
      Duration rowDeadline) {
    return execute(config, transport, rowDeadline, PRODUCTION_BOUNDARY);
  }

  private static Map<String, Object> execute(RealProviderQualificationConfig config, RowTransport transport,
      Duration rowDeadline, ProductionBoundary boundary) {
    if (config == null || transport == null || rowDeadline == null || rowDeadline.isZero()
        || rowDeadline.isNegative()) {
      throw new IllegalArgumentException("config, transport, and positive deadline are required");
    }
    List<Map<String, Object>> rows = new ArrayList<>();
    long accumulatedCost = 0;
    boolean veto = false;
    try (QualificationExchangeCapture.Capture ignored = QualificationExchangeCapture.beginCapture()) {
      for (String id : ROW_IDS) {
        long worstCaseNextRowCostMicros = config.worstCaseRowCostMicros(id);
        if (worstCaseNextRowCostMicros > config.costBudgetUsdMicros() - accumulatedCost) {
          rows.add(row(config, id, "blocked", Map.of("status", "not-dispatched"),
              Map.of("reason", "cost budget exhausted"), zeroUsage(config)));
          veto = true;
          continue;
        }
        String requestId = UUID.randomUUID().toString();
        long deadlineNanos = System.nanoTime() + rowDeadline.toNanos();
        FutureTask<RowOutcome> future = new FutureTask<>(() -> transport.dispatch(id, requestId, deadlineNanos));
        Thread worker = Thread.ofPlatform().name("qualification-" + id).unstarted(future);
        long started = System.nanoTime();
        worker.start();
        try {
          RowOutcome outcome = future.get(Math.max(1, deadlineNanos - System.nanoTime()), TimeUnit.NANOSECONDS);
          requireUsageEquality(outcome.rawProviderUsage(), outcome.adapterUsage());
          long observedCost = recomputeCost(config, outcome.adapterUsage());
          if (observedCost > config.costBudgetUsdMicros() - accumulatedCost) {
            throw new IllegalArgumentException("observed cost exceeds remaining budget");
          }
          accumulatedCost = Math.addExact(accumulatedCost, observedCost);
          Map<String, Object> evidence = QualificationExchangeCapture.consume(requestId);
          Map<String, Object> observed = new LinkedHashMap<>(evidence == null ? outcome.observed() : evidence);
          observed.remove("_actualResponseSurface");
          observed.remove("_actualCaptureSurface");
          observed.put("adapterCapturePresent", evidence != null
              || (boundary == PRODUCTION_BOUNDARY && observed.containsKey("streamParser")));
          observed.put("captureRequestId", requestId);
          observed.put("expectedStreamParser", config.providerId().equals("anthropic") ? "anthropic-sse" : "openai-sse");
          observed.put("rawProviderUsage", outcome.rawProviderUsage());
          observed.put("adapterUsage", outcome.adapterUsage());
          boolean productionOnlyRow = id.equals("stream") || id.equals("redaction");
          String rowResult = "blocked".equals(outcome.result())
              || (productionOnlyRow && boundary != PRODUCTION_BOUNDARY)
              ? "blocked" : evaluateRow(id, observed, outcome.rawProviderUsage(), outcome.adapterUsage()) ? "pass" : "blocked";
          Map<String, Object> matrixRow = row(config, id, rowResult, observed,
              Map.of("deadlineMs", rowDeadline.toMillis(), "rawAdapterUsageEqual", true),
              outcome.adapterUsage().isEmpty() ? zeroUsage(config) : usageObjects(outcome.adapterUsage()));
          matrixRow.put("cost", Map.of("currency", "USD", "micros", observedCost));
          matrixRow.put("durationMs", Duration.ofNanos(System.nanoTime() - started).toMillis());
          rows.add(matrixRow);
          veto |= !"pass".equals(rowResult);
        } catch (TimeoutException e) {
          future.cancel(true);
          join(worker, rowDeadline);
          rows.add(row(config, id, "blocked", Map.of("status", "timeout"),
              Map.of("deadlineMs", rowDeadline.toMillis()), zeroUsage(config)));
          veto = true;
        } catch (InterruptedException e) {
          future.cancel(true);
          join(worker, rowDeadline);
          Thread.currentThread().interrupt();
          throw new IllegalStateException("qualification interrupted", e);
        } catch (ExecutionException e) {
          rows.add(row(config, id, "blocked", Map.of("status", "error"),
              Map.of("reason", "transport failed"), zeroUsage(config)));
          veto = true;
        } catch (IllegalArgumentException | ArithmeticException e) {
          rows.add(row(config, id, "fail", Map.of("status", "invalid-evidence"),
              Map.of("reason", sanitizedReason(e)), zeroUsage(config)));
          veto = true;
        } finally {
          QualificationExchangeCapture.clear(requestId);
        }
      }
    }
    boolean failed = rows.stream().anyMatch(row -> "fail".equals(row.get("result")));
    return report(rows, failed ? "fail" : veto ? "blocked" : "pass");
  }

  private static void join(Thread worker, Duration bound) {
    try {
      worker.join(Math.max(1, bound.toMillis()));
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("interrupted while joining cancelled request", e);
    }
    if (worker.isAlive()) throw new IllegalStateException("cancelled request did not terminate within oracle bound");
  }

  public static Map<String, Object> blockedReport(RealProviderQualificationConfig config, String reason) {
    List<Map<String, Object>> rows = new ArrayList<>();
    for (String id : ROW_IDS) rows.add(row(config, id, "blocked", Map.of("status", "blocked"), Map.of("reason", reason), zeroUsage(config)));
    return report(rows, "blocked");
  }

  public static Map<String, Object> report(List<Map<String, Object>> rows, String result) {
    Map<String, Object> report = new LinkedHashMap<>();
    report.put("track", "production");
    report.put("generatedAt", Instant.now().toString());
    report.put("result", result);
    report.put("rows", rows);
    return report;
  }

  public static Map<String, Object> row(RealProviderQualificationConfig config, String id, String result,
      Map<String, Object> observed, Map<String, Object> oracle, Map<String, Object> usage) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", config.providerId() + "-" + id);
    row.put("required", true);
    row.put("track", "production");
    row.put("environment", Map.of("endpointHost", config.endpoint().getHost(), "model", config.model()));
    row.put("protocolVersion", config.protocolVersion());
    row.put("capabilities", List.of(id));
    row.put("requestHash", RealProviderQualificationRunner.sha256(
        (config.providerId() + ":" + config.model() + ":" + id).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    row.put("observed", observed);
    row.put("oracle", oracleDefinition(id, oracle));
    row.put("usage", usage);
    row.put("cost", Map.of("currency", "USD", "micros", 0L));
    row.put("durationMs", 0L);
    row.put("result", result);
    return row;
  }

  public static void validateReport(Map<String, Object> report, String providerId) {
    validateStructure(report, providerId);
  }

  public static void validateReport(Map<String, Object> report, RealProviderQualificationConfig config) {
    validateStructure(report, config.providerId());
    long totalCost = 0;
    for (Object value : (List<?>) report.get("rows")) {
      Map<?, ?> row = (Map<?, ?>) value;
      Map<String, Long> usage = numericUsage(row.get("usage"));
      if ("pass".equals(row.get("result"))) {
        if (!(row.get("observed") instanceof Map<?, ?> observed)) {
          throw new IllegalArgumentException("pass row observed evidence is required");
        }
        Map<String, Long> rawUsage = numericUsage(observed.get("rawProviderUsage"));
        Map<String, Long> adapterUsage = numericUsage(observed.get("adapterUsage"));
        requireUsageEquality(rawUsage, adapterUsage);
        requireUsageEquality(adapterUsage, usage);
        String shortRowId = String.valueOf(row.get("id")).substring(config.providerId().length() + 1);
        if (!evaluateRow(shortRowId, stringObjectMap(observed), rawUsage, adapterUsage)) {
          throw new IllegalArgumentException("pass row does not satisfy row-specific oracle: " + shortRowId);
        }
      }
      long expectedCost = recomputeCost(config, usage);
      long actualCost = ((Number) ((Map<?, ?>) row.get("cost")).get("micros")).longValue();
      if (actualCost != expectedCost) throw new IllegalArgumentException("row cost does not match configured usage pricing");
      totalCost = Math.addExact(totalCost, actualCost);
    }
    if (totalCost > config.costBudgetUsdMicros()) throw new IllegalArgumentException("report total cost exceeds configured budget");
  }

  private static void validateStructure(Map<String, Object> report, String providerId) {
    if (report == null || !"production".equals(report.get("track"))) throw new IllegalArgumentException("report track must be production");
    if (!(report.get("generatedAt") instanceof String generatedAt)) throw new IllegalArgumentException("generatedAt is required");
    try { Instant.parse(generatedAt); } catch (Exception e) { throw new IllegalArgumentException("generatedAt must be an ISO instant", e); }
    if (!(report.get("rows") instanceof List<?> rawRows)) throw new IllegalArgumentException("report rows are required");
    List<String> expected = ROW_IDS.stream().map(id -> providerId + "-" + id).toList();
    List<String> actual = rawRows.stream().map(value -> value instanceof Map<?, ?> map ? String.valueOf(map.get("id")) : "").toList();
    if (!actual.equals(expected) || new LinkedHashSet<>(actual).size() != expected.size()) {
      throw new IllegalArgumentException("report must contain the exact ordered rows");
    }
    boolean veto = false;
    long totalCost = 0;
    for (Object value : rawRows) {
      if (!(value instanceof Map<?, ?> row)) throw new IllegalArgumentException("each row must be an object");
      if (!row.keySet().containsAll(REQUIRED_ROW_KEYS)) throw new IllegalArgumentException("row is missing required evidence fields");
      if (!Boolean.TRUE.equals(row.get("required")) || !"production".equals(row.get("track"))) {
        throw new IllegalArgumentException("all fixed rows must be required production rows");
      }
      String rowResult = String.valueOf(row.get("result"));
      if (!ROW_RESULTS.contains(rowResult)) throw new IllegalArgumentException("invalid row result: " + rowResult);
      if ("pass".equals(rowResult)) {
        if (!(row.get("observed") instanceof Map<?, ?> observed)) {
          throw new IllegalArgumentException("pass row observed evidence is required");
        }
        Map<String, Long> publishedUsage = numericUsage(row.get("usage"));
        Map<String, Long> rawUsage = numericUsage(observed.get("rawProviderUsage"));
        Map<String, Long> adapterUsage = numericUsage(observed.get("adapterUsage"));
        requireUsageEquality(rawUsage, adapterUsage);
        requireUsageEquality(adapterUsage, publishedUsage);
        String shortRowId = String.valueOf(row.get("id")).substring(providerId.length() + 1);
        if (!evaluateRow(shortRowId, stringObjectMap(observed), rawUsage, adapterUsage)) {
          throw new IllegalArgumentException("pass row does not satisfy row-specific oracle: " + shortRowId);
        }
      }
      veto |= !"pass".equals(rowResult);
      if (!(row.get("requestHash") instanceof String hash) || !hash.matches("^[a-f0-9]{64}$")) {
        throw new IllegalArgumentException("requestHash must be SHA-256 hex");
      }
      if (!(row.get("durationMs") instanceof Number duration) || duration.longValue() < 0) throw new IllegalArgumentException("durationMs must be nonnegative");
      if (!(row.get("cost") instanceof Map<?, ?> cost) || !"USD".equals(cost.get("currency")) || !(cost.get("micros") instanceof Number micros) || micros.longValue() < 0) {
        throw new IllegalArgumentException("row cost must be nonnegative USD micros");
      }
      totalCost = Math.addExact(totalCost, ((Number) ((Map<?, ?>) row.get("cost")).get("micros")).longValue());
    }
    String result = String.valueOf(report.get("result"));
    if ("pass".equals(result) && veto) throw new IllegalArgumentException("a blocked or failed required row vetoes overall pass");
    if (!Set.of("pass", "fail", "blocked").contains(result)) throw new IllegalArgumentException("invalid report result: " + result);
  }

  public static long costMicros(long tokens, long microsPerMillionTokens) {
    if (tokens < 0 || microsPerMillionTokens < 0) throw new IllegalArgumentException("tokens and pricing must be nonnegative");
    BigInteger numerator = BigInteger.valueOf(tokens).multiply(BigInteger.valueOf(microsPerMillionTokens));
    BigInteger[] parts = numerator.divideAndRemainder(BigInteger.valueOf(1_000_000));
    BigInteger result = parts[0].add(parts[1].signum() == 0 ? BigInteger.ZERO : BigInteger.ONE);
    return result.compareTo(BigInteger.valueOf(Long.MAX_VALUE)) > 0 ? Long.MAX_VALUE : result.longValueExact();
  }

  public static void requireUsageEquality(Map<String, ?> rawProvider, Map<String, ?> adapter) {
    if (!rawProvider.equals(adapter)) throw new IllegalArgumentException("raw provider and adapter usage mismatch");
  }

  public static long recomputeCost(RealProviderQualificationConfig config, Map<String, Long> usage) {
    long total = 0;
    for (Map.Entry<String, Long> entry : usage.entrySet()) {
      if (entry.getValue() == null || entry.getValue() < 0) throw new IllegalArgumentException("usage must be nonnegative");
      total = Math.addExact(total, costMicros(entry.getValue(), config.priceForUsageClass(entry.getKey())));
    }
    return total;
  }

  public static String redactionCanaryHash() {
    return RealProviderQualificationRunner.sha256(REDACTION_CANARY.getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }

  static String redactionCanary() { return REDACTION_CANARY; }

  private static boolean evaluateRow(String rowId, Map<String, Object> observed,
      Map<String, Long> rawUsage, Map<String, Long> adapterUsage) {
    return switch (rowId) {
      case "sync" -> Boolean.TRUE.equals(observed.get("responseReceived"))
          && Boolean.TRUE.equals(observed.get("contentPresent"))
          && List.of("request", "response").equals(observed.get("observedSequence"));
      case "stream" -> Boolean.TRUE.equals(observed.get("adapterCapturePresent"))
          && java.util.Objects.equals(observed.get("expectedStreamParser"), observed.get("streamParser"))
          && observed.get("expectedStreamParser") != null
          && java.util.Objects.equals(observed.get("captureRequestId"), observed.get("parserRequestId"))
          && Boolean.TRUE.equals(observed.get("streamMergeComplete"))
          && observed.get("streamDeltaCount") instanceof Number count && count.longValue() > 0
          && List.of("stream-start", "delta", "stream-end").equals(observed.get("parserStreamEvents"));
      case "usage" -> Boolean.TRUE.equals(observed.get("usageObserved"))
          && !rawUsage.isEmpty() && rawUsage.equals(adapterUsage);
      case "cost" -> Boolean.TRUE.equals(observed.get("costObserved"))
          && !adapterUsage.isEmpty();
      case "redaction" -> redactionCanaryHash().equals(observed.get("canaryHash"))
          && Boolean.TRUE.equals(observed.get("negativeScan"))
          && Boolean.TRUE.equals(observed.get("writerCloseout"))
          && observed.get("scanSurfaces") instanceof List<?> surfaces
          && surfaces.containsAll(List.of("response", "capture", "stdout", "stderr", "report"));
      default -> false;
    };
  }

  private static Map<String, Object> oracleDefinition(String rowId, Map<String, Object> details) {
    Map<String, Object> oracle = new LinkedHashMap<>();
    oracle.put("rowId", rowId);
    oracle.put("requiredEvidence", switch (rowId) {
      case "sync" -> List.of("responseReceived", "contentPresent", "observedSequence=request,response");
      case "stream" -> List.of("adapterCapturePresent", "SSE parser events=stream-start,delta,stream-end",
          "streamDeltaCount>0", "streamMergeComplete");
      case "usage" -> List.of("usageObserved", "rawProviderUsage=adapterUsage", "usagePresent");
      case "cost" -> List.of("costObserved", "configuredPricingRecomputed", "withinBudget");
      case "redaction" -> List.of("fixed canary hash", "writer closeout negativeScan", "all actual output surfaces");
      case "single-tool-call" -> List.of("one structured tool call", "tool name", "arguments oracle");
      case "multi-step-tool-call" -> List.of("two provider calls", "tool result continuation", "final response");
      case "structured-arguments" -> List.of("parsed JSON arguments", "schema equality");
      case "reasoning" -> List.of("provider reasoning capability", "reasoning block evidence");
      case "503-retry" -> List.of("authorized provider-backed 503", "retry sequence");
      case "timeout" -> List.of("shared deadline", "no late success", "request cleanup");
      case "cancellation" -> List.of("cancel acknowledged", "worker joined", "request cleanup");
      case "terminal-error" -> List.of("provider terminal error", "no fallback", "sanitized error");
      default -> throw new IllegalArgumentException("unsupported row: " + rowId);
    });
    if (details != null) oracle.putAll(details);
    return Map.copyOf(oracle);
  }

  private static Map<String, Object> stringObjectMap(Map<?, ?> map) {
    Map<String, Object> result = new LinkedHashMap<>();
    map.forEach((key, value) -> result.put(String.valueOf(key), value));
    return result;
  }

  private static Map<String, Object> usageObjects(Map<String, Long> usage) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.putAll(usage);
    return Map.copyOf(result);
  }

  private static Map<String, Long> numericUsage(Object value) {
    if (!(value instanceof Map<?, ?> map)) throw new IllegalArgumentException("row usage must be an object");
    Map<String, Long> result = new LinkedHashMap<>();
    map.forEach((key, counter) -> {
      if (!(counter instanceof Number number) || number.longValue() < 0) throw new IllegalArgumentException("usage must contain nonnegative numbers");
      result.put(String.valueOf(key), number.longValue());
    });
    return Map.copyOf(result);
  }

  private static String sanitizedReason(Exception error) {
    return String.valueOf(QualificationRedactor.redact(error.getMessage() == null ? "invalid evidence" : error.getMessage()));
  }

  private static Map<String, Object> zeroUsage(RealProviderQualificationConfig config) {
    Map<String, Object> counters = new LinkedHashMap<>();
    counters.put("promptTokens", 0L);
    counters.put("completionTokens", 0L);
    if (config.provider() == RealProviderQualificationConfig.ProviderKind.ANTHROPIC) {
      counters.put("cacheReadInputTokens", 0L);
      counters.put("cacheCreationInputTokens", 0L);
    }
    return Map.copyOf(counters);
  }
}
