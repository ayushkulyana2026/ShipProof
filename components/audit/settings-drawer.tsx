"use client";

import * as React from "react";
import { Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { MetroCity } from "@/lib/pincode/zones";
import { DEFAULT_SETTINGS, useAudit, type AppSettings } from "./store";

const splitList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

type MetroDraft = { name: string; districts: string; states: string };

function toDraft(s: AppSettings) {
  return {
    tolerancePercent: String(s.tolerancePercent),
    volumetricDivisor: String(s.volumetricDivisor),
    metros: s.zone.metros.map((m) => ({ name: m.name, districts: m.districts.join(", "), states: m.states.join(", ") })),
    specialStates: s.zone.specialStates.join(", "),
    regions: s.zone.regions.map((r) => r.join(", ")).join("\n"),
  };
}

export function SettingsDrawer() {
  const { settings, updateSettings } = useAudit();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => toDraft(settings));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(settings));
      setError(null);
    }
  }, [open, settings]);

  const setMetro = (i: number, patch: Partial<MetroDraft>) =>
    setDraft((d) => ({ ...d, metros: d.metros.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  function save() {
    const tol = Number(draft.tolerancePercent);
    const div = Number(draft.volumetricDivisor);
    if (!Number.isFinite(tol) || tol < 0 || tol > 100) return setError("Tolerance must be between 0 and 100%.");
    if (!Number.isFinite(div) || div <= 0) return setError("Volumetric divisor must be a positive number (usually 5000).");
    const metros: MetroCity[] = draft.metros
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), districts: splitList(m.districts), states: splitList(m.states) }));
    updateSettings({
      tolerancePercent: tol,
      volumetricDivisor: div,
      zone: {
        metros,
        specialStates: splitList(draft.specialStates),
        regions: draft.regions
          .split("\n")
          .map((line) => splitList(line))
          .filter((r) => r.length > 1),
      },
    });
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 /> Settings
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Audit settings</SheetTitle>
          <SheetDescription>Couriers define zones differently. Adjust these to match your contract. Saved in this browser only.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tol">Weight tolerance (%)</Label>
              <Input id="tol" inputMode="decimal" value={draft.tolerancePercent} onChange={(e) => setDraft({ ...draft, tolerancePercent: e.target.value })} />
              <p className="text-xs text-muted-foreground">Billed weight above chargeable × (1 + tolerance) is flagged.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="div">Volumetric divisor</Label>
              <Input id="div" inputMode="numeric" value={draft.volumetricDivisor} onChange={(e) => setDraft({ ...draft, volumetricDivisor: e.target.value })} />
              <p className="text-xs text-muted-foreground">L × B × H (cm) ÷ divisor = volumetric kg.</p>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Zone rules</h4>
            <ol className="space-y-1 text-xs text-muted-foreground">
              <li><b className="text-slate-700">A</b> Within city (same district, or same metro cluster below)</li>
              <li><b className="text-slate-700">B</b> Within region (same state, or a region group below)</li>
              <li><b className="text-slate-700">E</b> Special destination states</li>
              <li><b className="text-slate-700">C</b> Metro to metro</li>
              <li><b className="text-slate-700">D</b> Rest of India</li>
            </ol>
            <p className="text-xs text-muted-foreground">Checked in this order. Unknown pincodes are never guessed: their zone check is skipped.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Metro list</h4>
              <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, metros: [...draft.metros, { name: "", districts: "", states: "" }] })}>
                <Plus /> Add metro
              </Button>
            </div>
            {draft.metros.map((m, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Input aria-label="Metro name" placeholder="Metro name" value={m.name} onChange={(e) => setMetro(i, { name: e.target.value })} />
                  <Button variant="ghost" size="icon" aria-label={`Remove ${m.name || "metro"}`} onClick={() => setDraft({ ...draft, metros: draft.metros.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </Button>
                </div>
                <Input aria-label="Districts" placeholder="Districts (India Post names), comma-separated" value={m.districts} onChange={(e) => setMetro(i, { districts: e.target.value })} />
                <Input aria-label="Whole states" placeholder="Whole states (optional), e.g. Delhi" value={m.states} onChange={(e) => setMetro(i, { states: e.target.value })} />
              </div>
            ))}
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="special">Special zone (E) states</Label>
            <Textarea id="special" rows={3} value={draft.specialStates} onChange={(e) => setDraft({ ...draft, specialStates: e.target.value })} />
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="regions">Region groups for zone B (optional)</Label>
            <Textarea
              id="regions"
              rows={3}
              placeholder={"One region per line, e.g.\nHaryana, Punjab, Chandigarh"}
              value={draft.regions}
              onChange={(e) => setDraft({ ...draft, regions: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">By default only the same state counts as zone B.</p>
          </section>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(DEFAULT_SETTINGS))}>
            <RotateCcw /> Reset to defaults
          </Button>
          <Button onClick={save}>Save settings</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
