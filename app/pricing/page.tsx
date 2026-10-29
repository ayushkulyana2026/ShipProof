import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/checkout-button";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing" };

const FREE_FEATURES = ["Unlimited audits in your browser", "All 9 overcharge checks", "Dispute CSVs and emails per courier", "Files never leave your device"];

export default function PricingPage() {
  const pro = PLANS.pro;
  return (
    <section className="container max-w-4xl py-16 sm:py-20">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pricing</h1>
        <p className="mt-3 text-slate-600">The audit is free. Pro is for teams that want more.</p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="flex flex-col rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="font-semibold">Free</h2>
          <p className="tabular mt-2 text-3xl font-semibold">₹0</p>
          <p className="text-sm text-muted-foreground">No sign-up</p>
          <ul className="mt-6 flex-1 space-y-2.5 text-sm">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /> {f}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" variant="outline" className="mt-6 w-full">
            <Link href="/audit">Run a free audit</Link>
          </Button>
        </div>

        <div className="flex flex-col rounded-xl border-2 border-brand-700 bg-white p-6 shadow-sm">
          <h2 className="font-semibold">{pro.name}</h2>
          <p className="tabular mt-2 text-3xl font-semibold">{pro.priceLabel}</p>
          <p className="text-sm text-muted-foreground">{pro.cadence}</p>
          <p className="mt-4 text-sm text-slate-600">{pro.blurb}</p>
          <ul className="mt-4 flex-1 space-y-2.5 text-sm">
            {pro.features.map((f) => (
              <li key={f} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <CheckoutButton plan="pro">Buy Pro</CheckoutButton>
          </div>
        </div>
      </div>

      <p className="mt-8 inline-flex w-full items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Payments are handled by Dodo Payments. Your audit files are never part of checkout.
      </p>
    </section>
  );
}
