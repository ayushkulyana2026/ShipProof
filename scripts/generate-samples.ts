/**
 * Generates realistic sample files with KNOWN, planted billing errors:
 *   public/samples/sample_invoice_delhivery.csv
 *   public/samples/sample_shopify_orders.csv
 *   public/samples/sample_rate_card.json (+ rate_card_template.csv)
 *   public/samples/sample_expected_results.json
 *
 * Pricing here is deliberately re-implemented in a few lines (not imported from
 * lib/engine) and zones are hard-coded per pincode, so the end-to-end test is an
 * independent check of the engine rather than the engine checking itself.
 *
 * Usage: npm run generate:samples
 */
import fs from "node:fs";
import path from "node:path";

type Zone = "A" | "B" | "C" | "D" | "E";
type PlantedType =
  | "WEIGHT_OVERCHARGE"
  | "WRONG_ZONE"
  | "COD_ON_PREPAID"
  | "COD_WRONG_AMOUNT"
  | "DUPLICATE_AWB"
  | "RTO_WITHOUT_RETURN"
  | "RTO_WRONG_RATE"
  | "UNMATCHED_AWB";

const OUT = "public/samples";
const COURIER = "Delhivery";
const ORIGIN = "122016"; // Gurugram (Udyog Vihar), Haryana

const RATE_CARD = {
  courier: COURIER,
  originPincode: ORIGIN,
  volumetricDivisor: 5000,
  firstSlabKg: 0.5,
  additionalSlabKg: 0.5,
  rates: {
    A: { firstSlab: 32, additionalSlab: 30 },
    B: { firstSlab: 38, additionalSlab: 34 },
    C: { firstSlab: 45, additionalSlab: 40 },
    D: { firstSlab: 52, additionalSlab: 48 },
    E: { firstSlab: 68, additionalSlab: 62 },
  } as Record<Zone, { firstSlab: number; additionalSlab: number }>,
  rtoRule: "same_as_forward" as const,
  codFixed: 35,
  codPercent: 1.75,
  fuelSurchargePercent: 8,
  gstPercent: 18,
  tolerancePercent: 10,
};

/** Destination pincodes with their zone from origin 122016 (Gurugram, in the Delhi NCR cluster). */
const PINCODES: Record<Zone, string[]> = {
  A: ["122001", "122002", "122018", "110001", "110020", "110092", "201301", "201010", "121001"],
  B: ["132001", "132103", "124001", "133001", "125001", "131001"],
  C: ["400001", "400070", "400601", "560001", "560034", "560102", "600001", "600040", "700001", "711101", "500001", "500081", "411001", "411014", "380001", "380015"],
  D: ["226001", "302001", "452001", "462001", "641001", "682001", "160017", "141001", "144001", "248001", "800001", "751001"],
  E: ["781001", "793001", "190001", "180001", "194101", "744101", "737101", "795001"],
};
const ZONE_WEIGHTS: [Zone, number][] = [["A", 0.18], ["B", 0.12], ["C", 0.38], ["D", 0.24], ["E", 0.08]];
const BOXES: [number, number, number][] = [
  [15, 10, 5], [20, 15, 10], [22, 18, 8], [25, 20, 10], [30, 25, 15], [35, 25, 20], [40, 30, 10], [18, 12, 10],
];

// ---- tiny deterministic PRNG (mulberry32) ----
let seed = 20261014;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
function weighted<T>(items: [T, number][]): T {
  let r = rand();
  for (const [v, w] of items) {
    if ((r -= w) < 0) return v;
  }
  return items[items.length - 1]![0];
}

// ---- independent pricing ----
const r2 = (n: number) => Math.round(n * 100 + 1e-7) / 100;
const q = (n: number) => Math.round(n * 1e6) / 1e6;
function slabbed(kg: number): number {
  const extra = kg <= 0.5 ? 0 : Math.ceil(q((kg - 0.5) / 0.5));
  return 0.5 + extra * 0.5;
}
function freight(zone: Zone, kg: number): number {
  const extra = (slabbed(kg) - 0.5) / 0.5;
  return r2(RATE_CARD.rates[zone].firstSlab + extra * RATE_CARD.rates[zone].additionalSlab);
}
const cod = (value: number) => r2(Math.max(35, r2((value * 1.75) / 100)));

type Ord = {
  orderId: string;
  awb: string;
  pincode: string;
  zone: Zone;
  weight: number;
  box: [number, number, number];
  payment: "COD" | "Prepaid";
  value: number;
  status: "Delivered" | "RTO" | "In Transit";
  date: string;
};
type Line = {
  awb: string;
  date: string;
  type: "Forward" | "RTO";
  pincode: string;
  weight: number;
  zone: Zone;
  freight: number;
  cod: number;
  fuel: number;
  gst: number;
  total: number;
};

function makeLine(o: Ord, type: Line["type"], weight: number, zone: Zone, fr: number, codAmt: number): Line {
  const fuel = r2((fr * RATE_CARD.fuelSurchargePercent) / 100);
  const gst = r2(((fr + fuel + codAmt) * RATE_CARD.gstPercent) / 100);
  return { awb: o.awb, date: o.date, type, pincode: o.pincode, weight, zone, freight: fr, cod: codAmt, fuel, gst, total: r2(fr + fuel + codAmt + gst) };
}
const chargeable = (o: Ord) => q(Math.max(o.weight, (o.box[0] * o.box[1] * o.box[2]) / 5000));

// ---- orders ----
const N = 200;
const orders: Ord[] = [];
for (let i = 0; i < N; i++) {
  const zone = weighted(ZONE_WEIGHTS);
  const leadingZero = i % 19 === 7; // a few AWBs with leading zeros
  const awb = (leadingZero ? "00" : "14") + String(3265100000 + i * 37 + Math.floor(rand() * 30)).padStart(10, "0");
  const day = 1 + Math.floor((i / N) * 28);
  orders.push({
    orderId: `#SP${1001 + i}`,
    awb,
    pincode: pick(PINCODES[zone]),
    zone,
    weight: r2(0.2 + rand() * 2.3),
    box: pick(BOXES),
    payment: rand() < 0.35 ? "COD" : "Prepaid",
    value: Math.round(399 + rand() * 4600),
    status: "Delivered",
    date: `2026-09-${String(day).padStart(2, "0")}`,
  });
}
// ~12% RTO, a few in transit (deterministic positions)
orders.forEach((o, i) => {
  if (i % 8 === 3) o.status = "RTO";
  else if (i % 41 === 20) o.status = "In Transit";
});

// ---- choose orders to plant errors on (distinct, constraint-respecting) ----
const used = new Set<number>();
function take(n: number, ok: (o: Ord) => boolean): Ord[] {
  const out: Ord[] = [];
  for (let i = 0; i < orders.length && out.length < n; i++) {
    const idx = (i * 7 + n * 13 + used.size * 3) % orders.length; // spread picks across the file
    const o = orders[idx]!;
    if (!used.has(idx) && ok(o)) {
      used.add(idx);
      out.push(o);
    }
  }
  if (out.length < n) throw new Error("not enough candidate orders");
  return out;
}

const isClean = (o: Ord) => o.status === "Delivered";
const weightErr = take(11, (o) => isClean(o) && chargeable(o) <= 2);
const comboErr = take(1, (o) => isClean(o) && o.zone === "A" && chargeable(o) <= 1.5); // weight + zone on one AWB
const zoneErr = take(5, (o) => isClean(o) && o.zone !== "E");
const codPrepaidErr = take(4, (o) => isClean(o) && o.payment === "Prepaid");
const codWrongErr = take(3, (o) => isClean(o) && o.payment === "COD");
const dupErr = take(2, isClean);
const rtoNoReturnErr = take(3, (o) => isClean(o));
const rtoRateErr = take(2, (o) => o.status === "RTO");
// Near misses that must NOT be flagged: weight within tolerance crossing a slab, and a cheaper billed zone.
const nearMissWeight = take(3, (o) => isClean(o));
nearMissWeight.forEach((o) => {
  o.weight = 0.98;
  o.box = [15, 10, 5]; // volumetric 0.15 → chargeable 0.98 (1.0 slab)
});
const cheaperZone = take(1, (o) => isClean(o) && o.zone === "D");

const pricierZone: Record<Zone, Zone> = { A: "C", B: "D", C: "D", D: "E", E: "E" };
const planted: { awb: string; orderId?: string; type: PlantedType; note: string }[] = [];
const has = (list: Ord[], o: Ord) => list.includes(o);

// ---- invoice ----
const lines: Line[] = [];
const correctTotals = new Map<string, number>();

for (const o of orders) {
  const ch = chargeable(o);
  let billedW = slabbed(ch);
  let billedZone: Zone = o.zone;
  // Accepted (correct) basis for this AWB
  let okW = billedW;
  let okZone: Zone = o.zone;

  if (has(nearMissWeight, o)) {
    billedW = r2(ch * 1.05); // 1.03 kg: crosses into the 1.5 kg slab but within 10% tolerance
    okW = billedW;
  }
  if (has(cheaperZone, o)) {
    billedZone = "C";
    okZone = "C";
  }
  if (has(weightErr, o) || has(comboErr, o)) {
    billedW = slabbed(ch) + (planted.length % 2 === 0 ? 0.5 : 1);
    planted.push({ awb: o.awb, orderId: o.orderId, type: "WEIGHT_OVERCHARGE", note: `chargeable ${ch} kg, billed ${billedW} kg` });
  }
  if (has(zoneErr, o) || has(comboErr, o)) {
    billedZone = pricierZone[o.zone];
    planted.push({ awb: o.awb, orderId: o.orderId, type: "WRONG_ZONE", note: `true zone ${o.zone}, billed ${billedZone}` });
  }

  let codBilled = o.payment === "COD" ? cod(o.value) : 0;
  const codOk = codBilled;
  if (has(codPrepaidErr, o)) {
    codBilled = 35;
    planted.push({ awb: o.awb, orderId: o.orderId, type: "COD_ON_PREPAID", note: "₹35 COD fee on a prepaid order" });
  }
  if (has(codWrongErr, o)) {
    codBilled = r2(Math.max(50, (o.value * 2.5) / 100)); // courier used ₹50 / 2.5% instead of ₹35 / 1.75%
    planted.push({ awb: o.awb, orderId: o.orderId, type: "COD_WRONG_AMOUNT", note: `billed ${codBilled}, agreed ${codOk}` });
  }

  const fwd = makeLine(o, "Forward", billedW, billedZone, freight(billedZone, billedW), codBilled);
  const fwdOk = makeLine(o, "Forward", okW, okZone, freight(okZone, okW), codOk);
  lines.push(fwd);
  let correct = fwdOk.total;

  const okRto = freight(okZone, okW); // same_as_forward
  if (o.status === "RTO") {
    let rtoAmt = okRto;
    if (has(rtoRateErr, o)) {
      rtoAmt = r2(okRto + 30);
      planted.push({ awb: o.awb, orderId: o.orderId, type: "RTO_WRONG_RATE", note: `RTO billed ${rtoAmt}, allowed ${okRto}` });
    }
    lines.push(makeLine(o, "RTO", billedW, billedZone, rtoAmt, 0));
    correct = r2(correct + makeLine(o, "RTO", okW, okZone, okRto, 0).total);
  }
  if (has(rtoNoReturnErr, o)) {
    lines.push(makeLine(o, "RTO", billedW, billedZone, okRto, 0));
    planted.push({ awb: o.awb, orderId: o.orderId, type: "RTO_WITHOUT_RETURN", note: "RTO billed on a delivered order" });
  }
  correctTotals.set(o.awb, correct);
}

// Duplicates: repeat the forward line later in the file.
for (const o of dupErr) {
  const fwd = lines.find((l) => l.awb === o.awb && l.type === "Forward")!;
  lines.splice(Math.min(lines.length, lines.indexOf(fwd) + 40), 0, { ...fwd });
  planted.push({ awb: o.awb, orderId: o.orderId, type: "DUPLICATE_AWB", note: "forward line billed twice" });
}

// Unmatched AWBs: shipments that aren't in the Shopify export.
for (const awb of ["14999990000101", "14999990000102"]) {
  const fake: Ord = { ...orders[0]!, awb, orderId: "", zone: "D", pincode: "302001" };
  lines.splice(60 + lines.length / 3, 0, makeLine(fake, "Forward", 0.5, "D", freight("D", 0.5), 0));
  planted.push({ awb, type: "UNMATCHED_AWB", note: "AWB not present in Shopify export" });
}

// Expected overcharge per AWB (₹), computed independently.
const perAwb: Record<string, number> = {};
for (const p of planted) {
  if (p.type === "UNMATCHED_AWB") {
    perAwb[p.awb] = 0;
    continue;
  }
  if (p.type === "DUPLICATE_AWB") continue;
  const billed = r2(lines.filter((l) => l.awb === p.awb).reduce((a, l) => a + l.total, 0));
  perAwb[p.awb] = r2(billed - correctTotals.get(p.awb)!);
}
for (const o of dupErr) {
  const fwd = lines.filter((l) => l.awb === o.awb && l.type === "Forward");
  perAwb[o.awb] = fwd[0]!.total; // one extra copy; the rest of the AWB is clean
}

// ---- write files ----
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const money = (n: number, i: number) => (i % 5 === 0 ? `₹${n.toFixed(2)}` : n.toFixed(2)); // some cells carry ₹ symbols

fs.mkdirSync(OUT, { recursive: true });

const invoiceRows: (string | number)[][] = [
  ["AWB Number", "Pickup Date", "Shipment Type", "Destination Pincode", "Charged Weight (Kg)", "Zone", "Freight Charges (Rs.)", "COD Charges", "RTO Charges", "Fuel Surcharge", "Other Charges", "GST @18%", "Total Amount (Rs.)"],
];
lines.forEach((l, i) => {
  invoiceRows.push([l.awb, l.date, l.type, l.pincode, l.weight, `Zone ${l.zone}`, l.freight.toFixed(2), l.cod ? l.cod.toFixed(2) : "", "", l.fuel.toFixed(2), "0.00", l.gst.toFixed(2), money(l.total, i)]);
  if (i === 90) invoiceRows.push(["", "", "", "", "", "", "", "", "", "", "", "", ""]); // a blank row, as exported by Excel
});
fs.writeFileSync(path.join(OUT, "sample_invoice_delhivery.csv"), toCsv(invoiceRows));

const PAY = { COD: "Cash on Delivery (COD)", Prepaid: "Razorpay Secure (UPI, Cards, Wallets, NetBanking)" };
const orderRows: (string | number)[][] = [
  ["Name", "Created at", "Tracking Number", "Shipping Zip", "Payment Method", "Total", "Weight (kg)", "Length (cm)", "Width (cm)", "Height (cm)", "Delivery Status"],
];
for (const o of orders) {
  orderRows.push([o.orderId, `${o.date} 10:15:00 +0530`, o.awb, o.pincode, PAY[o.payment], o.value >= 1000 ? `₹${o.value.toLocaleString("en-IN")}.00` : `${o.value}.00`, o.weight, o.box[0], o.box[1], o.box[2], o.status]);
}
fs.writeFileSync(path.join(OUT, "sample_shopify_orders.csv"), toCsv(orderRows));

fs.writeFileSync(path.join(OUT, "sample_rate_card.json"), JSON.stringify(RATE_CARD, null, 2) + "\n");

const templateRows: (string | number)[][] = [
  ["courier", "origin_pincode", "zone", "first_slab_rate", "additional_slab_rate", "first_slab_kg", "additional_slab_kg", "volumetric_divisor", "cod_fixed", "cod_percent", "fuel_surcharge_percent", "gst_percent", "rto_rule", "rto_value", "tolerance_percent"],
];
for (const z of ["A", "B", "C", "D", "E"] as Zone[]) {
  templateRows.push([COURIER, ORIGIN, z, RATE_CARD.rates[z].firstSlab, RATE_CARD.rates[z].additionalSlab, 0.5, 0.5, 5000, 35, 1.75, 8, 18, "same_as_forward", "", 10]);
}
fs.writeFileSync(path.join(OUT, "rate_card_template.csv"), toCsv(templateRows));

const counts: Record<string, number> = {};
for (const p of planted) counts[p.type] = (counts[p.type] ?? 0) + 1;
const expected = {
  description: "Every billing error planted in the sample invoice. The audit must find all of these and nothing else.",
  courier: COURIER,
  originPincode: ORIGIN,
  shipments: N,
  invoiceLines: lines.length,
  counts,
  totalOvercharge: r2(Object.values(perAwb).reduce((a, b) => a + b, 0)),
  overchargeByAwb: perAwb,
  planted,
  mustNotFlag: [
    ...nearMissWeight.map((o) => ({ awb: o.awb, why: "billed weight 5% above chargeable: crosses a slab but is within the 10% tolerance" })),
    ...cheaperZone.map((o) => ({ awb: o.awb, why: "billed a cheaper zone (C instead of D)" })),
  ],
};
fs.writeFileSync(path.join(OUT, "sample_expected_results.json"), JSON.stringify(expected, null, 2) + "\n");

console.log(`Wrote ${N} orders, ${lines.length} invoice lines, ${planted.length} planted issues →`, counts);
