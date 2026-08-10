import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = process.cwd();

function fail() {
  process.stderr.write("workspace_snapshot_failed\n");
  process.exit(1);
}

function runGit(args) {
  const result = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) fail();
  return result.stdout;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function mode(path) {
  const permissions = lstatSync(path).mode & 0o777;
  return (permissions & 0o111) !== 0 ? "100755" : "100644";
}

function normalizePath(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) fail();
  return path;
}

function statusRows() {
  const raw = runGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const tokens = raw.split("\0").filter(Boolean);
  const rows = new Map();
  for (const token of tokens) {
    if (token.length < 4 || token[2] !== " ") fail();
    const status = token.slice(0, 2);
    if (status.includes("R") || status.includes("C")) fail();
    const path = normalizePath(token.slice(3));
    rows.set(path, status);
  }
  return rows;
}

function snapshot() {
  const rows = [];
  for (const [path, status] of statusRows()) {
    const absolutePath = resolve(repoRoot, path);
    if (existsSync(absolutePath)) {
      rows.push({ path, status, mode: mode(absolutePath), sha256: sha256(absolutePath) });
    } else {
      rows.push({ path, status, mode: null, sha256: null });
    }
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  return {
    head: runGit(["rev-parse", "--verify", "HEAD^{commit}"]).trim(),
    rows
  };
}

function readSnapshot(path) {
  try {
    const value = JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
    if (!value || typeof value.head !== "string" || !Array.isArray(value.rows)) fail();
    return value;
  } catch {
    fail();
  }
}

if (process.argv[2] === "--compare") {
  if (!process.argv[3] || !process.argv[4]) fail();
  const before = readSnapshot(process.argv[3]);
  const after = readSnapshot(process.argv[4]);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail();
  process.stdout.write(`workspace_snapshot_ok paths=${after.rows.length}\n`);
} else {
  process.stdout.write(`${JSON.stringify(snapshot())}\n`);
}
