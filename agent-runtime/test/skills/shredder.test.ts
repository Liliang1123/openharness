import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { shredFile } from "../../src/skills/shredder";

describe("shredFile", () => {
  it("overwrites file content and successfully unlinks the path", () => {
    const filePath = path.join("/tmp", `sensitive-file-${Date.now()}.txt`);
    fs.writeFileSync(filePath, "highly confidential token and commercial license keys here", "utf-8");

    expect(fs.existsSync(filePath)).toBe(true);

    shredFile(filePath);

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("handles non-existent paths gracefully without throwing errors", () => {
    const nonExistent = path.join("/tmp", "non-existent-shred-path.txt");
    expect(() => shredFile(nonExistent)).not.toThrow();
  });

  it("blocks file shredding outside allowed sandbox directories", () => {
    const externalPath = path.resolve("/etc/hosts");
    expect(() => shredFile(externalPath)).toThrow(/Shred path is outside allowed sandbox directories/);
  });

  it("refuses to shred symbolic links", () => {
    const targetFile = path.join("/tmp", `link-target-${Date.now()}.txt`);
    const symlinkPath = path.join("/tmp", `symlink-${Date.now()}.txt`);

    fs.writeFileSync(targetFile, "actual content", "utf-8");
    fs.symlinkSync(targetFile, symlinkPath);

    expect(() => shredFile(symlinkPath)).toThrow(/Cannot shred a symbolic link/);

    fs.unlinkSync(symlinkPath);
    fs.unlinkSync(targetFile);
  });
});
