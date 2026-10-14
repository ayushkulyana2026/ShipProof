import { z } from "zod";
import { round2, roundQty } from "../engine/money";
import { normalizePincode } from "../pincode/directory";
import type { BoxSize, InvoiceLine, Order } from "../types";
import type { ColumnMapping, InvoiceFieldKey, OrderFieldKey } from "./mapping";
import type { RawTable } from "./read";
import { looksLikeScientific, parseAmount, parseAwb, parsePaymentMode, parseShipmentType, parseStatus, parseZone, cell } from "./values";

export type WeightUnit = "kg" | "g";

export type RowError = { row: number; message: string };

export type NormalizeResult<T> = {
  rows: T[];
  errors: RowError[];
  /** Rows without an AWB (blank, subtotal or footer rows) that were skipped. */
  skipped: number;
};

const ZONE = z.enum(["A", "B", "C", "D", "E"]);
const money = (label: string) => z.number({ invalid_type_error: `${label} is not a number` }).finite(`${label} is not a number`);
const optMoney = (label: string) => money(label).min(0, `${label} cannot be negative`).optional();

export const invoiceLineSchema = z.object({
  awb: z.string().min(1, "AWB is missing"),
  courier: z.string().min(1, "Courier is missing"),
  billedWeightKg: money("Billed weight").positive("Billed weight must be more than 0").max(1000, "Billed weight looks wrong (over 1000 kg)"),
  billedZone: ZONE.optional(),
  freightCharge: money("Freight").min(0, "Freight cannot be negative"),
  codCharge: optMoney("COD charge"),
  rtoCharge: optMoney("RTO charge"),
  fuelSurcharge: optMoney("Fuel surcharge"),
  otherCharges: money("Other charges").optional(),
  gst: optMoney("GST"),
  totalCharge: money("Total"),
  shipmentType: z.enum(["forward", "rto"]).optional(),
  invoiceDate: z.string().optional(),
  sourceRow: z.number().int().optional(),
});

export const orderSchema = z.object({
  orderId: z.string().min(1, "Order ID is missing"),
  awb: z.string().min(1, "AWB is missing"),
  destinationPincode: z.string().regex(/^[1-9]\d{5}$/, "Pincode must be 6 digits"),
  actualWeightKg: money("Weight").positive("Weight must be more than 0").max(1000, "Weight looks wrong (over 1000 kg)"),
  lengthCm: money("Length").positive().optional(),
  breadthCm: money("Breadth").positive().optional(),
  heightCm: money("Height").positive().optional(),
  paymentMode: z.enum(["COD", "Prepaid"], { errorMap: () => ({ message: "Payment mode is missing" }) }),
  orderValue: money("Order value").min(0, "Order value cannot be negative"),
  status: z.enum(["Delivered", "RTO", "In transit", "Cancelled"]).optional(),
});

function getter<K extends string>(mapping: ColumnMapping<K>, row: string[]) {
  return (key: K): string => {
    const idx = mapping[key];
    return idx === null || idx === undefined ? "" : cell(row[idx]);
  };
}

/** Drops undefined keys so the result matches optional fields exactly. */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function firstIssue(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join("; ");
}

const sheetRow = (i: number, table: RawTable) => table.rowNumbers[i] ?? i + 2;

export function normalizeInvoice(
  table: RawTable,
  mapping: ColumnMapping<InvoiceFieldKey>,
  opts: { courier?: string; weightUnit?: WeightUnit } = {},
): NormalizeResult<InvoiceLine> {
  const rows: InvoiceLine[] = [];
  const errors: RowError[] = [];
  let skipped = 0;
  const factor = opts.weightUnit === "g" ? 1 / 1000 : 1;

  table.rows.forEach((r, i) => {
    const get = getter(mapping, r);
    const row = sheetRow(i, table);
    const rawAwb = get("awb");
    if (!rawAwb) {
      skipped++;
      return;
    }
    if (looksLikeScientific(rawAwb)) {
      errors.push({ row, message: `AWB "${rawAwb}" was converted to scientific notation by Excel; re-export the column as text` });
      return;
    }
    const w = parseAmount(get("billedWeightKg"));
    const freight = parseAmount(get("freightCharge"));
    const cod = parseAmount(get("codCharge"));
    const rto = parseAmount(get("rtoCharge"));
    const fuel = parseAmount(get("fuelSurcharge"));
    const other = parseAmount(get("otherCharges"));
    const gst = parseAmount(get("gst"));
    let total = parseAmount(get("totalCharge"));
    if (total === undefined && freight !== undefined) {
      // No total column, or a blank total cell: add up the components.
      total = round2([freight, cod, rto, fuel, other, gst].reduce<number>((a, b) => a + (b ?? 0), 0));
    }
    const candidate = compact({
      awb: parseAwb(rawAwb),
      courier: get("courier") || opts.courier?.trim() || "",
      billedWeightKg: w === undefined ? undefined : roundQty(w * factor),
      billedZone: parseZone(get("billedZone")),
      freightCharge: freight ?? (mapping.freightCharge === null ? undefined : 0),
      codCharge: cod,
      rtoCharge: rto,
      fuelSurcharge: fuel,
      otherCharges: other,
      gst,
      totalCharge: total,
      shipmentType: parseShipmentType(get("shipmentType")),
      invoiceDate: get("invoiceDate") || undefined,
      sourceRow: row,
    });
    if (get("billedZone") && !candidate.billedZone) {
      errors.push({ row, message: `Unrecognised zone "${get("billedZone")}" (zone check skipped for this row)` });
    }
    const parsed = invoiceLineSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row, message: `AWB ${candidate.awb}: ${firstIssue(parsed.error)}` });
      return;
    }
    rows.push(parsed.data as InvoiceLine);
  });
  return { rows, errors, skipped };
}

export function normalizeOrders(
  table: RawTable,
  mapping: ColumnMapping<OrderFieldKey>,
  opts: { weightUnit?: WeightUnit } = {},
): NormalizeResult<Order> {
  const rows: Order[] = [];
  const errors: RowError[] = [];
  let skipped = 0;
  const factor = opts.weightUnit === "g" ? 1 / 1000 : 1;

  table.rows.forEach((r, i) => {
    const get = getter(mapping, r);
    const row = sheetRow(i, table);
    const rawAwb = get("awb");
    if (!rawAwb) {
      skipped++; // unfulfilled orders / Shopify's extra line-item rows have no tracking number
      return;
    }
    if (looksLikeScientific(rawAwb)) {
      errors.push({ row, message: `AWB "${rawAwb}" was converted to scientific notation by Excel; re-export the column as text` });
      return;
    }
    const w = parseAmount(get("actualWeightKg"));
    const pin = normalizePincode(get("destinationPincode"));
    const candidate = compact({
      orderId: get("orderId"),
      awb: parseAwb(rawAwb),
      destinationPincode: pin ?? get("destinationPincode"),
      actualWeightKg: w === undefined ? undefined : roundQty(w * factor),
      lengthCm: parseAmount(get("lengthCm")) || undefined,
      breadthCm: parseAmount(get("breadthCm")) || undefined,
      heightCm: parseAmount(get("heightCm")) || undefined,
      paymentMode: parsePaymentMode(get("paymentMode")),
      orderValue: parseAmount(get("orderValue")),
      status: parseStatus(get("status")),
    });
    const parsed = orderSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row, message: `${candidate.orderId || `AWB ${candidate.awb}`}: ${firstIssue(parsed.error)}` });
      return;
    }
    rows.push(parsed.data as Order);
  });
  return { rows, errors, skipped };
}

/** How many orders have no complete L × B × H (they'll need the default box size). */
export function countMissingDimensions(orders: Order[]): number {
  return orders.filter((o) => !(o.lengthCm && o.breadthCm && o.heightCm)).length;
}

export const DEFAULT_BOX: BoxSize = { lengthCm: 20, breadthCm: 15, heightCm: 10 };
