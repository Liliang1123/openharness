package org.openharness.backend.qualification;

import java.io.PrintStream;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.openharness.backend.model.Contracts.AgentMessage;
import org.openharness.backend.model.Contracts.ModelChatRequest;
import org.openharness.backend.model.Contracts.ModelChatResponse;
import org.openharness.backend.model.Contracts.Usage;
import org.openharness.backend.service.provider.AnthropicAdapter;
import org.openharness.backend.service.provider.OpenAiCompatibleAdapter;
import org.openharness.backend.service.provider.ProviderAdapter;
import org.openharness.backend.service.provider.ProviderConfig;

public final class RealProviderQualificationRunner {
  private static final ProductionExecution PRODUCTION_EXECUTION = new ProductionExecution();
  private static final class ProductionExecution { private ProductionExecution() {} }
  private record ProductionCloseoutSurface(String requestId, String response, String capture) {}

  private static final class ProductionTransport implements RealProviderQualificationMatrix.RowTransport {
    private final RealProviderQualificationConfig config;
    private final ProviderAdapter adapter;
    private final ProviderConfig providerConfig;
    private final AtomicReference<ProductionCloseoutSurface> closeout = new AtomicReference<>();

    private ProductionTransport(RealProviderQualificationConfig config) {
      this.config = config;
      this.adapter = config.provider() == RealProviderQualificationConfig.ProviderKind.OPENAI_COMPATIBLE
          ? new OpenAiCompatibleAdapter() : new AnthropicAdapter();
      this.providerConfig = new ProviderConfig(config.providerId(), config.providerId(),
          config.endpoint().toString(), config.credential(), List.of(config.model()), Map.of());
    }

    @Override
    public RealProviderQualificationMatrix.RowOutcome dispatch(String rowId, String requestId,
        long deadlineNanos) throws Exception {
      return dispatchProviderRow(config, adapter, providerConfig, closeout, rowId, requestId, deadlineNanos);
    }

    private ProductionCloseoutSurface closeoutSurface() { return closeout.get(); }
  }
  private RealProviderQualificationRunner() {}

  @FunctionalInterface
  public interface TransportFactory {
    RealProviderQualificationMatrix.RowTransport create(RealProviderQualificationConfig config);
  }

  public static void main(String[] args) {
    int exit = runInternal(args, System.getenv(), null, System.out, System.err, PRODUCTION_EXECUTION);
    if (exit != 0) System.exit(exit);
  }

  public static int run(String[] args, Map<String, String> environment, TransportFactory transportFactory,
      PrintStream stdout, PrintStream stderr) {
    return runInternal(args, environment, transportFactory, stdout, stderr, null);
  }

  private static int runInternal(String[] args, Map<String, String> environment, TransportFactory transportFactory,
      PrintStream stdout, PrintStream stderr, ProductionExecution execution) {
    try {
      RealProviderQualificationConfig config = RealProviderQualificationConfig.parse(args, environment);
      if (!config.hasCredential()) {
        Map<String, Object> report = RealProviderQualificationMatrix.blockedReport(config, "provider credential unavailable");
        QualificationReportWriter.WrittenReport written = QualificationReportWriter.write(config.reportPath(), report, config);
        stdout.println("provider=" + config.providerId() + " result=blocked rows=13 report=" + config.reportPath()
            + " sha256=" + written.sha256());
        return 3;
      }
      ProductionTransport productionTransport = execution == PRODUCTION_EXECUTION ? new ProductionTransport(config) : null;
      RealProviderQualificationMatrix.RowTransport transport = productionTransport != null
          ? productionTransport : transportFactory.create(config);
      Map<String, Object> report = execution == PRODUCTION_EXECUTION
          ? RealProviderQualificationMatrix.executeProduction(config, transport, Duration.ofSeconds(65))
          : RealProviderQualificationMatrix.execute(config, transport, Duration.ofSeconds(65));
      String stdoutPrefix = "provider=" + config.providerId() + " result=";
      String stdoutSuffix = " rows=13 report=" + config.reportPath();
      ProductionCloseoutSurface surface = productionTransport == null ? null : productionTransport.closeoutSurface();
      QualificationReportWriter.CloseoutEvidence closeout = surface == null ? null
          : QualificationReportWriter.CloseoutEvidence.production(surface.response(), surface.capture(),
              stdoutPrefix, stdoutSuffix, "");
      QualificationReportWriter.WrittenReport written = closeout == null
          ? QualificationReportWriter.write(config.reportPath(), report, config)
          : QualificationReportWriter.write(config.reportPath(), report, config, closeout);
      stdout.println(stdoutPrefix + written.result() + stdoutSuffix + " sha256=" + written.sha256());
      return "pass".equals(written.result()) ? 0 : 3;
    } catch (Exception e) {
      stderr.println("qualification preflight failed: " + sanitizedMessage(e));
      return 2;
    }
  }

  private static RealProviderQualificationMatrix.RowOutcome dispatchProviderRow(
      RealProviderQualificationConfig config, ProviderAdapter adapter, ProviderConfig providerConfig,
      AtomicReference<ProductionCloseoutSurface> closeout, String rowId, String requestId,
      long deadlineNanos) throws Exception {
      if (java.util.Set.of("single-tool-call", "multi-step-tool-call", "structured-arguments", "reasoning",
          "503-retry", "timeout", "cancellation", "terminal-error").contains(rowId)) {
        return new RealProviderQualificationMatrix.RowOutcome(
            Map.of("status", "blocked", "reason", "required provider-backed qualification fixture is not authorized"),
            Map.of(), Map.of(), "blocked");
      }
      long remainingMs = Math.max(1, Duration.ofNanos(Math.max(1, deadlineNanos - System.nanoTime())).toMillis());
      ModelChatRequest request = new ModelChatRequest(requestId, "qualification-" + rowId, "qualification-user",
          "qualification-tenant", config.model(), "stream".equals(rowId),
          List.of(new AgentMessage("user", fixturePrompt(rowId), null, null, null,
              null, null, null, null, null, null, null, null)), List.of(),
          Map.of("timeoutMs", remainingMs, "maxOutputTokens", config.maxOutputTokens(), "qualification", true));
      ModelChatResponse response = adapter.chat(request, providerConfig);
      Map<String, Long> adapterUsage = usage(response.usage(), config);
      Map<String, Object> capture = QualificationExchangeCapture.consume(requestId);
      Map<String, Long> rawUsage = capturedUsage(capture);
      Map<String, Object> observed = new java.util.LinkedHashMap<>(capture == null ? Map.of("status", "response") : capture);
      boolean contentPresent = response.message() != null && response.message().content() != null
          && !String.valueOf(response.message().content()).isBlank();
      switch (rowId) {
        case "sync" -> {
          observed.put("responseReceived", true);
          observed.put("contentPresent", contentPresent);
          observed.put("observedSequence", List.of("request", "response"));
        }
        case "stream" -> observed.put("contentPresent", contentPresent);
        case "usage" -> observed.put("usageObserved", !rawUsage.isEmpty());
        case "cost" -> observed.put("costObserved", !adapterUsage.isEmpty());
        case "redaction" -> {
          ProductionCloseoutSurface surface = new ProductionCloseoutSurface(requestId,
              String.valueOf(response.message()), String.valueOf(capture));
          if (!closeout.compareAndSet(null, surface)) {
            throw new IllegalStateException("duplicate production closeout surface");
          }
        }
        default -> { }
      }
      return RealProviderQualificationMatrix.RowOutcome.pass(observed, rawUsage, adapterUsage);
  }

  private static String fixturePrompt(String rowId) {
    if ("redaction".equals(rowId)) {
      return "Do not repeat this synthetic qualification marker: " + RealProviderQualificationMatrix.redactionCanary();
    }
    return "OpenHarness qualification fixture for " + rowId + ". Return a deterministic concise response.";
  }

  private static Map<String, Long> usage(Usage usage, RealProviderQualificationConfig config) {
    java.util.LinkedHashMap<String, Long> result = new java.util.LinkedHashMap<>();
    result.put("promptTokens", (long) usage.promptTokens());
    result.put("completionTokens", (long) usage.completionTokens());
    if (config.provider() == RealProviderQualificationConfig.ProviderKind.ANTHROPIC) {
      result.put("cacheReadInputTokens", usage.cacheReadTokens() == null ? 0L : usage.cacheReadTokens().longValue());
      result.put("cacheCreationInputTokens", usage.cacheWriteTokens() == null ? 0L : usage.cacheWriteTokens().longValue());
    }
    return Map.copyOf(result);
  }

  private static Map<String, Long> capturedUsage(Map<String, Object> capture) {
    if (capture == null || !(capture.get("rawProviderUsage") instanceof Map<?, ?> values)) {
      throw new IllegalArgumentException("adapter did not provide raw usage evidence");
    }
    java.util.LinkedHashMap<String, Long> result = new java.util.LinkedHashMap<>();
    values.forEach((key, value) -> {
      if (!(value instanceof Number number)) throw new IllegalArgumentException("raw usage evidence must be numeric");
      result.put(String.valueOf(key), number.longValue());
    });
    return Map.copyOf(result);
  }

  private static String sanitizedMessage(Exception error) {
    Object redacted = QualificationRedactor.redact(error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
    return String.valueOf(redacted).replace(RealProviderQualificationMatrix.redactionCanary(), "[REDACTED]");
  }

  static String sha256(byte[] bytes) {
    try {
      byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
      return java.util.HexFormat.of().formatHex(hash);
    } catch (Exception e) { throw new IllegalStateException("SHA-256 unavailable", e); }
  }
}
