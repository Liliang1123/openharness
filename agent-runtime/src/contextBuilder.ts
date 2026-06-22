import { estimateTokens } from "./compression";
import { stableHistory, toModelMessages } from "./history";
import type { AgentMessage } from "./types";
import type { MemoryFact } from "./memoryStore";

const DEFAULT_MODEL_CONTEXT_BUDGET_TOKENS = 8000;

export interface ContextBuildResult {
  messages: AgentMessage[];
  meta: {
    builder: "default";
    selectedMessages: number;
    estimatedTokens: number;
    budgetTokens: number;
    layers: string[];
    truncated: boolean;
  };
}

export function buildModelContext(
  messages: AgentMessage[],
  options: { budgetTokens?: number; memoryFacts?: MemoryFact[] } = {}
): ContextBuildResult {
  const budgetTokens = resolveBudget(options.budgetTokens);
  const stable = stableHistory(messages);
  const summaries = stable.filter(isCompressedSummary);
  const sessionContexts = stable.filter(isSessionContextMessage);
  const recentCandidates = stable.filter(
    (message) => !isCompressedSummary(message) && !isSessionContextMessage(message)
  );
  const memoryMessages = memoryContextMessages(options.memoryFacts ?? []);
  const reservedTokens = estimateTokens([...summaries, ...sessionContexts, ...memoryMessages]);

  const selectedRecent = selectRecentMessages(recentCandidates, Math.max(0, budgetTokens - reservedTokens));
  const selected = toModelMessages([...summaries, ...sessionContexts, ...memoryMessages, ...selectedRecent]);
  const selectedMessages = selected.length;
  const estimatedTokens = estimateTokens(selected);
  const totalCandidates = stable.length + memoryMessages.length;
  const truncated = selectedMessages < totalCandidates || estimatedTokens > budgetTokens;

  return {
    messages: selected,
    meta: {
      builder: "default",
      selectedMessages,
      estimatedTokens,
      budgetTokens,
      layers: layersFor(summaries, sessionContexts, memoryMessages, selectedRecent),
      truncated
    }
  };
}

function resolveBudget(perCall?: number): number {
  if (typeof perCall === "number" && Number.isFinite(perCall) && perCall > 0) return perCall;
  const fromEnv = Number(process.env.MODEL_CONTEXT_BUDGET_TOKENS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_MODEL_CONTEXT_BUDGET_TOKENS;
}

function isCompressedSummary(message: AgentMessage): boolean {
  return Boolean((message as AgentMessage & { compressedSummary?: boolean }).compressedSummary);
}

function isSessionContextMessage(message: AgentMessage): boolean {
  return typeof message.content === "string" && message.content.startsWith("[Session context:");
}

function selectRecentMessages(messages: AgentMessage[], budgetTokens: number): AgentMessage[] {
  const selected: AgentMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    const next = [candidate, ...selected];
    const nextTokens = estimateTokens(next);

    if (nextTokens <= budgetTokens || selected.length === 0) {
      selected.unshift(candidate);
      continue;
    }
    break;
  }

  return selected;
}

function memoryContextMessages(memoryFacts: MemoryFact[]): AgentMessage[] {
  if (memoryFacts.length === 0) return [];
  const lines = memoryFacts.map((fact, index) => {
    const tags = fact.tags.length > 0 ? ` tags=${fact.tags.join(",")}` : "";
    return `${index + 1}. [${fact.memoryId}${tags}] ${fact.content}`;
  });
  return [{
    role: "system",
    content: `Relevant long-term memory facts:\n${lines.join("\n")}`,
    sessionContext: true
  }];
}

function layersFor(
  summaries: AgentMessage[],
  sessionContexts: AgentMessage[],
  memoryMessages: AgentMessage[],
  recentMessages: AgentMessage[]
): string[] {
  const layers: string[] = [];
  if (summaries.length > 0) layers.push("compressed_summary");
  if (sessionContexts.length > 0) layers.push("session_context");
  if (memoryMessages.length > 0) layers.push("memory_retrieval");
  if (recentMessages.length > 0) layers.push("recent_messages");
  return layers;
}

