"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileSearch, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { settingsKey, useAudit } from "@/components/audit/store";
import { AssumptionsPanel } from "@/components/results/assumptions";
import { CourierBreakdown } from "@/components/results/courier-breakdown";
import { IssuesTable } from "@/components/results/issues-table";
import { formatINR } from "@/lib/engine/money";
import { fullReportCsv, ISSUE_DESCRIPTIONS, ISSUE_LABELS, summarize } from "@/lib/report";
import type { IssueType } from "@/lib/types";
import { cn, downloadText } from "@/lib/utils";

export default function ResultsPage() {
  const { run, settings, runCurrent, loadSample } = useAudit();
  const router = useRouter();
  const [typeFilter, setTypeFilter] = React.useState<IssueType | "">("");
  const [rerunning, setRerunning] = React.useState(false);
  const [loadingSample, setLoadingSample] = React.useState(false);
  const summary = React.useMemo(() => (run ? summarize(run.result) : null), [run]);

  if (!run || !summary) {
    return (
      <div className="container max-w-xl py-20 text-center">
        <FileSearch className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-2xl font-semibold">No audit yet</h1>
        <p className="mt-2 text-muted-foreground">Results live only in this browser tab, so they disappear on refresh. Run an audit to see them.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link href="/audit">Run a free audit</Link>
          </Button>
          <Button
            variant="outline"
            disabled={loadingSample}
            onClick={async () => {
              setLoadingSample(true);
              try {
                await loadSample();
              } finally {
                setLoadingSample(false);
              }
            }}
          >
            {loadingSample ? <Loader2 className="animate-spin" /> : <Sparkles />} Try with sample data
          </Button>
        </div>
      </div>
    );
  }

  const { result } = run;
  const stale = run.settingsKey !== settingsKey(settings);
  const cards = summary.byType.filter((t) => t.count > 0 || t.type !== "UNMATCHED_AWB");

  async function rerun() {
    setRerunning(true);
    try {
      await runCurrent();
    } finally {
      setRerunning(false);
    }
  }

  return (
    <div className="container max-w-6xl space-y-6 py-8 sm:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" className="-ml-3 w-fit" onClick={() => router.push("/audit")}>
          <ArrowLeft /> Edit inputs
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadText("shipproof-full-report.csv", fullReportCsv(result))}>
            <Download /> Download full report CSV
          </Button>
        </div>
      </div>

      {run.source === "sample" && (
        <Alert variant="info">
          <Sparkles />
          <AlertDescription>
            You&apos;re viewing a demo audit on sample data (200 Delhivery shipments with known billing errors).{" "}
            <Link href="/audit" className="font-medium underline">
              Upload your own files
            </Link>{" "}
            to audit your invoice.
          </AlertDescription>
        </Alert>
      )}
      {stale && (
        <Alert variant="warning" className="flex items-center justify-between gap-3">
          <AlertDescription>Settings changed since this audit ran.</AlertDescription>
          <Button size="sm" onClick={rerun} disabled={rerunning}>
            {rerunning ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-run audit
          </Button>
        </Alert>
      )}

      <Card className="overflow-hidden border-brand-700/20">
        <CardContent className="bg-gradient-to-br from-brand-50 to-white p-6 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-brand-800">Money you can recover{run.period ? ` · ${run.period}` : ""}</p>
          <h1 className="tabular mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            {formatINR(summary.totalOvercharge)} <span className="text-xl font-normal text-slate-600 sm:text-2xl">overcharged</span>
          </h1>
          <p className="mt-2 text-base text-slate-700 sm:text-lg">
            across <b>{summary.shipmentsAffected.toLocaleString("en-IN")}</b> shipment{summary.shipmentsAffected === 1 ? "" : "s"} (
            <b>{summary.percentOfInvoice.toFixed(1)}%</b> of your {formatINR(summary.invoiceTotal)} invoice)
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            {summary.shipmentsAudited.toLocaleString("en-IN")} AWBs and {result.invoiceLineCount.toLocaleString("en-IN")} invoice lines checked · {summary.issueCount} issues found
            {run.parseWarnings > 0 && ` · ${run.parseWarnings} rows skipped during import`}
          </p>
        </CardContent>
      </Card>

      <section aria-label="Issues by type" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((t) => {
          const active = typeFilter === t.type;
          return (
            <button
              key={t.type}
              type="button"
              title={ISSUE_DESCRIPTIONS[t.type]}
              onClick={() => {
                setTypeFilter(active ? "" : t.type);
                document.getElementById("issues")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={cn(
                "rounded-lg border bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-600",
                active && "border-brand-700 ring-2 ring-brand-700/20",
                t.count === 0 && "opacity-60",
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">{ISSUE_LABELS[t.type]}</p>
              <p className="tabular mt-1 text-xl font-semibold">{formatINR(t.amount, { decimals: 0 })}</p>
              <p className="text-xs text-muted-foreground">
                {t.count} issue{t.count === 1 ? "" : "s"}
              </p>
            </button>
          );
        })}
      </section>

      <CourierBreakdown result={result} summary={summary} period={run.period} />

      <div id="issues" className="scroll-mt-20">
        <IssuesTable issues={result.issues} typeFilter={typeFilter} onTypeFilter={setTypeFilter} />
      </div>

      <AssumptionsPanel a={result.assumptions} />
    </div>
  );
}
