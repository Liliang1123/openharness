package org.openharness.backend.qualification;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

public final class RealProviderQualificationConfig {
  public enum ProviderKind {
    OPENAI_COMPATIBLE("openai-compatible", "OPENAI_COMPATIBLE_API_KEY", "openai-chat-completions"),
    ANTHROPIC("anthropic", "ANTHROPIC_API_KEY", "2023-06-01");

    private final String cliValue;
    private final String credentialEnvironmentVariable;
    private final String protocolVersion;

    ProviderKind(String cliValue, String credentialEnvironmentVariable, String protocolVersion) {
      this.cliValue = cliValue;
      this.credentialEnvironmentVariable = credentialEnvironmentVariable;
      this.protocolVersion = protocolVersion;
    }

    static ProviderKind parse(String value) {
      for (ProviderKind kind : values()) if (kind.cliValue.equals(value)) return kind;
      throw new IllegalArgumentException("Unsupported provider: " + value);
    }
  }

  private final ProviderKind provider;
  private final URI endpoint;
  private final String model;
  private final Path reportPath;
  private final long costBudgetUsdMicros;
  private final long maxOutputTokens;
  private final long inputCostUsdMicrosPerMillionTokens;
  private final long outputCostUsdMicrosPerMillionTokens;
  private final Optional<Long> cacheReadCostUsdMicrosPerMillionTokens;
  private final Optional<Long> cacheWriteCostUsdMicrosPerMillionTokens;
  private final String credential;

  private RealProviderQualificationConfig(ProviderKind provider, URI endpoint, String model, Path reportPath,
      long costBudgetUsdMicros, long maxOutputTokens, long inputCost, long outputCost,
      Optional<Long> cacheReadCost, Optional<Long> cacheWriteCost, String credential) {
    this.provider = provider;
    this.endpoint = endpoint;
    this.model = model;
    this.reportPath = reportPath;
    this.costBudgetUsdMicros = costBudgetUsdMicros;
    this.maxOutputTokens = maxOutputTokens;
    this.inputCostUsdMicrosPerMillionTokens = inputCost;
    this.outputCostUsdMicrosPerMillionTokens = outputCost;
    this.cacheReadCostUsdMicrosPerMillionTokens = cacheReadCost;
    this.cacheWriteCostUsdMicrosPerMillionTokens = cacheWriteCost;
    this.credential = credential;
  }

  public static RealProviderQualificationConfig parse(String[] args, Map<String, String> environment) {
    if (args == null || environment == null) throw new IllegalArgumentException("arguments and environment are required");
    boolean real = false;
    Map<String, String> values = new LinkedHashMap<>();
    for (int i = 0; i < args.length; i++) {
      String flag = args[i];
      if ("--real".equals(flag)) {
        if (real) throw new IllegalArgumentException("--real may only be specified once");
        real = true;
        continue;
      }
      if (!allowedValueFlag(flag)) throw new IllegalArgumentException("Unsupported argument: " + flag);
      if (i + 1 >= args.length || args[i + 1].startsWith("--")) throw new IllegalArgumentException("Missing value for " + flag);
      if (values.putIfAbsent(flag, args[++i]) != null) throw new IllegalArgumentException("Duplicate argument: " + flag);
    }
    if (!real) throw new IllegalArgumentException("--real is required");

    ProviderKind provider = ProviderKind.parse(required(values, "--provider"));
    URI endpoint;
    try { endpoint = URI.create(required(values, "--endpoint")); }
    catch (RuntimeException e) { throw new IllegalArgumentException("endpoint must be a valid HTTPS URI", e); }
    if (!"https".equalsIgnoreCase(endpoint.getScheme()) || endpoint.getHost() == null) {
      throw new IllegalArgumentException("endpoint must use HTTPS and include a host");
    }
    if (endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null) {
      throw new IllegalArgumentException("endpoint must not contain userinfo, query, or fragment");
    }
    String model = required(values, "--model");
    Path reportPath = Path.of(required(values, "--report-path")).toAbsolutePath().normalize();
    if (Files.exists(reportPath)) throw new IllegalArgumentException("report path already exists: " + reportPath);

    long budget = positive(values, "--cost-budget-usd-micros");
    long maxOutput = positive(values, "--max-output-tokens");
    long inputCost = nonnegative(values, "--input-cost-usd-micros-per-million-tokens");
    long outputCost = nonnegative(values, "--output-cost-usd-micros-per-million-tokens");
    Optional<Long> cacheRead = optionalNonnegative(values, "--cache-read-cost-usd-micros-per-million-tokens");
    Optional<Long> cacheWrite = optionalNonnegative(values, "--cache-write-cost-usd-micros-per-million-tokens");
    if (provider == ProviderKind.ANTHROPIC && (cacheRead.isEmpty() || cacheWrite.isEmpty())) {
      throw new IllegalArgumentException("Anthropic cache pricing requires both cache read and cache write values");
    }
    String credential = environment.get(provider.credentialEnvironmentVariable);
    if (credential != null && credential.isBlank()) credential = null;
    return new RealProviderQualificationConfig(provider, endpoint, model, reportPath, budget, maxOutput,
        inputCost, outputCost, cacheRead, cacheWrite, credential);
  }

  private static boolean allowedValueFlag(String flag) {
    return switch (flag) {
      case "--provider", "--endpoint", "--model", "--report-path", "--cost-budget-usd-micros",
          "--max-output-tokens", "--input-cost-usd-micros-per-million-tokens",
          "--output-cost-usd-micros-per-million-tokens", "--cache-read-cost-usd-micros-per-million-tokens",
          "--cache-write-cost-usd-micros-per-million-tokens" -> true;
      default -> false;
    };
  }

  private static String required(Map<String, String> values, String flag) {
    String value = values.get(flag);
    if (value == null || value.isBlank()) throw new IllegalArgumentException(flag + " is required");
    return value;
  }
  private static long positive(Map<String, String> values, String flag) {
    long value = parseLong(required(values, flag), flag);
    if (value <= 0) throw new IllegalArgumentException(flag + " must be positive");
    return value;
  }
  private static long nonnegative(Map<String, String> values, String flag) {
    long value = parseLong(required(values, flag), flag);
    if (value < 0) throw new IllegalArgumentException(flag + " must be nonnegative");
    return value;
  }
  private static Optional<Long> optionalNonnegative(Map<String, String> values, String flag) {
    if (!values.containsKey(flag)) return Optional.empty();
    long value = parseLong(values.get(flag), flag);
    if (value < 0) throw new IllegalArgumentException(flag + " must be nonnegative");
    return Optional.of(value);
  }
  private static long parseLong(String value, String flag) {
    try { return Long.parseLong(value); }
    catch (NumberFormatException e) { throw new IllegalArgumentException(flag + " must be an integer", e); }
  }

  public ProviderKind provider() { return provider; }
  public URI endpoint() { return endpoint; }
  public String model() { return model; }
  public Path reportPath() { return reportPath; }
  public long costBudgetUsdMicros() { return costBudgetUsdMicros; }
  public long maxOutputTokens() { return maxOutputTokens; }
  public long inputCostUsdMicrosPerMillionTokens() { return inputCostUsdMicrosPerMillionTokens; }
  public long outputCostUsdMicrosPerMillionTokens() { return outputCostUsdMicrosPerMillionTokens; }
  public Optional<Long> cacheReadCostUsdMicrosPerMillionTokens() { return cacheReadCostUsdMicrosPerMillionTokens; }
  public Optional<Long> cacheWriteCostUsdMicrosPerMillionTokens() { return cacheWriteCostUsdMicrosPerMillionTokens; }
  public boolean hasCredential() { return credential != null; }
  String credential() { return credential; }
  public String protocolVersion() { return provider.protocolVersion; }
  public String providerId() { return provider.cliValue; }
  public long priceForUsageClass(String usageClass) {
    return switch (usageClass) {
      case "promptTokens" -> inputCostUsdMicrosPerMillionTokens;
      case "completionTokens" -> outputCostUsdMicrosPerMillionTokens;
      case "cacheReadInputTokens" -> cacheReadCostUsdMicrosPerMillionTokens.orElse(0L);
      case "cacheCreationInputTokens" -> cacheWriteCostUsdMicrosPerMillionTokens.orElse(0L);
      default -> throw new IllegalArgumentException("unsupported usage class: " + usageClass);
    };
  }

  public long worstCaseRowCostMicros(String rowId) {
    if (!RealProviderQualificationMatrix.ROW_IDS.contains(rowId)) throw new IllegalArgumentException("unsupported row: " + rowId);
    // Every fixed fixture is capped at 4 KiB UTF-8. Treat one byte as one token,
    // a deliberately conservative admission bound independent of tokenizer choice.
    long inputTokenUpperBound = 4096L;
    long total = RealProviderQualificationMatrix.costMicros(inputTokenUpperBound, inputCostUsdMicrosPerMillionTokens);
    total = Math.addExact(total, RealProviderQualificationMatrix.costMicros(maxOutputTokens, outputCostUsdMicrosPerMillionTokens));
    if (provider == ProviderKind.ANTHROPIC) {
      total = Math.addExact(total, RealProviderQualificationMatrix.costMicros(inputTokenUpperBound,
          cacheReadCostUsdMicrosPerMillionTokens.orElseThrow()));
      total = Math.addExact(total, RealProviderQualificationMatrix.costMicros(inputTokenUpperBound,
          cacheWriteCostUsdMicrosPerMillionTokens.orElseThrow()));
    }
    return total;
  }

  @Override public String toString() {
    return "RealProviderQualificationConfig[provider=" + provider + ", endpoint=" + endpoint + ", model=" + model
        + ", reportPath=" + reportPath + ", costBudgetUsdMicros=" + costBudgetUsdMicros
        + ", maxOutputTokens=" + maxOutputTokens + "]";
  }
}
