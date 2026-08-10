import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const evidenceRoots = [
  "docs/verification/agent-runtime-v1/providers",
  "docs/verification/agent-runtime-v1/gate-d",
  "docs/verification/agent-runtime-v1/baseline",
  "docs/verification/agent-runtime-v1/tools"
];
const testRoots = ["agent-runtime/test", "packages/shared-schema/test", "integration-tests/test"];
const sourceRoots = ["agent-runtime/src", "packages/shared-schema/src", "integration-tests/src"];

function rule(entries) {
  return new Map(entries);
}

const fixtureLiteralRules = new Map([
  ["agent-runtime/test/agentExecutionRunner.test.ts", rule([["sensitive:authorization:e47800f0be84febf6a4f71ff92d9ddf6c531f7e6fba972659598a6eec12620c2", 1]])],
  ["agent-runtime/test/agentRuntime.test.ts", rule([
    ["bearer:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 1],
    ["sensitive:authorization:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 1]
  ])],
  ["agent-runtime/test/approvalTimeout.test.ts", rule([["sensitive:authorization:e47800f0be84febf6a4f71ff92d9ddf6c531f7e6fba972659598a6eec12620c2", 1]])],
  ["agent-runtime/test/codexPendingTurn.test.ts", rule([
    ["bearer:64d7efad441708af69c9eef019556d897f823f86fa95ad58e510a0ca44967525", 2],
    ["sensitive:authorization:64d7efad441708af69c9eef019556d897f823f86fa95ad58e510a0ca44967525", 1]
  ])],
  ["agent-runtime/test/executionTimeout.test.ts", rule([["sensitive:authorization:e47800f0be84febf6a4f71ff92d9ddf6c531f7e6fba972659598a6eec12620c2", 1]])],
  ["agent-runtime/test/formalSoakExecution.test.ts", rule([
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 9],
    ["bearer:d534cec29d6b6528486229e98fd08608baac8046cb4c83ab3a276281c259eed4", 2],
    ["bearer:95c22df499e1fb7abd7f944541d3e9c893788d7f8a23dba2c89288533a5d7065", 1]
  ])],
  ["agent-runtime/test/gateCProviderPolicy.test.ts", rule([])],
  ["agent-runtime/test/gateDPerformanceDiagnostics.test.ts", rule([
    ["bearer:86e774bff90b0fe5f8ec00ffd9e579c653705ca16285d09d992ae2bfb58bc308", 3],
    ["canary:8285291beb771a1092bc63a63d537d9ef440127190bd5ee2c097e87d7bff7e41", 1],
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 7]
  ])],
  ["agent-runtime/test/localBaselineSampler.test.ts", rule([["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 1]])],
  ["agent-runtime/test/productionRunnerPersistence.test.ts", rule([["sensitive:authorization:e47800f0be84febf6a4f71ff92d9ddf6c531f7e6fba972659598a6eec12620c2", 1]])],
  ["agent-runtime/test/productionServerLifecycle.test.ts", rule([
    ["bearer:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 4],
    ["sensitive:authorization:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 4]
  ])],
  ["agent-runtime/test/qualificationRedaction.test.ts", rule([
    ["bearer:c23ede5f710e3a0d9874e257807515d41d92b078286452499dee8440e939f932", 3],
    ["sensitive:authorization:c23ede5f710e3a0d9874e257807515d41d92b078286452499dee8440e939f932", 1]
  ])],
  ["agent-runtime/test/qualificationReport.test.ts", rule([
    ["bearer:0c6e4493920989c327f6e0bac2948b17b71d119dbc9fdafb75435df6e0b87d4c", 1],
    ["sensitive:authorization:0c6e4493920989c327f6e0bac2948b17b71d119dbc9fdafb75435df6e0b87d4c", 1]
  ])],
  ["agent-runtime/test/runtimeChatLifecycleLog.test.ts", rule([
    ["bearer:64d7efad441708af69c9eef019556d897f823f86fa95ad58e510a0ca44967525", 1],
    ["sensitive:authorization:64d7efad441708af69c9eef019556d897f823f86fa95ad58e510a0ca44967525", 1]
  ])],
  ["agent-runtime/test/runtimeStorageAdmission.test.ts", rule([
    ["bearer:68de4003731e9a5d609f80b94cc3a8064344b2eaf9173172c840fc88b18567ea", 1],
    ["bearer:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 1],
    ["sensitive:authorization:68de4003731e9a5d609f80b94cc3a8064344b2eaf9173172c840fc88b18567ea", 1],
    ["sensitive:authorization:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 1]
  ])],
  ["agent-runtime/test/serviceAuth.test.ts", rule([
    ["bearer:8fac0aef7838c4b46012eddf3e5a3bea6ecf9daac1f2da141ba6e6de827e72b9", 2],
    ["sensitive:authorization:1a3ffb6a90d519dcb2034911e8f96152fc4e4f51d61695a8a5a42f68541555be", 1],
    ["sensitive:authorization:8fac0aef7838c4b46012eddf3e5a3bea6ecf9daac1f2da141ba6e6de827e72b9", 2]
  ])],
  ["agent-runtime/test/terminalErrors.test.ts", rule([["sensitive:authorization:e47800f0be84febf6a4f71ff92d9ddf6c531f7e6fba972659598a6eec12620c2", 1]])],
  ["agent-runtime/test/traceOutbox.test.ts", rule([
    ["bearer:ca64faa2f21a66699571463505fdf124b2046e98f1424f3bc28cb3e199ebd68f", 2],
    ["sensitive:authorization:ca64faa2f21a66699571463505fdf124b2046e98f1424f3bc28cb3e199ebd68f", 2]
  ])],
  ["packages/shared-schema/test/schema.test.ts", rule([["sensitive:authorization:bffde20413347b7a00e1363de3f97ca69e419dc0aea55f4a4a75018fab3a0e8e", 1]])],
  ["integration-tests/test/p0a.integration.test.ts", rule([
    ["bearer:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 2],
    ["sensitive:authorization:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 2]
  ])],
  ["integration-tests/test/p0b.integration.test.ts", rule([
    ["bearer:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 1],
    ["sensitive:authorization:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 1]
  ])],
  ["agent-runtime/test/agentRuntime.test.ts", rule([
    ["bearer:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 1],
    ["sensitive:authorization:e6851af8c176eb8682f730c1baf372c0c9ca07439a42c3d8f4ca20ba833be6c4", 1],
    ["sensitive:servicetoken:b026280aade7739ad61dae6998b883b83d2d6d514901cb99f316f172016c7e3f", 1]
  ])],
  ["agent-runtime/test/formalSoakCli.test.ts", rule([
    ["sensitive:servicetoken:da0f349908ed5aed98dec9a2b4a649e2a87e74a76e7c40ec15a17f5f90d3f1e7", 1],
    ["sensitive:service-token:da0f349908ed5aed98dec9a2b4a649e2a87e74a76e7c40ec15a17f5f90d3f1e7", 1]
  ])],
  ["agent-runtime/test/formalSoakExecution.test.ts", rule([
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 9],
    ["bearer:d534cec29d6b6528486229e98fd08608baac8046cb4c83ab3a276281c259eed4", 2],
    ["bearer:95c22df499e1fb7abd7f944541d3e9c893788d7f8a23dba2c89288533a5d7065", 1],
    ["sensitive:service-token:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", 1],
    ["sensitive:servicetoken:da0f349908ed5aed98dec9a2b4a649e2a87e74a76e7c40ec15a17f5f90d3f1e7", 9],
    ["sensitive:servicetoken:d9cb3f5bd0dd06b6e72f487507852bedd0c56598cec275bce5a0cbdaf3d3b673", 4],
    ["sensitive:api-key:b724cefed00ebe5fd3058ef02a2f7a3a7967f0a37e60f2660f5263447f6faa1d", 1],
    ["sensitive:api-key:9cbbbfb350d0e60ee0dbae7df8806c77a626a15a7311a6fc63382ef4ff6827fe", 1],
    ["sensitive:service-token:d9cb3f5bd0dd06b6e72f487507852bedd0c56598cec275bce5a0cbdaf3d3b673", 1],
    ["sensitive:servicetoken:6207561e92da6945c59a1c54ba7bee39841f0d9c932457156aa2764587433f91", 1],
    ["sensitive:servicetoken:c4570f4c7f05b36da265ba247ac31180aa168e7ed67e976319a6742681c770c7", 1],
    ["sensitive:servicetoken:96820dfd08df73515beece5adfea687bed8e38234e63ff1b8251d5d20af172e4", 1],
    ["sensitive:service-token:da0f349908ed5aed98dec9a2b4a649e2a87e74a76e7c40ec15a17f5f90d3f1e7", 1]
  ])],
  ["agent-runtime/test/gateCProviderPolicy.test.ts", rule([])],
  ["agent-runtime/test/gateDPerformanceDiagnostics.test.ts", rule([
    ["bearer:86e774bff90b0fe5f8ec00ffd9e579c653705ca16285d09d992ae2bfb58bc308", 3],
    ["canary:8285291beb771a1092bc63a63d537d9ef440127190bd5ee2c097e87d7bff7e41", 1],
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 7],
    ["provider-key:5e6720713c8ced598097cf4bff99fea6a92ff80942dda34d4d18cdf145040d38", 1],
    ["sensitive:servicetoken:a495a4608744a5ac548be33567a0b602ad1ce007f47a1abefbab8a571481463b", 1],
    ["sensitive:servicetoken:96cdd2fa99e9d5729e97109f1d33bb10fc042ca7e125f2ea675a579ad757092d", 1],
    ["sensitive:servicetoken:a954fc0f2f00bb3a8a29a4556649ac783d8f79c67c421e4b6b75975d2f715c22", 2],
    ["sensitive:service-token:a954fc0f2f00bb3a8a29a4556649ac783d8f79c67c421e4b6b75975d2f715c22", 1],
    ["sensitive:servicetoken:2f5b78396adc3b6cb3d9c5ff6a5e428e1f53caf69e6e40e3caa9155c898f56ae", 1],
    ["sensitive:service-token:2f5b78396adc3b6cb3d9c5ff6a5e428e1f53caf69e6e40e3caa9155c898f56ae", 4]
  ])],
  ["agent-runtime/test/jsonImporter.test.ts", rule([
    ["provider-key:c0fccc65dc27b87b682c2abd603df0817148a87a031a10eb2c1ae781ef922e09", 2]
  ])],
  ["agent-runtime/test/mcpRegistry.test.ts", rule([
    ["sensitive:service-token:6541f48460214a1e86c4d0603880d3c42e51f3e80184c4e3db6f07e4f6e60db1", 1],
    ["sensitive:api-key:6541f48460214a1e86c4d0603880d3c42e51f3e80184c4e3db6f07e4f6e60db1", 1]
  ])],
  ["agent-runtime/test/productionEntrypoint.test.ts", rule([
    ["sensitive:service-token:784c8e01994654a577f492116789bb8d9153c8774836fc8cb6bfa2cc773ae549", 3],
    ["sensitive:servicetoken:784c8e01994654a577f492116789bb8d9153c8774836fc8cb6bfa2cc773ae549", 1]
  ])],
  ["agent-runtime/test/productionServerLifecycle.test.ts", rule([
    ["bearer:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 4],
    ["sensitive:authorization:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 4],
    ["sensitive:servicetoken:784c8e01994654a577f492116789bb8d9153c8774836fc8cb6bfa2cc773ae549", 12],
    ["sensitive:servicetoken:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", 1],
    ["sensitive:service-token:784c8e01994654a577f492116789bb8d9153c8774836fc8cb6bfa2cc773ae549", 1]
  ])],
  ["agent-runtime/test/qualificationRedaction.test.ts", rule([
    ["bearer:c23ede5f710e3a0d9874e257807515d41d92b078286452499dee8440e939f932", 3],
    ["sensitive:authorization:c23ede5f710e3a0d9874e257807515d41d92b078286452499dee8440e939f932", 1],
    ["provider-key:c0fccc65dc27b87b682c2abd603df0817148a87a031a10eb2c1ae781ef922e09", 3],
    ["provider-key:a03d43d254a4ccb8f1921be6b2037423b14cd1d0bd460164980730e0fd1948f8", 1],
    ["sensitive:x-api-key:c0fccc65dc27b87b682c2abd603df0817148a87a031a10eb2c1ae781ef922e09", 1],
    ["sensitive:apikey:024f6c9525465fbec0047e2686f02a413c52241fde8af273148c419fa18fb312", 1]
  ])],
  ["agent-runtime/test/runtimeStorageAdmission.test.ts", rule([
    ["bearer:68de4003731e9a5d609f80b94cc3a8064344b2eaf9173172c840fc88b18567ea", 1],
    ["bearer:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 1],
    ["sensitive:authorization:68de4003731e9a5d609f80b94cc3a8064344b2eaf9173172c840fc88b18567ea", 1],
    ["sensitive:authorization:6fff43b45fb8776548b78ae5c938be97a9a74e48edd3fcba9da94ad4875a8256", 1],
    ["sensitive:servicetoken:784c8e01994654a577f492116789bb8d9153c8774836fc8cb6bfa2cc773ae549", 2]
  ])],
  ["agent-runtime/test/serviceAuth.test.ts", rule([
    ["bearer:8fac0aef7838c4b46012eddf3e5a3bea6ecf9daac1f2da141ba6e6de827e72b9", 2],
    ["sensitive:authorization:1a3ffb6a90d519dcb2034911e8f96152fc4e4f51d61695a8a5a42f68541555be", 1],
    ["sensitive:authorization:8fac0aef7838c4b46012eddf3e5a3bea6ecf9daac1f2da141ba6e6de827e72b9", 2],
    ["sensitive:servicetoken:2f5b78396adc3b6cb3d9c5ff6a5e428e1f53caf69e6e40e3caa9155c898f56ae", 3]
  ])],
  ["agent-runtime/src/baseline/formalSoakCli.ts", rule([
    ["sensitive:authorization:c4732b096aa97deaa08cb96c49706fc4b9cfd6134321355f957640ab9e29ad02", 1]
  ])],
  ["agent-runtime/src/baseline/formalSoakExecution.ts", rule([
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 6],
    ["sensitive:authorization:8090c7cd8b61ae295d02ea6e5df2620fa55456f2b9872ca8c7ee91676feccdde", 1],
    ["sensitive:authorization:b032ee594a2bce301bce1bf36de43d0720e0f38bd8d6cd5c6b6c53621fc9297f", 1]
  ])],
  ["agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts", rule([
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 1]
  ])],
  ["agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts", rule([
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 3]
  ])],
  ["agent-runtime/src/baseline/localBaseline.ts", rule([
    ["canary:f9be458ae2c8ca4d20ac591e03402f9cfbf735eec0c95c609609cb6768f994f6", 1]
  ])],
  ["agent-runtime/src/evalReplayHarness.ts", rule([
    ["sensitive:authorization:0193b3ab5654dd8f47bbf1479e64e857c634ecdeb14c8b7519807b4de3b25a93", 1]
  ])],
  ["agent-runtime/src/server.ts", rule([
    ["sensitive:authorization:8090c7cd8b61ae295d02ea6e5df2620fa55456f2b9872ca8c7ee91676feccdde", 3],
    ["sensitive:authorization:efa35a8ebb9ca97004f279c8ce03e08c25883a50f7208bbdc44f45ed7479c0f1", 1]
  ])]
]);

const rawSecretPattern = /OPENHARNESS_SECRET_CANARY|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9_-]{7,}\b/i;
const rawSecretPatternGlobal = /OPENHARNESS_SECRET_CANARY|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9_-]{7,}\b/gi;
const sensitiveAssignmentPattern = /["'`]?((?:authorization|access[_-]?token|refresh[_-]?token|oauth[_-]?access[_-]?token|oauth[_-]?refresh[_-]?token|api[_-]?key|x-api-key|provider[_-]?key|service[_-]?token|client[_-]?secret|secret[_-]?key))["'`]?\s*[:=]\s*(["'`])([^"'`]*?)\2/gi;
const sensitiveKeyPattern = /^(authorization|access[-_]?token|refresh[-_]?token|oauth[-_]?access[-_]?token|oauth[-_]?refresh[-_]?token|api[-_]?key|x-api-key|provider[-_]?key|service[-_]?token|client[-_]?secret|secret[-_]?key)$/i;
const readableExtensions = new Set([".cjs", ".js", ".json", ".jsonl", ".mjs", ".md", ".log", ".txt", ".ts", ".tsx"]);

function fail() {
  process.stderr.write("secret_scan_failed\n");
  process.exit(1);
}

function filesUnder(root) {
  const result = [];
  if (!existsSync(root)) return result;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        if (!readableExtensions.has(extname(entry.name))) fail();
        result.push(path);
      } else {
        fail();
      }
    }
  };
  walk(root);
  return result;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function collectSensitiveLiterals(text) {
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

function objectContainsSecret(value, key = "") {
  if (typeof value === "string") {
    return rawSecretPattern.test(value) || (sensitiveKeyPattern.test(key) && value !== "[REDACTED]");
  }
  if (Array.isArray(value)) return value.some((child) => objectContainsSecret(child, key));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([childKey, child]) => objectContainsSecret(child, childKey));
  }
  return false;
}

function fileContainsSecret(path) {
  const text = readFileSync(path, "utf8");
  if (rawSecretPattern.test(text)) return true;
  if (collectSensitiveLiterals(text).size > 0) return true;
  if (path.endsWith(".json")) return objectContainsSecret(JSON.parse(text));
  if (path.endsWith(".jsonl")) {
    return text.split("\n").filter(Boolean).some((line) => objectContainsSecret(JSON.parse(line)));
  }
  return false;
}

for (const root of evidenceRoots) {
  for (const path of filesUnder(root)) {
    try {
      if (fileContainsSecret(path)) fail(`evidence:${path}`);
    } catch {
      fail(`evidence-parse:${path}`);
    }
  }
}

for (const root of sourceRoots) {
  for (const path of filesUnder(root)) {
    try {
      const relativePath = path.replaceAll("\\", "/");
      const actual = collectSensitiveLiterals(readFileSync(path, "utf8"));
      const expected = fixtureLiteralRules.get(relativePath) ?? new Map();
      if (actual.size !== expected.size || [...actual].some(([key, count]) => expected.get(key) !== count)) {
        fail(`source:${relativePath}`);
      }
    } catch {
      fail(`source-parse:${path}`);
    }
  }
}

for (const root of testRoots) {
  for (const path of filesUnder(root)) {
    const relativePath = path.replaceAll("\\", "/");
    const actual = collectSensitiveLiterals(readFileSync(path, "utf8"));
    const expected = fixtureLiteralRules.get(relativePath) ?? new Map();
    if (actual.size !== expected.size || [...actual].some(([key, count]) => expected.get(key) !== count)) {
      fail(`test:${relativePath}`);
    }
  }
}

process.stdout.write("secret_scan_ok\n");
