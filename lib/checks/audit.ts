import { formatINR, round2 } from "../engine/money";
import { PincodeDirectory } from "../pincode/directory";
import { DEFAULT_ZONE_SETTINGS, resolveZone, type ZoneSettings } from "../pincode/zones";
import type { BoxSize, InvoiceLine, Issue, Order, RateCard, ResolvedZone } from "../types";
import { checkCodOnPrepaid } from "./codOnPrepaid";
import { checkCodWrongAmount } from "./codWrongAmount";
import { buildContext, describeFreight, type BilledParts, type Finding, type ShipmentContext } from "./context";
import { splitDuplicates } from "./duplicateAwb";
import { checkRateMismatch } from "./rateMismatch";
import { checkRtoWithoutReturn } from "./rtoWithoutReturn";
import { checkRtoWrongRate } from "./rtoWrongRate";
import { severityFor } from "./severity";
import { checkUnmatchedAwb } from "./unmatchedAwb";
import { checkWeightOvercharge, describeWeight } from "./weightOvercharge";
import { checkWrongZone } from "./wrongZone";

/** Per-shipment checks, in the order they are evaluated. */
export const SHIPMENT_CHECKS: ((ctx: ShipmentContext) => Finding | null)[] = [
  checkWrongZone,
  checkWeightOvercharge,
  checkRateMismatch,
  checkCodOnPrepaid,
  checkCodWrongAmount,
  checkRtoWithoutReturn,
  checkRtoWrongRate,
];

export type AuditInput = {
  invoice: InvoiceLine[];
  orders: Order[];
  rateCards: RateCard[];
  zoneSettings?: ZoneSettings;
  defaultBox?: BoxSize | null;
  /** Defaults to the bundled India Post directory. */
  directory?: PincodeDirectory;
};

export type ShipmentResult = {
  awb: string;
  orderId?: string;
  courier: string;
  matched: boolean;
  destinationPincode?: string;
  expectedZone?: ResolvedZone;
  billedZone?: string;
  chargeableKg?: number;
  billedKg?: number;
  billedTotal: number;
  /** Full rate-card expected cost (null when it could not be priced). */
  expectedTotal: number | null;
  /** Billed total with only the flagged items corrected. */
  correctedTotal: number;
  overcharge: number;
  issueTypes: string[];
};

export type Assumptions = {
  defaultBox: BoxSize | null;
  ordersUsingDefaultBox: number;
  ordersWithoutDimensions: number;
  unknownPincodes: { pincode: string; awbs: string[] }[];
  originUnknown: string[];
  couriersWithoutOwnRateCard: { courier: string; usedRateCardOf: string }[];
  couriersSkipped: string[];
  zoneSettings: ZoneSettings;
  rateCards: RateCard[];
  ordersNotOnInvoice: number;
};

export type AuditResult = {
  issues: Issue[];
  shipments: ShipmentResult[];
  invoiceTotal: number;
  invoiceLineCount: number;
  assumptions: Assumptions;
};

const normCourier = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const normAwb = (s: string) => s.trim().replace(/\s+/g, "").toUpperCase();

/**
 * Split `total` across findings in proportion to their pre-tax base, in whole
 * paise, so the parts always add back up to the total exactly.
 */
export function allocate(total: number, bases: number[]): number[] {
  const paise = Math.round(total * 100);
  const sumBase = bases.reduce((a, b) => a + b, 0);
  if (bases.length === 0) return [];
  if (sumBase <= 0) return bases.map((_, i) => (i === 0 ? paise / 100 : 0));
  const parts = bases.map((b) => Math.floor((paise * b) / sumBase));
  const remainder = paise - parts.reduce((a, b) => a + b, 0);
  let largest = 0;
  bases.forEach((b, i) => {
    if (b > (bases[largest] ?? 0)) largest = i;
  });
  parts[largest] = (parts[largest] ?? 0) + remainder;
  return parts.map((p) => p / 100);
}

/**
 * Correct only the flagged components, then carry the change through to fuel
 * surcharge and GST in the same proportion the courier applied them.
 */
export function correctBill(billed: BilledParts, findings: Finding[]) {
  const delta = { freight: 0, cod: 0, rto: 0 };
  for (const f of findings) delta[f.component] += f.base;
  const freight = round2(Math.max(0, billed.freight - delta.freight));
  const cod = round2(Math.max(0, billed.cod - delta.cod));
  const rto = round2(Math.max(0, billed.rto - delta.rto));
  const fuelBase = billed.freight + billed.rto;
  const fuel = fuelBase > 0 ? round2((billed.fuel * (freight + rto)) / fuelBase) : billed.fuel;
  const taxable = billed.freight + billed.fuel + billed.cod + billed.rto + billed.other;
  const correctedTaxable = freight + fuel + cod + rto + billed.other;
  const gst = taxable > 0 ? round2((billed.gst * correctedTaxable) / taxable) : billed.gst;
  const overcharge = round2(billed.freight - freight + (billed.fuel - fuel) + (billed.cod - cod) + (billed.rto - rto) + (billed.gst - gst));
  return { freight, cod, rto, fuel, gst, overcharge, total: round2(billed.total - overcharge) };
}

function shipmentWorking(ctx: ShipmentContext, corrected: ReturnType<typeof correctBill>): string[] {
  const b = ctx.billed;
  const lines = [
    "— Shipment summary —",
    ...describeWeight(ctx),
    `Expected zone: ${ctx.expectedZone} — ${ctx.zoneReason}`,
  ];
  if (ctx.expected) {
    const e = ctx.expected;
    lines.push(
      `Rate-card freight: ${describeFreight(e.freightDetail)}`,
      `Rate-card total: freight ${formatINR(e.freight)} + fuel ${formatINR(e.fuel)} + COD ${formatINR(e.cod)} + RTO ${formatINR(e.rto)} + GST ${formatINR(e.gst)} = ${formatINR(e.total)}`,
    );
  }
  lines.push(
    `Billed: freight ${formatINR(b.freight)} + fuel ${formatINR(b.fuel)} + COD ${formatINR(b.cod)} + RTO ${formatINR(b.rto)} + other ${formatINR(b.other)} + GST ${formatINR(b.gst)} = ${formatINR(b.total)}`,
    `Corrected bill (flagged items fixed, fuel & GST adjusted pro rata): ${formatINR(corrected.total)}`,
    `Overcharge on this AWB: ${formatINR(b.total)} − ${formatINR(corrected.total)} = ${formatINR(corrected.overcharge)}`,
  );
  return lines;
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  const zoneSettings = input.zoneSettings ?? DEFAULT_ZONE_SETTINGS;
  const defaultBox = input.defaultBox ?? null;
  const directory = input.directory ?? new PincodeDirectory();

  const invoice = input.invoice.map((l) => ({ ...l, awb: normAwb(l.awb) }));
  const orderByAwb = new Map<string, Order>();
  for (const o of input.orders) {
    const awb = normAwb(o.awb);
    if (awb && !orderByAwb.has(awb)) orderByAwb.set(awb, { ...o, awb });
  }

  await directory.preload([...input.rateCards.map((c) => c.originPincode), ...[...orderByAwb.values()].map((o) => o.destinationPincode)]);

  const { kept, issues: duplicateIssues } = splitDuplicates(invoice, (awb) => orderByAwb.get(awb)?.orderId);
  const linesByAwb = new Map<string, InvoiceLine[]>();
  for (const l of kept) {
    const arr = linesByAwb.get(l.awb) ?? [];
    arr.push(l);
    linesByAwb.set(l.awb, arr);
  }

  const cardByCourier = new Map(input.rateCards.map((c) => [normCourier(c.courier), c]));
  const fallbackCard = input.rateCards.length === 1 ? input.rateCards[0]! : null;
  const couriersWithoutOwnRateCard = new Map<string, string>();
  const couriersSkipped = new Set<string>();
  const unknown = new Map<string, string[]>();
  const originUnknown = new Set<string>();
  let ordersUsingDefaultBox = 0;
  let ordersWithoutDimensions = 0;

  const issues: Issue[] = [];
  const shipments: ShipmentResult[] = [];

  for (const [awb, lines] of linesByAwb) {
    const courier = lines[0]!.courier;
    const billedTotal = round2(lines.reduce((a, l) => a + l.totalCharge, 0));
    const order = orderByAwb.get(awb);
    if (!order) {
      issues.push(checkUnmatchedAwb(awb, lines));
      shipments.push({ awb, courier, matched: false, billedTotal, expectedTotal: null, correctedTotal: billedTotal, overcharge: 0, issueTypes: ["UNMATCHED_AWB"] });
      continue;
    }

    let card = cardByCourier.get(normCourier(courier));
    if (!card && fallbackCard) {
      card = fallbackCard;
      couriersWithoutOwnRateCard.set(courier, fallbackCard.courier);
    }
    if (!card) {
      couriersSkipped.add(courier);
      shipments.push({ awb, orderId: order.orderId, courier, matched: true, billedTotal, expectedTotal: null, correctedTotal: billedTotal, overcharge: 0, issueTypes: [] });
      continue;
    }

    const origin = directory.lookup(card.originPincode);
    const dest = directory.lookup(order.destinationPincode);
    if (!origin) originUnknown.add(card.originPincode);
    if (origin && !dest) unknown.set(order.destinationPincode, [...(unknown.get(order.destinationPincode) ?? []), awb]);
    const zone = resolveZone(origin, dest, zoneSettings);

    const ctx = buildContext({ awb, courier, order, card, lines, expectedZone: zone.zone, zoneReason: zone.reason, defaultBox });
    if (ctx.weight.usedDefaultBox) ordersUsingDefaultBox++;
    if (!ctx.weight.box) ordersWithoutDimensions++;

    const findings = SHIPMENT_CHECKS.map((check) => check(ctx)).filter((f): f is Finding => f !== null);
    const corrected = correctBill(ctx.billed, findings);
    const amounts = allocate(corrected.overcharge, findings.map((f) => f.base));
    const shared = findings.length ? shipmentWorking(ctx, corrected) : [];
    const split = findings.length > 1 ? ` This AWB has ${findings.length} issues; its ${formatINR(corrected.overcharge)} total overcharge is split between them, not double-counted.` : "";

    findings.forEach((f, i) => {
      const amount = amounts[i] ?? 0;
      issues.push({
        awb,
        orderId: order.orderId,
        courier,
        type: f.type,
        severity: severityFor(f.type, amount),
        expected: f.expected,
        billed: f.billed,
        overchargeAmount: amount,
        explanation: f.explain(amount) + split,
        working: [...f.working, `Share of AWB overcharge incl. fuel & GST: ${formatINR(amount)}`, ...shared],
      });
    });

    shipments.push({
      awb,
      orderId: order.orderId,
      courier,
      matched: true,
      destinationPincode: order.destinationPincode,
      expectedZone: zone.zone,
      billedZone: ctx.billedZone ?? undefined,
      chargeableKg: ctx.weight.chargeableKg,
      billedKg: ctx.billedWeightKg ?? undefined,
      billedTotal,
      expectedTotal: ctx.expected?.total ?? null,
      correctedTotal: corrected.total,
      overcharge: corrected.overcharge,
      issueTypes: findings.map((f) => f.type),
    });
  }

  // Duplicates last so they sit with their AWB's shipment row.
  for (const d of duplicateIssues) {
    issues.push(d);
    const s = shipments.find((x) => x.awb === d.awb);
    if (s) {
      s.billedTotal = round2(s.billedTotal + d.overchargeAmount);
      s.overcharge = round2(s.overcharge + d.overchargeAmount);
      s.issueTypes.push("DUPLICATE_AWB");
    }
  }

  const matchedAwbs = new Set(shipments.filter((s) => s.matched).map((s) => s.awb));
  return {
    issues,
    shipments,
    invoiceTotal: round2(invoice.reduce((a, l) => a + l.totalCharge, 0)),
    invoiceLineCount: invoice.length,
    assumptions: {
      defaultBox,
      ordersUsingDefaultBox,
      ordersWithoutDimensions,
      unknownPincodes: [...unknown.entries()].map(([pincode, awbs]) => ({ pincode, awbs })),
      originUnknown: [...originUnknown],
      couriersWithoutOwnRateCard: [...couriersWithoutOwnRateCard.entries()].map(([courier, usedRateCardOf]) => ({ courier, usedRateCardOf })),
      couriersSkipped: [...couriersSkipped],
      zoneSettings,
      rateCards: input.rateCards,
      ordersNotOnInvoice: [...orderByAwb.keys()].filter((a) => !matchedAwbs.has(a)).length,
    },
  };
}

