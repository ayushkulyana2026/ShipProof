"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { postJson } from "@/lib/api-client";
import type { LeadPlanInterest } from "@/lib/plans";

export function LeadForm({
  planInterest,
  defaultEmail = "",
  intro,
  submitLabel = "Send",
  source = "pricing",
}: {
  planInterest: LeadPlanInterest;
  defaultEmail?: string;
  intro?: string;
  submitLabel?: string;
  source?: string;
}) {
  const id = React.useId();
  const [state, setState] = React.useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    const res = await postJson<{ ok: true }>("/api/leads", {
      email: String(f.get("email") ?? ""),
      name: String(f.get("name") ?? ""),
      company: String(f.get("company") ?? ""),
      monthlyOrders: f.get("monthlyOrders") ? String(f.get("monthlyOrders")) : undefined,
      message: String(f.get("message") ?? ""),
      website: String(f.get("website") ?? ""),
      planInterest,
      source,
    });
    if (res.ok) setState("done");
    else {
      setError(res.error.message);
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p className="flex items-start gap-2 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900" role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Thanks! We&apos;ll be in touch within one working day.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-email`}>Work email *</Label>
        <Input id={`${id}-email`} name="email" type="email" required autoComplete="email" defaultValue={defaultEmail} placeholder="you@brand.in" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input id={`${id}-name`} name="name" autoComplete="name" maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-company`}>Brand</Label>
          <Input id={`${id}-company`} name="company" autoComplete="organization" maxLength={120} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-orders`}>Orders per month</Label>
        <Select id={`${id}-orders`} name="monthlyOrders" defaultValue="">
          <option value="">Prefer not to say</option>
          <option value="<500">Under 500</option>
          <option value="500-2000">500 – 2,000</option>
          <option value="2000-5000">2,000 – 5,000</option>
          <option value="5000+">5,000+</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-message`}>Anything we should know?</Label>
        <Textarea id={`${id}-message`} name="message" rows={2} maxLength={2000} placeholder="Couriers you use, monthly shipping spend…" />
      </div>
      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={state === "sending"}>
        {state === "sending" && <Loader2 className="animate-spin" />} {submitLabel}
      </Button>
    </form>
  );
}
