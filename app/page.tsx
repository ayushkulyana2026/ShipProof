import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSpreadsheet, Lock, Mail, Scale, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrySampleButton } from "@/components/try-sample-button";
import { Pricing } from "@/components/pricing";
import { runAudit } from "@/lib/checks/audit";
import { formatINR } from "@/lib/engine/money";
import { prepareFromText } from "@/lib/pipeline";
import { summarize } from "@/lib/report/summary";
import { ISSUE_LABELS } from "@/lib/report/labels";
import fs from "node:fs/promises";
import path from "node:path";

/** The hero example is the real engine's result on the bundled sample, computed at build time. */
async function sampleSummary() {
  const read = (f: string) => fs.readFile(path.join(process.cwd(), "public", "samples", f), "utf8");
  const [invoiceCsv, ordersCsv, rateCardJson] = await Promise.all([read("sample_invoice_delhivery.csv"), read("sample_shopify_orders.csv"), read("sample_rate_card.json")]);
  const p = prepareFromText({ invoiceCsv, ordersCsv, rateCardJson });
  const result = await runAudit({ invoice: p.invoice.rows, orders: p.orders.rows, rateCards: p.rateCards });
  return summarize(result);
}

const STEPS = [
  {
    icon: FileSpreadsheet,
    title: "Upload",
    body: "Your courier invoice, Shopify order export and agreed rate card. CSV or Excel, any column names.",
  },
  {
    icon: ScanSearch,
    title: "We check every AWB",
    body: "Each shipment is matched by AWB and re-priced: volumetric weight, slabs, pincode zone, COD, RTO, fuel and GST.",
  },
  {
    icon: Mail,
    title: "Get your refund list",
    body: "A rupee total you can recover, the working for every flagged AWB, and ready-to-send dispute emails + CSVs per courier.",
  },
];

const CHECKS = [
  ["Weight overcharges", "Billed above chargeable weight + tolerance, into a higher slab"],
  ["Wrong zones", "Billed as a costlier zone than the pincodes resolve to"],
  ["Rate mismatches", "Freight above your agreed rate card"],
  ["COD fees", "COD on prepaid orders, or above max(fixed, % of value)"],
  ["Duplicate AWBs", "The same shipment billed twice"],
  ["Bad RTO charges", "RTO on delivered orders, or above the RTO rule"],
];

export default async function LandingPage() {
  const sample = await sampleSummary();
  const sampleTop = sample.byType.filter((t) => t.type !== "UNMATCHED_AWB" && t.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
  return (
    <>
      <section className="border-b bg-white">
        <div className="container grid max-w-6xl gap-12 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
              <Lock className="h-3.5 w-3.5" /> Your files never leave your browser
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">Is your courier overcharging you?</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Upload your courier invoice and Shopify orders. ShipProof checks every shipment for wrong weights, wrong zones and hidden charges. Free, private, 2 minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-start gap-3">
              <Button asChild size="lg">
                <Link href="/audit">
                  Run a free audit <ArrowRight />
                </Link>
              </Button>
              <TrySampleButton />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Works with Shiprocket, Delhivery, Xpressbees, Blue Dart and more.</p>
          </div>

          <div className="rounded-xl border bg-gradient-to-br from-brand-50 via-white to-white p-6 shadow-sm" aria-label="Example result">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-800">Example audit · {sample.shipmentsAudited} AWBs</p>
            <p className="tabular mt-2 text-4xl font-semibold text-slate-900">{formatINR(sample.totalOvercharge)}</p>
            <p className="text-sm text-slate-600">
              overcharged across {sample.shipmentsAffected} shipments ({sample.percentOfInvoice.toFixed(1)}% of the invoice)
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {sampleTop.map((t) => [ISSUE_LABELS[t.type], String(t.count)] as const).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between border-b border-dashed pb-2 last:border-0">
                  <span className="text-slate-700">{k}</span>
                  <span className="tabular font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="container max-w-6xl py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
                <s.icon className="h-5 w-5 text-brand-700" />
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y bg-white">
        <div className="container grid max-w-6xl gap-10 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">What we check</h2>
            <p className="mt-3 text-slate-600">
              Every flag shows its working (expected vs billed, and why), so you can paste it straight into a dispute. All maths is plain, deterministic code. No AI guesses at
              your money.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {CHECKS.map(([t, d]) => (
                <li key={t} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  <span>
                    <span className="text-sm font-medium">{t}</span>
                    <span className="block text-xs text-muted-foreground">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Lock className="h-4 w-4 text-brand-700" /> Private by design
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Your files never leave your browser. Parsing, matching and the audit all run on your device, and nothing you upload is stored or sent to a server. Close
                the tab and it&apos;s gone.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Scale className="h-4 w-4 text-brand-700" /> Fair to your courier
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Weight tolerance, ₹1 rounding allowances and editable zone rules mean we only flag what you can genuinely dispute. Unknown pincodes are skipped, never
                guessed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Pricing />

      <section className="container max-w-6xl py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Find out in 2 minutes.</h2>
        <p className="mt-2 text-slate-600">No sign-up. No upload to any server. Free.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/audit">
              Run a free audit <ArrowRight />
            </Link>
          </Button>
          <TrySampleButton />
        </div>
      </section>
    </>
  );
}
