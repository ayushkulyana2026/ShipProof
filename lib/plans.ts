/** Plans shown on the pricing section. The charged price is whatever the Dodo product is set to. */
export const PLANS = {
  free: { id: "free", name: "Free audit", price: "₹0", cadence: "one-off" },
  monthly: { id: "monthly", name: "Monthly audits", price: "₹1,999", cadence: "per month" },
  success: { id: "success", name: "Success fee", price: "15%", cadence: "of money recovered" },
} as const;

export type PaidPlanId = "monthly";
export type LeadPlanInterest = "monthly" | "success" | "other";
