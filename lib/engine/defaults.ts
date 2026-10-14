import type { RateCard } from "../types";

/** Sensible starting rate card (typical Indian B2C surface rates, ₹ per slab). Users edit this in the form. */
export function defaultRateCard(courier = "Delhivery", originPincode = ""): RateCard {
  return {
    courier,
    originPincode,
    volumetricDivisor: 5000,
    firstSlabKg: 0.5,
    additionalSlabKg: 0.5,
    rates: {
      A: { firstSlab: 32, additionalSlab: 30 },
      B: { firstSlab: 38, additionalSlab: 34 },
      C: { firstSlab: 45, additionalSlab: 40 },
      D: { firstSlab: 52, additionalSlab: 48 },
      E: { firstSlab: 68, additionalSlab: 62 },
    },
    rtoRule: "same_as_forward",
    codFixed: 35,
    codPercent: 1.75,
    fuelSurchargePercent: 0,
    gstPercent: 18,
    tolerancePercent: 10,
  };
}
