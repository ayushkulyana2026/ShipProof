"use client";

import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/engine/money";
import { countMissingDimensions } from "@/lib/parsing/normalize";
import { useAudit } from "./store";

export function StepReview() {
  const { invoiceParsed, ordersParsed, orders, rateCards, settings } = useAudit();
  const lines = invoiceParsed?.rows ?? [];
  const total = lines.reduce((a, l) => a + l.totalCharge, 0);
  const awbs = new Set(lines.map((l) => l.awb));
  const orderAwbs = new Set((ordersParsed?.rows ?? []).map((o) => o.awb));
  const matched = [...awbs].filter((a) => orderAwbs.has(a)).length;
  const noDims = ordersParsed ? countMissingDimensions(ordersParsed.rows) : 0;

  const items: [string, string][] = [
    ["Invoice lines", `${lines.length.toLocaleString("en-IN")} (${awbs.size.toLocaleString("en-IN")} unique AWBs)`],
    ["Invoice total", formatINR(total)],
    ["Orders", (ordersParsed?.rows.length ?? 0).toLocaleString("en-IN")],
    ["AWBs matched to orders", `${matched.toLocaleString("en-IN")} of ${awbs.size.toLocaleString("en-IN")}`],
    ["Rate cards", rateCards.map((c) => `${c.courier} (origin ${c.originPincode})`).join(", ")],
    ["Weight tolerance", `${settings.tolerancePercent}%`],
    ["Default box", noDims && orders ? `${orders.defaultBox.lengthCm} × ${orders.defaultBox.breadthCm} × ${orders.defaultBox.heightCm} cm for ${noDims} orders` : "Not needed"],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready to audit</CardTitle>
        <CardDescription>ShipProof will recalculate every AWB against your rate card and flag anything you were overcharged for.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {items.map(([k, v]) => (
            <div key={k} className="flex flex-col border-b pb-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="tabular text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> The audit runs on this device. Nothing is uploaded.
        </p>
      </CardContent>
    </Card>
  );
}
