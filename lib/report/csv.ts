import type { AuditResult } from "../checks/audit";
import type { Issue } from "../types";
import { ISSUE_LABELS } from "./labels";

/** Escape a cell; text starting with = + - @ is prefixed so spreadsheets don't run it as a formula. */
export function csvCell(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const money = (n: number) => n.toFixed(2);

/** One row per disputed issue, ready to attach to a courier email. */
export function disputeCsv(issues: Issue[]): string {
  const rows: (string | number)[][] = [["AWB", "Order ID", "Courier", "Issue", "Expected", "Billed", "Overcharge (INR)", "Explanation"]];
  for (const i of issues) {
    rows.push([i.awb, i.orderId ?? "", i.courier, ISSUE_LABELS[i.type], i.expected, i.billed, money(i.overchargeAmount), i.explanation]);
  }
  return toCsv(rows);
}

/** Every audited AWB plus every issue with its full working. */
export function fullReportCsv(result: AuditResult): string {
  const rows: (string | number | undefined)[][] = [
    ["Section", "AWB", "Order ID", "Courier", "Destination pincode", "Expected zone", "Billed zone", "Chargeable kg", "Billed kg", "Billed total (INR)", "Rate-card total (INR)", "Corrected total (INR)", "Overcharge (INR)", "Issues", "Severity", "Expected", "Billed", "Explanation", "Working"],
  ];
  for (const s of result.shipments) {
    rows.push(["Shipment", s.awb, s.orderId, s.courier, s.destinationPincode, s.expectedZone, s.billedZone, s.chargeableKg, s.billedKg, money(s.billedTotal), s.expectedTotal === null ? "" : money(s.expectedTotal), money(s.correctedTotal), money(s.overcharge), s.issueTypes.map((t) => ISSUE_LABELS[t as Issue["type"]] ?? t).join("; ") || "OK", "", "", "", "", ""]);
  }
  for (const i of result.issues) {
    rows.push(["Issue", i.awb, i.orderId, i.courier, "", "", "", "", "", "", "", "", money(i.overchargeAmount), ISSUE_LABELS[i.type], i.severity, i.expected, i.billed, i.explanation, (i.working ?? []).join(" | ")]);
  }
  return toCsv(rows);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "courier";
}
