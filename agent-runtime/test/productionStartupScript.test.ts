import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("../scripts/start-production-runtime.sh", import.meta.url));

describe("production Runtime startup wrapper", () => {
  it("establishes the fail-closed production boundary before launching the reviewed entrypoint", () => {
    expect(existsSync(scriptPath)).toBe(true);
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("set -eu");
    expect(script).toContain("umask 077");
    expect(script).toContain("AGENT_RUNTIME_SQLITE_PATH is required");
    expect(script).toContain("OPENHARNESS_SERVICE_TOKEN is required");
    expect(script).toContain("export AGENT_RUNTIME_PROFILE=production");
    expect(script).toContain("exec pnpm --filter @openharness/agent-runtime exec node --import tsx src/index.ts");
    expect(script.indexOf("umask 077")).toBeLessThan(script.indexOf("exec pnpm"));
  });
});
