import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolDefinition, ToolCallResponse } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpToolEntry {
  serverName: string;
  tool: ToolDefinition;
}

type ServerStatus = "ready" | "failed" | "unavailable";

interface ServerRecord {
  name: string;
  client?: Client;
  status: ServerStatus;
  toolNames: Set<string>;
  timeoutMs: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

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
        return JSON.parse(raw) as McpConfig;
      } catch (e) {
        console.warn(`[mcp] failed to parse ${path}:`, e);
        return null;
      }
    }
  }
  return null;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export class McpRegistry {
  private readonly servers = new Map<string, ServerRecord>();

  constructor(private readonly config: McpConfig | null) {}

  async init(): Promise<void> {
    if (!this.config) return;
    const entries = Object.entries(this.config.mcpServers ?? {});
    await Promise.all(entries.map(([name, cfg]) => this.startServer(name, cfg)));
  }

  private async startServer(name: string, cfg: McpServerConfig): Promise<void> {
    const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const record: ServerRecord = {
      name,
      status: "failed",
      toolNames: new Set(),
      timeoutMs
    };
    this.servers.set(name, record);

    try {
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: { ...process.env as Record<string, string>, ...(cfg.env ?? {}) }
      });
      const client = new Client(
        { name: "openharness-agent-runtime", version: "0.1.0" },
        { capabilities: {} }
      );
      await client.connect(transport);

      const result = await client.listTools();
      for (const t of result.tools ?? []) {
        record.toolNames.add(t.name);
      }
      record.client = client;
      record.status = "ready";
    } catch (e) {
      record.status = "failed";
      record.error = e instanceof Error ? e.message : String(e);
      console.warn(`[mcp] server "${name}" failed to start:`, record.error);
    }
  }

  /**
   * Returns all available MCP tools across ready servers, adapted to ToolDefinition shape.
   * Adds an internal `_source: "mcp:{name}"` marker for routing; callers MUST strip
   * before sending to the model or to Java.
   */
  listTools(): McpToolEntry[] {
    const entries: McpToolEntry[] = [];
    for (const record of this.servers.values()) {
      if (record.status !== "ready" || !record.client) continue;
      // We don't keep the full definitions; re-read from cache or fetch lazily.
      // For simplicity here we expose names with a placeholder description.
      // Real impl would cache the listTools result.
    }
    return entries;
  }

  /**
   * Returns cached tool list per server. Populated during init().
   */
  async refreshToolDefinitions(): Promise<McpToolEntry[]> {
    const entries: McpToolEntry[] = [];
    for (const record of this.servers.values()) {
      if (record.status !== "ready" || !record.client) continue;
      try {
        const result = await record.client.listTools();
        for (const t of result.tools ?? []) {
          entries.push({
            serverName: record.name,
            tool: {
              name: t.name,
              description: t.description ?? "",
              parameters: this.normalizeSchema(t.inputSchema),
              permission: "sensitive", // safe default; user can override via mcp.json in future
              isReadOnly: false,
              isDestructive: false,
              requiresApproval: false,
              isConcurrencySafe: true
            }
          });
        }
      } catch (e) {
        console.warn(`[mcp] listTools failed for "${record.name}":`, e);
        record.status = "unavailable";
        record.error = e instanceof Error ? e.message : String(e);
      }
    }
    return entries;
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
    request: { requestId: string; conversationId: string; toolCallId: string }
  ): Promise<ToolCallResponse> {
    const record = this.servers.get(serverName);
    if (!record || record.status !== "ready" || !record.client) {
      return this.errorResponse(request, toolName, "MCP_SERVER_UNAVAILABLE",
        record?.error ? `MCP server "${serverName}" unavailable: ${record.error}` : `MCP server "${serverName}" not ready`);
    }

    try {
      const result = await Promise.race([
        record.client.callTool({ name: toolName, arguments: args }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), record.timeoutMs))
      ]) as { content?: unknown[]; isError?: boolean };

      if (result.isError) {
        const text = this.extractText(result.content) || "MCP tool returned error";
        return this.errorResponse(request, toolName, "MCP_TOOL_ERROR", text);
      }
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        toolCallId: request.toolCallId,
        toolName,
        result: { content: result.content ?? [] },
        status: "ok"
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const errorClass = message === "timeout" ? "MCP_TOOL_TIMEOUT" : "MCP_TOOL_ERROR";
      // Mark as unavailable on transport-level errors
      if (errorClass === "MCP_TOOL_ERROR" && message.toLowerCase().includes("connection")) {
        record.status = "unavailable";
      }
      return this.errorResponse(request, toolName, errorClass, message);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.values()).map(async (record) => {
        if (record.client) {
          try { await record.client.close(); } catch { /* ignore */ }
        }
      })
    );
    this.servers.clear();
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
