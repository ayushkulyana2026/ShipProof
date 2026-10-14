import type { IssueType } from "../types";

export const ISSUE_LABELS: Record<IssueType, string> = {
  WEIGHT_OVERCHARGE: "Weight overcharge",
  WRONG_ZONE: "Wrong zone",
  RATE_MISMATCH: "Rate mismatch",
  COD_ON_PREPAID: "COD on prepaid",
  COD_WRONG_AMOUNT: "COD wrong amount",
  DUPLICATE_AWB: "Duplicate AWB",
  RTO_WITHOUT_RETURN: "RTO without return",
  RTO_WRONG_RATE: "RTO wrong rate",
  UNMATCHED_AWB: "Unmatched AWB",
};

export const ISSUE_DESCRIPTIONS: Record<IssueType, string> = {
  WEIGHT_OVERCHARGE: "Billed weight above chargeable weight + tolerance, pushing it into a higher slab",
  WRONG_ZONE: "Billed in a costlier zone than the pincodes resolve to",
  RATE_MISMATCH: "Freight above the agreed rate for the billed weight and zone",
  COD_ON_PREPAID: "COD fee charged on a prepaid order",
  COD_WRONG_AMOUNT: "COD fee above max(fixed, % of order value)",
  DUPLICATE_AWB: "Same AWB billed more than once",
  RTO_WITHOUT_RETURN: "RTO charged on an order that was delivered",
  RTO_WRONG_RATE: "RTO charged above the rate-card rule",
  UNMATCHED_AWB: "Invoice AWB with no matching Shopify order (informational)",
};
