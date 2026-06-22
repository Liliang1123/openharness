package org.openharness.backend.api;

import org.openharness.backend.model.Contracts.TraceEvent;
import org.openharness.backend.service.TraceService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/trace")
public class TraceController {
  private final TraceService traceService;

  public TraceController(TraceService traceService) {
    this.traceService = traceService;
  }

  @PostMapping("/events")
  @ResponseStatus(HttpStatus.ACCEPTED)
  void event(@RequestBody TraceEvent event) {
    traceService.record(event);
  }
}
