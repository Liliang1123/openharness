import type { ToolCall } from "./types";
import type { JavaClient } from "./javaClient";

export interface BeforeToolUseContext {
  requestId: string;
  conversationId: string;
  userId: string;
  tenantId: string;
  traceId: string;
  catalogVersion: string;
  catalogHash: string;
  /** Optional: per-tool source map for MCP_REQUIRE_APPROVAL opt-in. */
  sources?: Map<string, string>;
  untrustedToolOutputSinceLastUser?: boolean;
  toolPermissions?: Map<string, "safe" | "sensitive" | "destructive">;
}

export interface BeforeToolUseDecision {
  toolCallId: string;
  decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  source?: string;
  reason?: string;
  approvalToken?: string;
}

export async function beforeToolUse(
  toolCalls: ToolCall[],
  context: BeforeToolUseContext,
  javaClient: JavaClient,
  headers: Record<string, string>
): Promise<BeforeToolUseDecision[]> {
  const response = await javaClient.evaluatePolicy({
    requestId: context.requestId,
    conversationId: context.conversationId,
    userId: context.userId,
    tenantId: context.tenantId,
    traceId: context.traceId,
    toolCalls: toolCalls.map(tc => ({
      id: tc.id,
      name: tc.name,
      argumentsRaw: tc.argumentsRaw,
      source: context.sources?.get(tc.name)
    })),
    context: {
      catalogVersion: context.catalogVersion,
      catalogHash: context.catalogHash,
      untrustedToolOutputSinceLastUser: context.untrustedToolOutputSinceLastUser ?? false,
      toolPermissions: context.toolPermissions ? Object.fromEntries(context.toolPermissions) : undefined
    }
  }, headers);

  const requireApprovalForMcp = process.env.MCP_REQUIRE_APPROVAL === "true";
  const callNameById = new Map(toolCalls.map(tc => [tc.id, tc.name]));

  return response.decisions.map(d => {
    let decision = d.decision as "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
    let source = d.source;
    let reason = d.reason;
    let approvalToken = d.approvalToken;

    if (requireApprovalForMcp && context.sources) {
      const toolName = callNameById.get(d.toolCallId);
      if (toolName) {
        const toolSource = context.sources.get(toolName);
        if (toolSource && toolSource.startsWith("mcp:") && decision === "ALLOW") {
          decision = "REQUIRE_APPROVAL";
          source = "MCP_REQUIRE_APPROVAL";
          reason = "MCP tool approval required by MCP_REQUIRE_APPROVAL=true";
          approvalToken = `mcp-approval-${d.toolCallId}-${Date.now()}`;
        }
      }
    }

    return { toolCallId: d.toolCallId, decision, source, reason, approvalToken };
  });
}
