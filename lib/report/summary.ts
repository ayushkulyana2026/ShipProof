import type { AuditResult } from "../checks/audit";
import { round2 } from "../engine/money";
import { ISSUE_TYPES, type Issue, type IssueType } from "../types";

export type TypeSummary = { type: IssueType; count: number; amount: number };
export type CourierSummary = { courier: string; issues: number; shipmentsAffected: number; amount: number; invoiceTotal: number };

export type AuditSummary = {
  totalOvercharge: number;
  shipmentsAffected: number;
  shipmentsAudited: number;
  invoiceTotal: number;
  percentOfInvoice: number;
  byType: TypeSummary[];
  byCourier: CourierSummary[];
  issueCount: number;
};

export function summarize(result: AuditResult): AuditSummary {
  const { issues, invoiceTotal } = result;
  const totalOvercharge = round2(issues.reduce((a, i) => a + i.overchargeAmount, 0));
  const affected = new Set(issues.filter((i) => i.overchargeAmount > 0).map((i) => i.awb));
  const byType = ISSUE_TYPES.map((type) => {
    const list = issues.filter((i) => i.type === type);
    return { type, count: list.length, amount: round2(list.reduce((a, i) => a + i.overchargeAmount, 0)) };
  });
  const couriers = [...new Set(result.shipments.map((s) => s.courier))];
  const byCourier = couriers
    .map((courier) => {
      const list = issues.filter((i) => i.courier === courier);
      return {
        courier,
        issues: list.length,
        shipmentsAffected: new Set(list.filter((i) => i.overchargeAmount > 0).map((i) => i.awb)).size,
        amount: round2(list.reduce((a, i) => a + i.overchargeAmount, 0)),
        invoiceTotal: round2(result.shipments.filter((s) => s.courier === courier).reduce((a, s) => a + s.billedTotal, 0)),
      };
    })
    .sort((a, b) => b.amount - a.amount);
  return {
    totalOvercharge,
    shipmentsAffected: affected.size,
    shipmentsAudited: result.shipments.length,
    invoiceTotal,
    percentOfInvoice: invoiceTotal > 0 ? round2((totalOvercharge / invoiceTotal) * 100) : 0,
    byType,
    byCourier,
    issueCount: issues.length,
  };
}

export function issuesForCourier(issues: Issue[], courier: string): Issue[] {
  return issues.filter((i) => i.courier === courier);
}

/** Highest overcharge first; informational issues last. */
export function sortByAmount(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => b.overchargeAmount - a.overchargeAmount || a.awb.localeCompare(b.awb));
}
