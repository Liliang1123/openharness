import type { AgentMessage } from "./types";
import type { CacheHint } from "@openharness/shared-schema";
import { estimateTokens } from "./compression";

export type CacheStrategy = "off" | "single" | "double" | "adaptive";

/**
 * Compute cache hints for the model request.
 * Selects eligible messages (skipping systemInjected, transient, compressionInstruction)
 * based on the cache strategy (off, single, double, adaptive).
 * Returns messageIndexFromTail (1-based from end).
 */
export function computeCacheHints(
  messages: AgentMessage[],
  strategyInput?: CacheStrategy
): CacheHint[] {
  const strategy = strategyInput || (process.env.CACHE_STRATEGY as CacheStrategy) || "double";
  if (strategy === "off") {
    return [];
  }

  let limit = 2;
  if (strategy === "single") {
    limit = 1;
  } else if (strategy === "adaptive") {
    // 门禁与成本自适应：在 2000 token 以下仅使用单 Marker
    const estimatedTokens = estimateTokens(messages);
    limit = estimatedTokens >= 2000 ? 2 : 1;
  }


  const hints: CacheHint[] = [];
  let count = 0;

  for (let i = messages.length - 1; i >= 0 && count < limit; i--) {
    const msg = messages[i];
    if (isSkipped(msg)) continue;
    const indexFromTail = messages.length - i;
    const scope = msg.role === "tool" ? "tool_result_block" as const : "message" as const;
    hints.push({ messageIndexFromTail: indexFromTail, scope });
    count++;
  }

  return hints;
}

function isSkipped(msg: AgentMessage): boolean {
  if ((msg as Record<string, unknown>).systemInjected) return true;
  if ((msg as Record<string, unknown>).transient) return true;
  if ((msg as Record<string, unknown>).compressionInstruction) return true;
  return false;
}

