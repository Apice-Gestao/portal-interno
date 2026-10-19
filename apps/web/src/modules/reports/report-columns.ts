import type { ReportResult } from "@apice/domain";

/**
 * Hidden columns that exist in this result. The saved choice is per report and
 * may name columns of another format (scope, grouping); it never hides them all.
 */
export function effectiveHidden(result: ReportResult, hidden: string[]) {
  const present = hidden.filter((key) =>
    result.columns.some((column) => column.key === key),
  );
  return present.length >= result.columns.length ? [] : present;
}
