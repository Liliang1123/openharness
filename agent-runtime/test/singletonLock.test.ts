import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { acquireRuntimeSingletonLock } from "../src/storage/singletonLock";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("runtime singleton lock", () => {
  it("rejects a second holder and releases with the owning descriptor", () => {
    const dir = mkdtempSync(join(tmpdir(), "openharness-singleton-"));
    dirs.push(dir);
    const path = join(dir, "runtime.lock");
    const first = acquireRuntimeSingletonLock(path);

    expect(() => acquireRuntimeSingletonLock(path)).toThrow(/already held/i);
    const child = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "-e",
      "import('./src/storage/singletonLock.ts').then(({acquireRuntimeSingletonLock})=>{try{acquireRuntimeSingletonLock(process.env.LOCK_PATH);process.exit(0)}catch{process.exit(23)}})"
    ], {
      cwd: join(import.meta.dirname, ".."),
      env: { ...process.env, LOCK_PATH: path }
    });
    expect(child.status).toBe(23);
    first.release();

    const replacement = acquireRuntimeSingletonLock(path);
    replacement.release();
  });
});
