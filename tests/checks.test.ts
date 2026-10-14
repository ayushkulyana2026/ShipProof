import { describe, expect, it } from "vitest";
import { allocate, runAudit } from "@/lib/checks/audit";
import { defaultRateCard } from "@/lib/engine/defaults";
import { round2 } from "@/lib/engine/money";
import { staticDirectory } from "@/lib/pincode/directory";
import type { InvoiceLine, Order, RateCard } from "@/lib/types";

// Origin 100001 (City X, State S1). 100002 = same city (A). 200001 = other state, not metro (D).
const directory = () =>
  staticDirectory({
    "100001": { district: "City X", state: "S1" },
    "100002": { district: "City X", state: "S1" },
    "100003": { district: "City Y", state: "S1" },
    "200001": { district: "City Z", state: "S2" },
  });
const card: RateCard = { ...defaultRateCard("TestCourier", "100001"), fuelSurchargePercent: 10 };
// D rates: 52 + 48/slab. A rates: 32 + 30/slab.

const order = (o: Partial<Order> = {}): Order => ({
  orderId: "#1",
  awb: "0001",
  destinationPincode: "200001",
  actualWeightKg: 0.4,
  lengthCm: 10,
  breadthCm: 10,
  heightCm: 10,
  paymentMode: "Prepaid",
  orderValue: 1000,
  status: "Delivered",
  ...o,
});

/** A correctly billed line, with optional overrides; totals are recomputed from components. */
function line(o: Partial<InvoiceLine> = {}): InvoiceLine {
  const base: InvoiceLine = {
    awb: "0001",
    courier: "TestCourier",
    billedWeightKg: 0.5,
    billedZone: "D",
    freightCharge: 52,
    codCharge: 0,
    rtoCharge: 0,
    otherCharges: 0,
    totalCharge: 0,
    shipmentType: "forward",
    ...o,
  };
  const fuel = o.fuelSurcharge ?? round2((base.freightCharge + (base.rtoCharge ?? 0)) * 0.1);
  const gst = o.gst ?? round2((base.freightCharge + fuel + (base.codCharge ?? 0) + (base.rtoCharge ?? 0)) * 0.18);
  return { ...base, fuelSurcharge: fuel, gst, totalCharge: o.totalCharge ?? round2(base.freightCharge + fuel + (base.codCharge ?? 0) + (base.rtoCharge ?? 0) + gst) };
}

async function audit(invoice: InvoiceLine[], orders: Order[]) {
  return runAudit({ invoice, orders, rateCards: [card], directory: directory() });
}
const types = (r: Awaited<ReturnType<typeof audit>>) => r.issues.map((i) => i.type).sort();

describe("clean shipment", () => {
  it("flags nothing when billed per rate card", async () => {
    const r = await audit([line()], [order()]);
    expect(r.issues).toEqual([]);
    expect(r.shipments[0]!.overcharge).toBe(0);
  });
});

describe("WEIGHT_OVERCHARGE", () => {
  it("flags billed weight beyond tolerance in a higher slab", async () => {
    const r = await audit([line({ billedWeightKg: 1.0, freightCharge: 100 })], [order()]);
    expect(types(r)).toEqual(["WEIGHT_OVERCHARGE"]);
    // pre-tax 48, + 10% fuel + 18% GST
    expect(r.issues[0]!.overchargeAmount).toBe(round2(48 * 1.1 * 1.18));
  });
  it("does not flag within tolerance even if it crosses a slab", async () => {
    // chargeable 0.5 (actual 0.5); billed 0.54 → slab 1.0 but within 10%
    const r = await audit([line({ billedWeightKg: 0.54, freightCharge: 100 })], [order({ actualWeightKg: 0.5 })]);
    expect(types(r)).toEqual([]);
  });
  it("does not flag a higher weight in the same slab", async () => {
    const r = await audit([line({ billedWeightKg: 0.5 })], [order({ actualWeightKg: 0.2 })]);
    expect(types(r)).toEqual([]);
  });
  it("uses volumetric weight", async () => {
    // 30×20×10/5000 = 1.2 kg chargeable → billed 1.5 kg slab is fair
    const r = await audit([line({ billedWeightKg: 1.5, freightCharge: 52 + 2 * 48 })], [order({ lengthCm: 30, breadthCm: 20, heightCm: 10 })]);
    expect(types(r)).toEqual([]);
  });
});

describe("WRONG_ZONE", () => {
  it("flags a pricier billed zone", async () => {
    const r = await audit([line({ billedZone: "D", freightCharge: 52 })], [order({ destinationPincode: "100002" })]);
    expect(types(r)).toEqual(["WRONG_ZONE"]);
    expect(r.issues[0]!.overchargeAmount).toBe(round2(20 * 1.1 * 1.18));
  });
  it("does not flag a cheaper billed zone", async () => {
    const r = await audit([line({ billedZone: "A", freightCharge: 32 })], [order({ destinationPincode: "200001" })]);
    expect(types(r)).toEqual([]);
  });
  it("skips zone checks for unknown pincodes", async () => {
    const r = await audit([line({ billedZone: "E", freightCharge: 68 })], [order({ destinationPincode: "300001" })]);
    expect(types(r)).toEqual([]);
  });
});

describe("weight + zone on the same AWB", () => {
  it("splits one AWB overcharge without double-counting", async () => {
    // Correct: zone A, 0.5 kg → ₹32. Billed: zone D, 1.0 kg → ₹100.
    const l = line({ billedZone: "D", billedWeightKg: 1.0, freightCharge: 100 });
    const r = await audit([l], [order({ destinationPincode: "100002" })]);
    expect(types(r)).toEqual(["WEIGHT_OVERCHARGE", "WRONG_ZONE"]);
    const total = round2(r.issues.reduce((a, i) => a + i.overchargeAmount, 0));
    const correct = round2(32 * 1.1 * 1.18);
    expect(total).toBe(round2(l.totalCharge - correct));
    expect(r.shipments[0]!.overcharge).toBe(total);
  });
});

describe("RATE_MISMATCH", () => {
  it("flags freight above the rate card for the billed weight/zone", async () => {
    const r = await audit([line({ freightCharge: 60 })], [order()]);
    expect(types(r)).toEqual(["RATE_MISMATCH"]);
  });
  it("allows ₹1 rounding", async () => {
    const r = await audit([line({ freightCharge: 52.9 })], [order()]);
    expect(types(r)).toEqual([]);
  });
});

describe("COD checks", () => {
  it("COD_ON_PREPAID", async () => {
    const r = await audit([line({ codCharge: 35 })], [order({ paymentMode: "Prepaid" })]);
    expect(types(r)).toEqual(["COD_ON_PREPAID"]);
    expect(r.issues[0]!.overchargeAmount).toBe(round2(35 * 1.18));
  });
  it("COD_WRONG_AMOUNT above max(fixed, %) + ₹1", async () => {
    const r = await audit([line({ codCharge: 70 })], [order({ paymentMode: "COD", orderValue: 2999 })]);
    expect(types(r)).toEqual(["COD_WRONG_AMOUNT"]); // expected 52.48
    expect(r.issues[0]!.overchargeAmount).toBe(round2((70 - 52.48) * 1.18));
  });
  it("correct COD is not flagged", async () => {
    const r = await audit([line({ codCharge: 52.48 })], [order({ paymentMode: "COD", orderValue: 2999 })]);
    expect(types(r)).toEqual([]);
  });
});

describe("DUPLICATE_AWB", () => {
  it("flags repeat lines with the same shipment type", async () => {
    const l = line();
    const r = await audit([l, { ...l }], [order()]);
    expect(types(r)).toEqual(["DUPLICATE_AWB"]);
    expect(r.issues[0]!.overchargeAmount).toBe(l.totalCharge);
  });
  it("forward + RTO lines for one AWB are not duplicates", async () => {
    const rto = line({ shipmentType: "rto", freightCharge: 52, billedZone: undefined });
    const r = await audit([line(), rto], [order({ status: "RTO" })]);
    expect(types(r)).toEqual([]);
  });
});

describe("RTO checks", () => {
  it("RTO_WITHOUT_RETURN when the order was delivered", async () => {
    const r = await audit([line(), line({ shipmentType: "rto", freightCharge: 52 })], [order({ status: "Delivered" })]);
    expect(types(r)).toEqual(["RTO_WITHOUT_RETURN"]);
    expect(r.issues[0]!.overchargeAmount).toBe(round2(52 * 1.1 * 1.18));
  });
  it("RTO_WRONG_RATE above the rule", async () => {
    const r = await audit([line(), line({ shipmentType: "rto", freightCharge: 80 })], [order({ status: "RTO" })]);
    expect(types(r)).toEqual(["RTO_WRONG_RATE"]);
  });
  it("supports an RTO column on the forward line", async () => {
    const r = await audit([line({ rtoCharge: 52 })], [order({ status: "RTO" })]);
    expect(types(r)).toEqual([]);
    const bad = await audit([line({ rtoCharge: 52 })], [order({ status: "Delivered" })]);
    expect(types(bad)).toEqual(["RTO_WITHOUT_RETURN"]);
  });
});

describe("UNMATCHED_AWB", () => {
  it("is informational with ₹0", async () => {
    const r = await audit([line({ awb: "9999" })], [order()]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ type: "UNMATCHED_AWB", severity: "low", overchargeAmount: 0 });
  });
  it("keeps leading zeros when matching", async () => {
    const r = await audit([line({ awb: "0001" })], [order({ awb: "1" })]);
    expect(types(r)).toEqual(["UNMATCHED_AWB"]);
  });
});

describe("allocate", () => {
  it("splits in paise and sums exactly", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(round2(parts.reduce((a, b) => a + b, 0))).toBe(100);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
  });
});
