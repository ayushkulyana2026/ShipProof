import type { IssueType, Severity } from "../types";

/** Clear-cut errors (the courier billed something that should not exist at all). */
const CLEAR_CUT: IssueType[] = ["DUPLICATE_AWB", "RTO_WITHOUT_RETURN", "COD_ON_PREPAID"];

export function severityFor(type: IssueType, amount: number): Severity {
  if (type === "UNMATCHED_AWB") return "low";
  if (CLEAR_CUT.includes(type) || amount >= 100) return "high";
  return amount >= 20 ? "medium" : "low";
}
