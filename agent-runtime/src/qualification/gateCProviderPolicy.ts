import {
  GateCProviderDecisionSchema,
  QualificationReportSchema,
  type GateCProviderDecision,
  type QualificationReport
} from "@openharness/shared-schema";

export const AUTHORIZED_CODEX_REPORT_SHA256 =
  "af2aee9aa03ed1d795599205936fe3f47e25bbfa3bdd3e16e317e6e0769bfad6";

export const REQUIRED_CODEX_ROW_IDS = [
  "codex-real-sync",
  "codex-real-reasoning",
  "codex-real-usage",
  "codex-real-stream",
  "codex-real-cancellation",
  "codex-real-redaction"
] as const;

export interface ProviderReportInput {
  path: string;
  sha256: string;
  report: QualificationReport;
}

const forbiddenEvidenceKeys = new Set([
  "authorization",
  "accesstoken",
  "refreshtoken",
  "oauthaccesstoken",
  "oauthrefreshtoken"
]);

function containsSensitiveEvidence(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized.includes("bearer ") || normalized.includes("auth.json") || normalized.includes(".codex");
  }
  if (Array.isArray(value)) {
    return value.some(containsSensitiveEvidence);
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, child]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (forbiddenEvidenceKeys.has(normalizedKey) && child !== "[REDACTED]") {
        return true;
      }
      return containsSensitiveEvidence(child);
    });
  }
  return false;
}

function hasCanonicalRequiredRows(report: QualificationReport): boolean {
  const requiredIds = report.rows.filter((row) => row.required).map((row) => row.id);
  return requiredIds.length === REQUIRED_CODEX_ROW_IDS.length
    && requiredIds.every((id, index) => id === REQUIRED_CODEX_ROW_IDS[index]);
}

export function evaluateGateCProviderQualification(input: {
  generatedAt: string;
  codex: ProviderReportInput;
  codexClientSourceSha256: string;
  advisory: ProviderReportInput[];
}): GateCProviderDecision {
  const codexReport = QualificationReportSchema.parse(input.codex.report);
  const advisoryReports = input.advisory.map((item) => ({
    ...item,
    report: QualificationReportSchema.parse(item.report)
  }));
  const blockers: string[] = [];
  const block = (blocker: string) => {
    if (!blockers.includes(blocker)) {
      blockers.push(blocker);
    }
  };

  if (input.codex.sha256 !== AUTHORIZED_CODEX_REPORT_SHA256) {
    block("codex_report_sha_mismatch");
  }
  if (codexReport.track !== "production" || codexReport.result !== "pass") {
    block("codex_report_not_production_pass");
  }
  if (!hasCanonicalRequiredRows(codexReport)) {
    block("codex_required_row_set_invalid");
  }

  const requiredRows = codexReport.rows.filter((row) => row.required);
  if (requiredRows.some((row) => row.result !== "pass")) {
    block("codex_required_row_invalid");
  }
  if (requiredRows.some((row) => {
    const environment = row.environment;
    return environment.provider !== "codex-app-server"
      || environment.qualificationAuthorization !== "granted"
      || environment.credentialState !== "not-read";
  })) {
    block("codex_environment_invalid");
  }
  if (requiredRows.some((row) => row.environment.clientImplementationSha256 !== input.codexClientSourceSha256)) {
    block("codex_client_source_binding_invalid");
  }

  const redactionRow = requiredRows.find((row) => row.id === "codex-real-redaction");
  if (redactionRow?.observed.rawCanaryObserved !== false
    || redactionRow.observed.redactionMarkerObserved !== true
    || redactionRow.oracle.rawCanaryObserved !== false
    || redactionRow.oracle.redactionMarkerObserved !== true) {
    block("codex_redaction_evidence_invalid");
  }
  if (containsSensitiveEvidence(codexReport)) {
    block("codex_report_sensitive_content");
  }

  return GateCProviderDecisionSchema.parse({
    schemaVersion: 1,
    policy: "codex-oauth-required-v1",
    generatedAt: input.generatedAt,
    result: blockers.length === 0 ? "pass" : "blocked",
    required: {
      authority: "required",
      path: input.codex.path,
      sha256: input.codex.sha256,
      track: codexReport.track,
      reportResult: codexReport.result,
      clientImplementationSha256: input.codexClientSourceSha256,
      requiredRowIds: [...REQUIRED_CODEX_ROW_IDS]
    },
    advisory: advisoryReports.map((item) => ({
      authority: "advisory",
      path: item.path,
      sha256: item.sha256,
      track: item.report.track,
      reportResult: item.report.result
    })),
    blockers
  });
}
