package org.openharness.backend.qualification;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

public final class QualificationReportWriter {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private QualificationReportWriter() {}

  @FunctionalInterface
  interface PublishObserver { void tempReady(Path temp) throws IOException; }

  public record WrittenReport(byte[] bytes, String sha256, String result) {
    public WrittenReport {
      bytes = bytes.clone();
    }

    @Override public byte[] bytes() { return bytes.clone(); }
  }

  static final class CloseoutEvidence {
    private final String response;
    private final String capture;
    private final String stdoutPrefix;
    private final String stdoutSuffix;
    private final String stderr;

    private CloseoutEvidence(String response, String capture, String stdoutPrefix, String stdoutSuffix, String stderr) {
      this.response = java.util.Objects.requireNonNull(response);
      this.capture = java.util.Objects.requireNonNull(capture);
      this.stdoutPrefix = java.util.Objects.requireNonNull(stdoutPrefix);
      this.stdoutSuffix = java.util.Objects.requireNonNull(stdoutSuffix);
      this.stderr = java.util.Objects.requireNonNull(stderr);
    }

    static CloseoutEvidence production(String response, String capture, String stdoutPrefix,
        String stdoutSuffix, String stderr) {
      return new CloseoutEvidence(response, capture, stdoutPrefix, stdoutSuffix, stderr);
    }
  }

  public static WrittenReport write(Path requestedTarget, Map<String, Object> report,
      RealProviderQualificationConfig config) throws IOException {
    return writeInternal(requestedTarget, report, config, null, temp -> {});
  }

  static WrittenReport write(Path requestedTarget, Map<String, Object> report,
      RealProviderQualificationConfig config, CloseoutEvidence closeout) throws IOException {
    return writeInternal(requestedTarget, report, config, closeout, temp -> {});
  }

  static WrittenReport write(Path requestedTarget, Map<String, Object> report,
      RealProviderQualificationConfig config, PublishObserver observer) throws IOException {
    return writeInternal(requestedTarget, report, config, null, observer);
  }

  private static WrittenReport writeInternal(Path requestedTarget, Map<String, Object> report,
      RealProviderQualificationConfig config, CloseoutEvidence closeout, PublishObserver observer) throws IOException {
    if (requestedTarget == null || report == null) throw new IllegalArgumentException("target and report are required");
    Path target = requestedTarget.toAbsolutePath().normalize();
    Path parent = target.getParent();
    if (parent == null) throw new IllegalArgumentException("report path must have a parent directory");
    Files.createDirectories(parent);
    if (Files.exists(target)) throw new FileAlreadyExistsException(target.toString());

    @SuppressWarnings("unchecked")
    Map<String, Object> redacted = (Map<String, Object>) QualificationRedactor.redact(report);
    closeoutRedaction(redacted, closeout);
    String provider = providerId(redacted);
    if (!provider.equals(config.providerId())) throw new IllegalArgumentException("report provider does not match config");
    RealProviderQualificationMatrix.validateReport(redacted, config);
    byte[] bytes = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsBytes(redacted);
    rejectSecretBytes(bytes);

    Path temp = parent.resolve("." + target.getFileName() + ".tmp-" + UUID.randomUUID());
    try {
      try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        while (buffer.hasRemaining()) channel.write(buffer);
        channel.force(true);
      }
      observer.tempReady(temp);
      // Same-directory hard-link creation is an atomic create-if-absent publish:
      // it cannot replace a target created by a cooperating or non-cooperating process.
      Files.createLink(target, temp);
      return new WrittenReport(bytes, sha256(bytes), String.valueOf(redacted.get("result")));
    } finally {
      Files.deleteIfExists(temp);
    }
  }

  private static String providerId(Map<String, Object> report) {
    Object rowsValue = report.get("rows");
    if (!(rowsValue instanceof java.util.List<?> rows) || rows.isEmpty() || !(rows.get(0) instanceof Map<?, ?> row)) {
      throw new IllegalArgumentException("report rows are required");
    }
    String id = String.valueOf(row.get("id"));
    for (String provider : java.util.List.of("openai-compatible", "anthropic")) {
      if (id.startsWith(provider + "-")) return provider;
    }
    throw new IllegalArgumentException("unsupported provider row id");
  }

  private static void rejectSecretBytes(byte[] bytes) {
    String text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
    String lower = text.toLowerCase(java.util.Locale.ROOT);
    if (text.matches("(?is).*(?:Bearer\\s+\\S+|sk-[a-z0-9_-]+).*")
        || lower.contains("qualification-canary")
        || lower.contains(RealProviderQualificationMatrix.redactionCanary().toLowerCase(java.util.Locale.ROOT))) {
      throw new IllegalArgumentException("report contains canary or secret-bearing content");
    }
  }

  @SuppressWarnings("unchecked")
  private static void closeoutRedaction(Map<String, Object> report, CloseoutEvidence closeout) {
    Object rowsValue = report.get("rows");
    if (!(rowsValue instanceof java.util.List<?> rows) || rows.size() != RealProviderQualificationMatrix.ROW_IDS.size()) return;
    Map<String, Object> redactionRow = (Map<String, Object>) rows.get(12);
    if (!(redactionRow.get("observed") instanceof Map<?, ?> rawObserved)) return;
    Map<String, Object> observed = new java.util.LinkedHashMap<>();
    rawObserved.forEach((key, value) -> observed.put(String.valueOf(key), value));
    observed.remove("negativeScan");
    observed.remove("scanSurfaces");
    observed.remove("writerCloseout");
    observed.putIfAbsent("rawProviderUsage", redactionRow.get("usage"));
    observed.putIfAbsent("adapterUsage", redactionRow.get("usage"));
    boolean complete = closeout != null;
    if (complete) {
      scanSurface("response", closeout.response);
      scanSurface("capture", closeout.capture);
      scanSurface("stderr", closeout.stderr);
      observed.put("canaryHash", RealProviderQualificationMatrix.redactionCanaryHash());
      observed.put("negativeScan", true);
      observed.put("writerCloseout", true);
      observed.put("scanSurfaces", java.util.List.of("response", "capture", "stdout", "stderr", "report"));
      redactionRow.put("result", "pass");
    } else {
      observed.put("negativeScan", false);
      observed.put("writerCloseout", false);
      observed.put("scanSurfaces", java.util.List.of());
      redactionRow.put("result", "blocked");
    }
    redactionRow.put("observed", observed);
    boolean fail = rows.stream().anyMatch(value -> value instanceof Map<?, ?> row && "fail".equals(row.get("result")));
    boolean blocked = rows.stream().anyMatch(value -> value instanceof Map<?, ?> row && "blocked".equals(row.get("result")));
    report.put("result", fail ? "fail" : blocked ? "blocked" : "pass");
    if (complete) scanSurface("stdout", closeout.stdoutPrefix + report.get("result") + closeout.stdoutSuffix);
  }

  private static void scanSurface(String name, String surface) {
    if (surface.toLowerCase(java.util.Locale.ROOT)
        .contains(RealProviderQualificationMatrix.redactionCanary().toLowerCase(java.util.Locale.ROOT))) {
      throw new IllegalArgumentException("redaction canary found in " + name + " surface");
    }
  }

  private static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }
}
