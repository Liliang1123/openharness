package org.openharness.backend.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.openharness.backend.service.PolicyService;
import org.openharness.backend.service.PolicyService.DecisionItem;
import org.openharness.backend.service.PolicyService.PolicyContext;
import org.openharness.backend.service.PolicyService.SkillPolicy;
import org.openharness.backend.service.PolicyService.ToolCallInput;
import org.openharness.backend.service.TraceService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/policies/tool-review")
public class PolicyController {

  private final PolicyService policyService;
  private final TraceService traceService;

  public PolicyController(PolicyService policyService, TraceService traceService) {
    this.policyService = policyService;
    this.traceService = traceService;
  }

  public record EvaluateRequest(
      String requestId, String conversationId, String userId, String tenantId, String traceId,
      List<ToolCallDto> toolCalls, ContextDto context) {}

  public record ToolCallDto(String id, String name, String argumentsRaw, String source) {}

  public record ContextDto(
      String orgId, String agentId, List<SkillPolicyDto> loadedSkills,
      Boolean callerRequireApproval, String catalogVersion, String catalogHash,
      Boolean untrustedToolOutputSinceLastUser,
      Map<String, String> toolPermissions) {}

  public record SkillPolicyDto(String name, List<String> requiresApprovalFor) {}

  public record EvaluateResponse(String requestId, String conversationId, List<DecisionItem> decisions) {}

  @PostMapping("/evaluate")
  EvaluateResponse evaluate(@RequestBody EvaluateRequest request, HttpServletRequest servletRequest) {
    String tenantId = servletRequest.getHeader("X-Tenant-Id");
    String userId = servletRequest.getHeader("X-User-Id");

    traceService.backendEvent(
        servletRequest.getHeader("X-Trace-Id"),
        servletRequest.getHeader("X-Request-Id"),
        request.conversationId(),
        userId, tenantId,
        "POLICY_EVALUATE_START", "policy evaluate",
        Map.of("toolCount", request.toolCalls().size()));

    List<ToolCallInput> toolCalls = request.toolCalls().stream()
        .map(tc -> new ToolCallInput(tc.id(), tc.name(), tc.argumentsRaw(), tc.source()))
        .toList();

    PolicyContext context = request.context() != null
        ? new PolicyContext(
            request.context().orgId(), request.context().agentId(),
            request.context().loadedSkills() != null
                ? request.context().loadedSkills().stream()
                    .map(s -> new SkillPolicy(s.name(), s.requiresApprovalFor()))
                    .toList()
                : null,
            request.context().callerRequireApproval(),
            request.context().catalogVersion(), request.context().catalogHash(),
            null,
            request.context().untrustedToolOutputSinceLastUser(),
            request.context().toolPermissions())
        : null;

    List<DecisionItem> decisions = policyService.evaluate(
        tenantId, userId, request.conversationId(), toolCalls, context);

    traceService.backendEvent(
        servletRequest.getHeader("X-Trace-Id"),
        servletRequest.getHeader("X-Request-Id"),
        request.conversationId(),
        userId, tenantId,
        "POLICY_EVALUATE_END", "policy evaluate done",
        Map.of("decisions", decisions.stream().map(DecisionItem::decision).toList()));

    return new EvaluateResponse(request.requestId(), request.conversationId(), decisions);
  }
}
