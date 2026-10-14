import { formatINR, formatKg, round2 } from "../engine/money";
import { describeFreight, freightFor, type Finding, type ShipmentContext } from "./context";

/** ₹ tolerance for rounding differences between our maths and the courier's. */
export const RUPEE_TOLERANCE = 1;

/** Billed freight is above the agreed rate for the courier's OWN billed weight and zone. */
export function checkRateMismatch(ctx: ShipmentContext): Finding | null {
  const zone = ctx.billedZone ?? ctx.pricingZone;
  if (!ctx.forwardLine || ctx.billedWeightKg === null || !zone) return null;
  const agreed = freightFor(zone, ctx.billedWeightKg, ctx.card);
  const billed = ctx.billed.freight;
  if (billed <= agreed.freight + RUPEE_TOLERANCE) return null;
  const base = round2(billed - agreed.freight);
  return {
    type: "RATE_MISMATCH",
    component: "freight",
    base,
    expected: `${formatINR(agreed.freight)} freight (rate card, Zone ${zone}, ${formatKg(ctx.billedWeightKg)})`,
    billed: `${formatINR(billed)} freight`,
    explain: (amount) =>
      `AWB ${ctx.awb} was charged ${formatINR(billed)} freight, but our agreed rate for Zone ${zone} at the billed ${formatKg(ctx.billedWeightKg as number)} is ${formatINR(agreed.freight)}, an excess of ${formatINR(amount)}.`,
    working: [
      `Agreed freight for the billed weight and zone: ${describeFreight(agreed)}`,
      `Billed freight: ${formatINR(billed)}`,
      `Rate difference (pre-tax): ${formatINR(base)}`,
    ],
  };
}
