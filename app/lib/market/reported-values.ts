export type ReportedValue = number | null;

export function reportedNonNegative(value: number): ReportedValue {
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

export function addReportedValues(current: ReportedValue | undefined, incoming: ReportedValue): ReportedValue {
  if (current === null || incoming === null) return null;
  return (current ?? 0) + incoming;
}

export function combineReportedValues(left: ReportedValue, right: ReportedValue): ReportedValue {
  return left === null || right === null ? null : left + right;
}
