import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

const repoRoot = process.cwd();
const requireClosure = process.argv.includes("--require-closure");
const manifestPath = resolve(
  repoRoot,
  "docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json"
);
const humanManifestPath = resolve(
  repoRoot,
  "docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md"
);
const repositoryPathMarker = "/openharness/";
const evidencePolicies = new Map([
  ["production_blocked", { restoreAllowed: true, maxRestores: 1, requireCurrent: false }],
  ["historical_readiness_marker", { restoreAllowed: true, maxRestores: 1, requireCurrent: false }],
  ["procedure_only", { restoreAllowed: true, maxRestores: 1, requireCurrent: false }],
  ["production_fail_partial", { restoreAllowed: true, maxRestores: 1, requireCurrent: false }],
  ["executable_source", { restoreAllowed: true, maxRestores: 1, requireCurrent: false }],
  ["startup_boundary", { restoreAllowed: true, maxRestores: 1, requireCurrent: false }],
  ["current_matches_non_ancestor_reference", { restoreAllowed: false, maxRestores: 0, requireCurrent: true }],
  ["explicit_script_merge_required", { restoreAllowed: false, maxRestores: 0, requireCurrent: true }],
  ["explicit_correction_required", { restoreAllowed: false, maxRestores: 0, requireCurrent: true }],
  ["tdd_cross_user_correction_required", { restoreAllowed: false, maxRestores: 0, requireCurrent: true }],
  ["tracked_dirty_persistence_correction", { restoreAllowed: false, maxRestores: 0, requireCurrent: true }],
  ["tracked_dirty_production_entrypoint_correction", { restoreAllowed: false, maxRestores: 0, requireCurrent: true }]
]);

function fail() {
  process.stderr.write("provenance_check_failed\n");
  process.exit(1);
}

function runGit(args, options = {}) {
  const result = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
  if (result.status !== 0) fail();
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function currentMode(path) {
  const mode = lstatSync(path).mode & 0o777;
  return (mode & 0o111) !== 0 ? "100755" : "100644";
}

function normalizedRelativePath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\")) fail();
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) fail();
  return path;
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
}

function parseHumanRows(markdown) {
  const rows = [];
  const pattern = /^\|\s+\[[^\]]+\]\((file:\/\/\/[^)]+)\)\s+\|\s+`([0-9a-f]{40})`\s+\|\s+`([0-9a-f]{40})`\s+\|\s+`([0-9a-f]{64})`\s+\|\s+`(100644|100755)`\s+\|/gm;
  for (const match of markdown.matchAll(pattern)) {
    const filePath = decodeURIComponent(new URL(match[1]).pathname);
    const markerIndex = filePath.lastIndexOf(repositoryPathMarker);
    if (markerIndex < 0) fail();
    rows.push({
      path: normalizedRelativePath(filePath.slice(markerIndex + repositoryPathMarker.length)),
      sourceCommit: match[2],
      sourceBlob: match[3],
      sourceSha256: match[4],
      sourceMode: match[5]
    });
  }
  if (rows.length === 0) fail();
  return rows;
}

function validateClosure(closure) {
  exactKeys(closure, ["entryPoints", "expectedPaths", "manifestPaths", "nonTypeScriptBoundaries", "status"]);
  if (closure.status !== "pending" && closure.status !== "locked") fail();
  if (!Array.isArray(closure.entryPoints) || !Array.isArray(closure.expectedPaths)
    || !Array.isArray(closure.manifestPaths) || !Array.isArray(closure.nonTypeScriptBoundaries)) fail();
  const expectedPaths = closure.expectedPaths.map(normalizedRelativePath);
  const manifestPaths = closure.manifestPaths.map(normalizedRelativePath);
  const boundaries = closure.nonTypeScriptBoundaries.map(normalizedRelativePath);
  if (new Set(expectedPaths).size !== expectedPaths.length
    || new Set(manifestPaths).size !== manifestPaths.length
    || new Set(boundaries).size !== boundaries.length) fail();
  for (const entry of closure.entryPoints) {
    exactKeys(entry, ["path", "project", "role"]);
    normalizedRelativePath(entry.path);
    if (!entry.path.endsWith(".ts") || typeof entry.project !== "string" || typeof entry.role !== "string") fail();
  }
  if (closure.status === "pending" && manifestPaths.length !== 0) fail();
  if (closure.status === "locked") {
    if (expectedPaths.length === 0 || boundaries.some((path) => !expectedPaths.includes(path))
      || manifestPaths.length !== expectedPaths.length
      || manifestPaths.some((path, index) => path !== expectedPaths[index])) fail();
    for (const entry of closure.entryPoints) {
      if (!expectedPaths.includes(entry.path)) fail();
    }
  }
  if (requireClosure && closure.status !== "locked") fail();
}

let manifest;
let humanManifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  humanManifest = readFileSync(humanManifestPath, "utf8");
} catch {
  fail();
}

exactKeys(manifest, ["baseCommit", "closure", "rows", "schemaVersion", "secretScanDependencies"]);
if (manifest.schemaVersion !== 2 || !/^[0-9a-f]{40}$/.test(manifest.baseCommit)
  || !Array.isArray(manifest.rows) || manifest.rows.length === 0
  || !Array.isArray(manifest.secretScanDependencies)) fail();
validateClosure(manifest.closure);
if (runGit(["cat-file", "-t", manifest.baseCommit]).trim() !== "commit") fail();

const rowKeys = [
  "currentMode",
  "currentSha256",
  "evidenceState",
  "maxRestores",
  "path",
  "requireCurrent",
  "restoreAllowed",
  "sourceBlob",
  "sourceCommit",
  "sourceMode",
  "sourceSha256"
];
const seenPaths = new Set();
for (const row of manifest.rows) {
  if (!row || typeof row !== "object" || Array.isArray(row)) fail();
  const expectedKeys = row.requireCurrent ? rowKeys : rowKeys.filter((key) => !["currentMode", "currentSha256"].includes(key));
  exactKeys(row, expectedKeys);
  normalizedRelativePath(row.path);
  if (seenPaths.has(row.path)) fail();
  seenPaths.add(row.path);
  if (!/^[0-9a-f]{40}$/.test(row.sourceCommit)
    || !/^[0-9a-f]{40}$/.test(row.sourceBlob)
    || !/^[0-9a-f]{64}$/.test(row.sourceSha256)
    || !/^(100644|100755)$/.test(row.sourceMode)) fail();
  const policy = evidencePolicies.get(row.evidenceState);
  if (!policy || row.restoreAllowed !== policy.restoreAllowed || row.maxRestores !== policy.maxRestores) fail();
  if (typeof row.requireCurrent !== "boolean") fail();
  if (row.requireCurrent !== policy.requireCurrent) fail();
  if (row.requireCurrent && (!/^[0-9a-f]{64}$/.test(row.currentSha256)
    || !/^(100644|100755)$/.test(row.currentMode))) fail();

  if (runGit(["cat-file", "-t", row.sourceCommit]).trim() !== "commit") fail();
  const treeLine = runGit(["ls-tree", row.sourceCommit, "--", row.path]).trim();
  const treeMatch = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(treeLine);
  if (!treeMatch || treeMatch[1] !== row.sourceMode || treeMatch[2] !== row.sourceBlob || treeMatch[3] !== row.path) fail();

  const source = runGit(["show", `${row.sourceCommit}:${row.path}`], { encoding: null });
  if (sha256(Buffer.from(source)) !== row.sourceSha256) fail();

  if (row.requireCurrent) {
    const currentPath = resolve(repoRoot, row.path);
    if (!existsSync(currentPath) || currentMode(currentPath) !== row.currentMode) fail();
    if (sha256(readFileSync(currentPath)) !== row.currentSha256) fail();
  }
}

if (manifest.closure.status === "locked") {
  const closurePaths = new Set(manifest.closure.expectedPaths.map(normalizedRelativePath));
  const manifestClosurePaths = new Set(manifest.closure.manifestPaths.map(normalizedRelativePath));
  if (closurePaths.size !== manifestClosurePaths.size
    || [...closurePaths].some((path) => !manifestClosurePaths.has(path))
    || [...closurePaths].some((path) => !seenPaths.has(path))) fail();
}

const secretScanDependencies = manifest.secretScanDependencies.map(normalizedRelativePath);
if (new Set(secretScanDependencies).size !== secretScanDependencies.length) fail();
const closurePaths = new Set(manifest.closure.expectedPaths.map(normalizedRelativePath));
for (const path of secretScanDependencies) {
  if (!closurePaths.has(path) || !seenPaths.has(path)) fail();
}

const humanRows = parseHumanRows(humanManifest);
if (humanRows.length !== manifest.rows.length) fail();
const humanByPath = new Map(humanRows.map((row) => [row.path, row]));
for (const row of manifest.rows) {
  const human = humanByPath.get(row.path);
  const humanHash = row.requireCurrent ? row.currentSha256 : row.sourceSha256;
  if (!human || human.sourceCommit !== row.sourceCommit || human.sourceBlob !== row.sourceBlob
    || human.sourceSha256 !== humanHash || human.sourceMode !== row.sourceMode) fail();
}

process.stdout.write(`provenance_ok rows=${manifest.rows.length} closure=${manifest.closure.status}\n`);
