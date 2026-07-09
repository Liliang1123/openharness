import { closeSync, constants, openSync } from "node:fs";
import { spawnSync } from "node:child_process";

export interface RuntimeSingletonLock {
  readonly path: string;
  release(): void;
}

// Darwin exposes O_EXLOCK through open(2), but Node does not publish the flag.
// The lock is advisory, non-blocking, descriptor-owned, and released on process death.
const DARWIN_O_EXLOCK = 0x20;

export function acquireRuntimeSingletonLock(path: string): RuntimeSingletonLock {
  let fd: number;
  if (process.platform === "darwin") {
    try {
      fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NONBLOCK | DARWIN_O_EXLOCK, 0o600);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN";
      if (code === "EWOULDBLOCK" || code === "EAGAIN") {
        throw new Error(`Runtime singleton lock is already held: ${path}`);
      }
      throw error;
    }
  } else if (process.platform === "linux") {
    fd = openSync(path, constants.O_CREAT | constants.O_RDWR, 0o600);
    // The child locks the inherited open-file description. Linux flock locks
    // remain attached to that description after the child exits and until fd closes.
    const result = spawnSync("flock", ["-n", "3"], { stdio: ["ignore", "ignore", "ignore", fd] });
    if (result.error) {
      closeSync(fd);
      throw new Error(`Unable to execute flock for runtime singleton lock: ${result.error.message}`);
    }
    if (result.status !== 0) {
      closeSync(fd);
      throw new Error(`Runtime singleton lock is already held: ${path}`);
    }
  } else {
    throw new Error(`Descriptor-owned runtime singleton lock is not implemented for ${process.platform}`);
  }

  let released = false;
  return {
    path,
    release() {
      if (released) return;
      released = true;
      closeSync(fd);
    }
  };
}
