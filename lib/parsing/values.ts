import type { OrderStatus, PaymentMode, ShipmentType, Zone } from "../types";

/** Raw cell → trimmed string ("" for empty). */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/ /g, " ").trim();
}

/**
 * Parse an Indian-formatted amount: "₹1,23,456.50", "Rs. 99", "INR 1,000", "(12.50)", "1 234".
 * Returns undefined for blanks/dashes and NaN for text that is not a number.
 */
export function parseAmount(v: unknown): number | undefined {
  let s = cell(v);
  if (s === "" || /^[-–—]+$/.test(s) || /^n\/?a$/i.test(s)) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s
    .replace(/₹|rs\.?|inr|kgs?|gms?|grams?/gi, "")
    .replace(/[,\s']/g, "")
    .trim();
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.$/.test(s)) return Number.NaN;
  const n = Number(s);
  return negative ? -n : n;
}

/** Excel turns long numeric AWBs into "1.43265E+11"; those digits are lost and cannot be matched. */
export function looksLikeScientific(s: string): boolean {
  return /^\d(\.\d+)?e\+\d+$/i.test(s);
}

/** Keep AWBs as strings, preserving leading zeros. Strips a leading apostrophe and a spurious ".0". */
export function parseAwb(v: unknown): string {
  let s = cell(v).replace(/^'/, "").replace(/\s+/g, "");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s.toUpperCase();
}

export function parseZone(v: unknown): Zone | undefined {
  const s = cell(v).toLowerCase();
  if (!s) return undefined;
  const letter = s.match(/^(?:zone[\s_-]*)?([a-e])$/);
  if (letter) return letter[1]!.toUpperCase() as Zone;
  const z = s.match(/\bzone[\s_-]*([a-e])\b/);
  if (z) return z[1]!.toUpperCase() as Zone;
  if (/within\s*city|intra\s*city|local/.test(s)) return "A";
  if (/within\s*(state|region)|regional|intra\s*state/.test(s)) return "B";
  if (/metro/.test(s)) return "C";
  if (/rest\s*of\s*india|\broi\b|national/.test(s)) return "D";
  if (/special|north\s*east|\bne\b|j\s*&\s*k|kashmir/.test(s)) return "E";
  return undefined;
}

export function parsePaymentMode(v: unknown): PaymentMode | undefined {
  const s = cell(v).toLowerCase();
  if (!s) return undefined;
  if (/\bcod\b|cash\s*on\s*delivery|^cash$|pay\s*on\s*delivery|\bpod\b/.test(s)) return "COD";
  return "Prepaid";
}

export function parseStatus(v: unknown): OrderStatus | undefined {
  const s = cell(v).toLowerCase();
  if (!s) return undefined;
  if (/\brto\b|return(ed)?\s*to\s*origin|returned|undelivered\s*returned/.test(s)) return "RTO";
  if (/cancel/.test(s)) return "Cancelled";
  if (/^delivered$|^delivered\b|fulfilled\s*-?\s*delivered/.test(s)) return "Delivered";
  if (/transit|shipped|out\s*for\s*delivery|dispatched|picked|manifested|pending/.test(s)) return "In transit";
  return undefined;
}

export function parseShipmentType(v: unknown): ShipmentType | undefined {
  const s = cell(v).toLowerCase();
  if (!s) return undefined;
  if (/\brto\b|return|reverse/.test(s)) return "rto";
  return "forward";
}
