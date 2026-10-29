/**
 * Public plan details shown on the pricing page. Safe to import anywhere.
 * The price shown here is display copy only: the amount actually charged is
 * whatever the product is set to in the Dodo Payments dashboard, so keep them in sync.
 */
export type PlanId = "pro";

export interface Plan {
  id: PlanId;
  name: string;
  priceLabel: string;
  cadence: string;
  blurb: string;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  pro: {
    id: "pro",
    name: "ShipProof Pro",
    priceLabel: "₹999",
    cadence: "one-time",
    blurb: "For brands that audit every invoice, every month.",
    features: ["Everything in Free", "Priority email support", "Early access to new courier formats", "Supports an independent, private tool"],
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS, value);
}
