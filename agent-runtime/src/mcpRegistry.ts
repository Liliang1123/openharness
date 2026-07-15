import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolDefinition, ToolCallResponse } from "./types";
import type { Skill } from "./skills/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
  description?: string;
  idleTimeoutMs?: number;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpToolEntry {
  serverName: string;
  tool: ToolDefinition;
}

type ServerStatus = "stopped" | "starting" | "ready" | "failed";

interface McpListedTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpClientLike {
  listTools(): Promise<{ tools?: McpListedTool[] }>;
  callTool(
    request: { name: string; arguments: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { timeout?: number; maxTotalTimeout?: number; signal?: AbortSignal }
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpRegistryOptions {
  connect?: (name: string, config: McpServerConfig) => Promise<McpClientLike>;
  now?: () => number;
  scheduleReaper?: boolean;
}

interface ServerRecord {
  name: string;
  config: McpServerConfig;
  client?: McpClientLike;
  status: ServerStatus;
  toolNames: Set<string>;
  tools: ToolDefinition[];
  timeoutMs: number;
  idleTimeoutMs: number;
  lastUsedAt: number;
  activeCalls: number;
  startPromise?: Promise<void>;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;
const REAPER_INTERVAL_MS = 60_000;
const MCP_CHILD_HOST_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "LANG",
  "LC_ALL"
] as const;

// ── Config loading ───────────────────────────────────────────────────────────

export function loadMcpConfig(projectRoot?: string, agentRuntimeRoot?: string): McpConfig | null {
  const explicit = projectRoot !== undefined || agentRuntimeRoot !== undefined;
  const candidates = explicit
    ? [
        projectRoot ? join(projectRoot, "mcp.json") : null,
        agentRuntimeRoot ? join(agentRuntimeRoot, "mcp.json") : null
      ].filter((p): p is string => Boolean(p))
    : [
        join(process.cwd(), "mcp.json"),
        join(process.cwd(), "..", "mcp.json")
      ];

  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        return normalizeMcpConfig(JSON.parse(raw));
      } catch (e) {
        console.warn(`[mcp] failed to parse ${path}:`, e);
        return null;
      }
    }
  }
  return null;
}

export function loadMcpConfigFile(path: string): McpConfig {
  if (!isAbsolute(path)) throw new Error("MCP config path must be absolute");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read MCP config: ${message}`);
  }
  return normalizeMcpConfig(parsed);
}

function normalizeMcpConfig(parsed: unknown): McpConfig {
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    throw new Error("MCP config must contain an mcpServers object");
  }
  const mcpServers: Record<string, McpServerConfig> = {};
  for (const [name, candidate] of Object.entries(parsed.mcpServers)) {
    if (!name.trim() || name.length > 128) {
      throw new Error("MCP server name must be non-empty and at most 128 characters");
    }
    if (!isRecord(candidate) || typeof candidate.command !== "string" || !candidate.command.trim()) {
      throw new Error(`MCP server ${name || "<empty>"} command must be non-empty`);
    }
    if (candidate.args !== undefined && (!Array.isArray(candidate.args) || candidate.args.some(value => typeof value !== "string"))) {
      throw new Error(`MCP server ${name} args must be strings`);
    }
    if (candidate.env !== undefined && (!isRecord(candidate.env) || Object.values(candidate.env).some(value => typeof value !== "string"))) {
      throw new Error(`MCP server ${name} env values must be strings`);
    }
    if (candidate.timeoutMs !== undefined && (!Number.isInteger(candidate.timeoutMs) || Number(candidate.timeoutMs) <= 0)) {
      throw new Error(`MCP server ${name} timeoutMs must be a positive integer`);
    }
    if (candidate.description !== undefined && typeof candidate.description !== "string") {
      throw new Error(`MCP server ${name} description must be a string`);
    }
    if (candidate.idleTimeoutMs !== undefined && (!Number.isInteger(candidate.idleTimeoutMs) || Number(candidate.idleTimeoutMs) <= 0)) {
      throw new Error(`MCP server ${name} idleTimeoutMs must be a positive integer`);
    }
    mcpServers[name] = {
      command: candidate.command,
      ...(candidate.args === undefined ? {} : { args: candidate.args as string[] }),
      ...(candidate.env === undefined ? {} : { env: candidate.env as Record<string, string> }),
      ...(candidate.timeoutMs === undefined ? {} : { timeoutMs: Number(candidate.timeoutMs) }),
      ...(candidate.description === undefined ? {} : { description: candidate.description as string }),
      ...(candidate.idleTimeoutMs === undefined ? {} : { idleTimeoutMs: Number(candidate.idleTimeoutMs) })
    };
  }
  return { mcpServers };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildMcpChildEnvironment(
  configuredEnv: Record<string, string> = {},
  hostEnv: Readonly<Record<string, string | undefined>> = process.env
): Record<string, string> {
  const safeHostEnv: Record<string, string> = {};
  for (const name of MCP_CHILD_HOST_ENV_ALLOWLIST) {
    const value = hostEnv[name];
    if (value !== undefined) safeHostEnv[name] = value;
  }
  return { ...safeHostEnv, ...configuredEnv };
}

// ── Registry ─────────────────────────────────────────────────────────────────

export class McpRegistry {
  private readonly servers = new Map<string, ServerRecord>();
  private readonly connect: (name: string, config: McpServerConfig) => Promise<McpClientLike>;
  private readonly now: () => number;
  private readonly scheduleReaper: boolean;
  private reaper?: NodeJS.Timeout;
  private shuttingDown = false;

  constructor(
    private readonly config: McpConfig | null,
    options: McpRegistryOptions = {}
  ) {
    this.connect = options.connect ?? connectDefaultClient;
    this.now = options.now ?? Date.now;
    this.scheduleReaper = options.scheduleReaper ?? true;
  }

  async init(): Promise<void> {
    if (!this.config) return;
    for (const [name, cfg] of Object.entries(this.config.mcpServers ?? {})) {
      if (this.servers.has(name)) continue;
      this.servers.set(name, {
        name,
        config: cfg,
        status: "stopped",
        toolNames: new Set(),
        tools: [],
        timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        idleTimeoutMs: cfg.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
        lastUsedAt: this.now(),
        activeCalls: 0
      });
    }
    if (this.scheduleReaper && this.servers.size > 0 && !this.reaper) {
      this.reaper = setInterval(() => {
        void this.reapIdleServers(this.now());
      }, REAPER_INTERVAL_MS);
      this.reaper.unref?.();
    }
  }

  hasConfiguredServers(): boolean {
    return this.servers.size > 0 || Object.keys(this.config?.mcpServers ?? {}).length > 0;
  }

  hasConfiguredServer(name: string): boolean {
    return this.servers.has(name) || Boolean(this.config?.mcpServers?.[name]);
  }

  listVirtualSkillDescriptors(): Array<{ name: string; description: string }> {
    return Object.entries(this.config?.mcpServers ?? {})
      .map(([name, config]) => ({
        name: `mcp:${name}`,
        description: redactKnownValues(
          config.description?.trim() || `Tools provided by MCP server ${name}`,
          config.env
        )
          .replace(/\s+/g, " ")
          .slice(0, 240)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async ensureStarted(name: string): Promise<ServerRecord> {
    if (this.shuttingDown) throw new Error("MCP registry is shutting down");
    const record = this.servers.get(name);
    if (!record) throw new Error(`MCP server "${name}" is not configured`);
    if (record.status === "ready" && record.client) {
      record.lastUsedAt = this.now();
      return record;
    }
    if (record.startPromise) {
      await record.startPromise;
      if (record.status === "ready" && record.client) return record;
      throw new Error(record.error ?? `MCP server "${name}" unavailable`);
    }

    record.status = "starting";
    record.error = undefined;
    record.startPromise = (async () => {
      let client: McpClientLike | undefined;
      try {
        client = await this.connect(name, record.config);
        const result = await client.listTools();
        const tools = (result.tools ?? [])
          .map(tool => this.toToolDefinition(tool))
          .sort((a, b) => a.name.localeCompare(b.name));
        record.client = client;
        record.tools = tools;
        record.toolNames = new Set(tools.map(tool => tool.name));
        record.lastUsedAt = this.now();
        record.status = "ready";
      } catch (error) {
        if (client) {
          try { await client.close(); } catch { /* startup failure remains primary */ }
        }
        record.client = undefined;
        record.tools = [];
        record.toolNames.clear();
        record.status = "failed";
        record.error = this.redactText(record, boundedError(error));
        console.warn(`[mcp] server "${name}" failed to start:`, record.error);
        throw new Error(record.error);
      } finally {
        record.startPromise = undefined;
      }
    })();

    await record.startPromise;
    return record;
  }

  /**
   * Returns all available MCP tools across ready servers, adapted to ToolDefinition shape.
   * Adds an internal `_source: "mcp:{name}"` marker for routing; callers MUST strip
   * before sending to the model or to Java.
   */
  listTools(): McpToolEntry[] {
    const entries: McpToolEntry[] = [];
    for (const record of this.servers.values()) {
      if (record.status !== "ready") continue;
      for (const tool of record.tools) entries.push({ serverName: record.name, tool });
    }
    return entries;
  }

  /**
   * Returns cached tool list per server. Populated during init().
   */
  async refreshToolDefinitions(): Promise<McpToolEntry[]> {
    for (const record of this.servers.values()) {
      try {
        await this.ensureStarted(record.name);
      } catch {
        // Explicit discovery keeps server failures isolated.
      }
    }
    return this.listTools();
  }

  async getVirtualSkill(skillName: string): Promise<Skill> {
    if (!skillName.startsWith("mcp:")) throw new Error(`Skill ${skillName} is not an MCP virtual skill`);
    const serverName = skillName.slice("mcp:".length);
    const record = await this.ensureStarted(serverName);
    const toolCatalog = record.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters
    }));
    return {
      metadata: {
        name: skillName,
        description: this.redactText(
          record,
          record.config.description?.trim() || `Tools provided by MCP server ${serverName}`
        ),
        version: "1",
        tools_required: ["mcp_call"],
        parameters: {},
        fork_agent: true
      },
      content: this.redactText(record, [
        `You are scoped to MCP server ${JSON.stringify(serverName)}.`,
        "Use only mcp_call and always pass this exact server name.",
        "Available tools:",
        JSON.stringify(toolCatalog, null, 2)
      ].join("\n\n")),
      sourcePath: `virtual:mcp:${serverName}`
    };
  }

  getServerForTool(toolName: string): string | null {
    for (const record of this.servers.values()) {
      if (record.status === "ready" && record.toolNames.has(toolName)) {
        return record.name;
      }
    }
    return null;
  }

  hasTool(toolName: string): boolean {
    return this.getServerForTool(toolName) !== null;
  }

  async execute(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    request: { requestId: string; conversationId: string; toolCallId: string },
    options?: { signal?: AbortSignal }
  ): Promise<ToolCallResponse> {
    let record: ServerRecord;
    try {
      record = await this.ensureStarted(serverName);
    } catch (error) {
      const configured = this.servers.get(serverName);
      return this.errorResponse(request, toolName, "MCP_SERVER_UNAVAILABLE",
        configured?.error ? `MCP server "${serverName}" unavailable: ${configured.error}` : boundedError(error));
    }
    if (!record.client) {
      return this.errorResponse(request, toolName, "MCP_SERVER_UNAVAILABLE", `MCP server "${serverName}" unavailable`);
    }
    if (!record.toolNames.has(toolName)) {
      return this.errorResponse(request, toolName, "MCP_TOOL_NOT_FOUND", `MCP tool "${toolName}" is not advertised by server "${serverName}"`);
    }

    try {
      record.lastUsedAt = this.now();
      record.activeCalls += 1;
      const result = await record.client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { timeout: record.timeoutMs, maxTotalTimeout: record.timeoutMs, signal: options?.signal }
      ) as { content?: unknown[]; isError?: boolean };
      const redactedContent = this.redactValue(record, result.content);
      if (result.isError) {
        const text = this.extractText(redactedContent) || "MCP tool returned error";
        return this.errorResponse(request, toolName, "MCP_TOOL_ERROR", text);
      }
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        toolCallId: request.toolCallId,
        toolName,
        result: { content: redactedContent ?? [] },
        status: "ok",
        provenance: "untrusted"
      };
    } catch (e) {
      const message = this.redactText(record, e instanceof Error ? e.message : String(e));
      const errorClass = this.classifyMcpError(e, message);
      if (errorClass === "MCP_TOOL_ERROR" && message.toLowerCase().includes("connection")) {
        await this.stopRecord(record);
        record.status = "failed";
        record.error = this.redactText(record, boundedError(e));
      }
      return this.errorResponse(request, toolName, errorClass, message);
    } finally {
      record.activeCalls = Math.max(0, record.activeCalls - 1);
      record.lastUsedAt = this.now();
    }
  }

  async executeBroker(
    envelope: Record<string, unknown>,
    request: { requestId: string; conversationId: string; toolCallId: string },
    options?: { signal?: AbortSignal; restrictedServer?: string }
  ): Promise<ToolCallResponse> {
    const server = typeof envelope.server === "string" ? envelope.server.trim() : "";
    const tool = typeof envelope.tool === "string" ? envelope.tool.trim() : "";
    const args = envelope.arguments;
    if (!server || !tool || server.length > 128 || tool.length > 128 || !isRecord(args)) {
      return this.errorResponse(request, "mcp_call", "MCP_BROKER_INVALID_ARGUMENTS", "mcp_call requires non-empty server and tool strings plus an arguments object");
    }
    if (options?.restrictedServer && server !== options.restrictedServer) {
      return this.errorResponse(request, "mcp_call", "MCP_TARGET_DENIED", `MCP virtual skill is restricted to server "${options.restrictedServer}"`);
    }
    return this.execute(server, tool, args, request, { signal: options?.signal });
  }

  async reapIdleServers(now = this.now()): Promise<void> {
    for (const record of this.servers.values()) {
      if (record.status !== "ready" || !record.client) continue;
      if (record.activeCalls > 0) continue;
      if (now - record.lastUsedAt < record.idleTimeoutMs) continue;
      await this.stopRecord(record);
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.reaper) clearInterval(this.reaper);
    this.reaper = undefined;
    await Promise.allSettled(
      Array.from(this.servers.values()).flatMap(record => record.startPromise ? [record.startPromise] : [])
    );
    await Promise.all(Array.from(this.servers.values()).map(record => this.stopRecord(record)));
    this.servers.clear();
  }

  private async stopRecord(record: ServerRecord): Promise<void> {
    const client = record.client;
    record.client = undefined;
    record.tools = [];
    record.toolNames.clear();
    record.status = "stopped";
    if (client) {
      try { await client.close(); } catch { /* shutdown remains best-effort */ }
    }
  }

  private toToolDefinition(tool: McpListedTool): ToolDefinition {
    if (typeof tool.name !== "string" || !tool.name.trim() || tool.name.length > 128) {
      throw new Error("MCP tool name must be non-empty and at most 128 characters");
    }
    return {
      name: tool.name,
      description: tool.description ?? "",
      parameters: this.normalizeSchema(tool.inputSchema),
      permission: "sensitive",
      isReadOnly: false,
      isDestructive: false,
      requiresApproval: false,
      isConcurrencySafe: true
    };
  }

  private redactText(record: ServerRecord, value: string): string {
    return redactKnownValues(value, record.config.env);
  }

  private redactValue(record: ServerRecord, value: unknown): unknown {
    if (typeof value === "string") return this.redactText(record, value);
    if (Array.isArray(value)) return value.map(item => this.redactValue(record, item));
    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [this.redactText(record, key), this.redactValue(record, item)])
      );
    }
    return value;
  }

  private errorResponse(
    request: { requestId: string; conversationId: string; toolCallId: string },
    toolName: string,
    errorClass: string,
    errorMessage: string
  ): ToolCallResponse {
    const status = errorClass === "MCP_TOOL_TIMEOUT" ? "timeout" : "error";
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName,
      status,
      error: {
        errorClass,
        errorMessage,
        retriable: false,
        retryOwner: "ts",
        maxRetries: 0,
        fallbackAllowed: false,
        httpStatus: 500
      }
    };
  }

  private classifyMcpError(error: unknown, message: string): string {
    const lower = message.toLowerCase();
    if (error instanceof DOMException && error.name === "AbortError") return "MCP_TOOL_CANCELLED";
    if (error instanceof Error && error.name === "AbortError") return "MCP_TOOL_CANCELLED";
    if (lower.includes("abort") || lower.includes("cancel")) return "MCP_TOOL_CANCELLED";
    if (lower.includes("timeout") || lower.includes("timed out")) return "MCP_TOOL_TIMEOUT";
    return "MCP_TOOL_ERROR";
  }

  private extractText(content: unknown): string {
    if (!Array.isArray(content)) return "";
    for (const block of content) {
      if (block && typeof block === "object" && "text" in block) {
        return String((block as { text: unknown }).text);
      }
    }
    return "";
  }

  private normalizeSchema(input: unknown): { type: string; [k: string]: unknown } {
    if (input && typeof input === "object" && "type" in input) {
      return input as { type: string; [k: string]: unknown };
    }
    return { type: "object", properties: {} };
  }
}

async function connectDefaultClient(_name: string, config: McpServerConfig): Promise<McpClientLike> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: buildMcpChildEnvironment(config.env)
  });
  const client = new Client(
    { name: "openharness-agent-runtime", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  return client as unknown as McpClientLike;
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 512);
}

function redactKnownValues(value: string, env?: Record<string, string>): string {
  let redacted = value;
  for (const secret of Object.values(env ?? {})) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}
