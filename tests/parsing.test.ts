import { describe, expect, it } from "vitest";
import { autoMap, INVOICE_FIELDS, missingRequired, ORDER_FIELDS } from "@/lib/parsing/mapping";
import { normalizeInvoice, normalizeOrders } from "@/lib/parsing/normalize";
import { parseRateCardCsv, parseRateCardJson } from "@/lib/parsing/rateCard";
import { readCsvText } from "@/lib/parsing/read";
import { parseAmount, parseAwb, parsePaymentMode, parseStatus, parseZone } from "@/lib/parsing/values";
import fs from "node:fs";
import path from "node:path";

describe("value parsers", () => {
  it("parses ₹ symbols, commas and Indian grouping", () => {
    expect(parseAmount("₹1,23,456.50")).toBe(123456.5);
    expect(parseAmount("Rs. 99")).toBe(99);
    expect(parseAmount("INR 1,000")).toBe(1000);
    expect(parseAmount(" 45.00 ")).toBe(45);
    expect(parseAmount("(12.50)")).toBe(-12.5);
    expect(parseAmount("0.5 kg")).toBe(0.5);
    expect(parseAmount("")).toBeUndefined();
    expect(parseAmount("-")).toBeUndefined();
    expect(parseAmount("abc")).toBeNaN();
  });
  it("keeps AWBs as strings with leading zeros", () => {
    expect(parseAwb("000123456789")).toBe("000123456789");
    expect(parseAwb("'0012345")).toBe("0012345");
    expect(parseAwb("12345.0")).toBe("12345");
    expect(parseAwb(" sf 123 ")).toBe("SF123");
  });
  it("parses zones in many spellings", () => {
    expect(parseZone("A")).toBe("A");
    expect(parseZone("Zone C")).toBe("C");
    expect(parseZone("zone_d")).toBe("D");
    expect(parseZone("Within City")).toBe("A");
    expect(parseZone("Metro to Metro")).toBe("C");
    expect(parseZone("ROI")).toBe("D");
    expect(parseZone("North East")).toBe("E");
    expect(parseZone("Z")).toBeUndefined();
  });
  it("parses payment mode and status", () => {
    expect(parsePaymentMode("Cash on Delivery (COD)")).toBe("COD");
    expect(parsePaymentMode("cod")).toBe("COD");
    expect(parsePaymentMode("Razorpay Secure (UPI, Cards)")).toBe("Prepaid");
    expect(parseStatus("RTO Delivered")).toBe("RTO");
    expect(parseStatus("Delivered")).toBe("Delivered");
    expect(parseStatus("In Transit")).toBe("In transit");
    expect(parseStatus("Cancelled")).toBe("Cancelled");
  });
});

describe("CSV reading", () => {
  it("skips blank rows and keeps text exactly", () => {
    const t = readCsvText("AWB,Total\n00123,₹1\n,\n\n00456,\"₹1,200.00\"\n");
    expect(t.headers).toEqual(["AWB", "Total"]);
    expect(t.rows).toEqual([["00123", "₹1"], ["00456", "₹1,200.00"]]);
    expect(t.rowNumbers).toEqual([2, 5]);
    expect(t.blankRows).toBe(3);
  });
  it("strips a UTF-8 BOM and skips a leading blank line", () => {
    const t = readCsvText("﻿\nAWB No.,Weight\n1,0.5\n");
    expect(t.headers).toEqual(["AWB No.", "Weight"]);
  });
});

describe("column auto-mapping", () => {
  it("maps invoice headers with different names and cases", () => {
    const headers = ["WAYBILL NO", "charged wt (kg)", "Zone Name", "Forward Freight", "cod fee", "RTO Freight", "FSC", "IGST", "Grand Total", "Movement Type", "Manifest Date"];
    const m = autoMap(headers, INVOICE_FIELDS);
    expect(m.awb).toBe(0);
    expect(m.billedZone).toBe(2);
    expect(m.freightCharge).toBe(3);
    expect(m.codCharge).toBe(4);
    expect(m.rtoCharge).toBe(5);
    expect(m.fuelSurcharge).toBe(6);
    expect(m.gst).toBe(7);
    expect(m.totalCharge).toBe(8);
    expect(m.shipmentType).toBe(9);
    expect(m.invoiceDate).toBe(10);
    expect(m.billedWeightKg).toBe(1);
    expect(missingRequired(m, INVOICE_FIELDS)).toEqual([]);
  });
  it("never maps 'COD Amount' (collected value) as the COD fee", () => {
    const m = autoMap(["AWB", "COD Amount", "Weight", "Freight", "Total"], INVOICE_FIELDS);
    expect(m.codCharge).toBeNull();
  });
  it("maps Shopify-style order headers", () => {
    const m = autoMap(["Name", "Email", "Financial Status", "Shipping Zip", "Tracking Number", "Total", "Weight (kg)", "Payment Method"], ORDER_FIELDS);
    expect(m.orderId).toBe(0);
    expect(m.destinationPincode).toBe(3);
    expect(m.awb).toBe(4);
    expect(m.orderValue).toBe(5);
    expect(m.actualWeightKg).toBe(6);
    expect(m.paymentMode).toBe(7);
  });
  it("reports missing required fields", () => {
    const m = autoMap(["Foo", "Bar"], INVOICE_FIELDS);
    expect(missingRequired(m, INVOICE_FIELDS).map((f) => f.key)).toEqual(["awb", "billedWeightKg", "freightCharge"]);
  });
});

describe("normalization", () => {
  it("normalizes invoice rows, converts grams and validates", () => {
    const t = readCsvText(
      "AWB,Weight (g),Zone,Freight,COD Charges,Total\n" +
        "000111,500,Zone A,\"₹1,032.00\",,1032\n" +
        "000222,abc,B,40,,40\n" +
        ",,,,,\n" +
        "000333,1000,Q,40,,\n",
    );
    const m = autoMap(t.headers, INVOICE_FIELDS);
    const r = normalizeInvoice(t, m, { courier: "Delhivery", weightUnit: "g" });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ awb: "000111", courier: "Delhivery", billedWeightKg: 0.5, billedZone: "A", freightCharge: 1032, totalCharge: 1032 });
    expect(r.errors.map((e) => e.row)).toEqual([3, 5]); // bad weight; unknown zone warning
    expect(r.errors[0]!.message).toMatch(/Billed weight is not a number/);
    expect(r.rows[1]!.billedZone).toBeUndefined();
  });
  it("derives the total from components when there is no total column", () => {
    const t = readCsvText("AWB,Weight,Freight,COD Charges,GST\n1,0.5,40,35,13.5\n");
    const r = normalizeInvoice(t, autoMap(t.headers, INVOICE_FIELDS), { courier: "X" });
    expect(r.rows[0]!.totalCharge).toBe(88.5);
  });
  it("flags AWBs mangled into scientific notation by Excel", () => {
    const t = readCsvText("AWB,Weight,Freight,Total\n1.43265E+11,0.5,40,40\n");
    const r = normalizeInvoice(t, autoMap(t.headers, INVOICE_FIELDS), { courier: "X" });
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]!.message).toMatch(/scientific notation/);
  });
  it("normalizes orders and rejects bad pincodes", () => {
    const t = readCsvText(
      "Name,Tracking Number,Shipping Zip,Payment Method,Total,Weight (kg)\n" +
        "#1,0099,'560034,Cash on Delivery (COD),\"₹1,200.00\",0.4\n" +
        "#2,0100,5600,Prepaid,500,0.4\n" +
        "#3,,560034,Prepaid,500,0.4\n",
    );
    const r = normalizeOrders(t, autoMap(t.headers, ORDER_FIELDS));
    expect(r.rows).toEqual([{ orderId: "#1", awb: "0099", destinationPincode: "560034", actualWeightKg: 0.4, paymentMode: "COD", orderValue: 1200 }]);
    expect(r.errors[0]!.message).toMatch(/Pincode must be 6 digits/);
    expect(r.skipped).toBe(1);
  });
});

describe("rate card import", () => {
  const samples = path.join(__dirname, "../public/samples");
  it("reads the JSON sample", () => {
    const [card] = parseRateCardJson(fs.readFileSync(path.join(samples, "sample_rate_card.json"), "utf8"));
    expect(card!.rates.C).toEqual({ firstSlab: 45, additionalSlab: 40 });
  });
  it("reads the CSV template and matches the JSON", () => {
    const csv = parseRateCardCsv(fs.readFileSync(path.join(samples, "rate_card_template.csv"), "utf8"));
    const json = parseRateCardJson(fs.readFileSync(path.join(samples, "sample_rate_card.json"), "utf8"));
    expect(csv).toEqual(json);
  });
  it("rejects a template with a missing zone", () => {
    expect(() => parseRateCardCsv("courier,origin_pincode,zone,first_slab_rate,additional_slab_rate\nX,122016,A,30,30\n")).toThrow(/missing zone/);
  });
});

describe("Excel", () => {
  it("reads the .xlsx sample identically to the CSV, keeping text AWBs", async () => {
    const { readExcel } = await import("@/lib/parsing/read");
    const samples = path.join(__dirname, "../public/samples");
    const buf = fs.readFileSync(path.join(samples, "sample_invoice_delhivery.xlsx"));
    const xlsx = await readExcel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "sample.xlsx");
    const csv = readCsvText(fs.readFileSync(path.join(samples, "sample_invoice_delhivery.csv"), "utf8"));
    const a = normalizeInvoice(xlsx, autoMap(xlsx.headers, INVOICE_FIELDS), { courier: "Delhivery" });
    const b = normalizeInvoice(csv, autoMap(csv.headers, INVOICE_FIELDS), { courier: "Delhivery" });
    expect(a.errors).toEqual([]);
    expect(a.rows.map(({ sourceRow: _s, ...r }) => r)).toEqual(b.rows.map(({ sourceRow: _s, ...r }) => r));
    expect(a.rows.some((r) => r.awb.startsWith("00"))).toBe(true);
  });
});
