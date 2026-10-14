import { formatINR, round2 } from "../engine/money";
import type { InvoiceLine, Issue } from "../types";
import { severityFor } from "./severity";

/** Group key for duplicate detection: same AWB and same shipment type. */
export function duplicateKey(line: InvoiceLine): string {
  return `${line.awb}|${line.shipmentType ?? "forward"}`;
}

/**
 * Same AWB billed more than once with the same shipment type. The first line is
 * kept; each repeat is flagged for its full amount and excluded from other checks.
 */
export function splitDuplicates(lines: InvoiceLine[], orderIdFor: (awb: string) => string | undefined) {
  const seen = new Map<string, InvoiceLine>();
  const kept: InvoiceLine[] = [];
  const issues: Issue[] = [];
  for (const line of lines) {
    const key = duplicateKey(line);
    const first = seen.get(key);
    if (!first) {
      seen.set(key, line);
      kept.push(line);
      continue;
    }
    const amount = round2(line.totalCharge);
    const type = line.shipmentType ?? "forward";
    const rowNote = line.sourceRow && first.sourceRow ? ` (invoice rows ${first.sourceRow} and ${line.sourceRow})` : "";
    issues.push({
      awb: line.awb,
      orderId: orderIdFor(line.awb),
      courier: line.courier,
      type: "DUPLICATE_AWB",
      severity: severityFor("DUPLICATE_AWB", amount),
      expected: `Billed once (${type})`,
      billed: `Billed again for ${formatINR(amount)}`,
      overchargeAmount: amount,
      explanation: `AWB ${line.awb} was billed twice as a ${type} shipment${rowNote}; the repeat charge of ${formatINR(amount)} should be reversed.`,
      working: [
        `First ${type} line: ${formatINR(first.totalCharge)}${first.sourceRow ? ` (row ${first.sourceRow})` : ""}`,
        `Repeat ${type} line: ${formatINR(line.totalCharge)}${line.sourceRow ? ` (row ${line.sourceRow})` : ""}`,
        `Overcharge = full repeat line total = ${formatINR(amount)}`,
      ],
    });
  }
  return { kept, issues };
}
