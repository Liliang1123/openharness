import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { beforeToolUse } from "../src/beforeToolUse";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class AllowAllJava implements JavaClient {
  async getCatalog() { return { catalogVersion: "v", catalogHash: "h", tools: [] } as CatalogResponse; }
  async chat(_r: ModelChatRequest) { return { requestId: "", conversationId: "", rawProvider: "mock" }; }
  async executeTool(_r: ToolCallRequest) { return { requestId: "", conversationId: "", toolCallId: "", toolName: "", result: {}, status: "ok" as const }; }
  async postTrace(_e: TraceEvent) {}
  async evaluatePolicy(req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: "ALLOW", source: "NONE" }))
    };
  }
}

describe("MCP_REQUIRE_APPROVAL opt-in", () => {
  beforeEach(() => {
    delete process.env.MCP_REQUIRE_APPROVAL;
  });

  afterEach(() => {
    delete process.env.MCP_REQUIRE_APPROVAL;
  });

  it("upgrades MCP tools to REQUIRE_APPROVAL when env=true", async () => {
    process.env.MCP_REQUIRE_APPROVAL = "true";
    const java = new AllowAllJava();
    const sources = new Map<string, string>([
      ["catalog_tool", "catalog"],
      ["mcp_tool", "mcp:fs"]
    ]);

    const decisions = await beforeToolUse(
      [
        { id: "tc1", name: "catalog_tool", argumentsRaw: "{}" },
        { id: "tc2", name: "mcp_tool", argumentsRaw: "{}" }
      ],
      {
        requestId: "r", conversationId: "c", userId: "u", tenantId: "t",
        traceId: "tr", catalogVersion: "v", catalogHash: "h", sources
      },
      java,
      {}
    );

    const catalogDecision = decisions.find(d => d.toolCallId === "tc1")!;
    const mcpDecision = decisions.find(d => d.toolCallId === "tc2")!;

    expect(catalogDecision.decision).toBe("ALLOW");
    expect(mcpDecision.decision).toBe("REQUIRE_APPROVAL");
    expect(mcpDecision.source).toBe("MCP_REQUIRE_APPROVAL");
    expect(mcpDecision.approvalToken).toMatch(/^mcp-approval-tc2-/);
  });

  it("leaves all decisions untouched when env=false", async () => {
    process.env.MCP_REQUIRE_APPROVAL = "false";
    const java = new AllowAllJava();
    const sources = new Map<string, string>([["mcp_tool", "mcp:fs"]]);

    const decisions = await beforeToolUse(
      [{ id: "tc1", name: "mcp_tool", argumentsRaw: "{}" }],
      {
        requestId: "r", conversationId: "c", userId: "u", tenantId: "t",
        traceId: "tr", catalogVersion: "v", catalogHash: "h", sources
      },
      java,
      {}
    );

    expect(decisions[0].decision).toBe("ALLOW");
  });

  it("default behaves as opt-out (no env var)", async () => {
    const java = new AllowAllJava();
    const sources = new Map<string, string>([["mcp_tool", "mcp:fs"]]);

    const decisions = await beforeToolUse(
      [{ id: "tc1", name: "mcp_tool", argumentsRaw: "{}" }],
      {
        requestId: "r", conversationId: "c", userId: "u", tenantId: "t",
        traceId: "tr", catalogVersion: "v", catalogHash: "h", sources
      },
      java,
      {}
    );

    expect(decisions[0].decision).toBe("ALLOW");
  });
});
