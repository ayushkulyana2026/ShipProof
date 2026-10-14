import { formatINR, round2 } from "../engine/money";
import type { Issue, IssueType } from "../types";
import { ISSUE_LABELS } from "./labels";
import { slug } from "./csv";
import { sortByAmount } from "./summary";

export type DisputeEmail = { subject: string; body: string; attachmentName: string };

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

/** "1 Sep 2026 – 28 Sep 2026" from the invoice dates, or "" when the file had none. */
export function invoicePeriod(dates: (string | undefined)[]): string {
  const valid = dates
    .filter((d): d is string => !!d)
    .map((d) => ({ raw: d, t: new Date(d).getTime() }))
    .filter((d) => !Number.isNaN(d.t))
    .sort((a, b) => a.t - b.t);
  if (!valid.length) return "";
  const first = fmtDate(valid[0]!.raw);
  const last = fmtDate(valid[valid.length - 1]!.raw);
  return first === last ? first : `${first} – ${last}`;
}

/** Template-based (no LLM) dispute email for one courier. */
export function disputeEmail(args: { courier: string; issues: Issue[]; period?: string; brandName?: string }): DisputeEmail {
  const { courier, period, brandName } = args;
  const disputable = sortByAmount(args.issues.filter((i) => i.type !== "UNMATCHED_AWB"));
  const unmatched = args.issues.filter((i) => i.type === "UNMATCHED_AWB");
  const total = round2(disputable.reduce((a, i) => a + i.overchargeAmount, 0));
  const awbs = new Set(disputable.map((i) => i.awb));
  const attachmentName = `shipproof-dispute-${slug(courier)}.csv`;

  const counts = new Map<IssueType, { n: number; amt: number }>();
  for (const i of disputable) {
    const c = counts.get(i.type) ?? { n: 0, amt: 0 };
    counts.set(i.type, { n: c.n + 1, amt: round2(c.amt + i.overchargeAmount) });
  }

  const subject = `Billing dispute – Invoice ${period || "(recent period)"} – ${awbs.size} shipments, ${formatINR(total)}`;

  const top = disputable.slice(0, 10);
  const w = { awb: Math.max(3, ...top.map((i) => i.awb.length)), type: Math.max(5, ...top.map((i) => ISSUE_LABELS[i.type].length)) };
  const table = [
    `${"AWB".padEnd(w.awb)}  ${"Issue".padEnd(w.type)}  ${"Overcharge".padStart(12)}`,
    `${"-".repeat(w.awb)}  ${"-".repeat(w.type)}  ${"-".repeat(12)}`,
    ...top.map((i) => `${i.awb.padEnd(w.awb)}  ${ISSUE_LABELS[i.type].padEnd(w.type)}  ${formatINR(i.overchargeAmount).padStart(12)}`),
  ].join("\n");

  const lines = [
    `Dear ${courier} Billing Team,`,
    "",
    `We have reconciled your invoice${period ? ` for ${period}` : ""} against our order records and agreed rate card, and found billing discrepancies on ${awbs.size} shipment${awbs.size === 1 ? "" : "s"} totalling ${formatINR(total)} (including fuel surcharge and GST where applicable).`,
    "",
    "Summary by issue type:",
    ...[...counts.entries()].map(([t, c]) => `  • ${ISSUE_LABELS[t]}: ${c.n} shipment${c.n === 1 ? "" : "s"}, ${formatINR(c.amt)}`),
    "",
    `Top ${top.length} AWBs by amount:`,
    "",
    table,
    "",
    `The full list, with the expected vs billed calculation for every AWB, is attached as "${attachmentName}".`,
  ];
  if (unmatched.length) {
    lines.push(
      "",
      `Separately, ${unmatched.length} AWB${unmatched.length === 1 ? "" : "s"} on the invoice (${unmatched.map((i) => i.awb).join(", ")}) do not match any of our orders. Please share the order references or reverse these charges.`,
    );
  }
  lines.push(
    "",
    `We request a credit note of ${formatINR(total)} against these shipments. Please confirm receipt and let us know if you need any further information.`,
    "",
    "Thank you,",
    brandName ? brandName : "[Your name]",
    "[Company] · [Phone]",
  );
  return { subject, body: lines.join("\n"), attachmentName };
}
