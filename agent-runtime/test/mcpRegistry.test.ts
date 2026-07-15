import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildMcpChildEnvironment,
  loadMcpConfig,
  loadMcpConfigFile,
  McpRegistry,
  type McpClientLike
} from "../src/mcpRegistry";

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

  it("rejects an unsafe default Runtime config instead of deferring a type error", () => {
    writeFileSync(
      join(TMP, "mcp.json"),
      JSON.stringify({ mcpServers: { unsafe: { command: "node", description: { secret: true } } } })
    );

    expect(loadMcpConfig(TMP)).toBeNull();
  });

  it("loads an explicit absolute Gate D config and rejects unsafe shapes", () => {
    const path = join(TMP, "gate-d-mcp.json");
    writeFileSync(path, JSON.stringify({
      mcpServers: {
        qualification: {
          command: "node",
          args: ["fixture.js"],
          timeoutMs: 30_000,
          description: "Qualification fixture",
          idleTimeoutMs: 10_000
        }
      }
    }));

    expect(loadMcpConfigFile(path).mcpServers.qualification.command).toBe("node");
    expect(loadMcpConfigFile(path).mcpServers.qualification.description).toBe("Qualification fixture");
    expect(loadMcpConfigFile(path).mcpServers.qualification.idleTimeoutMs).toBe(10_000);
    expect(() => loadMcpConfigFile("relative/mcp.json")).toThrow(/absolute/i);
    writeFileSync(path, JSON.stringify({ mcpServers: { qualification: { command: "" } } }));
    expect(() => loadMcpConfigFile(path)).toThrow(/command/i);
    writeFileSync(path, JSON.stringify({ mcpServers: { qualification: { command: "node", description: 42 } } }));
    expect(() => loadMcpConfigFile(path)).toThrow(/description/i);
    writeFileSync(path, JSON.stringify({ mcpServers: { qualification: { command: "node", idleTimeoutMs: 0 } } }));
    expect(() => loadMcpConfigFile(path)).toThrow(/idleTimeoutMs/i);
    writeFileSync(path, JSON.stringify({ mcpServers: { ["s".repeat(129)]: { command: "node" } } }));
    expect(() => loadMcpConfigFile(path)).toThrow(/server name/i);
  });

  it("passes only safe host variables plus explicit server env to MCP children", () => {
    const childEnv = buildMcpChildEnvironment(
      { SERVER_SPECIFIC_TOKEN: "configured-token" },
      {
        PATH: "/usr/bin",
        HOME: "/tmp/home",
        LANG: "en_US.UTF-8",
        OPENHARNESS_SERVICE_TOKEN: "must-not-reach-mcp",
        ZHIPU_API_KEY: "must-not-reach-mcp",
        CODEX_OAUTH_TOKEN: "must-not-reach-mcp"
      }
    );

    expect(childEnv).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
      LANG: "en_US.UTF-8",
      SERVER_SPECIFIC_TOKEN: "configured-token"
    });
    expect(childEnv).not.toHaveProperty("OPENHARNESS_SERVICE_TOKEN");
    expect(childEnv).not.toHaveProperty("ZHIPU_API_KEY");
    expect(childEnv).not.toHaveProperty("CODEX_OAUTH_TOKEN");
  });
});

function fakeClient(toolName: string, close = vi.fn(async () => {})): McpClientLike {
  return {
    listTools: vi.fn(async () => ({
      tools: [{
        name: toolName,
        description: `${toolName} description`,
        inputSchema: { type: "object", properties: { value: { type: "string" } } }
      }]
    })),
    callTool: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
    close
  };
}

describe("McpRegistry — lazy lifecycle and virtual skills", () => {
  it("registers configured servers without starting clients", async () => {
    const connect = vi.fn(async (name: string) => fakeClient(`${name}_tool`));
    const registry = new McpRegistry({
      mcpServers: {
        filesystem: { command: "fs" },
        database: { command: "db" }
      }
    }, { connect });

    await registry.init();

    expect(registry.hasConfiguredServers()).toBe(true);
    expect(registry.hasConfiguredServer("filesystem")).toBe(true);
    expect(connect).not.toHaveBeenCalled();
    await registry.shutdown();
  });

  it("starts only the selected server and shares concurrent startup", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const connect = vi.fn(async (name: string) => {
      await blocked;
      return fakeClient(`${name}_tool`);
    });
    const registry = new McpRegistry({
      mcpServers: {
        filesystem: { command: "fs", description: "File tools" },
        database: { command: "db" }
      }
    }, { connect });
    await registry.init();

    const first = registry.getVirtualSkill("mcp:filesystem");
    const second = registry.getVirtualSkill("mcp:filesystem");
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(connect).toHaveBeenCalledWith("filesystem", expect.objectContaining({ command: "fs" }));
    release();

    const [skillA, skillB] = await Promise.all([first, second]);
    expect(skillA.metadata.name).toBe("mcp:filesystem");
    expect(skillA.metadata.description).toBe("File tools");
    expect(skillA.metadata.fork_agent).toBe(true);
    expect(skillA.metadata.tools_required).toEqual(["mcp_call"]);
    expect(skillA.content).toContain("filesystem_tool");
    expect(skillB.content).toBe(skillA.content);
    expect(connect).toHaveBeenCalledTimes(1);
    await registry.shutdown();
  });

  it("does not leak config env into a virtual skill", async () => {
    const registry = new McpRegistry({
      mcpServers: {
        filesystem: {
          command: "fs",
          env: { SECRET_TOKEN: "must-not-leak" }
        }
      }
    }, { connect: async () => fakeClient("read_file") });
    await registry.init();

    const skill = await registry.getVirtualSkill("mcp:filesystem");
    expect(skill.content).not.toContain("must-not-leak");
    expect(skill.content).not.toContain("SECRET_TOKEN");
    await registry.shutdown();
  });

  it("redacts known config env values echoed by server metadata, results, and startup errors", async () => {
    const secret = "server-secret-canary";
    const registry = new McpRegistry({
      mcpServers: {
        filesystem: { command: "fs", env: { SECRET_TOKEN: secret } }
      }
    }, {
      connect: async () => ({
        listTools: async () => ({ tools: [{
          name: "echo",
          description: `description ${secret}`,
          inputSchema: { type: "object", description: `schema ${secret}` }
        }] }),
        callTool: async () => ({ content: [{ [secret]: "key echo", type: "text", text: `result ${secret}` }] }),
        close: async () => {}
      })
    });
    await registry.init();

    const skill = await registry.getVirtualSkill("mcp:filesystem");
    expect(skill.content).not.toContain(secret);
    expect(skill.content).toContain("[REDACTED]");
    const result = await registry.executeBroker(
      { server: "filesystem", tool: "echo", arguments: {} },
      { requestId: "r", conversationId: "c", toolCallId: "tc" }
    );
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).toContain("[REDACTED]");
    await registry.shutdown();

    const failing = new McpRegistry({
      mcpServers: { broken: { command: "broken", env: { SECRET_TOKEN: secret } } }
    }, { connect: async () => { throw new Error(`startup ${secret}`); } });
    await failing.init();
    await expect(failing.getVirtualSkill("mcp:broken")).rejects.not.toThrow(secret);
    await failing.shutdown();
  });

  it("rejects an unknown virtual skill without starting another server", async () => {
    const connect = vi.fn(async () => fakeClient("read_file"));
    const registry = new McpRegistry({ mcpServers: { filesystem: { command: "fs" } } }, { connect });
    await registry.init();

    await expect(registry.getVirtualSkill("mcp:missing")).rejects.toThrow(/not configured/i);
    expect(connect).not.toHaveBeenCalled();
    await registry.shutdown();
  });

  it("rejects an empty or unbounded remote tool name and closes the client", async () => {
    const close = vi.fn(async () => {});
    const registry = new McpRegistry({
      mcpServers: { unsafe: { command: "unsafe" } }
    }, {
      connect: async () => ({
        listTools: async () => ({ tools: [{ name: "t".repeat(129), inputSchema: { type: "object" } }] }),
        callTool: vi.fn(),
        close
      })
    });
    await registry.init();

    await expect(registry.getVirtualSkill("mcp:unsafe")).rejects.toThrow(/tool name/i);
    expect(close).toHaveBeenCalledTimes(1);
    await registry.shutdown();
  });

  it("reaps idle servers and restarts them on later access", async () => {
    let now = 1_000;
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    const connect = vi.fn(async () => {
      const close = vi.fn(async () => {});
      closes.push(close);
      return fakeClient("read_file", close);
    });
    const registry = new McpRegistry({
      mcpServers: { filesystem: { command: "fs", idleTimeoutMs: 500 } }
    }, { connect, now: () => now, scheduleReaper: false });
    await registry.init();
    await registry.getVirtualSkill("mcp:filesystem");

    now = 1_499;
    await registry.reapIdleServers(now);
    expect(closes[0]).not.toHaveBeenCalled();
    now = 1_500;
    await registry.reapIdleServers(now);
    expect(closes[0]).toHaveBeenCalledTimes(1);

    await registry.getVirtualSkill("mcp:filesystem");
    expect(connect).toHaveBeenCalledTimes(2);
    await registry.shutdown();
  });

  it("validates broker targets and enforces a virtual-skill server restriction", async () => {
    const fsClient = fakeClient("read_file");
    const registry = new McpRegistry({
      mcpServers: {
        filesystem: { command: "fs" },
        database: { command: "db" }
      }
    }, { connect: async (name) => name === "filesystem" ? fsClient : fakeClient("query") });
    await registry.init();
    const request = { requestId: "r1", conversationId: "c1", toolCallId: "tc1" };

    const ok = await registry.executeBroker({
      server: "filesystem", tool: "read_file", arguments: { value: "a" }
    }, request, { restrictedServer: "filesystem" });
    expect(ok.status).toBe("ok");
    expect(fsClient.callTool).toHaveBeenCalledWith(
      { name: "read_file", arguments: { value: "a" } },
      undefined,
      expect.objectContaining({ timeout: 30_000 })
    );

    const denied = await registry.executeBroker({
      server: "database", tool: "query", arguments: {}
    }, request, { restrictedServer: "filesystem" });
    expect(denied.status).toBe("error");
    if (denied.status === "error") expect(denied.error.errorClass).toBe("MCP_TARGET_DENIED");

    const missing = await registry.executeBroker({
      server: "filesystem", tool: "missing", arguments: {}
    }, request);
    expect(missing.status).toBe("error");
    if (missing.status === "error") expect(missing.error.errorClass).toBe("MCP_TOOL_NOT_FOUND");
    await registry.shutdown();
  });

  it("rejects unbounded broker identity before routing", async () => {
    const connect = vi.fn(async () => fakeClient("read_file"));
    const registry = new McpRegistry({
      mcpServers: { filesystem: { command: "fs" } }
    }, { connect });
    await registry.init();

    const result = await registry.executeBroker(
      { server: "x".repeat(129), tool: "read_file", arguments: {} },
      { requestId: "r", conversationId: "c", toolCallId: "tc" }
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.errorClass).toBe("MCP_BROKER_INVALID_ARGUMENTS");
    expect(connect).not.toHaveBeenCalled();
    await registry.shutdown();
  });

  it("does not start unavailable servers during init and returns a structured failure on access", async () => {
    const connect = vi.fn(async () => { throw new Error("bounded start failure"); });
    const registry = new McpRegistry({
      mcpServers: {
        broken: { command: "/nonexistent/binary-that-does-not-exist", args: [] }
      }
    }, { connect });
    await registry.init();
    expect(connect).not.toHaveBeenCalled();
    const tools = await registry.refreshToolDefinitions();
    expect(tools).toEqual([]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(registry.hasTool("anything")).toBe(false);
    await registry.shutdown();
  });

  it("closes a connected client when initial tool discovery fails", async () => {
    const close = vi.fn(async () => {});
    const registry = new McpRegistry({
      mcpServers: { broken: { command: "broken" } }
    }, {
      connect: async () => ({
        listTools: vi.fn(async () => { throw new Error("discovery failed"); }),
        callTool: vi.fn(),
        close
      })
    });
    await registry.init();

    await expect(registry.getVirtualSkill("mcp:broken")).rejects.toThrow(/discovery failed/i);
    expect(close).toHaveBeenCalledTimes(1);
    await registry.shutdown();
  });

  it("does not reap a server while a tool call is active", async () => {
    let now = 1_000;
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const close = vi.fn(async () => {});
    const client = fakeClient("slow", close);
    client.callTool = vi.fn(async () => {
      await blocked;
      return { content: [{ type: "text", text: "done" }] };
    });
    const registry = new McpRegistry({
      mcpServers: { slow: { command: "slow", idleTimeoutMs: 100 } }
    }, { connect: async () => client, now: () => now, scheduleReaper: false });
    await registry.init();

    const executing = registry.executeBroker(
      { server: "slow", tool: "slow", arguments: {} },
      { requestId: "r", conversationId: "c", toolCallId: "tc" }
    );
    await vi.waitFor(() => expect(client.callTool).toHaveBeenCalledTimes(1));
    now = 2_000;
    await registry.reapIdleServers(now);
    expect(close).not.toHaveBeenCalled();

    release();
    await expect(executing).resolves.toMatchObject({ status: "ok" });
    now = 2_100;
    await registry.reapIdleServers(now);
    expect(close).toHaveBeenCalledTimes(1);
    await registry.shutdown();
  });

  it("waits for an in-flight startup and closes its client during shutdown", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const close = vi.fn(async () => {});
    const connect = vi.fn(async () => {
      await blocked;
      return fakeClient("read_file", close);
    });
    const registry = new McpRegistry({
      mcpServers: { filesystem: { command: "fs" } }
    }, { connect, scheduleReaper: false });
    await registry.init();

    const starting = registry.getVirtualSkill("mcp:filesystem");
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    const stopping = registry.shutdown();
    release();
    await Promise.allSettled([starting, stopping]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(registry.hasConfiguredServers()).toBe(true);
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
