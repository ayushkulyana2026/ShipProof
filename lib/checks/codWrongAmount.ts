import { codFor } from "../engine/cost";
import { formatINR, pctOf, round2 } from "../engine/money";
import type { Finding, ShipmentContext } from "./context";
import { RUPEE_TOLERANCE } from "./rateMismatch";

export function checkCodWrongAmount(ctx: ShipmentContext): Finding | null {
  if (ctx.order.paymentMode !== "COD") return null;
  const expected = codFor(ctx.order, ctx.card);
  const billed = ctx.billed.cod;
  if (billed <= expected + RUPEE_TOLERANCE) return null;
  const base = round2(billed - expected);
  const { codFixed, codPercent } = ctx.card;
  const pct = pctOf(ctx.order.orderValue, codPercent);
  return {
    type: "COD_WRONG_AMOUNT",
    component: "cod",
    base,
    expected: `${formatINR(expected)} COD`,
    billed: `${formatINR(billed)} COD`,
    explain: (amount) =>
      `AWB ${ctx.awb} was charged ${formatINR(billed)} COD; the agreed fee is max(₹${codFixed}, ${codPercent}% of ${formatINR(ctx.order.orderValue)}) = ${formatINR(expected)}, an excess of ${formatINR(amount)}.`,
    working: [
      `Order value: ${formatINR(ctx.order.orderValue)}`,
      `COD rule: max(₹${codFixed}, ${codPercent}% × ${formatINR(ctx.order.orderValue)} = ${formatINR(pct)}) = ${formatINR(expected)}`,
      `COD billed: ${formatINR(billed)}`,
    ],
  };
}
