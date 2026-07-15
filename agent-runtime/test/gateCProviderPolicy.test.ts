import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QualificationReportSchema, type QualificationReport } from "@openharness/shared-schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTHORIZED_CODEX_REPORT_SHA256,
  REQUIRED_CODEX_ROW_IDS,
  evaluateGateCProviderQualification
} from "../src/qualification/gateCProviderPolicy";
import { runGateCProviderReconciliation } from "../src/qualification/gateCProviderReconcileCli";

const CLIENT_SHA = "08b2aa0126f78ca45aad239e20981ad06b6e796539a1edc498706f2b81833ddc";
const GENERATED_AT = "2026-07-15T00:00:00.000Z";
const ADVISORY_SHA = "c".repeat(64);
const temporaryRoots: string[] = [];
type QualificationRow = QualificationReport["rows"][number];

function requiredRow(id: string, overrides: Partial<QualificationRow> = {}): QualificationRow {
  return {
    id,
    required: true,
    track: "production",
    environment: {
      provider: "codex-app-server",
      qualificationAuthorization: "granted",
      credentialState: "not-read",
      clientImplementationSha256: CLIENT_SHA
    },
    protocolVersion: "codex-app-server-v1",
    capabilities: [id],
    requestHash: "d".repeat(64),
    observed: id === "codex-real-redaction"
      ? { rawCanaryObserved: false, redactionMarkerObserved: true }
      : {},
    oracle: id === "codex-real-redaction"
      ? { rawCanaryObserved: false, redactionMarkerObserved: true }
      : {},
    durationMs: 1,
    result: "pass",
    ...overrides
  };
}

function codexReport(overrides: Partial<QualificationReport> = {}): QualificationReport {
  return QualificationReportSchema.parse({
    track: "production",
    generatedAt: "2026-07-12T08:00:00.000Z",
    result: "pass",
    rows: REQUIRED_CODEX_ROW_IDS.map((id) => requiredRow(id)),
    ...overrides
  });
}

function advisoryReport(result: "pass" | "fail" | "blocked"): QualificationReport {
  return QualificationReportSchema.parse({
    track: "production",
    generatedAt: "2026-07-14T08:00:00.000Z",
    result,
    rows: [requiredRow("zhipu-sync", {
      required: false,
      environment: { provider: "zhipu" },
      result: result === "pass" ? "pass" : result
    })]
  });
}

function evaluate(report = codexReport(), advisory = [advisoryReport("blocked"), advisoryReport("fail")]) {
  return evaluateGateCProviderQualification({
    generatedAt: GENERATED_AT,
    codex: {
      path: "docs/verification/codex.json",
      sha256: AUTHORIZED_CODEX_REPORT_SHA256,
      report
    },
    codexClientSourceSha256: CLIENT_SHA,
    advisory: advisory.map((item, index) => ({
      path: `docs/verification/advisory-${index}.json`,
      sha256: index === 0 ? ADVISORY_SHA : "e".repeat(64),
      report: item
    }))
  });
}

describe("Gate C provider policy", () => {
  afterEach(() => {
    for (const root of temporaryRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    temporaryRoots.length = 0;
  });

  it("passes required Codex evidence while preserving advisory blocked and fail results", () => {
    const decision = evaluate();

    expect(decision.result).toBe("pass");
    expect(decision.blockers).toEqual([]);
    expect(decision.required.requiredRowIds).toEqual([...REQUIRED_CODEX_ROW_IDS]);
    expect(decision.advisory.map((item) => item.reportResult)).toEqual(["blocked", "fail"]);
  });

  it("blocks required Codex failures and missing or extra required rows", () => {
    const blockedRow = requiredRow("codex-real-sync", { result: "blocked" });
    const blockedReport = QualificationReportSchema.parse({
      ...codexReport(),
      result: "blocked",
      rows: [blockedRow, ...REQUIRED_CODEX_ROW_IDS.slice(1).map((id) => requiredRow(id))]
    });
    expect(evaluate(blockedReport).result).toBe("blocked");

    expect(evaluate(codexReport({ rows: REQUIRED_CODEX_ROW_IDS.slice(0, -1).map((id) => requiredRow(id)) })).result)
      .toBe("blocked");
    expect(evaluate(codexReport({ rows: [
      ...REQUIRED_CODEX_ROW_IDS.map((id) => requiredRow(id)),
      requiredRow("codex-real-extra")
    ] })).result).toBe("blocked");
  });

  it("blocks invalid provider authorization, credential state, and source binding", () => {
    for (const environment of [
      { provider: "mock-codex", qualificationAuthorization: "granted", credentialState: "not-read", clientImplementationSha256: CLIENT_SHA },
      { provider: "codex-app-server", qualificationAuthorization: "missing", credentialState: "not-read", clientImplementationSha256: CLIENT_SHA },
      { provider: "codex-app-server", qualificationAuthorization: "granted", credentialState: "read", clientImplementationSha256: CLIENT_SHA },
      { provider: "codex-app-server", qualificationAuthorization: "granted", credentialState: "not-read", clientImplementationSha256: "f".repeat(64) }
    ]) {
      const rows = REQUIRED_CODEX_ROW_IDS.map((id) => requiredRow(id, { environment }));
      expect(evaluate(codexReport({ rows })).result).toBe("blocked");
    }
    expect(evaluateGateCProviderQualification({
      generatedAt: GENERATED_AT,
      codex: { path: "codex.json", sha256: "0".repeat(64), report: codexReport() },
      codexClientSourceSha256: CLIENT_SHA,
      advisory: []
    }).result).toBe("blocked");
  });

  it("blocks local or secret-bearing Codex evidence", () => {
    const local = QualificationReportSchema.parse({
      track: "local",
      generatedAt: GENERATED_AT,
      result: "local_verified",
      rows: REQUIRED_CODEX_ROW_IDS.map((id) => ({ ...requiredRow(id), track: "local" }))
    });
    expect(evaluate(local).result).toBe("blocked");

    const rows = REQUIRED_CODEX_ROW_IDS.map((id) => requiredRow(id));
    rows[0] = requiredRow("codex-real-sync", { observed: { Authorization: "Bearer should-not-appear" } });
    expect(evaluate(codexReport({ rows })).result).toBe("blocked");
  });

  it("writes one normalized decision and refuses to overwrite it", () => {
    const root = mkdtempSync(join(tmpdir(), "openharness-gate-c-"));
    temporaryRoots.push(root);
    const reportDirectory = join(root, "docs/verification");
    const sourceDirectory = join(root, "backend");
    mkdirSync(reportDirectory, { recursive: true });
    mkdirSync(sourceDirectory, { recursive: true });
    copyFileSync(new URL("../../docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json", import.meta.url), join(reportDirectory, "codex.json"));
    copyFileSync(new URL("../../docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json", import.meta.url), join(reportDirectory, "zhipu.json"));
    copyFileSync(new URL("../../backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java", import.meta.url), join(sourceDirectory, "CodexAppServerClient.java"));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const args = [
      "--",
      "--project-root", root,
      "--codex-report", "docs/verification/codex.json",
      "--codex-client-source", "backend/CodexAppServerClient.java",
      "--advisory-report", "docs/verification/zhipu.json",
      "--output", "docs/verification/decision.json",
      "--generated-at", GENERATED_AT
    ];
    const io = { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) };

    expect(runGateCProviderReconciliation(args, io)).toBe(0);
    const outputPath = join(reportDirectory, "decision.json");
    const firstBytes = readFileSync(outputPath);
    const decision = JSON.parse(firstBytes.toString("utf8"));
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(decision.result).toBe("pass");
    expect(decision.required.path).toBe("docs/verification/codex.json");
    expect(decision.advisory[0].reportResult).toBe("blocked");
    expect(stdout.join("\n")).toMatch(/^result=pass policy=codex-oauth-required-v1 output=decision\.json sha256=[a-f0-9]{64}$/);
    expect(stderr).toEqual([]);

    expect(runGateCProviderReconciliation(args, io)).toBe(2);
    expect(readFileSync(outputPath)).toEqual(firstBytes);
  });

  it("writes a bounded blocked decision with exit 3 when client source binding drifts", () => {
    const root = mkdtempSync(join(tmpdir(), "openharness-gate-c-blocked-"));
    temporaryRoots.push(root);
    const reportDirectory = join(root, "docs/verification");
    const sourceDirectory = join(root, "backend");
    mkdirSync(reportDirectory, { recursive: true });
    mkdirSync(sourceDirectory, { recursive: true });
    copyFileSync(new URL("../../docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json", import.meta.url), join(reportDirectory, "codex.json"));
    const sourcePath = join(sourceDirectory, "CodexAppServerClient.java");
    copyFileSync(new URL("../../backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java", import.meta.url), sourcePath);
    writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}\n`);
    const stdout: string[] = [];
    const stderr: string[] = [];

    expect(runGateCProviderReconciliation([
      "--project-root", root,
      "--codex-report", "docs/verification/codex.json",
      "--codex-client-source", "backend/CodexAppServerClient.java",
      "--output", "docs/verification/blocked.json",
      "--generated-at", GENERATED_AT
    ], { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) })).toBe(3);

    const outputPath = join(reportDirectory, "blocked.json");
    const decision = JSON.parse(readFileSync(outputPath, "utf8"));
    expect(decision.result).toBe("blocked");
    expect(decision.blockers).toEqual(["codex_client_source_binding_invalid"]);
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "result=blocked policy=codex-oauth-required-v1 blockerCount=1 blockerClasses=codex_client_source_binding_invalid"
    ]);
  });

  it("rejects project-root escapes before creating an output", () => {
    const root = mkdtempSync(join(tmpdir(), "openharness-gate-c-boundary-"));
    temporaryRoots.push(root);
    writeFileSync(join(root, "placeholder.json"), "{}\n");
    const stderr: string[] = [];
    const result = runGateCProviderReconciliation([
      "--project-root", root,
      "--codex-report", "../outside.json",
      "--codex-client-source", "placeholder.json",
      "--output", "decision.json",
      "--generated-at", GENERATED_AT
    ], { stdout: () => undefined, stderr: (line: string) => stderr.push(line) });

    expect(result).toBe(2);
    expect(stderr.join("\n")).toContain("preflight_error");
  });
});
