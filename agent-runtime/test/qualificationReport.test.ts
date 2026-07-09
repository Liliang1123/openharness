import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createQualificationReport } from "../src/qualification/report";

const validRow = {
  id: "openai-sync",
  required: true,
  track: "local" as const,
  environment: { node: "20" },
  protocolVersion: "openai-chat-completions",
  capabilities: ["sync", "usage"],
  requestHash: "d".repeat(64),
  observed: {
    headers: { Authorization: "Bearer fake-provider-secret" },
    usage: { promptTokens: 17, completionTokens: 5 }
  },
  oracle: { usage: { promptTokens: 17, completionTokens: 5 } },
  durationMs: 10,
  result: "pass" as const
};

describe("qualification report", () => {
  it("redacts secrets while preserving token counters", () => {
    const report = createQualificationReport({
      track: "local",
      generatedAt: "2026-07-06T08:00:00.000Z",
      result: "local_verified",
      rows: [validRow]
    });

    expect(report.rows[0].observed).toEqual({
      headers: { Authorization: "[REDACTED]" },
      usage: { promptTokens: 17, completionTokens: 5 }
    });
    expect(JSON.stringify(report)).not.toContain("fake-provider-secret");
  });

  it("rejects track mismatches and required-row veto violations", () => {
    expect(() => createQualificationReport({
      track: "production",
      generatedAt: "2026-07-06T08:00:00.000Z",
      result: "pass",
      rows: [validRow]
    })).toThrow();

    expect(() => createQualificationReport({
      track: "local",
      generatedAt: "2026-07-06T08:00:00.000Z",
      result: "local_verified",
      rows: [{ ...validRow, result: "blocked" }]
    })).toThrow();
  });

  it("validates immutable local fake-provider reports as local_verified", () => {
    for (const name of ["2026-07-06-openai-compatible-local.json", "2026-07-06-anthropic-local.json"]) {
      const raw = JSON.parse(readFileSync(
        new URL(`../../docs/verification/agent-runtime-v1/providers/${name}`, import.meta.url),
        "utf8"
      ));
      const report = createQualificationReport(raw);
      expect(report.track).toBe("local");
      expect(report.result).toBe("local_verified");
      expect(report.rows.some((row) => row.required && row.result === "blocked")).toBe(false);
    }
  });
});
