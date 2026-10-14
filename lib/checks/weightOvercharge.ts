import { formatINR, formatKg, roundQty } from "../engine/money";
import { slabs } from "../engine/weight";
import { describeFreight, freightFor, type Finding, type ShipmentContext } from "./context";
import { acceptedZone } from "./wrongZone";

/**
 * Billed weight is above chargeable weight × (1 + tolerance) AND lands in a
 * higher slab. Priced at the accepted zone so it never overlaps the zone check.
 */
export function weightOvercharge(ctx: ShipmentContext) {
  const { billedWeightKg, weight, card } = ctx;
  const zone = acceptedZone(ctx);
  if (billedWeightKg === null || !zone) return null;
  const limit = roundQty(weight.chargeableKg * (1 + card.tolerancePercent / 100));
  if (billedWeightKg <= limit) return null;
  const billedSlabs = slabs(billedWeightKg, card);
  const expectedSlabs = slabs(weight.chargeableKg, card);
  if (billedSlabs.extraSlabs <= expectedSlabs.extraSlabs) return null;
  const atBilled = freightFor(zone, billedWeightKg, card);
  const atExpected = freightFor(zone, weight.chargeableKg, card);
  const base = atBilled.freight - atExpected.freight;
  if (base <= 0) return null;
  return { limit, atBilled, atExpected, base };
}

/** Weight we accept for pricing: our chargeable weight if the courier over-weighed, otherwise what was billed. */
export function acceptedWeightKg(ctx: ShipmentContext): number {
  if (weightOvercharge(ctx)) return ctx.weight.chargeableKg;
  return ctx.billedWeightKg ?? ctx.weight.chargeableKg;
}

export function describeWeight(ctx: ShipmentContext): string[] {
  const w = ctx.weight;
  const lines = [`Actual weight: ${formatKg(w.actualKg)}`];
  if (w.box && w.volumetricKg !== null) {
    const { lengthCm: l, breadthCm: b, heightCm: h } = w.box;
    lines.push(
      `Volumetric: ${l} × ${b} × ${h} cm ÷ ${ctx.card.volumetricDivisor} = ${formatKg(w.volumetricKg)}${w.usedDefaultBox ? " (default box size — assumption)" : ""}`,
    );
  } else {
    lines.push("Volumetric: no box size available, using actual weight");
  }
  lines.push(`Chargeable weight: max(actual, volumetric) = ${formatKg(w.chargeableKg)}`);
  return lines;
}

export function checkWeightOvercharge(ctx: ShipmentContext): Finding | null {
  const r = weightOvercharge(ctx);
  if (!r) return null;
  const billed = ctx.billedWeightKg as number;
  return {
    type: "WEIGHT_OVERCHARGE",
    component: "freight",
    base: r.base,
    expected: `${formatKg(ctx.weight.chargeableKg)} chargeable (${r.atExpected.slabbedKg} kg slab)`,
    billed: `${formatKg(billed)} (${r.atBilled.slabbedKg} kg slab)`,
    explain: (amount) =>
      `AWB ${ctx.awb} was billed at ${formatKg(billed)} but its chargeable weight is ${formatKg(ctx.weight.chargeableKg)} (max of actual and volumetric), beyond the ${ctx.card.tolerancePercent}% tolerance, resulting in an excess of ${formatINR(amount)}.`,
    working: [
      ...describeWeight(ctx),
      `Billed weight: ${formatKg(billed)} (tolerance limit ${formatKg(r.limit)})`,
      `Freight at billed weight: ${describeFreight(r.atBilled)}`,
      `Freight at chargeable weight: ${describeFreight(r.atExpected)}`,
      `Weight difference (pre-tax): ${formatINR(r.base)}`,
    ],
  };
}
