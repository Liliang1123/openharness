import { describe, expect, it } from "vitest";
import { evaluateDiskGuard } from "../src/storage/diskGuard";

const GiB = 1024 ** 3;

describe("runtime disk guard", () => {
  it("allows admission and terminal writes with healthy free space", () => {
    expect(evaluateDiskGuard({ freeBytes: 20 * GiB, totalBytes: 100 * GiB })).toEqual({
      state: "normal",
      allowAdmission: true,
      allowInternalTerminalWrite: true
    });
  });

  it("stops admission at the low watermark but preserves terminal headroom", () => {
    expect(evaluateDiskGuard({ freeBytes: 5 * GiB, totalBytes: 100 * GiB })).toEqual({
      state: "low",
      allowAdmission: false,
      allowInternalTerminalWrite: true
    });
  });

  it("enters critical drain while permitting only internal terminal writes", () => {
    expect(evaluateDiskGuard({ freeBytes: 400 * 1024 ** 2, totalBytes: 100 * GiB })).toEqual({
      state: "critical",
      allowAdmission: false,
      allowInternalTerminalWrite: true
    });
  });
});
