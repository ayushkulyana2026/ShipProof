import type { BoxSize, Order, RateCard } from "../types";
import { roundQty } from "./money";

/** (L × B × H) / divisor, in kg. */
export function volumetricWeightKg(box: BoxSize, divisor: number): number {
  if (divisor <= 0) throw new Error("Volumetric divisor must be positive");
  return roundQty((box.lengthCm * box.breadthCm * box.heightCm) / divisor);
}

export type WeightBreakdown = {
  actualKg: number;
  volumetricKg: number | null;
  chargeableKg: number;
  box: BoxSize | null;
  /** True when the box came from the user's default box size, not the order row. */
  usedDefaultBox: boolean;
};

export function orderBox(order: Order, defaultBox?: BoxSize | null): { box: BoxSize | null; usedDefault: boolean } {
  const { lengthCm, breadthCm, heightCm } = order;
  if (lengthCm && breadthCm && heightCm) {
    return { box: { lengthCm, breadthCm, heightCm }, usedDefault: false };
  }
  if (defaultBox) return { box: defaultBox, usedDefault: true };
  return { box: null, usedDefault: false };
}

/** chargeable = max(actual, volumetric). Without any box size, chargeable = actual. */
export function chargeableWeight(order: Order, card: Pick<RateCard, "volumetricDivisor">, defaultBox?: BoxSize | null): WeightBreakdown {
  const { box, usedDefault } = orderBox(order, defaultBox);
  const volumetricKg = box ? volumetricWeightKg(box, card.volumetricDivisor) : null;
  const chargeableKg = roundQty(Math.max(order.actualWeightKg, volumetricKg ?? 0));
  return { actualKg: order.actualWeightKg, volumetricKg, chargeableKg, box, usedDefaultBox: usedDefault };
}

export type Slabs = {
  /** Number of additional slabs beyond the first. */
  extraSlabs: number;
  /** Weight actually billed after slab rounding (first + extra × additional). */
  slabbedKg: number;
};

/**
 * First slab covers `firstSlabKg`; any extra weight is rounded UP to the next
 * `additionalSlabKg`. 0.5 → 0 extra, 0.51 → 1 extra, 1.0 → 1 extra (with 0.5/0.5 slabs).
 */
export function slabs(weightKg: number, card: Pick<RateCard, "firstSlabKg" | "additionalSlabKg">): Slabs {
  const { firstSlabKg, additionalSlabKg } = card;
  if (additionalSlabKg <= 0) throw new Error("Additional slab must be positive");
  const extraWeight = roundQty(weightKg - firstSlabKg);
  const extraSlabs = extraWeight > 0 ? Math.ceil(roundQty(extraWeight / additionalSlabKg)) : 0;
  return { extraSlabs, slabbedKg: roundQty(firstSlabKg + extraSlabs * additionalSlabKg) };
}
