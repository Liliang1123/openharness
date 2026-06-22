import { describe, expect, it } from "vitest";
import { beforeToolUse } from "../src/beforeToolUse";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { ToolCall } from "../src/types";

function makeClient(capturedRequests: PolicyEvaluateRequest[]): JavaClient {
  return {
    async getCatalog() { return { catalogVersion: "v1", catalogHash: "h1", tools: [] }; },
    async chat() { throw new Error("not used"); },
    async executeTool() { throw new Error("not used"); },
    async postTrace() {},
    async evaluatePolicy(req, _headers): Promise<PolicyEvaluateResponse> {
      capturedRequests.push(req);
      return {
        requestId: req.requestId,
        conversationId: req.conversationId,
        decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: "ALLOW", source: "NONE" }))
      };
    }
  };
}

const BASE_CTX = {
  requestId: "req-1",
  conversationId: "conv-1",
  userId: "u1",
  tenantId: "t1",
  traceId: "tr1",
  catalogVersion: "v1",
  catalogHash: "h1"
};

describe("beforeToolUse source field", () => {
  it("sends source=mcp:server for MCP tools", async () => {
    const captured: PolicyEvaluateRequest[] = [];
    const client = makeClient(captured);

    const toolCalls: ToolCall[] = [
      { id: "call-1", name: "mcp_tool", argumentsRaw: "{}" },
      { id: "call-2", name: "catalog_tool", argumentsRaw: "{}" }
    ];
    const sources = new Map([["mcp_tool", "mcp:my-server"]]);

    await beforeToolUse(toolCalls, { ...BASE_CTX, sources }, client, {});

    const sent = captured[0].toolCalls;
    expect(sent.find(tc => tc.id === "call-1")?.source).toBe("mcp:my-server");
    expect(sent.find(tc => tc.id === "call-2")?.source).toBeUndefined();
  });

  it("sends no source when sources map is absent", async () => {
    const captured: PolicyEvaluateRequest[] = [];
    const client = makeClient(captured);

    const toolCalls: ToolCall[] = [{ id: "call-1", name: "some_tool", argumentsRaw: "{}" }];

    await beforeToolUse(toolCalls, BASE_CTX, client, {});

    expect(captured[0].toolCalls[0].source).toBeUndefined();
  });

  it("sends untrusted context and tool permissions", async () => {
    const captured: PolicyEvaluateRequest[] = [];
    const client = makeClient(captured);

    const toolCalls: ToolCall[] = [{ id: "call-1", name: "submit_payment", argumentsRaw: "{}" }];

    await beforeToolUse(toolCalls, {
      ...BASE_CTX,
      untrustedToolOutputSinceLastUser: true,
      toolPermissions: new Map([["submit_payment", "sensitive"]])
    }, client, {});

    expect(captured[0].context.untrustedToolOutputSinceLastUser).toBe(true);
    expect(captured[0].context.toolPermissions).toEqual({ submit_payment: "sensitive" });
  });
});
