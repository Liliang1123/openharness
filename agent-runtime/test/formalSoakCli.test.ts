import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  probeGateDJavaFixtures,
  runGateDPreflightCli,
  runGateDRunCli
} from "../src/baseline/formalSoakCli";
import { buildDeterministicBaselineWorkload, createRuntimeBaselineReport } from "../src/baseline/localBaseline";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Gate D production preflight CLI", () => {
  it("rejects unknown, duplicate, and credential-bearing argv before probes", async () => {
    const fixture = createFixture();
    let probes = 0;
    const deps = dependencies(() => { probes += 1; });

    expect(await runGateDPreflightCli([...fixture.args, "--duration-ms", "1"], deps)).toBe(2);
    expect(await runGateDPreflightCli([...fixture.args, "--run-id", "duplicate"], deps)).toBe(2);
    expect(await runGateDPreflightCli([...fixture.args, "--service-token", "raw-secret"], deps)).toBe(2);
    expect(probes).toBe(0);
  });

  it("binds approval to runId and plan hash, performs probes, and writes one redacted mode-0600 artifact", async () => {
    const fixture = createFixture();
    const probeCalls: string[] = [];
    const deps = dependencies(name => { probeCalls.push(name); });

    expect(await runGateDPreflightCli(fixture.args, deps)).toBe(0);

    const artifact = JSON.parse(readFileSync(fixture.preflightPath, "utf8"));
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      runId: "gate-d-20260715",
      result: "pass",
      planSha256: fixture.planSha256,
      probes: { javaGateway: "pass", mcpFixture: "pass", diskHeadroom: "pass" }
    });
    expect(JSON.stringify(artifact)).not.toContain("gate-d-service-token");
    expect(statSync(fixture.preflightPath).mode & 0o777).toBe(0o600);
    expect(probeCalls).toEqual(["java", "mcp", "disk"]);

    expect(await runGateDPreflightCli(fixture.args, deps)).toBe(2);
    expect(readFileSync(fixture.preflightPath, "utf8")).toContain(fixture.planSha256);
  });

  it("rejects a mismatched or expired approval before any active probe", async () => {
    const fixture = createFixture({ planSha256: "0".repeat(64), approvedAt: "2026-07-13T00:00:00.000Z" });
    let probes = 0;

    expect(await runGateDPreflightCli(fixture.args, dependencies(() => { probes += 1; }))).toBe(2);
    expect(probes).toBe(0);
  });

  it("blocks preflight when free disk is below the fixed ten-percent watermark", async () => {
    const fixture = createFixture();
    const deps = dependencies(() => undefined);
    expect(await runGateDPreflightCli(fixture.args, {
      ...deps,
      diskHeadroomBytes: () => ({ bytes: 4 * 1024 * 1024 * 1024, ratio: 0.05 })
    })).toBe(2);
  });

  it("rejects missing evidence, pre-existing targets, and failed active probes before start", async () => {
    const missingEvidence = createFixture();
    rmSync(missingEvidence.monitoringPath);
    let probes = 0;
    expect(await runGateDPreflightCli(
      missingEvidence.args,
      dependencies(() => { probes += 1; })
    )).toBe(2);
    expect(probes).toBe(0);

    const existingTarget = createFixture();
    writeFileSync(existingTarget.journalPath, "retain\n");
    expect(await runGateDPreflightCli(existingTarget.args, dependencies(() => { probes += 1; }))).toBe(2);
    expect(probes).toBe(0);

    const failedProbe = createFixture();
    expect(await runGateDPreflightCli(failedProbe.args, {
      ...dependencies(() => undefined),
      probeJava: async () => { throw new Error("Java Gateway health probe failed"); }
    })).toBe(2);
    expect(existsSync(failedProbe.preflightPath)).toBe(false);
  });

  it("rejects relative/escaping paths, missing credentials, MCP failure, and every fixed report target", async () => {
    let probes = 0;
    const relativePath = createFixture();
    expect(await runGateDPreflightCli(
      replaceFlag(relativePath.args, "--sqlite-path", "relative.sqlite"),
      dependencies(() => { probes += 1; })
    )).toBe(2);
    expect(probes).toBe(0);

    const escapingPath = createFixture();
    expect(await runGateDPreflightCli(
      replaceFlag(escapingPath.args, "--report", join(tmpdir(), `gate-d-escape-${Date.now()}.json`)),
      dependencies(() => { probes += 1; })
    )).toBe(2);
    expect(probes).toBe(0);

    const missingCredential = createFixture();
    expect(await runGateDPreflightCli(missingCredential.args, {
      ...dependencies(() => { probes += 1; }),
      env: {}
    })).toBe(2);
    expect(probes).toBe(0);

    const mcpFailure = createFixture();
    expect(await runGateDPreflightCli(mcpFailure.args, {
      ...dependencies(() => undefined),
      probeMcp: async () => { throw new Error("MCP qualification fixture probe failed"); }
    })).toBe(2);

    for (const targetName of ["reportPath", "partialReportPath"] as const) {
      const existing = createFixture();
      writeFileSync(existing[targetName], "retain\n");
      expect(await runGateDPreflightCli(existing.args, dependencies(() => undefined))).toBe(2);
    }
  });

  it("revalidates the immutable preflight binding before executing and writes one final report", async () => {
    const fixture = createFixture();
    const preflightDeps = dependencies(() => undefined);
    expect(await runGateDPreflightCli(fixture.args, preflightDeps)).toBe(0);
    let executions = 0;

    expect(await runGateDRunCli(fixture.args, {
      ...preflightDeps,
      executeProductionSoak: async input => {
        executions += 1;
        expect(input.runId).toBe("gate-d-20260715");
        expect(input.serviceToken).toBe("gate-d-service-token");
        return passingFormalReport();
      }
    })).toBe(0);

    expect(executions).toBe(1);
    const report = JSON.parse(readFileSync(fixture.reportPath, "utf8"));
    expect(report).toMatchObject({ track: "production", result: "pass" });
    expect(statSync(fixture.reportPath).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(report)).not.toContain("gate-d-service-token");
    expect(await runGateDRunCli(fixture.args, {
      ...preflightDeps,
      executeProductionSoak: async () => { executions += 1; return passingFormalReport(); }
    })).toBe(2);
    expect(executions).toBe(1);
  });

  it("rejects a deterministic Java fixture response that is not proven to come from the mock provider", async () => {
    const originalFetch = globalThis.fetch;
    let requestIndex = 0;
    globalThis.fetch = (async () => {
      requestIndex += 1;
      if (requestIndex === 1) return new Response(JSON.stringify({ status: "UP" }), { status: 200 });
      if (requestIndex === 2) {
        return new Response(JSON.stringify({ catalogVersion: "v1", catalogHash: "hash" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        message: { role: "assistant", content: "unexpected", toolCalls: [] },
        rawProvider: "zhipu"
      }), { status: 200 });
    }) as typeof fetch;
    try {
      await expect(probeGateDJavaFixtures({
        javaUrl: "http://127.0.0.1:8080",
        serviceToken: "gate-d-service-token"
      })).rejects.toThrow(/mock provider/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function createFixture(approvalOverride: { planSha256?: string; approvedAt?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "openharness-gate-d-cli-"));
  dirs.push(root);
  const evidence = join(root, "docs", "verification", "agent-runtime-v1", "gate-d");
  mkdirSync(evidence, { recursive: true });
  const planPath = join(root, "gate-d-plan.md");
  const approvalPath = join(evidence, "approval.json");
  const mcpPath = join(evidence, "mcp.json");
  const monitoringPath = join(evidence, "monitoring.md");
  const interruptionPath = join(evidence, "interruption.md");
  const databasePath = join(evidence, "runtime.sqlite");
  const reportPath = join(evidence, "report.json");
  const partialReportPath = join(evidence, "partial.json");
  const journalPath = join(evidence, "journal.jsonl");
  const preflightPath = join(evidence, "preflight.json");
  writeFileSync(planPath, "# fixed gate d plan\n");
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: { qualification: { command: "node", args: ["fixture.js"] } } }));
  writeFileSync(monitoringPath, "monitoring active\n");
  writeFileSync(interruptionPath, "stop and retain partial evidence\n");
  writeFileSync(databasePath, "");
  const planSha256 = sha256(readFileSync(planPath));
  writeFileSync(approvalPath, JSON.stringify({
    schemaVersion: 1,
    changeId: "harden-agent-runtime-single-node-production",
    approved: true,
    approvedBy: "user",
    approvedAt: approvalOverride.approvedAt ?? "2026-07-15T00:00:00.000Z",
    runId: "gate-d-20260715",
    planSha256: approvalOverride.planSha256 ?? planSha256,
    reason: "explicit production start approval"
  }));
  const args = [
    "--project-root", root,
    "--run-id", "gate-d-20260715",
    "--approval-file", approvalPath,
    "--plan", planPath,
    "--java-url", "http://127.0.0.1:8080",
    "--mcp-config", mcpPath,
    "--sqlite-path", databasePath,
    "--report", reportPath,
    "--partial-report", partialReportPath,
    "--journal", journalPath,
    "--preflight-output", preflightPath,
    "--monitoring-evidence", monitoringPath,
    "--interruption-procedure", interruptionPath,
    "--minimum-disk-headroom-bytes", String(2 * 1024 * 1024 * 1024)
  ];
  return {
    args,
    planSha256,
    planPath,
    preflightPath,
    reportPath,
    partialReportPath,
    journalPath,
    approvalPath,
    mcpPath,
    monitoringPath,
    interruptionPath
  };
}

function dependencies(onProbe: (name: string) => void) {
  return {
    env: { OPENHARNESS_SERVICE_TOKEN: "gate-d-service-token" },
    now: () => new Date("2026-07-15T01:00:00.000Z"),
    probeJava: async () => { onProbe("java"); },
    probeMcp: async () => { onProbe("mcp"); },
    diskHeadroomBytes: () => { onProbe("disk"); return 4 * 1024 * 1024 * 1024; },
    writeOutput: () => undefined,
    writeError: () => undefined
  };
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function replaceFlag(args: string[], flag: string, value: string): string[] {
  const copy = [...args];
  const index = copy.indexOf(flag);
  if (index < 0) throw new Error(`missing test flag ${flag}`);
  copy[index + 1] = value;
  return copy;
}

function passingFormalReport() {
  const generatedAt = "2026-07-15T01:00:00.000Z";
  const restartScheduleMs = [2, 12, 22].map(hours => hours * 60 * 60 * 1000);
  return createRuntimeBaselineReport({
    track: "production",
    generatedAt,
    workload: buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 }),
    environment: {
      baselineKind: "fixed-24-hour-soak",
      evidenceKind: "formal-24-hour-soak",
      runComplete: true,
      restartScheduleMs,
      observedRestartScheduleMs: restartScheduleMs
    },
    samples: Array.from({ length: 2_880 }, (_, index) => ({
      sampledAt: new Date(Date.parse(generatedAt) + (index + 1) * 30_000).toISOString(),
      admissionP95Ms: 10,
      durableReplayP95Ms: 20,
      rssBytes: 100_000_000,
      openFileDescriptors: 100,
      walBytes: 1_024,
      mcpChildCount: 1,
      hardFailures: []
    }))
  });
}
