/** Keeps the documented outcomes in TESTING.md true for the messy tester file. */
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { runAudit } from "@/lib/checks/audit";
import { autoMap, INVOICE_FIELDS, missingRequired, ORDER_FIELDS } from "@/lib/parsing/mapping";
import { normalizeInvoice, normalizeOrders } from "@/lib/parsing/normalize";
import { parseRateCardJson } from "@/lib/parsing/rateCard";
import { readCsvText } from "@/lib/parsing/read";
import { guessWeightUnit } from "@/lib/pipeline";

const read = (f: string) => fs.readFileSync(path.join(__dirname, "../public/samples", f), "utf8");

it("tester_shiprocket_style_invoice.csv: auto-maps, detects grams, reports the 2 broken rows, finds 4 weight overcharges", async () => {
  const t = readCsvText(read("tester_shiprocket_style_invoice.csv"));
  const m = autoMap(t.headers, INVOICE_FIELDS);
  expect(missingRequired(m, INVOICE_FIELDS)).toEqual([]);
  expect(m.courier).toBe(1);
  expect(guessWeightUnit(t, m.billedWeightKg)).toBe("g");
  const inv = normalizeInvoice(t, m, { weightUnit: "g" });
  expect(inv.rows).toHaveLength(60);
  expect(inv.errors.map((e) => e.row)).toEqual([62, 63]);
  expect(inv.skipped).toBe(1); // the TOTAL footer row

  const ot = readCsvText(read("sample_shopify_orders.csv"));
  const orders = normalizeOrders(ot, autoMap(ot.headers, ORDER_FIELDS));
  const res = await runAudit({ invoice: inv.rows, orders: orders.rows, rateCards: parseRateCardJson(read("sample_rate_card.json")) });
  const counts: Record<string, number> = {};
  for (const i of res.issues) counts[i.type] = (counts[i.type] ?? 0) + 1;
  expect(counts).toEqual({ WEIGHT_OVERCHARGE: 4 });
  expect(Math.round(res.issues.reduce((a, i) => a + i.overchargeAmount, 0) * 100) / 100).toBe(310.96);
});
