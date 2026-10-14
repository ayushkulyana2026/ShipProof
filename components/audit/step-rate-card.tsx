"use client";

import * as React from "react";
import { AlertCircle, Copy, Download, FileUp, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { describeRtoRule } from "@/lib/engine/cost";
import { parseRateCardCsv, parseRateCardJson, validateRateCard } from "@/lib/parsing/rateCard";
import { normalizePincode, PincodeDirectory } from "@/lib/pincode/directory";
import type { PincodeInfo } from "@/lib/pincode/types";
import { ZONE_LABELS } from "@/lib/pincode/zones";
import { ZONES, type RateCard, type RtoRule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAudit } from "./store";

const directory = new PincodeDirectory();

/** Number input that lets the user type freely and only commits valid numbers. */
function NumberField({ id, value, onChange, step = "any", suffix, className }: { id: string; value: number | undefined; onChange: (n: number | undefined) => void; step?: string; suffix?: string; className?: string }) {
  const [text, setText] = React.useState(value === undefined ? "" : String(value));
  React.useEffect(() => {
    if (value === undefined ? text !== "" : Number(text) !== value) setText(value === undefined ? "" : String(value));
  }, [value]);
  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        inputMode="decimal"
        type="number"
        step={step}
        min={0}
        value={text}
        className={suffix ? "pr-10" : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.trim() === "" ? undefined : Number(e.target.value);
          if (n === undefined || Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function OriginLookup({ pincode }: { pincode: string }) {
  const [info, setInfo] = React.useState<PincodeInfo | null | "loading">(null);
  React.useEffect(() => {
    const p = normalizePincode(pincode);
    if (!p) return setInfo(null);
    let alive = true;
    setInfo("loading");
    directory.preload([p]).then(() => alive && setInfo(directory.lookup(p)));
    return () => {
      alive = false;
    };
  }, [pincode]);
  if (!normalizePincode(pincode)) return <p className="text-xs text-muted-foreground">Your warehouse / pickup pincode.</p>;
  if (info === "loading") return <p className="text-xs text-muted-foreground">Looking up…</p>;
  if (!info) return <p className="text-xs text-destructive">Not found in the India Post directory — zone checks will be skipped.</p>;
  return (
    <p className="inline-flex items-center gap-1 text-xs text-brand-800">
      <MapPin className="h-3 w-3" /> {info.district}, {info.state}
    </p>
  );
}

export function StepRateCard() {
  const { rateCards, setRateCards, couriers } = useAudit();
  const [active, setActive] = React.useState(0);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [importNote, setImportNote] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const idx = Math.min(active, Math.max(0, rateCards.length - 1));
  const card = rateCards[idx];

  if (!card) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Upload an invoice first so we know which couriers need a rate card.</CardContent>
      </Card>
    );
  }

  const update = (patch: Partial<RateCard>) => setRateCards(rateCards.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const setRate = (zone: (typeof ZONES)[number], key: "firstSlab" | "additionalSlab", v: number | undefined) =>
    update({ rates: { ...card.rates, [zone]: { ...card.rates[zone], [key]: v ?? Number.NaN } } });
  const validation = validateRateCard(card);

  async function onImport(file: File) {
    setImportError(null);
    setImportNote(null);
    try {
      const text = await file.text();
      const imported = /\.json$/i.test(file.name) ? parseRateCardJson(text) : parseRateCardCsv(text);
      const byCourier = new Map(imported.map((c) => [c.courier.toLowerCase(), c]));
      let applied = 0;
      const next = rateCards.map((c, i) => {
        const hit = byCourier.get(c.courier.toLowerCase()) ?? (imported.length === 1 && i === idx ? imported[0] : undefined);
        if (!hit) return c;
        applied++;
        return { ...hit, courier: c.courier };
      });
      if (!applied) throw new Error(`No rate card in ${file.name} matches ${rateCards.map((c) => c.courier).join(", ")}.`);
      setRateCards(next);
      setImportNote(`Imported ${applied} rate card${applied === 1 ? "" : "s"} from ${file.name}.`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not read that rate card.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Your agreed rate card</CardTitle>
            <CardDescription>Prefilled with typical rates — replace them with the numbers in your courier contract. One rate card per courier.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp /> Import CSV / JSON
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/samples/rate_card_template.csv" download>
                <Download /> Template
              </a>
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {importError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          )}
          {importNote && <p className="text-sm text-brand-800">{importNote}</p>}

          {rateCards.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Couriers">
              {rateCards.map((c, i) => (
                <Button key={c.courier} role="tab" aria-selected={i === idx} variant={i === idx ? "default" : "outline"} size="sm" onClick={() => setActive(i)}>
                  {c.courier}
                  {!validateRateCard(c).ok && <AlertCircle className="text-amber-300" />}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRateCards(rateCards.map((c) => ({ ...card, courier: c.courier })))}
                title="Copy this rate card to every courier"
              >
                <Copy /> Use for all couriers
              </Button>
            </div>
          )}
          {couriers.length === 1 && <p className="text-sm text-muted-foreground">Courier: <span className="font-medium text-foreground">{card.courier}</span></p>}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="origin">Origin pincode *</Label>
              <Input id="origin" inputMode="numeric" maxLength={6} placeholder="e.g. 122016" value={card.originPincode} onChange={(e) => update({ originPincode: e.target.value.replace(/\D/g, "") })} />
              <OriginLookup pincode={card.originPincode} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="first-slab">First slab</Label>
              <NumberField id="first-slab" value={card.firstSlabKg} onChange={(v) => update({ firstSlabKg: v ?? Number.NaN })} suffix="kg" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-slab">Each additional slab</Label>
              <NumberField id="add-slab" value={card.additionalSlabKg} onChange={(v) => update({ additionalSlabKg: v ?? Number.NaN })} suffix="kg" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="divisor">Volumetric divisor</Label>
              <NumberField id="divisor" value={card.volumetricDivisor} onChange={(v) => update({ volumetricDivisor: v ?? Number.NaN })} />
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold">Freight rates (₹, before fuel and GST)</h4>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Zone</th>
                    <th className="px-3 py-2 text-left font-semibold">First {card.firstSlabKg || "?"} kg</th>
                    <th className="px-3 py-2 text-left font-semibold">Each extra {card.additionalSlabKg || "?"} kg</th>
                  </tr>
                </thead>
                <tbody>
                  {ZONES.map((z) => (
                    <tr key={z} className="border-t">
                      <td className="px-3 py-2">
                        <span className="font-semibold">{z}</span> <span className="text-muted-foreground">· {ZONE_LABELS[z]}</span>
                      </td>
                      <td className="px-3 py-2">
                        <NumberField id={`rate-${z}-1`} className="max-w-[140px]" value={card.rates[z].firstSlab} onChange={(v) => setRate(z, "firstSlab", v)} suffix="₹" />
                      </td>
                      <td className="px-3 py-2">
                        <NumberField id={`rate-${z}-2`} className="max-w-[140px]" value={card.rates[z].additionalSlab} onChange={(v) => setRate(z, "additionalSlab", v)} suffix="₹" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="cod-fixed">COD fixed fee</Label>
              <NumberField id="cod-fixed" value={card.codFixed} onChange={(v) => update({ codFixed: v ?? Number.NaN })} suffix="₹" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cod-pct">COD % of order value</Label>
              <NumberField id="cod-pct" value={card.codPercent} onChange={(v) => update({ codPercent: v ?? Number.NaN })} suffix="%" />
              <p className="text-xs text-muted-foreground">COD = max(fixed, % × order value)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fuel">Fuel surcharge</Label>
              <NumberField id="fuel" value={card.fuelSurchargePercent} onChange={(v) => update({ fuelSurchargePercent: v ?? Number.NaN })} suffix="%" />
              <p className="text-xs text-muted-foreground">% of freight</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gst">GST</Label>
              <NumberField id="gst" value={card.gstPercent} onChange={(v) => update({ gstPercent: v ?? Number.NaN })} suffix="%" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rto-rule">RTO rule</Label>
              <Select id="rto-rule" value={card.rtoRule} onChange={(e) => update({ rtoRule: e.target.value as RtoRule })}>
                <option value="same_as_forward">Same as forward freight</option>
                <option value="percent_of_forward">% of forward freight</option>
                <option value="flat">Flat ₹ per RTO</option>
              </Select>
            </div>
            {card.rtoRule !== "same_as_forward" && (
              <div className="space-y-1.5">
                <Label htmlFor="rto-value">{card.rtoRule === "flat" ? "RTO flat fee" : "RTO % of forward"}</Label>
                <NumberField id="rto-value" value={card.rtoValue} onChange={(v) => update({ rtoValue: v })} suffix={card.rtoRule === "flat" ? "₹" : "%"} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="tolerance">Weight tolerance</Label>
              <NumberField id="tolerance" value={card.tolerancePercent} onChange={(v) => update({ tolerancePercent: v ?? Number.NaN })} suffix="%" />
            </div>
          </section>
          <p className="text-xs text-muted-foreground">{describeRtoRule(card)}. RTO is only expected on orders whose Shopify status is RTO.</p>

          {!validation.ok && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {validation.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function rateCardStepReady(ctx: ReturnType<typeof useAudit>): boolean {
  return ctx.rateCards.length > 0 && ctx.rateCards.every((c) => validateRateCard(c).ok);
}
