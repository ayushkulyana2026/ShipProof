import { describe, expect, it } from "vitest";
import { codFor, expectedCost, freightFor, rtoFor } from "@/lib/engine/cost";
import { defaultRateCard } from "@/lib/engine/defaults";
import { formatINR, pctOf, round2 } from "@/lib/engine/money";
import { chargeableWeight, slabs, volumetricWeightKg } from "@/lib/engine/weight";
import type { Order } from "@/lib/types";

const card = defaultRateCard();
const order = (o: Partial<Order> = {}): Order => ({
  orderId: "#1001",
  awb: "123",
  destinationPincode: "560001",
  actualWeightKg: 0.4,
  paymentMode: "Prepaid",
  orderValue: 999,
  ...o,
});

describe("money", () => {
  it("rounds to paise without float noise", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(-2.345)).toBe(-2.35);
  });
  it("formats INR Indian-style", () => {
    expect(formatINR(123456)).toBe("₹1,23,456.00");
    expect(formatINR(1234567.891)).toBe("₹12,34,567.89");
    expect(formatINR(999)).toBe("₹999.00");
    expect(formatINR(1000)).toBe("₹1,000.00");
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(-1500.5)).toBe("-₹1,500.50");
    expect(formatINR(10000000, { decimals: 0 })).toBe("₹1,00,00,000");
  });
});

describe("volumetric & chargeable weight", () => {
  it("computes L×B×H / divisor", () => {
    expect(volumetricWeightKg({ lengthCm: 20, breadthCm: 15, heightCm: 10 }, 5000)).toBe(0.6);
    expect(volumetricWeightKg({ lengthCm: 30, breadthCm: 20, heightCm: 10 }, 4000)).toBe(1.5);
  });
  it("chargeable = max(actual, volumetric)", () => {
    expect(chargeableWeight(order({ lengthCm: 20, breadthCm: 15, heightCm: 10 }), card).chargeableKg).toBe(0.6);
    expect(chargeableWeight(order({ actualWeightKg: 1.2, lengthCm: 20, breadthCm: 15, heightCm: 10 }), card).chargeableKg).toBe(1.2);
  });
  it("uses the default box only when dimensions are missing", () => {
    const box = { lengthCm: 25, breadthCm: 20, heightCm: 10 };
    const w = chargeableWeight(order(), card, box);
    expect(w.usedDefaultBox).toBe(true);
    expect(w.chargeableKg).toBe(1);
    const own = chargeableWeight(order({ lengthCm: 10, breadthCm: 10, heightCm: 10 }), card, box);
    expect(own.usedDefaultBox).toBe(false);
    expect(own.chargeableKg).toBe(0.4);
  });
  it("falls back to actual weight without any box", () => {
    const w = chargeableWeight(order(), card, null);
    expect(w.volumetricKg).toBeNull();
    expect(w.chargeableKg).toBe(0.4);
  });
});

describe("slab rounding", () => {
  it.each([
    [0.1, 0, 0.5],
    [0.5, 0, 0.5],
    [0.51, 1, 1],
    [1.0, 1, 1],
    [1.01, 2, 1.5],
    [2.5, 4, 2.5],
    [0.3 + 0.2, 0, 0.5], // float noise must not bump a slab
  ])("%s kg → %s extra slabs (%s kg)", (kg, extra, slabbed) => {
    expect(slabs(kg, card)).toEqual({ extraSlabs: extra, slabbedKg: slabbed });
  });
  it("supports 1 kg additional slabs", () => {
    expect(slabs(1.6, { firstSlabKg: 0.5, additionalSlabKg: 1 })).toEqual({ extraSlabs: 2, slabbedKg: 2.5 });
  });
});

describe("freight, COD, RTO, GST", () => {
  it("prices freight by zone and slabs", () => {
    expect(freightFor("A", 0.5, card).freight).toBe(32);
    expect(freightFor("C", 0.51, card).freight).toBe(85);
    expect(freightFor("D", 2.5, card).freight).toBe(52 + 4 * 48);
  });
  it("COD = max(fixed, percent × value)", () => {
    expect(codFor({ paymentMode: "COD", orderValue: 999 }, card)).toBe(35); // 1.75% = 17.48
    expect(codFor({ paymentMode: "COD", orderValue: 2000 }, card)).toBe(35); // exactly 35
    expect(codFor({ paymentMode: "COD", orderValue: 4000 }, card)).toBe(70);
    expect(codFor({ paymentMode: "COD", orderValue: 2999 }, card)).toBe(52.48);
    expect(codFor({ paymentMode: "Prepaid", orderValue: 4000 }, card)).toBe(0);
  });
  it("RTO rules", () => {
    expect(rtoFor(80, { rtoRule: "same_as_forward" })).toBe(80);
    expect(rtoFor(80, { rtoRule: "percent_of_forward", rtoValue: 75 })).toBe(60);
    expect(rtoFor(80, { rtoRule: "flat", rtoValue: 45 })).toBe(45);
  });
  it("GST is applied on freight + fuel + COD + RTO", () => {
    expect(pctOf(100, 18)).toBe(18);
    const c = { ...card, fuelSurchargePercent: 10 };
    const e = expectedCost(order({ paymentMode: "COD", orderValue: 1000, actualWeightKg: 0.7 }), "B", c, { isRto: true });
    expect(e.freight).toBe(72); // 38 + 34
    expect(e.fuel).toBe(7.2);
    expect(e.cod).toBe(35);
    expect(e.rto).toBe(72);
    expect(e.gst).toBe(round2((72 + 7.2 + 35 + 72) * 0.18));
    expect(e.total).toBe(round2(72 + 7.2 + 35 + 72 + e.gst));
  });
  it("RTO is only charged for RTO shipments", () => {
    expect(expectedCost(order(), "A", card, { isRto: false }).rto).toBe(0);
  });
});
