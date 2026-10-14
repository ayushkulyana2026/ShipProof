import { z } from "zod";
import type { RateCard, Zone } from "../types";
import { ZONES } from "../types";
import { readCsvText } from "./read";
import { parseAmount } from "./values";

const slab = z.object({ firstSlab: z.number().min(0), additionalSlab: z.number().min(0) });

export const rateCardSchema = z
  .object({
    courier: z.string().trim().min(1, "Courier name is required"),
    originPincode: z.string().regex(/^[1-9]\d{5}$/, "Origin pincode must be 6 digits"),
    volumetricDivisor: z.number().positive("Volumetric divisor must be positive"),
    firstSlabKg: z.number().positive("First slab must be positive"),
    additionalSlabKg: z.number().positive("Additional slab must be positive"),
    rates: z.object({ A: slab, B: slab, C: slab, D: slab, E: slab }),
    rtoRule: z.enum(["same_as_forward", "percent_of_forward", "flat"]),
    rtoValue: z.number().min(0).optional(),
    codFixed: z.number().min(0),
    codPercent: z.number().min(0).max(100),
    fuelSurchargePercent: z.number().min(0).max(100),
    gstPercent: z.number().min(0).max(100),
    tolerancePercent: z.number().min(0).max(100),
  })
  .refine((c) => c.rtoRule === "same_as_forward" || c.rtoValue !== undefined, {
    message: "RTO value is required for this RTO rule",
    path: ["rtoValue"],
  });

export function validateRateCard(card: unknown): { ok: true; card: RateCard } | { ok: false; errors: string[] } {
  const r = rateCardSchema.safeParse(card);
  if (r.success) return { ok: true, card: r.data as RateCard };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "rate card"}: ${i.message}`) };
}

/** Parse rate cards from JSON (one card or an array). */
export function parseRateCardJson(text: string): RateCard[] {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : [data];
  return list.map((c, i) => {
    const v = validateRateCard(c);
    if (!v.ok) throw new Error(`Rate card ${i + 1}: ${v.errors.join("; ")}`);
    return v.card;
  });
}

/**
 * Parse the CSV template (public/samples/rate_card_template.csv): one row per
 * courier × zone; card-level columns are read from the courier's first row.
 */
export function parseRateCardCsv(text: string): RateCard[] {
  const table = readCsvText(text, "rate_card.csv");
  const col = (name: string) => table.headers.findIndex((h) => h.trim().toLowerCase() === name);
  const need = ["courier", "origin_pincode", "zone", "first_slab_rate", "additional_slab_rate"];
  for (const n of need) if (col(n) < 0) throw new Error(`Rate card CSV is missing the "${n}" column`);
  const num = (row: string[], name: string, fallback: number) => {
    const i = col(name);
    const v = i < 0 ? undefined : parseAmount(row[i]);
    return v === undefined || Number.isNaN(v) ? fallback : v;
  };
  const str = (row: string[], name: string) => {
    const i = col(name);
    return i < 0 ? "" : (row[i] ?? "").trim();
  };
  const cards = new Map<string, RateCard & { seen: Set<Zone> }>();
  for (const row of table.rows) {
    const courier = str(row, "courier");
    const zone = str(row, "zone").toUpperCase().replace(/^ZONE\s*/, "") as Zone;
    if (!courier) continue;
    if (!ZONES.includes(zone)) throw new Error(`Rate card CSV: unknown zone "${str(row, "zone")}" for ${courier}`);
    let card = cards.get(courier);
    if (!card) {
      const rtoRule = (str(row, "rto_rule") || "same_as_forward") as RateCard["rtoRule"];
      const rtoValue = str(row, "rto_value") ? num(row, "rto_value", 0) : undefined;
      card = {
        courier,
        originPincode: str(row, "origin_pincode"),
        volumetricDivisor: num(row, "volumetric_divisor", 5000),
        firstSlabKg: num(row, "first_slab_kg", 0.5),
        additionalSlabKg: num(row, "additional_slab_kg", 0.5),
        rates: {} as RateCard["rates"],
        rtoRule,
        ...(rtoValue !== undefined ? { rtoValue } : {}),
        codFixed: num(row, "cod_fixed", 0),
        codPercent: num(row, "cod_percent", 0),
        fuelSurchargePercent: num(row, "fuel_surcharge_percent", 0),
        gstPercent: num(row, "gst_percent", 18),
        tolerancePercent: num(row, "tolerance_percent", 10),
        seen: new Set(),
      };
      cards.set(courier, card);
    }
    card.rates[zone] = { firstSlab: num(row, "first_slab_rate", NaN), additionalSlab: num(row, "additional_slab_rate", NaN) };
    card.seen.add(zone);
  }
  return [...cards.values()].map(({ seen, ...card }) => {
    const missing = ZONES.filter((z) => !seen.has(z));
    if (missing.length) throw new Error(`Rate card CSV: ${card.courier} is missing zone(s) ${missing.join(", ")}`);
    const v = validateRateCard(card);
    if (!v.ok) throw new Error(`Rate card CSV (${card.courier}): ${v.errors.join("; ")}`);
    return v.card;
  });
}
