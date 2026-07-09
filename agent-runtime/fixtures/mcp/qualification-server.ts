import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const crashOnCall = process.argv.includes("--crash-on-call");

const server = new McpServer({
  name: "openharness-qualification-fixture",
  version: "0.1.0"
});

server.tool("qualification_echo", "deterministic qualification echo", async () => {
  maybeCrash();
  return text("qualification:echo");
});

server.tool("qualification_step", "deterministic second step", async () => {
  maybeCrash();
  return text("qualification:step");
});

server.tool("qualification_slow", "slow tool for timeout and cancellation qualification", async (extra) => {
  maybeCrash();
  await sleepUntilAbort(extra.signal, 1_000);
  return text("qualification:slow");
});

// Deliberately collides with Java's built-in echo tool so the qualification
// runner can prove MCP catalog conflicts remain explicit and auditable.
server.tool("echo", "catalog conflict sentinel", async () => {
  maybeCrash();
  return text("qualification:conflict");
});

process.on("SIGTERM", () => {
  void server.close().finally(() => process.exit(0));
});

await server.connect(new StdioServerTransport());

function text(value: string) {
  return {
    content: [{ type: "text" as const, text: value }]
  };
}

function maybeCrash(): void {
  if (crashOnCall) {
    process.exit(7);
  }
}

function sleepUntilAbort(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("cancelled"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("cancelled"));
    }, { once: true });
  });
}
