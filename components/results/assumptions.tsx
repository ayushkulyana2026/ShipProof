import { Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Assumptions } from "@/lib/checks/audit";
import { describeRtoRule } from "@/lib/engine/cost";

export function AssumptionsPanel({ a }: { a: Assumptions }) {
  const items: { title: string; body: React.ReactNode }[] = [];

  for (const c of a.rateCards) {
    items.push({
      title: `Rate card · ${c.courier}`,
      body: `Origin ${c.originPincode}; slabs ${c.firstSlabKg} kg + ${c.additionalSlabKg} kg (extra weight rounded up); volumetric = L×B×H ÷ ${c.volumetricDivisor}; COD = max(₹${c.codFixed}, ${c.codPercent}%); fuel ${c.fuelSurchargePercent}% of freight; GST ${c.gstPercent}%; ${describeRtoRule(c)}.`,
    });
    items.push({
      title: "Weight tolerance",
      body: `Weight is only flagged when billed weight exceeds chargeable weight by more than ${c.tolerancePercent}% AND lands in a higher slab.`,
    });
  }

  if (a.defaultBox && a.ordersUsingDefaultBox > 0) {
    items.push({
      title: "Default box size (assumption)",
      body: `${a.ordersUsingDefaultBox} order${a.ordersUsingDefaultBox === 1 ? "" : "s"} had no dimensions, so we assumed ${a.defaultBox.lengthCm} × ${a.defaultBox.breadthCm} × ${a.defaultBox.heightCm} cm for volumetric weight.`,
    });
  } else if (a.ordersWithoutDimensions > 0) {
    items.push({ title: "Missing box sizes", body: `${a.ordersWithoutDimensions} orders had no dimensions; we used actual weight only.` });
  }

  const metros = a.zoneSettings.metros.map((m) => m.name).join(", ");
  items.push({
    title: "Zone rules",
    body: (
      <>
        A = same city (metro clusters count as one city), B = same state{a.zoneSettings.regions.length ? " or region group" : ""}, E = destination in{" "}
        {a.zoneSettings.specialStates.join(", ")}, C = metro to metro ({metros}), D = rest of India. Pincodes resolved with the India Post directory.
      </>
    ),
  });

  if (a.unknownPincodes.length) {
    items.push({
      title: "Unknown pincodes — zone check skipped",
      body: `${a.unknownPincodes.map((u) => `${u.pincode} (${u.awbs.length} AWB${u.awbs.length === 1 ? "" : "s"})`).join(", ")}. These aren't in the India Post directory, so we didn't guess a zone; the billed zone was used for pricing.`,
    });
  }
  if (a.originUnknown.length) {
    items.push({ title: "Origin pincode not found", body: `${a.originUnknown.join(", ")} isn't in the directory, so zone checks were skipped for every shipment.` });
  }
  for (const c of a.couriersWithoutOwnRateCard) {
    items.push({ title: `No rate card for ${c.courier}`, body: `Audited with the ${c.usedRateCardOf} rate card.` });
  }
  if (a.couriersSkipped.length) {
    items.push({ title: "Couriers not audited", body: `${a.couriersSkipped.join(", ")}: no rate card provided.` });
  }
  items.push({
    title: "RTO, COD and rounding",
    body: "A shipment is treated as RTO when its Shopify status is RTO. COD and RTO charges allow ₹1 for rounding. When an AWB has several issues, its overcharge is computed once (billed total − corrected total, with fuel and GST adjusted pro rata) and split between the issues, so nothing is double-counted.",
  });
  if (a.ordersNotOnInvoice > 0) {
    items.push({ title: "Orders not on this invoice", body: `${a.ordersNotOnInvoice} orders weren't billed on this invoice (likely billed in another period). They were ignored.` });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5 text-brand-700" /> Assumptions used
        </CardTitle>
        <CardDescription>Everything the numbers above depend on. Change rates on the rate card step and zone rules in Settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 md:grid-cols-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-md border bg-slate-50/60 p-3">
              <dt className="text-sm font-medium">{it.title}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{it.body}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
