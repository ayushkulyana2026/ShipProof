import type { BoxSize, Order, RateCard, Zone } from "../types";
import { pctOf, round2 } from "./money";
import { chargeableWeight, slabs, type WeightBreakdown } from "./weight";

export type FreightBreakdown = {
  zone: Zone;
  weightKg: number;
  slabbedKg: number;
  extraSlabs: number;
  firstSlabRate: number;
  additionalSlabRate: number;
  freight: number;
};

/** freight = first-slab rate + extra slabs × additional-slab rate, for the given zone. */
export function freightFor(zone: Zone, weightKg: number, card: RateCard): FreightBreakdown {
  const rate = card.rates[zone];
  const { extraSlabs, slabbedKg } = slabs(weightKg, card);
  return {
    zone,
    weightKg,
    slabbedKg,
    extraSlabs,
    firstSlabRate: rate.firstSlab,
    additionalSlabRate: rate.additionalSlab,
    freight: round2(rate.firstSlab + extraSlabs * rate.additionalSlab),
  };
}

/** COD = max(codFixed, codPercent% × orderValue) for COD orders, 0 for prepaid. */
export function codFor(order: Pick<Order, "paymentMode" | "orderValue">, card: Pick<RateCard, "codFixed" | "codPercent">): number {
  if (order.paymentMode !== "COD") return 0;
  return round2(Math.max(card.codFixed, pctOf(order.orderValue, card.codPercent)));
}

/** RTO charge allowed by the rate card, given the forward freight. */
export function rtoFor(forwardFreight: number, card: Pick<RateCard, "rtoRule" | "rtoValue">): number {
  switch (card.rtoRule) {
    case "same_as_forward":
      return round2(forwardFreight);
    case "percent_of_forward":
      return pctOf(forwardFreight, card.rtoValue ?? 100);
    case "flat":
      return round2(card.rtoValue ?? 0);
  }
}

export function describeRtoRule(card: Pick<RateCard, "rtoRule" | "rtoValue">): string {
  switch (card.rtoRule) {
    case "same_as_forward":
      return "RTO = forward freight";
    case "percent_of_forward":
      return `RTO = ${card.rtoValue ?? 100}% of forward freight`;
    case "flat":
      return `RTO = flat ₹${card.rtoValue ?? 0}`;
  }
}

export type ExpectedCost = {
  weight: WeightBreakdown;
  freightDetail: FreightBreakdown;
  freight: number;
  fuel: number;
  cod: number;
  rto: number;
  gst: number;
  total: number;
};

/**
 * Full expected cost of one shipment under the rate card:
 * freight → fuel (on freight) → COD → RTO (only if RTO) → GST on the sum → total.
 */
export function expectedCost(
  order: Order,
  zone: Zone,
  card: RateCard,
  opts: { isRto: boolean; defaultBox?: BoxSize | null },
): ExpectedCost {
  const weight = chargeableWeight(order, card, opts.defaultBox);
  const freightDetail = freightFor(zone, weight.chargeableKg, card);
  const freight = freightDetail.freight;
  const fuel = pctOf(freight, card.fuelSurchargePercent);
  const cod = codFor(order, card);
  const rto = opts.isRto ? rtoFor(freight, card) : 0;
  const gst = pctOf(freight + fuel + cod + rto, card.gstPercent);
  const total = round2(freight + fuel + cod + rto + gst);
  return { weight, freightDetail, freight, fuel, cod, rto, gst, total };
}
