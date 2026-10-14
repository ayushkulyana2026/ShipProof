import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runAudit, type AuditResult } from "@/lib/checks/audit";
import { prepareFromText } from "@/lib/pipeline";
import { csvCell, disputeCsv, disputeEmail, fullReportCsv, invoicePeriod, summarize } from "@/lib/report";
import { readCsvText } from "@/lib/parsing/read";

const read = (f: string) => fs.readFileSync(path.join(__dirname, "../public/samples", f), "utf8");
let result: AuditResult;
let dates: (string | undefined)[];
beforeAll(async () => {
  const p = prepareFromText({ invoiceCsv: read("sample_invoice_delhivery.csv"), ordersCsv: read("sample_shopify_orders.csv"), rateCardJson: read("sample_rate_card.json") });
  dates = p.invoice.rows.map((r) => r.invoiceDate);
  result = await runAudit({ invoice: p.invoice.rows, orders: p.orders.rows, rateCards: p.rateCards });
});

describe("summary", () => {
  it("totals agree with the issues", () => {
    const s = summarize(result);
    expect(s.byType.reduce((a, t) => a + t.count, 0)).toBe(result.issues.length);
    expect(Math.abs(s.byType.reduce((a, t) => a + t.amount, 0) - s.totalOvercharge)).toBeLessThan(0.01);
    expect(s.byCourier).toHaveLength(1);
    expect(s.byCourier[0]!.amount).toBe(s.totalOvercharge);
    expect(s.percentOfInvoice).toBeGreaterThan(0);
    expect(s.shipmentsAffected).toBe(31); // 34 issues, 2 unmatched (₹0), 1 AWB with two issues
  });
});

describe("exports", () => {
  it("dispute CSV round-trips and protects against formula injection", () => {
    const csv = disputeCsv(result.issues);
    const t = readCsvText(csv);
    expect(t.rows).toHaveLength(result.issues.length);
    expect(t.headers[0]).toBe("AWB");
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it("full report has one row per shipment plus one per issue", () => {
    const t = readCsvText(fullReportCsv(result));
    expect(t.rows).toHaveLength(result.shipments.length + result.issues.length);
  });
});

describe("dispute email", () => {
  it("has the required subject format and an inline top-10 table", () => {
    const period = invoicePeriod(dates);
    expect(period).toMatch(/Sept? 2026 – .*Sept? 2026/);
    const e = disputeEmail({ courier: "Delhivery", issues: result.issues, period });
    expect(e.subject).toMatch(/^Billing dispute – Invoice .+ – 31 shipments, ₹[\d,]+\.\d{2}$/);
    expect(e.body).toContain("Dear Delhivery Billing Team");
    expect(e.body).toContain("Top 10 AWBs by amount");
    expect(e.body).toContain(e.attachmentName);
    expect(e.body).toContain("do not match any of our orders");
  });
});
