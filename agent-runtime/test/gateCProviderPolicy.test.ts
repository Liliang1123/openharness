import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QualificationReportSchema, type QualificationReport } from "@openharness/shared-schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateGateCProviderQualification,
  REQUIRED_OPENAI_COMPATIBLE_ROW_IDS
} from "../src/qualification/gateCProviderPolicy";
import { runGateCProviderReconciliation } from "../src/qualification/gateCProviderReconcileCli";

const GENERATED_AT = "2026-08-07T00:00:00.000Z";
const REQUIRED_SHA = "a".repeat(64);
const temporaryRoots: string[] = [];
type QualificationRow = QualificationReport["rows"][number];

function requiredRow(id: string, overrides: Partial<QualificationRow> = {}): QualificationRow {
  return {
    id,
    required: true,
    track: "production",
    environment: {
      provider: "zhipu",
      providerType: "openai-compatible",
      model: "glm-4-flash",
      endpointKind: "chat-completions",
      transport: "real-provider",
      host: "open.bigmodel.cn"
    },
    protocolVersion: "openai-chat-completions",
    capabilities: [id],
    requestHash: "b".repeat(64),
    observed: {},
    oracle: {},
    durationMs: 1,
    result: "pass",
    ...overrides
  };
}

function openAiReport(overrides: Partial<QualificationReport> = {}): QualificationReport {
  return QualificationReportSchema.parse({
    track: "production",
    generatedAt: GENERATED_AT,
    result: "pass",
    rows: REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.map((id) => requiredRow(id)),
    ...overrides
  });
}

function advisoryReport(result: "pass" | "fail" | "blocked"): QualificationReport {
  return QualificationReportSchema.parse({
    track: "production",
    generatedAt: GENERATED_AT,
    result,
    rows: [requiredRow("anthropic-advisory", {
      required: false,
      environment: { provider: "anthropic", providerType: "anthropic" },
      protocolVersion: "anthropic-messages",
      result
    })]
  });
}

function evaluate(report = openAiReport(), advisory = [advisoryReport("blocked"), advisoryReport("fail")]) {
  return evaluateGateCProviderQualification({
    generatedAt: GENERATED_AT,
    required: {
      path: "docs/verification/agent-runtime-v1/providers/required.json",
      sha256: REQUIRED_SHA,
      report
    },
    advisory: advisory.map((item, index) => ({
      path: `docs/verification/agent-runtime-v1/providers/advisory-${index}.json`,
      sha256: `${index}`.repeat(64),
      report: item
    }))
  });
}

function writeReport(root: string, relativePath: string, report: QualificationReport): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

describe("Gate C OpenAI-compatible provider policy", () => {
  afterEach(() => {
    for (const root of temporaryRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    temporaryRoots.length = 0;
  });

  it("passes required OpenAI-compatible evidence while preserving advisory results", () => {
    const decision = evaluate();

    expect(decision.result).toBe("pass");
    expect(decision.blockers).toEqual([]);
    expect(decision.policy).toBe("openai-compatible-required-v1");
    expect(decision.required.requiredRowIds).toEqual([...REQUIRED_OPENAI_COMPATIBLE_ROW_IDS]);
    expect(decision.advisory.map((item) => item.reportResult)).toEqual(["blocked", "fail"]);
  });

  it("keeps required blocked/fail, missing, or extra rows as a veto", () => {
    const blockedRows = REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.map((id) => requiredRow(id));
    blockedRows[0] = requiredRow(REQUIRED_OPENAI_COMPATIBLE_ROW_IDS[0], { result: "blocked" });
    expect(evaluate(QualificationReportSchema.parse({
      ...openAiReport(),
      result: "blocked",
      rows: blockedRows
    })).result).toBe("blocked");

    expect(evaluate(openAiReport({
      rows: REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.slice(0, -1).map((id) => requiredRow(id))
    })).result).toBe("blocked");
    expect(evaluate(openAiReport({
      rows: [
        ...REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.map((id) => requiredRow(id)),
        requiredRow("openai-zhipu-unapproved-extra")
      ]
    })).result).toBe("blocked");
    expect(evaluate(QualificationReportSchema.parse({
      ...openAiReport(),
      result: "blocked",
      rows: REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.map((id) => requiredRow(id, { result: "blocked" }))
    }), [advisoryReport("pass")]).result).toBe("blocked");
  });

  it("blocks local, mock, non-Chat-Completions, and non-real required evidence", () => {
    const invalidEnvironments = [
      { provider: "mock", providerType: "openai-compatible", endpointKind: "chat-completions", transport: "mock" },
      { provider: "zhipu", providerType: "anthropic", endpointKind: "chat-completions", transport: "real-provider" },
      { provider: "zhipu", providerType: "openai-compatible", endpointKind: "messages", transport: "real-provider" },
      { provider: "zhipu", providerType: "openai-compatible", endpointKind: "chat-completions", transport: "fixture" }
    ];

    for (const environment of invalidEnvironments) {
      const rows = REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.map((id) => requiredRow(id, { environment }));
      expect(evaluate(openAiReport({ rows })).result).toBe("blocked");
    }

    const localReport = QualificationReportSchema.parse({
      track: "local",
      generatedAt: GENERATED_AT,
      result: "local_verified",
      rows: REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.map((id) => ({ ...requiredRow(id), track: "local" }))
    });
    expect(evaluate(localReport).result).toBe("blocked");
  });

  it("rejects sensitive evidence before it can become a provider decision", () => {
    const report = openAiReport();
    const firstRow = report.rows[0];
    const secretKey = ["api", "Key"].join("");
    const secretValue = ["sk", "-", "fixture"].join("");
    firstRow.observed[secretKey] = secretValue;

    expect(evaluate(report).result).toBe("blocked");
  });

  it("writes one normalized decision and refuses to overwrite it", () => {
    const root = mkdtempSync(join(tmpdir(), "openharness-gate-c-openai-"));
    temporaryRoots.push(root);
    writeReport(root, "docs/verification/required.json", openAiReport());
    writeReport(root, "docs/verification/advisory.json", advisoryReport("blocked"));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const args = [
      "--project-root", root,
      "--required-report", "docs/verification/required.json",
      "--advisory-report", "docs/verification/advisory.json",
      "--output", "docs/verification/decision.json",
      "--generated-at", GENERATED_AT
    ];
    const io = { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) };

    expect(runGateCProviderReconciliation(args, io)).toBe(0);
    const outputPath = join(root, "docs/verification/decision.json");
    const firstBytes = readFileSync(outputPath);
    const decision = JSON.parse(firstBytes.toString("utf8"));
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(decision.result).toBe("pass");
    expect(decision.required.path).toBe("docs/verification/required.json");
    expect(decision.advisory[0].reportResult).toBe("blocked");
    expect(stdout.join("\n")).toMatch(/^result=pass policy=openai-compatible-required-v1 output=decision\.json sha256=[a-f0-9]{64}$/);
    expect(stderr).toEqual([]);

    expect(runGateCProviderReconciliation(args, io)).toBe(2);
    expect(readFileSync(outputPath)).toEqual(firstBytes);
  });

  it("writes a bounded blocked decision with exit 3 for a required blocked report", () => {
    const root = mkdtempSync(join(tmpdir(), "openharness-gate-c-openai-blocked-"));
    temporaryRoots.push(root);
    const blockedRows = REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.map((id) => requiredRow(id));
    blockedRows[0] = requiredRow(REQUIRED_OPENAI_COMPATIBLE_ROW_IDS[0], { result: "blocked" });
    writeReport(root, "docs/verification/required.json", QualificationReportSchema.parse({
      ...openAiReport(),
      result: "blocked",
      rows: blockedRows
    }));
    const stdout: string[] = [];
    const stderr: string[] = [];

    expect(runGateCProviderReconciliation([
      "--project-root", root,
      "--required-report", "docs/verification/required.json",
      "--output", "docs/verification/blocked.json",
      "--generated-at", GENERATED_AT
    ], { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) })).toBe(3);

    const outputPath = join(root, "docs/verification/blocked.json");
    const decision = JSON.parse(readFileSync(outputPath, "utf8"));
    expect(decision.result).toBe("blocked");
    expect(decision.blockers).toContain("required_report_not_production_pass");
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toMatch(/^result=blocked policy=openai-compatible-required-v1 blockerCount=\d+ blockerClasses=/);
  });

  it("rejects project-root escapes before creating an output", () => {
    const root = mkdtempSync(join(tmpdir(), "openharness-gate-c-openai-boundary-"));
    temporaryRoots.push(root);
    writeFileSync(join(root, "placeholder.json"), "{}\n");
    const stderr: string[] = [];
    const result = runGateCProviderReconciliation([
      "--project-root", root,
      "--required-report", "../outside.json",
      "--output", "decision.json",
      "--generated-at", GENERATED_AT
    ], { stdout: () => undefined, stderr: (line: string) => stderr.push(line) });

    expect(result).toBe(2);
    expect(stderr.join("\n")).toContain("preflight_error");
  });
});
