package org.openharness.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.TraceEvent;

class TraceServiceTest {
  @Test
  void deduplicatesRuntimeTraceEventsByCommittedEventIdentity() {
    TraceService service = new TraceService(new ObjectMapper());

    service.record(traceEvent("event-1", "span-a"));
    service.record(traceEvent("event-1", "span-b"));
    service.record(traceEvent("event-2", "span-c"));

    assertEquals(2, service.events().size());
    assertEquals("span-a", service.events().get(0).spanId());
    assertEquals("span-c", service.events().get(1).spanId());
  }

  private TraceEvent traceEvent(String committedEventId, String spanId) {
    return new TraceEvent(
        "trace-1",
        spanId,
        null,
        "request-1",
        "conversation-1",
        null,
        "user-1",
        "tenant-1",
        null,
        "agent-runtime",
        "MODEL_CALL_END",
        "model call end",
        Map.of("committedEventId", committedEventId),
        "ok",
        null,
        null,
        1780000000000L,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }
}
