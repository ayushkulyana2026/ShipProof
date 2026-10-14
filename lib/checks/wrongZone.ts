import { formatINR } from "../engine/money";
import type { Zone } from "../types";
import { ZONE_LABELS } from "../pincode/zones";
import { describeFreight, freightFor, type Finding, type ShipmentContext } from "./context";

/** Billed zone differs from the zone the pincodes resolve to, and costs more at the billed weight. */
export function zoneOvercharge(ctx: ShipmentContext) {
  const { billedZone, expectedZone, billedWeightKg, card } = ctx;
  if (!billedZone || expectedZone === "Unknown" || billedWeightKg === null) return null;
  if (billedZone === expectedZone) return null;
  const atBilled = freightFor(billedZone, billedWeightKg, card);
  const atExpected = freightFor(expectedZone, billedWeightKg, card);
  if (atBilled.freight <= atExpected.freight) return null;
  return { billedZone, expectedZone, atBilled, atExpected, base: atBilled.freight - atExpected.freight };
}

/** Zone we accept for pricing: the expected zone if the courier over-zoned, otherwise what was billed. */
export function acceptedZone(ctx: ShipmentContext): Zone | null {
  if (zoneOvercharge(ctx)) return ctx.expectedZone as Zone;
  return ctx.billedZone ?? ctx.pricingZone;
}

export function checkWrongZone(ctx: ShipmentContext): Finding | null {
  const z = zoneOvercharge(ctx);
  if (!z) return null;
  const pin = ctx.order.destinationPincode;
  return {
    type: "WRONG_ZONE",
    component: "freight",
    base: z.base,
    expected: `Zone ${z.expectedZone} (${ZONE_LABELS[z.expectedZone]})`,
    billed: `Zone ${z.billedZone} (${ZONE_LABELS[z.billedZone]})`,
    explain: (amount) =>
      `AWB ${ctx.awb} to pincode ${pin} was billed as Zone ${z.billedZone} but is Zone ${z.expectedZone} under our rate card (${ctx.zoneReason.charAt(0).toLowerCase() + ctx.zoneReason.slice(1)}), an excess of ${formatINR(amount)}.`,
    working: [
      `Expected zone: ${z.expectedZone} — ${ctx.zoneReason}`,
      `Billed zone: ${z.billedZone}`,
      `Freight at billed zone: ${describeFreight(z.atBilled)}`,
      `Freight at correct zone: ${describeFreight(z.atExpected)}`,
      `Zone difference (pre-tax): ${formatINR(z.base)}`,
    ],
  };
}
