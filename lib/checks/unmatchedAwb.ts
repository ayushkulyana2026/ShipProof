import { formatINR } from "../engine/money";
import type { InvoiceLine, Issue } from "../types";

/** An invoice AWB with no matching Shopify order. Informational: ₹0, low severity. */
export function checkUnmatchedAwb(awb: string, lines: InvoiceLine[]): Issue {
  const total = lines.reduce((a, l) => a + l.totalCharge, 0);
  return {
    awb,
    courier: lines[0]?.courier ?? "",
    type: "UNMATCHED_AWB",
    severity: "low",
    expected: "A matching Shopify order",
    billed: `${formatINR(total)} billed, no order found`,
    overchargeAmount: 0,
    explanation: `AWB ${awb} (${formatINR(total)}) appears on the invoice but does not match any of our orders; please share the order reference or reverse the charge.`,
    working: ["No order in the Shopify export has this AWB, so it could not be audited.", `Billed total: ${formatINR(total)}`],
  };
}
