import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resolveCandidateBytes, validateSecretScanDependencies } from "./2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs";

const manifest = JSON.parse(readFileSync(
  new URL("./2026-08-05-gate-closure-persistence-fix-provenance-manifest.json", import.meta.url),
  "utf8"
));
const scannerSource = readFileSync(
  new URL("./2026-08-05-gate-closure-persistence-fix-secret-scan.mjs", import.meta.url),
  "utf8"
);
const diagnosticPath = fileURLToPath(new URL(
  "./2026-08-10-gate-closure-evidence-scope-diagnostic.mjs",
  import.meta.url
));

function fixtureRulePaths() {
  return [...scannerSource.matchAll(/\["([^"]+\.tsx?)",\s*rule\(/g)]
    .map(match => match[1]);
}

test("manifest declares an explicit versioned secret-scan dependency set", () => {
  assert.equal(manifest.schemaVersion, 2);
  assert.ok(Array.isArray(manifest.secretScanDependencies));
  assert.ok(manifest.secretScanDependencies.length > 0);
  assert.equal(
    new Set(manifest.secretScanDependencies).size,
    manifest.secretScanDependencies.length
  );
});

test("every scanner fixture rule path is declared by the dependency set", () => {
  const declared = new Set(manifest.secretScanDependencies ?? []);
  const missing = [...new Set(fixtureRulePaths())].filter(path => !declared.has(path));
  assert.deepEqual(missing, []);
});

test("every scanner dependency is a locked closure path with one provenance row", () => {
  const closure = new Set(manifest.closure?.expectedPaths ?? []);
  const rows = new Map((manifest.rows ?? []).map(row => [row.path, row]));
  for (const path of manifest.secretScanDependencies ?? []) {
    assert.equal(closure.has(path), true, `dependency outside closure: ${path}`);
    assert.equal(rows.has(path), true, `dependency without provenance row: ${path}`);
  }
});

test("dependency validation rejects a fixture rule outside the declared set", () => {
  assert.throws(
    () => validateSecretScanDependencies({
      closure: { expectedPaths: ["candidate.ts"] },
      secretScanDependencies: [],
      rows: [{ path: "candidate.ts" }]
    }, ["candidate.ts"]),
    /dependency/i
  );
});

test("dependency validation rejects duplicate and unbound rows", () => {
  assert.throws(
    () => validateSecretScanDependencies({
      closure: { expectedPaths: ["candidate.ts"] },
      secretScanDependencies: ["candidate.ts", "candidate.ts"],
      rows: [{ path: "candidate.ts" }]
    }, ["candidate.ts"]),
    /unique/i
  );
  assert.throws(
    () => validateSecretScanDependencies({
      closure: { expectedPaths: ["candidate.ts"] },
      secretScanDependencies: ["candidate.ts"],
      rows: []
    }, ["candidate.ts"]),
    /row/i
  );
});

test("source-pinned dependencies resolve from Git rather than the dirty worktree", () => {
  const row = manifest.rows.find(candidate => !candidate.requireCurrent);
  assert.ok(row);
  const bytes = resolveCandidateBytes(process.cwd(), row);
  assert.ok(Buffer.isBuffer(bytes));
  assert.ok(bytes.length > 0);
  const pinned = spawnSync("git", [
    "--no-optional-locks",
    "show",
    `${row.sourceCommit}:${row.path}`
  ], { cwd: process.cwd(), encoding: null });
  assert.equal(pinned.status, 0);
  assert.deepEqual(bytes, Buffer.from(pinned.stdout));
});

test("the two mixed originals are not correction-only entrypoints", () => {
  const entryPaths = new Set((manifest.closure?.entryPoints ?? []).map(entry => entry.path));
  assert.equal(entryPaths.has("agent-runtime/test/mcpRegistry.test.ts"), false);
  assert.equal(entryPaths.has("agent-runtime/test/traceOutbox.test.ts"), false);
  assert.equal(fixtureRulePaths().includes("agent-runtime/test/mcpRegistry.test.ts"), false);
  assert.equal(fixtureRulePaths().includes("agent-runtime/test/traceOutbox.test.ts"), false);
  assert.equal(entryPaths.has("agent-runtime/test/mcpRegistry.correction.test.ts"), true);
  assert.equal(entryPaths.has("agent-runtime/test/traceOutbox.correction.test.ts"), true);
});

test("scope diagnostic accepts only its declared role and phase", () => {
  const result = spawnSync(process.execPath, [
    diagnosticPath,
    "--role=governance-test",
    "--phase=scope-diagnostic-test"
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^scope_diagnostic_ok$/m);
  assert.match(result.stdout, /entrypoint_paths=/);
  assert.match(result.stdout, /secret_scan_dependency_paths=/);
  assert.doesNotMatch(result.stdout, /Bearer|OPENHARNESS|(?:sk|rk|pk)-/i);
});

test("scope diagnostic rejects unknown and sensitive-shaped arguments", () => {
  const result = spawnSync(process.execPath, [
    diagnosticPath,
    "--role=governance-test",
    "--phase=scope-diagnostic-test",
    "--token=redacted"
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`, "scope_diagnostic_failed\n");
});
