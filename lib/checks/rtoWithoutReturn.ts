import { formatINR } from "../engine/money";
import type { Finding, ShipmentContext } from "./context";

export function checkRtoWithoutReturn(ctx: ShipmentContext): Finding | null {
  if (ctx.billed.rto <= 0 || ctx.order.status !== "Delivered") return null;
  const rto = ctx.billed.rto;
  return {
    type: "RTO_WITHOUT_RETURN",
    component: "rto",
    base: rto,
    expected: "No RTO (order delivered)",
    billed: `${formatINR(rto)} RTO`,
    explain: (amount) =>
      `AWB ${ctx.awb} (order ${ctx.order.orderId}) was delivered to the customer, yet an RTO charge of ${formatINR(rto)} was billed; total excess ${formatINR(amount)}.`,
    working: [`Order status in Shopify: Delivered`, `RTO billed: ${formatINR(rto)}`, `RTO allowed: ₹0.00`],
  };
}
