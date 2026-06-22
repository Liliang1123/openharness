package org.openharness.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.openharness.backend.model.Contracts.TraceEvent;
import org.springframework.stereotype.Service;

@Service
public class TraceService {
  private final List<TraceEvent> events = new ArrayList<>();
  private final ObjectMapper objectMapper;

  public TraceService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public synchronized void record(TraceEvent event) {
    events.add(event);
    try {
      System.out.println(objectMapper.writeValueAsString(event));
    } catch (JsonProcessingException ignored) {
      System.out.println("{\"traceSerializeError\":true}");
    }
  }

  public synchronized List<TraceEvent> events() {
    return List.copyOf(events);
  }

  public void backendEvent(
      String traceId,
      String requestId,
      String conversationId,
      String userId,
      String tenantId,
      String eventType,
      String name,
      Map<String, Object> attributes) {
    record(
        new TraceEvent(
            traceId,
            java.util.UUID.randomUUID().toString(),
            null,
            requestId,
            conversationId,
            null,
            userId,
            tenantId,
            null,
            "backend",
            eventType,
            name,
            attributes,
            "ok",
            null,
            null,
            System.currentTimeMillis(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null));
  }
}
