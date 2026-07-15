package org.openharness.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openharness.backend.service.PolicyService.DecisionItem;
import org.openharness.backend.service.PolicyService.PolicyContext;
import org.openharness.backend.service.PolicyService.ToolCallInput;

class PolicyServiceTest {

  private final PolicyService service = new PolicyService();

  // 4.1 MCP source without allow-list → REQUIRE_APPROVAL
  @Test
  void mcpSourceDefaultsToRequireApproval() {
    ToolCallInput tc = new ToolCallInput("call-1", "do_thing", "{}", "mcp:my-server");
    List<DecisionItem> decisions = service.evaluate("t1", "u1", "conv-1", List.of(tc), null);

    assertThat(decisions).hasSize(1);
    DecisionItem d = decisions.get(0);
    assertThat(d.decision()).isEqualTo("REQUIRE_APPROVAL");
    assertThat(d.source()).isEqualTo("MCP_DEFAULT");
    assertThat(d.approvalToken()).isNotNull();
  }

  // 4.2 catalog source (null) → ALLOW (regression)
  @Test
  void catalogSourceDefaultsToAllow() {
    ToolCallInput tc = new ToolCallInput("call-2", "echo", "{}", null);
    List<DecisionItem> decisions = service.evaluate("t1", "u1", "conv-1", List.of(tc), null);

    assertThat(decisions).hasSize(1);
    assertThat(decisions.get(0).decision()).isEqualTo("ALLOW");
  }

  // mcpAllowList by tool name → ALLOW
  @Test
  void mcpSourceInAllowListByToolNameAllows() {
    ToolCallInput tc = new ToolCallInput("call-3", "safe_tool", "{}", "mcp:trusted");
    PolicyContext ctx = new PolicyContext(null, null, null, null, null, null, List.of("safe_tool"), false, Map.of());
    List<DecisionItem> decisions = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx);

    assertThat(decisions.get(0).decision()).isEqualTo("ALLOW");
  }

  // mcpAllowList by server name → ALLOW
  @Test
  void mcpSourceInAllowListByServerAllows() {
    ToolCallInput tc = new ToolCallInput("call-4", "any_tool", "{}", "mcp:trusted-server");
    PolicyContext ctx = new PolicyContext(null, null, null, null, null, null, List.of("mcp:trusted-server"), false, Map.of());
    List<DecisionItem> decisions = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx);

    assertThat(decisions.get(0).decision()).isEqualTo("ALLOW");
  }

  @Test
  void mcpBrokerUsesNestedToolForAllowList() {
    ToolCallInput tc = new ToolCallInput(
        "call-broker-tool",
        "mcp_call",
        "{\"server\":\"trusted-server\",\"tool\":\"safe_tool\",\"arguments\":{}}",
        "mcp:broker");
    PolicyContext ctx = new PolicyContext(
        null, null, null, null, null, null, List.of("safe_tool"), false, Map.of());

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("ALLOW");
  }

  @Test
  void mcpBrokerUsesNestedServerForAllowList() {
    ToolCallInput tc = new ToolCallInput(
        "call-broker-server",
        "mcp_call",
        "{\"server\":\"trusted-server\",\"tool\":\"any_tool\",\"arguments\":{}}",
        "mcp:broker");
    PolicyContext ctx = new PolicyContext(
        null, null, null, null, null, null, List.of("mcp:trusted-server"), false, Map.of());

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("ALLOW");
  }

  @Test
  void mcpBrokerAppliesDenyRuleToNestedTool() {
    ToolCallInput tc = new ToolCallInput(
        "call-broker-blocked",
        "mcp_call",
        "{\"server\":\"trusted-server\",\"tool\":\"blocked_dangerous\",\"arguments\":{}}",
        "mcp:broker");

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), null).get(0);

    assertThat(decision.decision()).isEqualTo("DENY");
    assertThat(decision.source()).isEqualTo("ORG_POLICY");
  }

  @Test
  void mcpBrokerTrimsNestedToolBeforeDenyRule() {
    ToolCallInput tc = new ToolCallInput(
        "call-broker-blocked-spaces",
        "mcp_call",
        "{\"server\":\" trusted-server \",\"tool\":\" blocked_dangerous \",\"arguments\":{}}",
        "mcp:broker");

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), null).get(0);

    assertThat(decision.decision()).isEqualTo("DENY");
    assertThat(decision.source()).isEqualTo("ORG_POLICY");
  }

  @Test
  void mcpBrokerTrimsNestedTargetBeforeAllowList() {
    ToolCallInput tc = new ToolCallInput(
        "call-broker-allow-spaces",
        "mcp_call",
        "{\"server\":\" trusted-server \",\"tool\":\" safe_tool \",\"arguments\":{}}",
        "mcp:broker");
    PolicyContext ctx = new PolicyContext(
        null, null, null, null, null, null, List.of("safe_tool", "mcp:trusted-server"), false, Map.of());

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("ALLOW");
  }

  @Test
  void mcpBrokerAppliesSkillApprovalRuleToNestedTool() {
    ToolCallInput tc = new ToolCallInput(
        "call-broker-skill",
        "mcp_call",
        "{\"server\":\"trusted-server\",\"tool\":\"review_tool\",\"arguments\":{}}",
        "mcp:broker");
    PolicyContext ctx = new PolicyContext(
        null,
        null,
        List.of(new PolicyService.SkillPolicy("review-skill", List.of("review_tool"))),
        null,
        null,
        null,
        null,
        false,
        Map.of());

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("REQUIRE_APPROVAL");
    assertThat(decision.source()).isEqualTo("SKILL_MANIFEST");
  }

  @Test
  void malformedMcpBrokerEnvelopeFailsClosedEvenWhenOuterBridgeIsAllowListed() {
    ToolCallInput tc = new ToolCallInput("call-broker-invalid", "mcp_call", "{}", "mcp:broker");
    PolicyContext ctx = new PolicyContext(
        null, null, null, null, null, null, List.of("mcp_call", "mcp:broker"), false, Map.of());

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("REQUIRE_APPROVAL");
    assertThat(decision.source()).isEqualTo("MCP_DEFAULT");
  }

  // blocked_ rule still fires before MCP check
  @Test
  void blockedRuleTakesPrecedenceOverMcpSource() {
    ToolCallInput tc = new ToolCallInput("call-5", "blocked_tool", "{}", "mcp:server");
    List<DecisionItem> decisions = service.evaluate("t1", "u1", "conv-1", List.of(tc), null);

    assertThat(decisions.get(0).decision()).isEqualTo("DENY");
    assertThat(decisions.get(0).source()).isEqualTo("ORG_POLICY");
  }

  @Test
  void untrustedContextRequiresApprovalForSensitiveTool() {
    ToolCallInput tc = new ToolCallInput("call-6", "submit_payment", "{}", "catalog");
    PolicyContext ctx = new PolicyContext(null, null, null, null, "v1", "hash", null, true, Map.of("submit_payment", "sensitive"));

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("REQUIRE_APPROVAL");
    assertThat(decision.source()).isEqualTo("UNTRUSTED_CONTEXT");
    assertThat(decision.approvalToken()).isNotBlank();
  }

  @Test
  void untrustedContextAllowsSafeToolByDefault() {
    ToolCallInput tc = new ToolCallInput("call-7", "echo", "{}", "catalog");
    PolicyContext ctx = new PolicyContext(null, null, null, null, "v1", "hash", null, true, Map.of("echo", "safe"));

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("ALLOW");
    assertThat(decision.source()).isEqualTo("NONE");
  }

  @Test
  void blockedRulePrecedesUntrustedContextRule() {
    ToolCallInput tc = new ToolCallInput("call-8", "blocked_payment", "{}", "catalog");
    PolicyContext ctx = new PolicyContext(null, null, null, null, "v1", "hash", null, true, Map.of("blocked_payment", "sensitive"));

    DecisionItem decision = service.evaluate("t1", "u1", "conv-1", List.of(tc), ctx).get(0);

    assertThat(decision.decision()).isEqualTo("DENY");
    assertThat(decision.source()).isEqualTo("ORG_POLICY");
  }
}
