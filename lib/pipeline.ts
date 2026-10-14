import { autoMap, headerSaysGrams, INVOICE_FIELDS, ORDER_FIELDS } from "./parsing/mapping";
import { normalizeInvoice, normalizeOrders, type WeightUnit } from "./parsing/normalize";
import { parseRateCardJson } from "./parsing/rateCard";
import { readCsvText, type RawTable } from "./parsing/read";

export function guessWeightUnit(table: RawTable, col: number | null): WeightUnit {
  return col !== null && headerSaysGrams(table.headers[col]) ? "g" : "kg";
}

/** Auto-map and normalize both files with no user input (used by "Try with sample data" and the e2e test). */
export function prepareFromText(input: { invoiceCsv: string; ordersCsv: string; rateCardJson: string; courier?: string }) {
  const invoiceTable = readCsvText(input.invoiceCsv, "sample_invoice_delhivery.csv");
  const invoiceMapping = autoMap(invoiceTable.headers, INVOICE_FIELDS);
  const rateCards = parseRateCardJson(input.rateCardJson);
  const invoice = normalizeInvoice(invoiceTable, invoiceMapping, {
    courier: input.courier ?? rateCards[0]?.courier,
    weightUnit: guessWeightUnit(invoiceTable, invoiceMapping.billedWeightKg),
  });
  const ordersTable = readCsvText(input.ordersCsv, "sample_shopify_orders.csv");
  const orderMapping = autoMap(ordersTable.headers, ORDER_FIELDS);
  const orders = normalizeOrders(ordersTable, orderMapping, { weightUnit: guessWeightUnit(ordersTable, orderMapping.actualWeightKg) });
  return { invoiceTable, invoiceMapping, invoice, ordersTable, orderMapping, orders, rateCards };
}
