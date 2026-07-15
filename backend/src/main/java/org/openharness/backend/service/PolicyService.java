package org.openharness.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class PolicyService {

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  // In-memory allow records: key = tenantId:toolCallId
  private final ConcurrentHashMap<String, AllowRecord> allowRecords = new ConcurrentHashMap<>();

  public record ToolCallInput(String id, String name, String argumentsRaw, String source) {}

  public record PolicyContext(
      String orgId, String agentId, List<SkillPolicy> loadedSkills,
      Boolean callerRequireApproval, String catalogVersion, String catalogHash,
      List<String> mcpAllowList,
      Boolean untrustedToolOutputSinceLastUser,
      Map<String, String> toolPermissions) {}

  public record SkillPolicy(String name, List<String> requiresApprovalFor) {}

  public record DecisionItem(
      String toolCallId, String decision, String source, String reason,
      String reviewerUserId, String approvalToken) {}

  public record AllowRecord(String tenantId, String userId, String conversationId, String toolCallId, long createdAt) {}

  private record McpBrokerTarget(String server, String tool) {}

  public List<DecisionItem> evaluate(
      String tenantId, String userId, String conversationId,
      List<ToolCallInput> toolCalls, PolicyContext context) {

    List<DecisionItem> decisions = new ArrayList<>();
    for (ToolCallInput tc : toolCalls) {
      DecisionItem decision = evaluateSingle(tenantId, userId, conversationId, tc, context);
      decisions.add(decision);
      if ("ALLOW".equals(decision.decision())) {
        String key = tenantId + ":" + tc.id();
        allowRecords.put(key, new AllowRecord(tenantId, userId, conversationId, tc.id(), System.currentTimeMillis()));
      }
    }
    return decisions;
  }

  public boolean hasAllowRecord(String tenantId, String toolCallId) {
    return allowRecords.containsKey(tenantId + ":" + toolCallId);
  }

  private DecisionItem evaluateSingle(
      String tenantId, String userId, String conversationId,
      ToolCallInput tc, PolicyContext context) {

    McpBrokerTarget brokerTarget = brokerTarget(tc);
    String policyToolName = brokerTarget != null ? brokerTarget.tool() : tc.name();

    // Deny rule: tool name starts with "blocked_"
    if (policyToolName.startsWith("blocked_")) {
      return new DecisionItem(tc.id(), "DENY", "ORG_POLICY",
          "Tool '" + policyToolName + "' is blocked by org policy.", null, null);
    }

    // Deny rule: tool name in skill's requiresApprovalFor → REQUIRE_APPROVAL
    if (context != null && context.loadedSkills() != null) {
      for (SkillPolicy skill : context.loadedSkills()) {
        if (skill.requiresApprovalFor() != null && skill.requiresApprovalFor().contains(policyToolName)) {
          String token = "approval-" + tc.id() + "-" + System.currentTimeMillis();
          return new DecisionItem(tc.id(), "REQUIRE_APPROVAL", "SKILL_MANIFEST",
              "Skill '" + skill.name() + "' requires approval for '" + policyToolName + "'.",
              null, token);
        }
      }
    }

    // MCP default rule: source starts with "mcp:" → REQUIRE_APPROVAL unless in mcpAllowList
    if (tc.source() != null && tc.source().startsWith("mcp:")) {
      List<String> allowList = (context != null) ? context.mcpAllowList() : null;
      boolean brokerCall = "mcp:broker".equals(tc.source()) && "mcp_call".equals(tc.name());
      boolean allowed = allowList != null && (brokerCall
          ? brokerTarget != null && (
              allowList.contains(brokerTarget.tool())
                  || allowList.contains("mcp:" + brokerTarget.server()))
          : allowList.contains(tc.name()) || allowList.contains(tc.source()));
      if (!allowed) {
        String token = "mcp-approval-" + tc.id() + "-" + System.currentTimeMillis();
        return new DecisionItem(tc.id(), "REQUIRE_APPROVAL", "MCP_DEFAULT",
            "MCP tool '" + policyToolName + "' requires approval by default.", null, token);
      }
    }

    if (context != null && Boolean.TRUE.equals(context.untrustedToolOutputSinceLastUser())) {
      String permission = context.toolPermissions() != null
          ? context.toolPermissions().getOrDefault(tc.name(), "safe")
          : "safe";
      if ("sensitive".equals(permission) || "destructive".equals(permission)) {
        String token = "untrusted-context-approval-" + tc.id() + "-" + System.currentTimeMillis();
        return new DecisionItem(tc.id(), "REQUIRE_APPROVAL", "UNTRUSTED_CONTEXT",
            "Sensitive or destructive tool '" + tc.name() + "' requires approval after untrusted tool output.",
            null, token);
      }
    }

    // Default: ALLOW
    return new DecisionItem(tc.id(), "ALLOW", "NONE", null, null, null);
  }

  private McpBrokerTarget brokerTarget(ToolCallInput tc) {
    if (!"mcp:broker".equals(tc.source()) || !"mcp_call".equals(tc.name())) return null;
    try {
      JsonNode envelope = OBJECT_MAPPER.readTree(tc.argumentsRaw());
      JsonNode server = envelope.path("server");
      JsonNode tool = envelope.path("tool");
      JsonNode arguments = envelope.path("arguments");
      if (!envelope.isObject() || !server.isTextual() || !tool.isTextual() || !arguments.isObject()) return null;
      String serverName = server.textValue().trim();
      String toolName = tool.textValue().trim();
      if (serverName.isBlank() || toolName.isBlank() || serverName.length() > 128 || toolName.length() > 128) return null;
      return new McpBrokerTarget(serverName, toolName);
    } catch (Exception ignored) {
      return null;
    }
  }
}
