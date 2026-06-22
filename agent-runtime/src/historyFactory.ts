import { InMemoryHistoryStore, type HistoryStore } from "./history";
import { JsonFileHistoryStore } from "./jsonFileHistoryStore";

export function createHistoryStore(): HistoryStore {
  const mode = process.env.HISTORY_STORE ?? "file";
  if (mode === "memory") return new InMemoryHistoryStore();
  return new JsonFileHistoryStore();
}
