import { formatINR } from "../engine/money";
import type { Finding, ShipmentContext } from "./context";

export function checkCodOnPrepaid(ctx: ShipmentContext): Finding | null {
  if (ctx.order.paymentMode !== "Prepaid" || ctx.billed.cod <= 0) return null;
  const cod = ctx.billed.cod;
  return {
    type: "COD_ON_PREPAID",
    component: "cod",
    base: cod,
    expected: "₹0.00 COD (prepaid order)",
    billed: `${formatINR(cod)} COD`,
    explain: (amount) =>
      `AWB ${ctx.awb} (order ${ctx.order.orderId}) is a prepaid order but was charged a COD fee of ${formatINR(cod)}; total excess ${formatINR(amount)}.`,
    working: [`Payment mode in Shopify: Prepaid`, `COD fee billed: ${formatINR(cod)}`, `COD fee allowed: ₹0.00`],
  };
}
