import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const manifestPath = resolve(
  repoRoot,
  "docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json"
);
const requireLocked = process.argv.includes("--require-locked");

function fail() {
  process.stderr.write("closure_check_failed\n");
  process.exit(1);
}

function normalizePath(path) {
  return path.split("\\").join("/");
}

function relativePath(path) {
  const normalized = normalizePath(relative(repoRoot, path));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    fail();
  }
  return normalized;
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail();
  }
}

function readProjectOptions(ts, tsconfigPath) {
  const absolutePath = resolve(repoRoot, tsconfigPath);
  const result = ts.readConfigFile(absolutePath, ts.sys.readFile);
  if (result.error) fail();
  const parsed = ts.parseJsonConfigFileContent(
    result.config,
    ts.sys,
    resolve(absolutePath, ".."),
    undefined,
    absolutePath
  );
  if (parsed.errors.length > 0) fail();
  return parsed.options;
}

function isWorkspaceSource(ts, sourceFile) {
  const absolutePath = resolve(sourceFile.fileName);
  const rootPrefix = `${repoRoot.replaceAll("\\", "/")}/`;
  const normalizedAbsolutePath = normalizePath(absolutePath);
  if (normalizedAbsolutePath !== normalizePath(repoRoot) && !normalizedAbsolutePath.startsWith(rootPrefix)) return false;
  const path = relativePath(absolutePath);
  if (path.includes("/node_modules/") || path.startsWith("node_modules/")) return false;
  return [".cjs", ".js", ".json", ".mjs", ".ts", ".tsx"].some((extension) => path.endsWith(extension));
}

const manifest = readManifest();
const closure = manifest.closure;
if (!closure || closure.status !== "pending" && closure.status !== "locked") fail();
if (!Array.isArray(closure.entryPoints) || !Array.isArray(closure.nonTypeScriptBoundaries)
  || !Array.isArray(closure.expectedPaths) || !Array.isArray(closure.manifestPaths)) fail();
if (!Array.isArray(manifest.secretScanDependencies)) fail();

const expectedEntryPoints = new Map([
  ["agent-runtime", "agent-runtime/tsconfig.json"],
  ["integration-tests", "integration-tests/tsconfig.json"]
]);
const canonicalEntryPoints = [
  ["agent-runtime/src/index.ts", "agent-runtime", "startup"],
  ["agent-runtime/src/qualification/gateCProviderReconcileCli.ts", "agent-runtime", "gate-c-cli"],
  ["agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts", "agent-runtime", "gate-d-cli"],
  ["agent-runtime/src/baseline/formalSoakCli.ts", "agent-runtime", "formal-soak-cli"],
  ["integration-tests/test/p1b.integration.test.ts", "integration-tests", "p1b"],
  ["agent-runtime/test/jsonFileHistoryStore.test.ts", "agent-runtime", "json-persistence"],
  ["agent-runtime/test/gateCProviderPolicy.test.ts", "agent-runtime", "gate-c-test"],
  ["agent-runtime/test/gateDPerformanceDiagnostics.test.ts", "agent-runtime", "gate-d-test"],
  ["agent-runtime/test/formalSoakCli.test.ts", "agent-runtime", "formal-soak-cli-test"],
  ["agent-runtime/test/formalSoakExecution.test.ts", "agent-runtime", "formal-soak-execution-test"],
  ["agent-runtime/test/formalSoakRunner.test.ts", "agent-runtime", "formal-soak-runner-test"],
  ["agent-runtime/test/productionEntrypoint.test.ts", "agent-runtime", "production-entrypoint-test"],
  ["agent-runtime/test/productionRunnerPersistence.test.ts", "agent-runtime", "production-persistence-test"],
  ["agent-runtime/test/productionServerLifecycle.test.ts", "agent-runtime", "production-server-test"],
  ["agent-runtime/test/productionStartupScript.test.ts", "agent-runtime", "production-startup-test"],
  ["agent-runtime/test/mcpRegistry.correction.test.ts", "agent-runtime", "mcp-correction-test"],
  ["agent-runtime/test/traceOutbox.correction.test.ts", "agent-runtime", "trace-outbox-correction-test"]
];
const canonicalBoundaries = [
  "agent-runtime/scripts/start-production-runtime.sh",
  "agent-runtime/package.json",
  "agent-runtime/tsconfig.json",
  "integration-tests/package.json",
  "integration-tests/tsconfig.json",
  "packages/shared-schema/package.json",
  "packages/shared-schema/tsconfig.json",
  "frontend/package.json",
  "frontend/tsconfig.json",
  "frontend/vite.config.ts",
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "tsconfig.base.json"
];
const projects = new Map();
for (const entry of closure.entryPoints) {
  if (!entry || typeof entry.path !== "string" || typeof entry.project !== "string"
    || typeof entry.role !== "string" || !expectedEntryPoints.has(entry.project)) fail();
  if (projects.has(entry.project)) {
    projects.get(entry.project).push(entry.path);
  } else {
    projects.set(entry.project, [entry.path]);
  }
  const entryPath = resolve(repoRoot, entry.path);
  if (!existsSync(entryPath) || !entry.path.endsWith(".ts")) fail();
}

for (const boundary of closure.nonTypeScriptBoundaries) {
  if (typeof boundary !== "string" || !boundary || boundary.startsWith("/") || boundary.includes("\\")
    || boundary.split("/").some((part) => !part || part === "." || part === "..")) fail();
  if (closure.status === "locked" && !existsSync(resolve(repoRoot, boundary))) fail();
}

const canonicalEntryPointKey = ([path, project, role]) => `${path}\u0000${project}\u0000${role}`;
const expectedEntryPointKeys = new Set(canonicalEntryPoints.map(canonicalEntryPointKey));
const actualEntryPointKeys = new Set(
  closure.entryPoints.map((entry) => canonicalEntryPointKey([entry.path, entry.project, entry.role]))
);
if (actualEntryPointKeys.size !== closure.entryPoints.length
  || actualEntryPointKeys.size !== expectedEntryPointKeys.size
  || [...expectedEntryPointKeys].some((key) => !actualEntryPointKeys.has(key))) fail();

const expectedBoundarySet = new Set(canonicalBoundaries);
const actualBoundarySet = new Set(closure.nonTypeScriptBoundaries.map(normalizePath));
if (actualBoundarySet.size !== closure.nonTypeScriptBoundaries.length
  || actualBoundarySet.size !== expectedBoundarySet.size
  || [...expectedBoundarySet].some((path) => !actualBoundarySet.has(path))) fail();

const secretScanDependencySet = new Set(manifest.secretScanDependencies.map((path) => {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\")
    || path.split("/").some((part) => !part || part === "." || part === "..")) fail();
  return normalizePath(path);
}));
if (secretScanDependencySet.size !== manifest.secretScanDependencies.length) fail();
if (closure.status === "locked" && [...secretScanDependencySet].some((path) => !existsSync(resolve(repoRoot, path)))) fail();

let ts;
try {
  ts = require("typescript");
} catch {
  fail();
}

const actual = new Set(closure.nonTypeScriptBoundaries.map(normalizePath));
for (const [project, entryPaths] of projects) {
  const options = readProjectOptions(ts, expectedEntryPoints.get(project));
  const program = ts.createProgram(
    entryPaths.map((entryPath) => resolve(repoRoot, entryPath)),
    { ...options, noEmit: true }
  );
  for (const sourceFile of program.getSourceFiles()) {
    if (isWorkspaceSource(ts, sourceFile)) actual.add(relativePath(sourceFile.fileName));
  }
}
for (const path of secretScanDependencySet) actual.add(path);

const expected = new Set(closure.expectedPaths.map(normalizePath));
const manifestClosure = new Set(closure.manifestPaths.map(normalizePath));
if (expected.size !== closure.expectedPaths.length || manifestClosure.size !== closure.manifestPaths.length) fail();
if (closure.status === "locked" || requireLocked) {
  if (closure.status !== "locked" || expected.size === 0
    || expected.size !== manifestClosure.size
    || [...expected].some((path) => !manifestClosure.has(path))) fail();
  const manifestRows = new Set(
    Array.isArray(manifest.rows) ? manifest.rows.map((row) => normalizePath(row.path)) : []
  );
  if ([...expected].some((path) => !manifestRows.has(path))) fail();
  if (actual.size !== expected.size || [...actual].some((path) => !expected.has(path))) fail();
  if ([...secretScanDependencySet].some((path) => !expected.has(path))) fail();
  process.stdout.write(`closure_ok entries=${closure.entryPoints.length} paths=${actual.size}\n`);
  process.exit(0);
}

process.stdout.write(`closure_pending entries=${closure.entryPoints.length} paths=${actual.size}\n`);
