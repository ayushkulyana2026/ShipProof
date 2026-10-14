import { describeRtoRule, rtoFor } from "../engine/cost";
import { formatINR, round2 } from "../engine/money";
import { describeFreight, freightFor, type Finding, type ShipmentContext } from "./context";
import { RUPEE_TOLERANCE } from "./rateMismatch";
import { acceptedWeightKg } from "./weightOvercharge";
import { acceptedZone } from "./wrongZone";

export function checkRtoWrongRate(ctx: ShipmentContext): Finding | null {
  if (ctx.billed.rto <= 0 || ctx.order.status === "Delivered") return null;
  const zone = acceptedZone(ctx);
  if (!zone) return null;
  const forward = freightFor(zone, acceptedWeightKg(ctx), ctx.card);
  const allowed = rtoFor(forward.freight, ctx.card);
  const billed = ctx.billed.rto;
  if (billed <= allowed + RUPEE_TOLERANCE) return null;
  const base = round2(billed - allowed);
  const rule = describeRtoRule(ctx.card);
  return {
    type: "RTO_WRONG_RATE",
    component: "rto",
    base,
    expected: `${formatINR(allowed)} RTO (${rule})`,
    billed: `${formatINR(billed)} RTO`,
    explain: (amount) =>
      `AWB ${ctx.awb} was charged ${formatINR(billed)} for RTO, but our rate card allows ${formatINR(allowed)} (${rule.toLowerCase()}), an excess of ${formatINR(amount)}.`,
    working: [
      `Forward freight per rate card: ${describeFreight(forward)}`,
      `RTO rule: ${rule} → ${formatINR(allowed)}`,
      `RTO billed: ${formatINR(billed)}`,
    ],
  };
}
