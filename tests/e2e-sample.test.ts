/**
 * MAIN ACCEPTANCE CHECK: run the full pipeline (CSV → auto column mapping →
 * parsing → audit) on the sample files and assert that every planted error is
 * found and nothing else is flagged.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runAudit, type AuditResult } from "@/lib/checks/audit";
import { round2 } from "@/lib/engine/money";
import { prepareFromText } from "@/lib/pipeline";

const dir = path.join(__dirname, "../public/samples");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
type Expected = {
  counts: Record<string, number>;
  totalOvercharge: number;
  overchargeByAwb: Record<string, number>;
  planted: { awb: string; type: string }[];
  mustNotFlag: { awb: string }[];
  invoiceLines: number;
  shipments: number;
};
const expected = JSON.parse(read("sample_expected_results.json")) as Expected;

let result: AuditResult;
let prepared: ReturnType<typeof prepareFromText>;

beforeAll(async () => {
  prepared = prepareFromText({
    invoiceCsv: read("sample_invoice_delhivery.csv"),
    ordersCsv: read("sample_shopify_orders.csv"),
    rateCardJson: read("sample_rate_card.json"),
  });
  result = await runAudit({ invoice: prepared.invoice.rows, orders: prepared.orders.rows, rateCards: prepared.rateCards });
});

describe("sample data end-to-end", () => {
  it("parses every row without errors", () => {
    expect(prepared.invoice.errors).toEqual([]);
    expect(prepared.orders.errors).toEqual([]);
    expect(prepared.invoice.rows).toHaveLength(expected.invoiceLines);
    expect(prepared.orders.rows).toHaveLength(expected.shipments);
    expect(prepared.invoiceTable.blankRows).toBeGreaterThan(0); // the planted blank row is skipped
  });

  it("keeps AWBs with leading zeros as strings", () => {
    expect(prepared.orders.rows.some((o) => o.awb.startsWith("00"))).toBe(true);
    expect(prepared.invoice.rows.some((l) => l.awb.startsWith("00"))).toBe(true);
  });

  it("finds exactly the planted errors — nothing missing, nothing extra", () => {
    const key = (i: { awb: string; type: string }) => `${i.type}:${i.awb}`;
    const found = result.issues.map(key).sort();
    const planted = expected.planted.map(key).sort();
    const missing = planted.filter((k) => !found.includes(k));
    const extra = found.filter((k) => !planted.includes(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(found).toHaveLength(planted.length);
  });

  it("matches planted counts by type", () => {
    const counts: Record<string, number> = {};
    for (const i of result.issues) counts[i.type] = (counts[i.type] ?? 0) + 1;
    expect(counts).toEqual(expected.counts);
    expect(counts).toEqual({
      WEIGHT_OVERCHARGE: 12,
      WRONG_ZONE: 6,
      COD_ON_PREPAID: 4,
      COD_WRONG_AMOUNT: 3,
      DUPLICATE_AWB: 2,
      RTO_WITHOUT_RETURN: 3,
      RTO_WRONG_RATE: 2,
      UNMATCHED_AWB: 2,
    });
  });

  it("computes the overcharge per AWB (independently calculated) within ₹0.05", () => {
    const byAwb: Record<string, number> = {};
    for (const i of result.issues) byAwb[i.awb] = round2((byAwb[i.awb] ?? 0) + i.overchargeAmount);
    for (const [awb, amount] of Object.entries(expected.overchargeByAwb)) {
      expect(Math.abs((byAwb[awb] ?? 0) - amount), `AWB ${awb}`).toBeLessThanOrEqual(0.05);
    }
    const total = round2(result.issues.reduce((a, i) => a + i.overchargeAmount, 0));
    expect(Math.abs(total - expected.totalOvercharge)).toBeLessThanOrEqual(0.5);
  });

  it("does not double-count the AWB with both weight and zone errors", () => {
    const byAwb = new Map<string, string[]>();
    for (const p of expected.planted) byAwb.set(p.awb, [...(byAwb.get(p.awb) ?? []), p.type]);
    const combo = [...byAwb.entries()].find(([, t]) => t.includes("WEIGHT_OVERCHARGE") && t.includes("WRONG_ZONE"));
    expect(combo).toBeDefined();
    const [awb] = combo!;
    const issues = result.issues.filter((i) => i.awb === awb);
    const shipment = result.shipments.find((s) => s.awb === awb)!;
    expect(round2(issues.reduce((a, i) => a + i.overchargeAmount, 0))).toBe(shipment.overcharge);
    expect(shipment.overcharge).toBe(round2(shipment.billedTotal - shipment.correctedTotal));
  });

  it("does not flag the near-miss shipments", () => {
    const flagged = new Set(result.issues.map((i) => i.awb));
    for (const n of expected.mustNotFlag) expect(flagged.has(n.awb), n.awb).toBe(false);
  });

  it("every issue shows its working", () => {
    for (const i of result.issues) {
      expect(i.expected.length).toBeGreaterThan(0);
      expect(i.billed.length).toBeGreaterThan(0);
      expect(i.explanation).toContain(i.awb);
      expect(i.working?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
