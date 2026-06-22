import type { CatalogResponse, ToolDefinition } from "./types";
import type { JavaClient } from "./javaClient";
import type { McpRegistry } from "./mcpRegistry";

export type ToolSource = "catalog" | `mcp:${string}`;

interface FrozenEntry {
  catalog: CatalogResponse;
  /** map toolName -> source for routing */
  sources: Map<string, ToolSource>;
}

export class ToolRegistry {
  private static readonly entries = new Map<string, FrozenEntry>();
  private readonly localEntries = new Map<string, FrozenEntry>();

  constructor(
    private readonly javaClient: JavaClient,
    private readonly mcpRegistry?: McpRegistry
  ) {}

  private getEntriesMap(): Map<string, FrozenEntry> {
    if (process.env.VITEST === "true") {
      return this.localEntries;
    }
    return ToolRegistry.entries;
  }

  async getFrozenCatalog(
    tenantId: string,
    conversationId: string,
    headers: Record<string, string>
  ): Promise<CatalogResponse> {
    const key = `${tenantId}:${conversationId}`;
    const map = this.getEntriesMap();
    const existing = map.get(key);
    if (existing) return existing.catalog;

    const catalog = await this.javaClient.getCatalog(headers);
    const sources = new Map<string, ToolSource>();
    for (const tool of catalog.tools) {
      sources.set(tool.name, "catalog");
    }

    const mergedTools: ToolDefinition[] = [...catalog.tools];

    const isTest = process.env.VITEST === "true";
    const skillsEnabled = !isTest || process.env.OPENHARNESS_SKILLS_ENABLED === "true";
    if (skillsEnabled) {
      sources.set("invoke_skill", "catalog");
      mergedTools.push({
        name: "invoke_skill",
        description: "Invoke an agent skill dynamically by loading its instructions and state.",
        permission: "sensitive",
        isReadOnly: false,
        isDestructive: false,
        requiresApproval: true,
        isConcurrencySafe: true,
        parameters: {
          type: "object",
          properties: {
            skill_name: { type: "string", description: "The unique name of the skill to invoke." },
            task: { type: "string", description: "Specific instruction or task payload for the skill." }
          },
          required: ["skill_name", "task"]
        }
      } as ToolDefinition);
    }

    if (this.mcpRegistry) {
      const mcpEntries = await this.mcpRegistry.refreshToolDefinitions();
      for (const entry of mcpEntries) {
        if (sources.has(entry.tool.name)) {
          console.warn(
            `[mcp] tool name conflict: "${entry.tool.name}" exists in catalog; dropping MCP version from server "${entry.serverName}"`
          );
          continue;
        }
        sources.set(entry.tool.name, `mcp:${entry.serverName}`);
        mergedTools.push(entry.tool);
      }
    }

    const merged: CatalogResponse = {
      catalogVersion: catalog.catalogVersion,
      catalogHash: catalog.catalogHash,
      tools: mergedTools
    };

    const frozen: FrozenEntry = { catalog: merged, sources };

    // 内存安全控制：若活跃 Session 缓存超过 500，淘汰最旧的条目
    if (map.size >= 500) {
      const oldestKey = map.keys().next().value;
      if (oldestKey) {
        map.delete(oldestKey);
      }
    }

    map.set(key, frozen);
    return merged;
  }


  resolveSource(tenantId: string, conversationId: string, toolName: string): ToolSource | null {
    const key = `${tenantId}:${conversationId}`;
    const entry = this.getEntriesMap().get(key);
    if (!entry) return null;
    return entry.sources.get(toolName) ?? null;
  }

  getSources(tenantId: string, conversationId: string): Map<string, string> {
    const key = `${tenantId}:${conversationId}`;
    const entry = this.getEntriesMap().get(key);
    if (!entry) return new Map();
    return new Map(entry.sources);
  }

  getPermissions(tenantId: string, conversationId: string): Map<string, "safe" | "sensitive" | "destructive"> {
    const key = `${tenantId}:${conversationId}`;
    const entry = this.getEntriesMap().get(key);
    const permissions = new Map<string, "safe" | "sensitive" | "destructive">();
    if (!entry) return permissions;
    for (const tool of entry.catalog.tools) {
      permissions.set(tool.name, tool.permission);
    }
    return permissions;
  }

  getCatalogTools(tenantId: string, conversationId: string): ToolDefinition[] {
    const key = `${tenantId}:${conversationId}`;
    const entry = this.getEntriesMap().get(key);
    return entry ? [...entry.catalog.tools] : [];
  }

  public static clearSessionCatalog(tenantId: string, conversationId: string): void {
    const key = `${tenantId}:${conversationId}`;
    ToolRegistry.entries.delete(key);
  }
}


