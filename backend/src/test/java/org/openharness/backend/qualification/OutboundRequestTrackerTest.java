package org.openharness.backend.qualification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class OutboundRequestTrackerTest {
  @Test
  void ignoresProductionRequestsOutsideQualificationCaptureAndConsumesCapturedHashes() {
    OutboundRequestTracker.setRequestHash("prod-request", "a".repeat(64));

    assertThat(OutboundRequestTracker.consumeRequestHash("prod-request")).isNull();
    assertThat(OutboundRequestTracker.retainedRequestHashCount()).isZero();

    try (OutboundRequestTracker.Capture ignored = OutboundRequestTracker.beginCapture()) {
      OutboundRequestTracker.setRequestHash("qualified-request", "b".repeat(64));

      assertThat(OutboundRequestTracker.retainedRequestHashCount()).isEqualTo(1);
      assertThat(OutboundRequestTracker.consumeRequestHash("qualified-request")).isEqualTo("b".repeat(64));
      assertThat(OutboundRequestTracker.retainedRequestHashCount()).isZero();
    }

    assertThat(OutboundRequestTracker.retainedRequestHashCount()).isZero();
  }

  @Test
  void rejectsRequestIdReuseWithDifferentHashInsideCapture() {
    try (OutboundRequestTracker.Capture ignored = OutboundRequestTracker.beginCapture()) {
      OutboundRequestTracker.setRequestHash("same-request", "c".repeat(64));

      assertThatThrownBy(() -> OutboundRequestTracker.setRequestHash("same-request", "d".repeat(64)))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("requestId hash collision");
    }
  }
}
