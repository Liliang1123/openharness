import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AgentDefinitionSchema, type AgentDefinition } from "@openharness/shared-schema";

export const DEFAULT_AGENT_DEFINITION: AgentDefinition = {
  agentId: "default-agent",
  promptRef: "openharness-default@v1",
  tools: [],
  model: "default"
};

export interface AgentDefinitionRegistry {
  get(agentId: string): AgentDefinition | undefined;
  list(): AgentDefinition[];
}

export class InMemoryAgentDefinitionRegistry implements AgentDefinitionRegistry {
  private readonly definitions = new Map<string, AgentDefinition>();

  constructor(definitions: AgentDefinition[]) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.agentId)) {
        throw new Error(`Duplicate agentId: ${definition.agentId}`);
      }
      this.definitions.set(definition.agentId, definition);
    }
  }

  get(agentId: string): AgentDefinition | undefined {
    return this.definitions.get(agentId);
  }

  list(): AgentDefinition[] {
    return [...this.definitions.values()];
  }
}

export function loadAgentDefinitions(dir = join(process.cwd(), "agents")): AgentDefinitionRegistry {
  if (!existsSync(dir)) {
    return new InMemoryAgentDefinitionRegistry([DEFAULT_AGENT_DEFINITION]);
  }

  const files = readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && path.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    return new InMemoryAgentDefinitionRegistry([DEFAULT_AGENT_DEFINITION]);
  }

  const definitions = files.map((file) => readDefinitionFile(file));
  return new InMemoryAgentDefinitionRegistry(definitions);
}

function readDefinitionFile(file: string): AgentDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse agent definition ${file}: ${message}`);
  }

  const result = AgentDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid agent definition ${file}: ${result.error.message}`);
  }
  return result.data;
}
