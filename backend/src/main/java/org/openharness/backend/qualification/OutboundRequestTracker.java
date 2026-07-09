package org.openharness.backend.qualification;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class OutboundRequestTracker {
  private static final InheritableThreadLocal<Capture> activeCapture = new InheritableThreadLocal<>();

  private OutboundRequestTracker() {}

  public static Capture beginCapture() {
    if (activeCapture.get() != null) {
      throw new IllegalStateException("Outbound request capture is already active on this thread");
    }
    Capture capture = new Capture();
    activeCapture.set(capture);
    return capture;
  }

  public static void setRequestHash(String requestId, String hash) {
    Capture capture = activeCapture.get();
    if (capture == null) {
      return;
    }
    capture.setRequestHash(requestId, hash);
  }

  public static String getRequestHash(String requestId) {
    Capture capture = activeCapture.get();
    return capture != null ? capture.getRequestHash(requestId) : null;
  }

  public static String consumeRequestHash(String requestId) {
    Capture capture = activeCapture.get();
    return capture != null ? capture.consumeRequestHash(requestId) : null;
  }

  public static int retainedRequestHashCount() {
    Capture capture = activeCapture.get();
    return capture != null ? capture.retainedRequestHashCount() : 0;
  }

  public static void clear(String requestId) {
    Capture capture = activeCapture.get();
    if (capture != null) {
      capture.clear(requestId);
    }
  }

  public static void clearAll() {
    Capture capture = activeCapture.get();
    if (capture != null) {
      capture.clearAll();
    }
  }

  public static final class Capture implements AutoCloseable {
    private final Map<String, String> requestHashes = new ConcurrentHashMap<>();

    private Capture() {}

    private void setRequestHash(String requestId, String hash) {
      if (requestId == null || requestId.isBlank()) {
        throw new IllegalArgumentException("requestId is required for outbound request hash capture");
      }
      if (hash == null || !hash.matches("^[a-fA-F0-9]{64}$")) {
        throw new IllegalArgumentException("request hash must be a SHA-256 hex string");
      }
      String previous = requestHashes.putIfAbsent(requestId, hash);
      if (previous != null && !previous.equals(hash)) {
        throw new IllegalStateException("requestId hash collision for " + requestId);
      }
    }

    private String getRequestHash(String requestId) {
      return requestId != null ? requestHashes.get(requestId) : null;
    }

    private String consumeRequestHash(String requestId) {
      return requestId != null ? requestHashes.remove(requestId) : null;
    }

    private int retainedRequestHashCount() {
      return requestHashes.size();
    }

    private void clear(String requestId) {
      if (requestId != null) {
        requestHashes.remove(requestId);
      }
    }

    private void clearAll() {
      requestHashes.clear();
    }

    @Override
    public void close() {
      requestHashes.clear();
      if (activeCapture.get() == this) {
        activeCapture.remove();
      }
    }
  }
}
