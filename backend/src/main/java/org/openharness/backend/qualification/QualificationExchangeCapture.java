package org.openharness.backend.qualification;

import java.util.LinkedHashMap;
import java.util.Map;

public final class QualificationExchangeCapture {
  private static final int MAX_ENTRIES = 64;
  private static final InheritableThreadLocal<Capture> ACTIVE = new InheritableThreadLocal<>();

  private QualificationExchangeCapture() {}

  public static Capture beginCapture() {
    if (ACTIVE.get() != null) throw new IllegalStateException("qualification exchange capture already active");
    Capture capture = new Capture();
    ACTIVE.set(capture);
    return capture;
  }

  public static void record(String requestId, Map<String, Object> sanitizedEvidence) {
    Capture capture = ACTIVE.get();
    if (capture != null) capture.record(requestId, sanitizedEvidence);
  }

  public static void merge(String requestId, Map<String, Object> sanitizedEvidence) {
    Capture capture = ACTIVE.get();
    if (capture != null) capture.merge(requestId, sanitizedEvidence);
  }

  public static Map<String, Object> consume(String requestId) {
    Capture capture = ACTIVE.get();
    return capture == null ? null : capture.consume(requestId);
  }

  public static void clear(String requestId) { Capture capture = ACTIVE.get(); if (capture != null) capture.clear(requestId); }
  public static int retainedCount() { Capture capture = ACTIVE.get(); return capture == null ? 0 : capture.size(); }

  public static final class Capture implements AutoCloseable {
    private final Map<String, Map<String, Object>> entries = new LinkedHashMap<>();
    private synchronized void record(String requestId, Map<String, Object> evidence) {
      if (requestId == null || requestId.isBlank()) throw new IllegalArgumentException("requestId is required");
      if (entries.size() >= MAX_ENTRIES && !entries.containsKey(requestId)) throw new IllegalStateException("capture capacity exceeded");
      @SuppressWarnings("unchecked")
      Map<String, Object> redacted = (Map<String, Object>) QualificationRedactor.redact(evidence == null ? Map.of() : evidence);
      if (entries.putIfAbsent(requestId, Map.copyOf(redacted)) != null) throw new IllegalStateException("duplicate capture requestId");
    }
    private synchronized Map<String, Object> consume(String requestId) { return entries.remove(requestId); }
    private synchronized void merge(String requestId, Map<String, Object> evidence) {
      if (requestId == null || requestId.isBlank()) throw new IllegalArgumentException("requestId is required");
      if (entries.size() >= MAX_ENTRIES && !entries.containsKey(requestId)) throw new IllegalStateException("capture capacity exceeded");
      @SuppressWarnings("unchecked")
      Map<String, Object> redacted = (Map<String, Object>) QualificationRedactor.redact(evidence == null ? Map.of() : evidence);
      Map<String, Object> merged = new LinkedHashMap<>(entries.getOrDefault(requestId, Map.of()));
      merged.putAll(redacted);
      entries.put(requestId, Map.copyOf(merged));
    }
    private synchronized void clear(String requestId) { entries.remove(requestId); }
    private synchronized int size() { return entries.size(); }
    @Override public synchronized void close() { entries.clear(); if (ACTIVE.get() == this) ACTIVE.remove(); }
  }
}
