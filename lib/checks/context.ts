import { expectedCost, freightFor, type ExpectedCost, type FreightBreakdown } from "../engine/cost";
import { round2, roundQty } from "../engine/money";
import type { WeightBreakdown } from "../engine/weight";
import { chargeableWeight } from "../engine/weight";
import type { BoxSize, InvoiceLine, IssueType, Order, RateCard, ResolvedZone, Zone } from "../types";

/** Billed amounts for one AWB, after duplicates are removed and forward + RTO lines are merged. */
export type BilledParts = {
  freight: number;
  cod: number;
  rto: number;
  fuel: number;
  other: number;
  gst: number;
  total: number;
};

/** Everything a check needs to know about one matched shipment. */
export type ShipmentContext = {
  awb: string;
  courier: string;
  order: Order;
  card: RateCard;
  /** Non-duplicate invoice lines for this AWB. */
  lines: InvoiceLine[];
  billed: BilledParts;
  /** The forward line (first one), if the invoice has one for this AWB. */
  forwardLine: InvoiceLine | null;
  billedWeightKg: number | null;
  billedZone: Zone | null;
  weight: WeightBreakdown;
  expectedZone: ResolvedZone;
  zoneReason: string;
  /** Zone used to price the shipment: expected zone, or billed zone when the expected one is unknown. */
  pricingZone: Zone | null;
  isRto: boolean;
  /** Full rate-card cost (null when no zone is available to price it). */
  expected: ExpectedCost | null;
};

/** One detected problem before its rupee amount is finalised by the orchestrator. */
export type Finding = {
  type: IssueType;
  /** Which billed component this finding corrects. */
  component: "freight" | "cod" | "rto";
  /** Pre-tax overcharge on that component (₹). */
  base: number;
  expected: string;
  billed: string;
  /** Builds the dispute sentence once the final amount (incl. fuel/GST share) is known. */
  explain: (amount: number) => string;
  working: string[];
};

export function emptyParts(): BilledParts {
  return { freight: 0, cod: 0, rto: 0, fuel: 0, other: 0, gst: 0, total: 0 };
}

/**
 * Split a line into components. For an RTO line with no separate RTO column,
 * the freight column is the RTO charge. When GST is missing but the total is
 * larger than the components, the gap is treated as tax.
 */
export function lineParts(line: InvoiceLine): BilledParts {
  const isRtoLine = line.shipmentType === "rto";
  const rtoCol = line.rtoCharge ?? 0;
  const freight = isRtoLine && rtoCol === 0 ? 0 : line.freightCharge;
  const rto = isRtoLine && rtoCol === 0 ? line.freightCharge : rtoCol;
  const cod = line.codCharge ?? 0;
  const fuel = line.fuelSurcharge ?? 0;
  const other = line.otherCharges ?? 0;
  const pre = round2(freight + rto + cod + fuel + other);
  const gst = line.gst ?? (line.totalCharge - pre > 1 ? round2(line.totalCharge - pre) : 0);
  return { freight, cod, rto, fuel, other, gst, total: line.totalCharge };
}

export function mergeParts(parts: BilledParts[]): BilledParts {
  const m = emptyParts();
  for (const p of parts) {
    m.freight += p.freight;
    m.cod += p.cod;
    m.rto += p.rto;
    m.fuel += p.fuel;
    m.other += p.other;
    m.gst += p.gst;
    m.total += p.total;
  }
  for (const k of Object.keys(m) as (keyof BilledParts)[]) m[k] = round2(m[k]);
  return m;
}

export function buildContext(args: {
  awb: string;
  courier: string;
  order: Order;
  card: RateCard;
  lines: InvoiceLine[];
  expectedZone: ResolvedZone;
  zoneReason: string;
  defaultBox?: BoxSize | null;
}): ShipmentContext {
  const { order, card, lines, expectedZone } = args;
  const forwardLine = lines.find((l) => (l.shipmentType ?? "forward") === "forward") ?? null;
  const billedZone = forwardLine?.billedZone ?? lines.find((l) => l.billedZone)?.billedZone ?? null;
  const pricingZone: Zone | null = expectedZone !== "Unknown" ? expectedZone : billedZone;
  const isRto = order.status === "RTO";
  return {
    awb: args.awb,
    courier: args.courier,
    order,
    card,
    lines,
    billed: mergeParts(lines.map(lineParts)),
    forwardLine,
    billedWeightKg: forwardLine ? roundQty(forwardLine.billedWeightKg) : null,
    billedZone,
    weight: chargeableWeight(order, card, args.defaultBox),
    expectedZone,
    zoneReason: args.zoneReason,
    pricingZone,
    isRto,
    expected: pricingZone ? expectedCost(order, pricingZone, card, { isRto, defaultBox: args.defaultBox }) : null,
  };
}

export function describeFreight(f: FreightBreakdown): string {
  const extra = f.extraSlabs > 0 ? ` + ${f.extraSlabs} × ₹${f.additionalSlabRate}` : "";
  return `Zone ${f.zone}, ${f.slabbedKg} kg slab: ₹${f.firstSlabRate}${extra} = ₹${f.freight.toFixed(2)}`;
}

export { freightFor };
