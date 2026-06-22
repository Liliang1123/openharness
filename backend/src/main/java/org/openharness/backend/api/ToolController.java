package org.openharness.backend.api;

import jakarta.servlet.http.HttpServletRequest;
import org.openharness.backend.model.Contracts.CatalogResponse;
import org.openharness.backend.model.Contracts.ToolCallRequest;
import org.openharness.backend.model.Contracts.ToolCallResponse;
import org.openharness.backend.service.CatalogService;
import org.openharness.backend.service.TraceService;
import org.openharness.backend.service.ToolExecutionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tools")
public class ToolController {
  private final CatalogService catalogService;
  private final ToolExecutionService toolExecutionService;
  private final TraceService traceService;

  public ToolController(CatalogService catalogService, ToolExecutionService toolExecutionService, TraceService traceService) {
    this.catalogService = catalogService;
    this.toolExecutionService = toolExecutionService;
    this.traceService = traceService;
  }

  @GetMapping("/catalog")
  CatalogResponse catalog(HttpServletRequest request) {
    traceService.backendEvent(
        request.getHeader("X-Trace-Id"),
        request.getHeader("X-Request-Id"),
        "catalog",
        request.getHeader("X-User-Id"),
        request.getHeader("X-Tenant-Id"),
        "CATALOG_FETCH",
        "catalog fetch",
        java.util.Map.of());
    return catalogService.catalog();
  }

  @PostMapping("/execute")
  ToolCallResponse execute(@RequestBody ToolCallRequest request, HttpServletRequest servletRequest) {
    return toolExecutionService.execute(
        servletRequest.getHeader("X-Tenant-Id"),
        servletRequest.getHeader("X-Trace-Id"),
        servletRequest.getHeader("X-Request-Id"),
        servletRequest.getHeader("X-User-Id"),
        request);
  }
}
