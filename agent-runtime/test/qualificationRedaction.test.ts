import { describe, expect, it } from "vitest";
import { redactQualificationValue } from "../src/qualification/redaction";

describe("qualification redaction", () => {
  it("redacts nested secrets across qualification sinks without mutating input", () => {
    const input = {
      headers: { Authorization: "Bearer local-secret", "x-api-key": "sk-test-canary" },
      error: { message: "provider rejected Bearer local-secret" },
      stdout: "request used sk-test-canary",
      file: [{ token: "local-token", status: "failed" }],
      trace: { attributes: { apiKey: "local-api-key", promptTokens: 3 } },
      report: { observed: { password: "local-password", result: "failed" } }
    };

    const redacted = redactQualificationValue(input);

    expect(JSON.stringify(redacted)).not.toContain("local-secret");
    expect(JSON.stringify(redacted)).not.toContain("sk-test-canary");
    expect(JSON.stringify(redacted)).not.toContain("local-token");
    expect(JSON.stringify(redacted)).not.toContain("local-api-key");
    expect(JSON.stringify(redacted)).not.toContain("local-password");
    expect(redacted).toMatchObject({
      headers: { Authorization: "[REDACTED]", "x-api-key": "[REDACTED]" },
      file: [{ token: "[REDACTED]", status: "failed" }],
      trace: { attributes: { apiKey: "[REDACTED]", promptTokens: 3 } }
    });
    expect(input.headers.Authorization).toBe("Bearer local-secret");
  });

  it("preserves non-secret values and redacts secret-bearing strings", () => {
    expect(redactQualificationValue({ message: "ordinary failure", count: 2, active: false })).toEqual({
      message: "ordinary failure",
      count: 2,
      active: false
    });
    expect(redactQualificationValue("prefix Bearer abc123 suffix")).toBe("[REDACTED]");
    expect(redactQualificationValue("prefix sk-live-secret suffix")).toBe("[REDACTED]");
  });
});
