import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readCandidateManifest,
  validateSecretScanDependencies
} from "./2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs";

const repoRoot = process.cwd();
const allowedInvocations = new Set([
  "author-preflight\u0000scope-diagnostic",
  "governance-test\u0000scope-diagnostic-test"
]);

function fail() {
  process.stderr.write("scope_diagnostic_failed\n");
  process.exit(1);
}

function normalizePath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\")) fail();
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) fail();
  return path;
}

function fixtureRulePaths() {
  const scannerPath = resolve(
    repoRoot,
    "docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs"
  );
  const scannerSource = readFileSync(scannerPath, "utf8");
  return [...new Set([...scannerSource.matchAll(/\["([^\"]+\.tsx?)",\s*rule\(/g)]
    .map((match) => normalizePath(match[1])))].sort();
}

const args = process.argv.slice(2);
const roleArgument = args.find((argument) => argument.startsWith("--role="));
const phaseArgument = args.find((argument) => argument.startsWith("--phase="));
if (args.length !== 2 || new Set(args).size !== 2 || !roleArgument || !phaseArgument
  || !allowedInvocations.has(`${roleArgument.slice("--role=".length)}\u0000${phaseArgument.slice("--phase=".length)}`)) fail();

try {
  const manifest = readCandidateManifest(repoRoot);
  if (manifest.schemaVersion !== 2 || manifest.closure?.status !== "locked") fail();

  const closurePaths = [...new Set(manifest.closure.expectedPaths.map(normalizePath))];
  const manifestPaths = [...new Set(manifest.closure.manifestPaths.map(normalizePath))];
  if (closurePaths.length !== manifest.closure.expectedPaths.length
    || manifestPaths.length !== manifest.closure.manifestPaths.length
    || closurePaths.length !== manifestPaths.length
    || closurePaths.some((path, index) => path !== manifestPaths[index])) fail();

  const rows = new Map(manifest.rows.map((row) => [normalizePath(row.path), row]));
  if (rows.size !== manifest.rows.length || closurePaths.some((path) => !rows.has(path))) fail();

  const fixturePaths = fixtureRulePaths();
  const dependencyPaths = [...new Set(manifest.secretScanDependencies.map(normalizePath))].sort();
  if (dependencyPaths.length !== manifest.secretScanDependencies.length
    || fixturePaths.length !== dependencyPaths.length
    || fixturePaths.some((path, index) => path !== dependencyPaths[index])) fail();
  validateSecretScanDependencies(manifest, fixturePaths);

  const entrypointPaths = manifest.closure.entryPoints.map((entry) => normalizePath(entry.path)).sort();
  const correctionPaths = [
    "agent-runtime/test/mcpRegistry.correction.test.ts",
    "agent-runtime/test/traceOutbox.correction.test.ts"
  ];
  const mixedOriginalPaths = [
    "agent-runtime/test/mcpRegistry.test.ts",
    "agent-runtime/test/traceOutbox.test.ts"
  ];
  if (correctionPaths.some((path) => !entrypointPaths.includes(path))
    || mixedOriginalPaths.some((path) => entrypointPaths.includes(path))) fail();

  process.stdout.write("scope_diagnostic_ok\n");
  process.stdout.write(`entrypoint_paths=${JSON.stringify(entrypointPaths)}\n`);
  process.stdout.write(`secret_scan_dependency_paths=${JSON.stringify(dependencyPaths)}\n`);
  process.stdout.write(`correction_entrypoint_paths=${JSON.stringify(correctionPaths)}\n`);
  process.stdout.write(`mixed_original_entrypoint_paths=${JSON.stringify([])}\n`);
  process.stdout.write(`counts.entrypoints=${entrypointPaths.length}\n`);
  process.stdout.write(`counts.closure_paths=${closurePaths.length}\n`);
  process.stdout.write(`counts.manifest_rows=${manifest.rows.length}\n`);
  process.stdout.write(`counts.secret_scan_dependencies=${dependencyPaths.length}\n`);
  process.stdout.write(`counts.fixture_rule_paths=${fixturePaths.length}\n`);
} catch {
  fail();
}
