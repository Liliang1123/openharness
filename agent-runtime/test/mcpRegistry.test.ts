import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadMcpConfig, McpRegistry } from "../src/mcpRegistry";

const TMP = "/tmp/openharness-mcp-test";

describe("loadMcpConfig", () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("returns null when no config exists", () => {
    expect(loadMcpConfig(TMP, TMP)).toBeNull();
  });

  it("loads project root mcp.json", () => {
    writeFileSync(
      join(TMP, "mcp.json"),
      JSON.stringify({ mcpServers: { foo: { command: "echo", args: ["hi"] } } })
    );
    const cfg = loadMcpConfig(TMP);
    expect(cfg).not.toBeNull();
    expect(cfg!.mcpServers.foo.command).toBe("echo");
  });

  it("project root takes precedence over agent-runtime", () => {
    const agentDir = join(TMP, "agent-runtime");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(TMP, "mcp.json"), JSON.stringify({ mcpServers: { root: { command: "a" } } }));
    writeFileSync(join(agentDir, "mcp.json"), JSON.stringify({ mcpServers: { agent: { command: "b" } } }));
    const cfg = loadMcpConfig(TMP, agentDir);
    expect(cfg!.mcpServers.root).toBeDefined();
    expect(cfg!.mcpServers.agent).toBeUndefined();
  });

  it("falls back to agent-runtime when project root has no mcp.json", () => {
    const agentDir = join(TMP, "agent-runtime");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "mcp.json"), JSON.stringify({ mcpServers: { agent: { command: "b" } } }));
    const cfg = loadMcpConfig(TMP, agentDir);
    expect(cfg!.mcpServers.agent).toBeDefined();
  });

  it("returns null on malformed JSON", () => {
    writeFileSync(join(TMP, "mcp.json"), "{ not valid");
    expect(loadMcpConfig(TMP)).toBeNull();
  });
});

describe("McpRegistry — server start failure isolation", () => {
  it("does not throw when server command does not exist", async () => {
    const registry = new McpRegistry({
      mcpServers: {
        broken: { command: "/nonexistent/binary-that-does-not-exist", args: [] }
      }
    });
    await registry.init(); // must not throw
    const tools = await registry.refreshToolDefinitions();
    expect(tools).toEqual([]);
    expect(registry.hasTool("anything")).toBe(false);
    await registry.shutdown();
  });

  it("handles null config gracefully", async () => {
    const registry = new McpRegistry(null);
    await registry.init();
    expect(await registry.refreshToolDefinitions()).toEqual([]);
    await registry.shutdown();
  });

  it("execute returns MCP_SERVER_UNAVAILABLE for unknown server", async () => {
    const registry = new McpRegistry({ mcpServers: {} });
    await registry.init();
    const result = await registry.execute("ghost", "any_tool", {}, {
      requestId: "r1", conversationId: "c1", toolCallId: "tc1"
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.errorClass).toBe("MCP_SERVER_UNAVAILABLE");
    }
    await registry.shutdown();
  });
});
