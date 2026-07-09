import { QualificationReportSchema, type QualificationReport } from "@openharness/shared-schema";
import { redactQualificationValue } from "./redaction";

export function createQualificationReport(input: unknown): QualificationReport {
  return QualificationReportSchema.parse(redactQualificationValue(input));
}
