/**
 * Money helpers. All amounts are INR rupees as JS numbers, rounded to paise
 * (2 dp) at every step so results are deterministic and match what appears on
 * an invoice.
 */

/** Round to 2 decimal places (paise), half away from zero, robust to float noise (1.005 → 1.01). */
export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + 1e-7)) / 100;
}

/** Round a weight / ratio to 6 dp to kill float noise like 0.30000000000000004. */
export function roundQty(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function sum(values: readonly number[]): number {
  return round2(values.reduce((a, b) => a + b, 0));
}

/** Percentage of an amount, rounded to paise. `pct` is a percentage (18 → 18%). */
export function pctOf(amount: number, pct: number): number {
  return round2((amount * pct) / 100);
}

/**
 * Indian-style currency formatting: ₹1,23,456.00.
 * Implemented by hand (not Intl) so output is identical in every runtime.
 */
export function formatINR(amount: number, opts: { symbol?: boolean; decimals?: 0 | 2 } = {}): string {
  const { symbol = true, decimals = 2 } = opts;
  const negative = amount < 0;
  const fixed = Math.abs(decimals === 2 ? round2(amount) : Math.round(amount)).toFixed(decimals);
  const [intPart, frac] = fixed.split(".") as [string, string | undefined];
  let grouped: string;
  if (intPart.length <= 3) {
    grouped = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  const body = frac !== undefined ? `${grouped}.${frac}` : grouped;
  return `${negative ? "-" : ""}${symbol ? "₹" : ""}${body}`;
}

export function formatKg(kg: number): string {
  return `${Number(roundQty(kg).toFixed(3))} kg`;
}
