export type DiskGuardState = "normal" | "low" | "critical";

export interface DiskSpaceSample {
  freeBytes: number;
  totalBytes: number;
}

export interface DiskGuardDecision {
  state: DiskGuardState;
  allowAdmission: boolean;
  allowInternalTerminalWrite: boolean;
}

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

export function evaluateDiskGuard(sample: DiskSpaceSample): DiskGuardDecision {
  if (!Number.isFinite(sample.freeBytes) || !Number.isFinite(sample.totalBytes) || sample.totalBytes <= 0) {
    throw new Error("Invalid disk-space sample");
  }
  const criticalWatermark = Math.max(512 * MiB, sample.totalBytes * 0.02);
  const lowWatermark = Math.max(2 * GiB, sample.totalBytes * 0.1);

  if (sample.freeBytes < criticalWatermark) {
    return { state: "critical", allowAdmission: false, allowInternalTerminalWrite: true };
  }
  if (sample.freeBytes < lowWatermark) {
    return { state: "low", allowAdmission: false, allowInternalTerminalWrite: true };
  }
  return { state: "normal", allowAdmission: true, allowInternalTerminalWrite: true };
}
