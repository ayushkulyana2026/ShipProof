/** Fuzzy header → field auto-detection for the column-mapping step. */

export type FieldDef<K extends string = string> = {
  key: K;
  label: string;
  required: boolean;
  synonyms: string[];
  /** Shown under the dropdown. */
  hint?: string;
  /** Headers that must never be picked for this field (e.g. "COD amount" is the collected value, not the fee). */
  exclude?: RegExp;
};

export const INVOICE_FIELDS = [
  { key: "awb", label: "AWB / Waybill", required: true, synonyms: ["awb", "awb number", "awb no", "waybill", "waybill number", "waybill no", "tracking number", "tracking id", "airway bill", "airway bill number", "docket number", "consignment number", "lrn", "shipment id"] },
  { key: "courier", label: "Courier", required: false, synonyms: ["courier", "courier name", "carrier", "courier partner", "logistics partner", "shipping partner"], hint: "Or set one courier for the whole file below." },
  { key: "billedWeightKg", label: "Billed / charged weight", required: true, synonyms: ["charged weight", "chargeable weight", "billed weight", "applied weight", "charge weight", "final weight", "billing weight", "weight"] },
  { key: "billedZone", label: "Billed zone", required: false, synonyms: ["zone", "billing zone", "billed zone", "applied zone", "zone name", "rate zone"] },
  { key: "freightCharge", label: "Freight charge", required: true, synonyms: ["freight", "freight charges", "freight charge", "forward charges", "forward freight", "shipping charges", "base freight", "freight amount", "base charges"] },
  { key: "codCharge", label: "COD charge", required: false, synonyms: ["cod charges", "cod charge", "cod fee", "cod fees", "cod handling", "cod handling charges"], exclude: /cod (amount|value|collect)|collectable|collectible/ },
  { key: "rtoCharge", label: "RTO charge", required: false, synonyms: ["rto charges", "rto charge", "rto freight", "return charges", "rto amount"] },
  { key: "fuelSurcharge", label: "Fuel surcharge", required: false, synonyms: ["fuel surcharge", "fuel", "fsc", "fuel charges"] },
  { key: "otherCharges", label: "Other charges", required: false, synonyms: ["other charges", "other", "misc charges", "miscellaneous", "additional charges"] },
  { key: "gst", label: "GST", required: false, synonyms: ["gst", "igst", "tax", "gst amount", "tax amount", "gst 18"] },
  { key: "totalCharge", label: "Total charge", required: false, synonyms: ["total", "total amount", "total charges", "net amount", "grand total", "invoice amount", "total charge", "amount payable"], hint: "If missing, we add up the components." },
  { key: "shipmentType", label: "Shipment type (forward / RTO)", required: false, synonyms: ["shipment type", "type", "direction", "movement type", "shipment direction", "forward rto"] },
  { key: "invoiceDate", label: "Date", required: false, synonyms: ["invoice date", "pickup date", "shipment date", "manifest date", "date", "booking date"] },
] as const satisfies readonly FieldDef[];

export const ORDER_FIELDS = [
  { key: "orderId", label: "Order ID", required: true, synonyms: ["name", "order", "order id", "order number", "order no", "order name", "id"] },
  { key: "awb", label: "AWB / Tracking number", required: true, synonyms: ["tracking number", "awb", "awb number", "waybill", "tracking id", "tracking", "fulfillment tracking number", "tracking code"] },
  { key: "destinationPincode", label: "Destination pincode", required: true, synonyms: ["shipping zip", "pincode", "pin code", "shipping pincode", "zip", "postal code", "destination pincode", "delivery pincode", "shipping postal code"] },
  { key: "actualWeightKg", label: "Actual weight", required: true, synonyms: ["weight", "weight kg", "total weight", "actual weight", "dead weight", "package weight", "shipping weight"] },
  { key: "lengthCm", label: "Box length (cm)", required: false, synonyms: ["length", "length cm", "box length", "l"] },
  { key: "breadthCm", label: "Box breadth (cm)", required: false, synonyms: ["breadth", "width", "breadth cm", "width cm", "box width", "box breadth", "b", "w"] },
  { key: "heightCm", label: "Box height (cm)", required: false, synonyms: ["height", "height cm", "box height", "h"] },
  { key: "paymentMode", label: "Payment mode", required: true, synonyms: ["payment method", "payment mode", "payment gateway", "payment type", "gateway"] },
  { key: "orderValue", label: "Order value", required: true, synonyms: ["total", "order value", "order total", "amount", "total price", "grand total", "subtotal", "cod amount"] },
  { key: "status", label: "Delivery status", required: false, synonyms: ["delivery status", "status", "shipment status", "fulfillment status", "order status", "tracking status"] },
] as const satisfies readonly FieldDef[];

export type InvoiceFieldKey = (typeof INVOICE_FIELDS)[number]["key"];
export type OrderFieldKey = (typeof ORDER_FIELDS)[number]["key"];

/** field key → column index (or null when not mapped). */
export type ColumnMapping<K extends string = string> = Record<K, number | null>;

export function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/₹|\brs\b\.?|\binr\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bwt\b/g, "weight")
    .replace(/\bamt\b/g, "amount")
    .replace(/\bchrg?s?\b/g, "charges")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Strip unit suffixes like "kg", "cm", "gms" that don't help identify the field. */
const stripUnits = (s: string) => s.replace(/\b(kg|kgs|cm|g|gm|gms|grams|in)\b/g, " ").replace(/\s+/g, " ").trim();

/** 0–1 similarity between a header and one synonym. */
export function similarity(header: string, synonym: string): number {
  const h = stripUnits(normHeader(header));
  const s = normHeader(synonym);
  if (!h || !s) return 0;
  if (h === s) return 1;
  if (h.replace(/ /g, "") === s.replace(/ /g, "")) return 0.98;
  // Synonym appears as whole words inside the header ("total amount" in "total amount rs").
  if (` ${h} `.includes(` ${s} `)) return 0.6 + 0.35 * (s.length / h.length);
  const ht = new Set(h.split(" "));
  const st = s.split(" ");
  const overlap = st.filter((t) => ht.has(t)).length;
  const jaccard = overlap / new Set([...ht, ...st]).size;
  const a = h.replace(/ /g, "");
  const b = s.replace(/ /g, "");
  const lev = a.length > 3 && b.length > 3 ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0;
  return Math.max(jaccard * 0.7, lev >= 0.8 ? lev * 0.8 : 0);
}

export function fieldScore(field: FieldDef, header: string): number {
  if (field.exclude?.test(normHeader(header))) return 0;
  return Math.max(...field.synonyms.map((s) => similarity(header, s)));
}

export const MIN_SCORE = 0.5;

/** Greedy best-first assignment so each column maps to at most one field. */
export function autoMap<K extends string>(headers: string[], fields: readonly FieldDef<K>[]): ColumnMapping<K> {
  const candidates: { key: K; col: number; score: number }[] = [];
  for (const f of fields) {
    headers.forEach((h, col) => {
      const score = fieldScore(f, h);
      if (score >= MIN_SCORE) candidates.push({ key: f.key, col, score });
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);
  const mapping = Object.fromEntries(fields.map((f) => [f.key, null])) as ColumnMapping<K>;
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.key] !== null || usedCols.has(c.col)) continue;
    mapping[c.key] = c.col;
    usedCols.add(c.col);
  }
  return mapping;
}

export function missingRequired<K extends string>(mapping: ColumnMapping<K>, fields: readonly FieldDef<K>[]): FieldDef<K>[] {
  return fields.filter((f) => f.required && mapping[f.key] === null);
}

/** Header says the weight is in grams ("Weight (g)", "Total Weight (gms)"). */
export function headerSaysGrams(header: string | undefined): boolean {
  if (!header) return false;
  return /\b(g|gm|gms|gram|grams)\b/.test(header.toLowerCase().replace(/[^a-z0-9]+/g, " "));
}
