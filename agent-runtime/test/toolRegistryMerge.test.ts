import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../src/toolRegistry";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, ToolDefinition, TraceEvent } from "../src/types";
import type { McpRegistry, McpToolEntry } from "../src/mcpRegistry";

class StubJava implements JavaClient {
  constructor(private readonly catalog: CatalogResponse) {}
  async getCatalog() { return this.catalog; }
  async chat(_r: ModelChatRequest) { return { requestId: "", conversationId: "", rawProvider: "mock" }; }
  async executeTool(_r: ToolCallRequest) { return { requestId: "", conversationId: "", toolCallId: "", toolName: "", result: {}, status: "ok" as const }; }
  async postTrace(_e: TraceEvent) {}
  async evaluatePolicy(_r: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: "", conversationId: "", decisions: [] };
  }
}

function makeMcpStub(entries: McpToolEntry[]): McpRegistry {
  return {
    hasConfiguredServers: vi.fn(() => entries.length > 0),
    listVirtualSkillDescriptors: vi.fn(() => entries.length === 0 ? [] : [
      { name: "mcp:fs", description: "Workspace file tools" }
    ]),
    refreshToolDefinitions: vi.fn(async () => entries),
    listTools: vi.fn(() => []),
    init: vi.fn(),
    shutdown: vi.fn(),
    execute: vi.fn(),
    hasTool: vi.fn(),
    getServerForTool: vi.fn()
  } as unknown as McpRegistry;
}

const sampleCatalog: CatalogResponse = {
  catalogVersion: "v1",
  catalogHash: "h1",
  tools: [
    {
      name: "echo",
      description: "Catalog echo",
      parameters: { type: "object", properties: {} },
      permission: "safe",
      isReadOnly: true,
      isDestructive: false,
      requiresApproval: false,
      isConcurrencySafe: true
    } as ToolDefinition
  ]
};

const mcpReadFile: McpToolEntry = {
  serverName: "fs",
  tool: {
    name: "read_file",
    description: "MCP read_file",
    parameters: { type: "object", properties: {} },
    permission: "sensitive",
    isReadOnly: false,
    isDestructive: false,
    requiresApproval: false,
    isConcurrencySafe: true
  } as ToolDefinition
};

const mcpEcho: McpToolEntry = {
  serverName: "fs",
  tool: { ...mcpReadFile.tool, name: "echo", description: "MCP echo" }
};

describe("ToolRegistry merge", () => {
  it("adds one constant broker without discovering individual MCP tools", async () => {
    const java = new StubJava(sampleCatalog);
    const mcp = makeMcpStub([mcpReadFile, { ...mcpReadFile, serverName: "db", tool: { ...mcpReadFile.tool, name: "query" } }]);
    const reg = new ToolRegistry(java, mcp);

    const merged = await reg.getFrozenCatalog("t1", "c1", {});
    const names = merged.tools.map(t => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("mcp_call");
    expect(names).not.toContain("read_file");
    expect(names).not.toContain("query");
    expect(merged.tools).toHaveLength(2);
    expect(mcp.refreshToolDefinitions).not.toHaveBeenCalled();
    const invokeSkill = merged.tools.find(tool => tool.name === "invoke_skill");
    if (invokeSkill) {
      expect(invokeSkill.description).toContain("mcp:fs");
      expect(invokeSkill.description).toContain("Workspace file tools");
      expect(invokeSkill.description).not.toContain("read_file");
    }
    const bridge = merged.tools.find(tool => tool.name === "mcp_call");
    expect(bridge?.parameters).toEqual({
      type: "object",
      properties: {
        server: expect.objectContaining({ type: "string" }),
        tool: expect.objectContaining({ type: "string" }),
        arguments: expect.objectContaining({ type: "object" })
      },
      required: ["server", "tool", "arguments"],
      additionalProperties: false
    });
  });

  it("fails closed when Java owns the reserved broker name", async () => {
    const java = new StubJava({
      ...sampleCatalog,
      tools: [{ ...sampleCatalog.tools[0], name: "mcp_call" }]
    });
    const mcp = makeMcpStub([mcpEcho]);
    const reg = new ToolRegistry(java, mcp);

    await expect(reg.getFrozenCatalog("t1", "reserved", {})).rejects.toThrow(/reserved.*mcp_call/i);
  });

  it("resolveSource returns correct source", async () => {
    const java = new StubJava(sampleCatalog);
    const mcp = makeMcpStub([mcpReadFile]);
    const reg = new ToolRegistry(java, mcp);

    await reg.getFrozenCatalog("t1", "c1", {});
    expect(reg.resolveSource("t1", "c1", "echo")).toBe("catalog");
    expect(reg.resolveSource("t1", "c1", "mcp_call")).toBe("mcp:broker");
    expect(reg.resolveSource("t1", "c1", "read_file")).toBeNull();
    expect(reg.resolveSource("t1", "c1", "missing")).toBeNull();
  });

  it("works without McpRegistry", async () => {
    const java = new StubJava(sampleCatalog);
    const reg = new ToolRegistry(java);

    const merged = await reg.getFrozenCatalog("t1", "c1", {});
    expect(merged.tools).toHaveLength(1);
    expect(reg.resolveSource("t1", "c1", "echo")).toBe("catalog");
  });

  it("getSources returns full map", async () => {
    const java = new StubJava(sampleCatalog);
    const mcp = makeMcpStub([mcpReadFile]);
    const reg = new ToolRegistry(java, mcp);

    await reg.getFrozenCatalog("t1", "c1", {});
    const sources = reg.getSources("t1", "c1");
    expect(sources.get("echo")).toBe("catalog");
    expect(sources.get("mcp_call")).toBe("mcp:broker");
  });

  it("locks the tool catalog across different ToolRegistry instances for the same session", async () => {
    const origVitest = process.env.VITEST;
    process.env.VITEST = "false";
    try {
      const catalogA: CatalogResponse = {
        catalogVersion: "versionA",
        catalogHash: "hashA",
        tools: [
          { name: "toolA", permission: "safe" } as ToolDefinition
        ]
      };
      const catalogB: CatalogResponse = {
        catalogVersion: "versionB",
        catalogHash: "hashB",
        tools: [
          { name: "toolB", permission: "safe" } as ToolDefinition
        ]
      };

      const javaA = new StubJava(catalogA);
      const javaB = new StubJava(catalogB);

      // Instance 1 gets catalog first
      const reg1 = new ToolRegistry(javaA);
      const merged1 = await reg1.getFrozenCatalog("tLock", "cLock", {});
      expect(merged1.catalogVersion).toBe("versionA");

      // Instance 2 should get the cached versionA, even if javaB would return versionB
      const reg2 = new ToolRegistry(javaB);
      const merged2 = await reg2.getFrozenCatalog("tLock", "cLock", {});
      expect(merged2.catalogVersion).toBe("versionA");

      // Clear session cache, then reg2 should get the updated versionB
      ToolRegistry.clearSessionCatalog("tLock", "cLock");
      const merged3 = await reg2.getFrozenCatalog("tLock", "cLock", {});
      expect(merged3.catalogVersion).toBe("versionB");
    } finally {
      process.env.VITEST = origVitest;
    }
  });

  it("appends invoke_skill to catalog when skills are enabled", async () => {
    const origSkills = process.env.OPENHARNESS_SKILLS_ENABLED;
    process.env.OPENHARNESS_SKILLS_ENABLED = "true";
    try {
      const java = new StubJava(sampleCatalog);
      const reg = new ToolRegistry(java, makeMcpStub([mcpReadFile]));
      const merged = await reg.getFrozenCatalog("tSkill", "cSkill", {});
      const names = merged.tools.map(t => t.name);
      expect(names).toContain("invoke_skill");
      const skillTool = merged.tools.find(t => t.name === "invoke_skill");
      expect(skillTool).toBeDefined();
      expect(skillTool?.permission).toBe("sensitive");
      expect(skillTool?.description).toContain("mcp:fs");
      expect(skillTool?.description).toContain("Workspace file tools");
      expect(skillTool?.description).not.toContain("read_file");
    } finally {
      process.env.OPENHARNESS_SKILLS_ENABLED = origSkills;
    }
  });

  it("exposes frozen catalog tools for scoped runtime derivation", async () => {
    const origSkills = process.env.OPENHARNESS_SKILLS_ENABLED;
    process.env.OPENHARNESS_SKILLS_ENABLED = "true";
    try {
      const java = new StubJava(sampleCatalog);
      const reg = new ToolRegistry(java);
      await reg.getFrozenCatalog("t1", "conv-tools", {});

      const tools = reg.getCatalogTools("t1", "conv-tools");
      expect(tools.map(tool => tool.name)).toContain("invoke_skill");
      tools.pop();
      expect(reg.getCatalogTools("t1", "conv-tools").map(tool => tool.name)).toContain("invoke_skill");
    } finally {
      process.env.OPENHARNESS_SKILLS_ENABLED = origSkills;
    }
  });
});
