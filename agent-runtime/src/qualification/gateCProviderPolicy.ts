import {
  QualificationReportSchema,
  type QualificationReport
} from "@openharness/shared-schema";

export const REQUIRED_OPENAI_COMPATIBLE_ROW_IDS = [
  "openai-zhipu-sync",
  "openai-zhipu-usage-cost",
  "openai-zhipu-stream",
  "openai-zhipu-structured-tool",
  "openai-zhipu-timeout",
  "openai-zhipu-retry",
  "openai-zhipu-terminal-error",
  "openai-zhipu-cancellation",
  "openai-zhipu-reasoning"
] as const;

export type GateCProviderDecisionResult = "pass" | "blocked";

export interface GateCProviderEvidenceRef {
  authority: "required" | "advisory";
  path: string;
  sha256: string;
  track: QualificationReport["track"];
  reportResult: QualificationReport["result"];
}

export interface GateCProviderDecision {
  schemaVersion: 1;
  policy: "openai-compatible-required-v1";
  generatedAt: string;
  result: GateCProviderDecisionResult;
  required: GateCProviderEvidenceRef & {
    authority: "required";
    requiredRowIds: string[];
  };
  advisory: Array<GateCProviderEvidenceRef & { authority: "advisory" }>;
  blockers: string[];
}

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
  "oauthrefreshtoken",
  "apikey",
  "xapikey",
  "servicetoken",
  "clientsecret"
]);

const sensitiveEvidenceValue = /bearer\s+|(?:sk|rk|pk)-|api[_-]?key|x-api-key|service[_-]?token|client[_-]?secret/i;

function containsSensitiveEvidence(value: unknown): boolean {
  if (typeof value === "string") {
    return sensitiveEvidenceValue.test(value);
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

function isProjectRelativePath(path: string): boolean {
  return path.length > 0
    && !path.startsWith("/")
    && !path.includes("\\")
    && path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function hasCanonicalRequiredRows(report: QualificationReport): boolean {
  const requiredIds = report.rows.filter((row) => row.required).map((row) => row.id);
  return requiredIds.length === REQUIRED_OPENAI_COMPATIBLE_ROW_IDS.length
    && requiredIds.every((id, index) => id === REQUIRED_OPENAI_COMPATIBLE_ROW_IDS[index]);
}

function hasOpenAiCompatibleEnvironment(report: QualificationReport): boolean {
  return report.rows
    .filter((row) => row.required)
    .every((row) => {
      const environment = row.environment;
      return typeof environment.provider === "string"
        && environment.provider.length > 0
        && environment.providerType === "openai-compatible"
        && environment.endpointKind === "chat-completions"
        && environment.transport === "real-provider"
        && row.protocolVersion === "openai-chat-completions";
    });
}

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function evaluateGateCProviderQualification(input: {
  generatedAt: string;
  required: ProviderReportInput;
  advisory: ProviderReportInput[];
}): GateCProviderDecision {
  const requiredReport = QualificationReportSchema.parse(input.required.report);
  const advisoryReports = input.advisory.map((item) => ({
    ...item,
    report: QualificationReportSchema.parse(item.report)
  }));
  const blockers: string[] = [];
  const block = (blocker: string) => {
    if (!blockers.includes(blocker)) blockers.push(blocker);
  };

  if (!isProjectRelativePath(input.required.path)) block("required_report_path_invalid");
  if (!validSha256(input.required.sha256)) block("required_report_sha_invalid");
  if (requiredReport.track !== "production" || requiredReport.result !== "pass") {
    block("required_report_not_production_pass");
  }
  if (!hasCanonicalRequiredRows(requiredReport)) block("openai_required_row_set_invalid");

  const requiredRows = requiredReport.rows.filter((row) => row.required);
  if (requiredRows.some((row) => row.result !== "pass")) block("openai_required_row_invalid");
  if (!hasOpenAiCompatibleEnvironment(requiredReport)) block("openai_environment_invalid");
  if (containsSensitiveEvidence(requiredReport)) block("required_report_sensitive_content");

  const decision: GateCProviderDecision = {
    schemaVersion: 1,
    policy: "openai-compatible-required-v1",
    generatedAt: input.generatedAt,
    result: blockers.length === 0 ? "pass" : "blocked",
    required: {
      authority: "required",
      path: input.required.path,
      sha256: input.required.sha256,
      track: requiredReport.track,
      reportResult: requiredReport.result,
      requiredRowIds: [...REQUIRED_OPENAI_COMPATIBLE_ROW_IDS]
    },
    advisory: advisoryReports.map((item) => ({
      authority: "advisory",
      path: item.path,
      sha256: item.sha256,
      track: item.report.track,
      reportResult: item.report.result
    })),
    blockers
  };

  return decision;
}
