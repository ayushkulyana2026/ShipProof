"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Lock, PlayCircle, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { invoiceStepReady, StepInvoice } from "@/components/audit/step-invoice";
import { ordersStepReady, StepOrders } from "@/components/audit/step-orders";
import { rateCardStepReady, StepRateCard } from "@/components/audit/step-rate-card";
import { StepReview } from "@/components/audit/step-review";
import { Stepper } from "@/components/audit/stepper";
import { useAudit } from "@/components/audit/store";

const STEPS = ["Courier invoice", "Shopify orders", "Rate card", "Run audit"];

export default function AuditPage() {
  const ctx = useAudit();
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const done = [invoiceStepReady(ctx), ordersStepReady(ctx), rateCardStepReady(ctx), false];
  const canNext = done[step] ?? false;

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  async function run(sample = false) {
    setRunning(true);
    setError(null);
    try {
      await (sample ? ctx.loadSample() : ctx.runCurrent());
      router.push("/audit/results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The audit failed. Please check your files and try again.");
      setRunning(false);
    }
  }

  return (
    <div className="container max-w-5xl space-y-8 py-8 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Run a free shipping audit</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Your files never leave your browser. Nothing is stored or sent to a server.
          </p>
        </div>
        {!ctx.invoice && (
          <Button variant="outline" onClick={() => run(true)} disabled={running}>
            <Sparkles /> Try with sample data
          </Button>
        )}
      </div>

      <Stepper steps={STEPS} current={step} done={done} onSelect={setStep} />

      {step === 0 && <StepInvoice />}
      {step === 1 && <StepOrders />}
      {step === 2 && <StepRateCard />}
      {step === 3 && <StepReview />}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between border-t pt-6">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || running}>
          <ArrowLeft /> Back
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button size="lg" onClick={() => run(false)} disabled={running || !done.slice(0, 3).every(Boolean)}>
            {running ? <Loader2 className="animate-spin" /> : <PlayCircle />} {running ? "Auditing…" : "Run audit"}
          </Button>
        )}
      </div>
    </div>
  );
}
