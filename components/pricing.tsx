"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJson } from "@/lib/api-client";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { LeadForm } from "./lead-form";

function Features({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((f) => (
        <li key={f} className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /> <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ highlight, children }: { highlight?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-5 rounded-xl border bg-white p-6 shadow-sm", highlight && "border-brand-700 ring-2 ring-brand-700/15")}>{children}</div>
  );
}

function PlanHead({ plan, badge }: { plan: (typeof PLANS)[keyof typeof PLANS]; badge?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{plan.name}</h3>
        {badge && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">{badge}</span>}
      </div>
      <p className="mt-3">
        <span className="tabular text-3xl font-semibold tracking-tight">{plan.price}</span> <span className="text-sm text-muted-foreground">{plan.cadence}</span>
      </p>
    </div>
  );
}

function MonthlyCheckout() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "loading" | "waitlist">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setError(null);
    const res = await postJson<{ checkoutUrl: string }>("/api/checkout", { plan: "monthly", email });
    if (res.ok) {
      window.location.assign(res.data.checkoutUrl);
      return;
    }
    if (res.error.code === "payments_not_configured" || res.error.status === 404) {
      setState("waitlist"); // payments not switched on yet: capture the lead instead
      return;
    }
    setError(res.error.message);
    setState("idle");
  }

  if (state === "waitlist") {
    return <LeadForm planInterest="monthly" defaultEmail={email} intro="Online payments open shortly. Leave your details and we'll set up monthly audits for you." submitLabel="Reserve my spot" />;
  }
  return (
    <form onSubmit={start} className="space-y-2">
      <Label htmlFor="checkout-email">Work email</Label>
      <Input id="checkout-email" type="email" required autoComplete="email" placeholder="you@brand.in" value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={state === "loading"}>
        {state === "loading" ? <Loader2 className="animate-spin" /> : <ArrowRight />} Start monthly audits
      </Button>
    </form>
  );
}

export function Pricing() {
  const [talk, setTalk] = React.useState(false);
  return (
    <section id="pricing" className="scroll-mt-20 border-y bg-slate-50/60">
      <div className="container max-w-6xl py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-2 text-slate-600">Start free. Pay only when ShipProof keeps finding you money.</p>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <PlanCard>
            <PlanHead plan={PLANS.free} />
            <Features items={["Audit one invoice, any courier", "Every check, with full working", "Dispute emails + CSVs per courier", "Runs in your browser"]} />
            <Button asChild variant="outline" className="mt-auto">
              <Link href="/audit">Run a free audit</Link>
            </Button>
          </PlanCard>

          <PlanCard highlight>
            <PlanHead plan={PLANS.monthly} badge="Most popular" />
            <Features items={["Unlimited invoices every month", "All couriers and rate cards", "Recovery tracking month to month", "Priority email support", "Cancel anytime"]} />
            <div className="mt-auto">
              <MonthlyCheckout />
            </div>
          </PlanCard>

          <PlanCard>
            <PlanHead plan={PLANS.success} />
            <Features items={["We audit and file the disputes", "Pay only on money credited back", "Best above ₹5 lakh/month in shipping", "Monthly recovery report"]} />
            <div className="mt-auto">
              {talk ? (
                <LeadForm planInterest="success" submitLabel="Talk to us" />
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setTalk(true)}>
                  Talk to us
                </Button>
              )}
            </div>
          </PlanCard>
        </div>
        <p className="mt-6 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Payments are processed by Dodo Payments. ShipProof stores only your email and billing status. Your invoices and orders never leave your browser. Prices exclude GST.
        </p>
      </div>
    </section>
  );
}
