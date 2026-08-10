import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, resolve } from "node:path";

export const readableExtensions = new Set([".cjs", ".js", ".json", ".jsonl", ".mjs", ".md", ".log", ".txt", ".ts", ".tsx"]);

const rawSecretPattern = /OPENHARNESS_SECRET_CANARY|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9_-]{7,}\b/i;
const rawSecretPatternGlobal = /OPENHARNESS_SECRET_CANARY|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9_-]{7,}\b/gi;
const sensitiveAssignmentPattern = /["'`]?((?:authorization|access[_-]?token|refresh[_-]?token|oauth[_-]?access[_-]?token|oauth[_-]?refresh[_-]?token|api[_-]?key|x-api-key|provider[_-]?key|service[_-]?token|client[_-]?secret|secret[_-]?key))["'`]?\s*[:=]\s*(["'`])([^"'`]*?)\2/gi;
const sensitiveKeyPattern = /^(authorization|access[-_]?token|refresh[-_]?token|oauth[-_]?access[-_]?token|oauth[-_]?refresh[-_]?token|api[-_]?key|x-api-key|provider[-_]?key|service[-_]?token|client[-_]?secret|secret[-_]?key)$/i;

export function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function collectSensitiveLiterals(text) {
  const matches = new Map();
  const add = (key) => matches.set(key, (matches.get(key) ?? 0) + 1);
  for (const match of text.matchAll(rawSecretPatternGlobal)) {
    const value = match[0];
    const lower = value.toLowerCase();
    const kind = lower.startsWith("bearer ")
      ? "bearer"
      : /^(?:sk|rk|pk)-/i.test(value)
        ? "provider-key"
        : "canary";
    add(`${kind}:${digest(value)}`);
  }
  for (const match of text.matchAll(sensitiveAssignmentPattern)) {
    const value = match[3];
    if (value === "Bearer " || value === "[REDACTED]") continue;
    add(`sensitive:${match[1].toLowerCase().replaceAll("_", "-")}:${digest(value)}`);
  }
  return matches;
}

export function objectContainsSecret(value, key = "") {
  if (typeof value === "string") {
    return rawSecretPattern.test(value) || (sensitiveKeyPattern.test(key) && value !== "[REDACTED]");
  }
  if (Array.isArray(value)) return value.some((child) => objectContainsSecret(child, key));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([childKey, child]) => objectContainsSecret(child, childKey));
  }
  return false;
}

export function fileContainsSecret(path, bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  if (rawSecretPattern.test(text)) return true;
  if (collectSensitiveLiterals(text).size > 0) return true;
  if (path.endsWith(".json")) return objectContainsSecret(JSON.parse(text));
  if (path.endsWith(".jsonl")) {
    return text.split("\n").filter(Boolean).some((line) => objectContainsSecret(JSON.parse(line)));
  }
  return false;
}

export function readCandidateManifest(repoRoot) {
  const manifestPath = resolve(repoRoot, "docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function resolveCandidateBytes(repoRoot, row, { readCurrent = readFileSync } = {}) {
  if (row.requireCurrent) {
    const currentPath = resolve(repoRoot, row.path);
    if (!existsSync(currentPath) || !lstatSync(currentPath).isFile()) {
      throw new Error(`current candidate missing: ${row.path}`);
    }
    return readCurrent(currentPath);
  }
  const result = spawnSync("git", ["--no-optional-locks", "show", `${row.sourceCommit}:${row.path}`], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error(`pinned candidate missing: ${row.path}`);
  }
  return result.stdout;
}

export function validateSecretScanDependencies(manifest, fixtureRulePaths) {
  if (!manifest || !manifest.closure || !Array.isArray(manifest.rows)
    || !Array.isArray(manifest.secretScanDependencies)) {
    throw new Error("secret-scan dependency contract missing");
  }
  if (!Array.isArray(fixtureRulePaths) || fixtureRulePaths.some(path => typeof path !== "string" || !path)) {
    throw new Error("secret-scan fixture rule contract missing");
  }
  const dependencies = manifest.secretScanDependencies;
  const unique = new Set(dependencies);
  if (unique.size !== dependencies.length || dependencies.some(path => typeof path !== "string" || !path)) {
    throw new Error("secret-scan dependency set is not unique");
  }
  const fixturePaths = new Set(fixtureRulePaths);
  if (fixturePaths.size !== fixtureRulePaths.length || fixturePaths.size !== dependencies.length
    || [...fixturePaths].some(path => !unique.has(path))
    || [...unique].some(path => !fixturePaths.has(path))) {
    throw new Error("secret-scan dependency set does not exactly match fixture rules");
  }
  const closure = new Set(manifest.closure.expectedPaths);
  const rowCounts = new Map();
  for (const row of manifest.rows) rowCounts.set(row.path, (rowCounts.get(row.path) ?? 0) + 1);
  for (const path of dependencies) {
    if (!closure.has(path)) throw new Error(`secret-scan dependency outside closure: ${path}`);
    if (rowCounts.get(path) !== 1) throw new Error(`secret-scan dependency requires one provenance row: ${path}`);
  }
}
