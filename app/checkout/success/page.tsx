"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const FAILED = new Set(["failed", "cancelled", "expired"]);

function Result() {
  const params = useSearchParams();
  const status = (params.get("status") ?? "").toLowerCase();
  // The redirect is only a hint; the subscription is confirmed by Dodo's webhook on our server.
  if (FAILED.has(status)) {
    return (
      <>
        <XCircle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 text-2xl font-semibold">Payment didn&apos;t go through</h1>
        <p className="mt-2 text-muted-foreground">You haven&apos;t been charged. You can try again, or use a different payment method.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link href="/#pricing">Try again</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/audit">Run a free audit</Link>
          </Button>
        </div>
      </>
    );
  }
  const done = status === "active" || status === "succeeded";
  return (
    <>
      {done ? <CheckCircle2 className="mx-auto h-10 w-10 text-brand-700" /> : <Clock className="mx-auto h-10 w-10 text-brand-700" />}
      <h1 className="mt-4 text-2xl font-semibold">{done ? "You're subscribed to monthly audits" : "Thanks! We're confirming your payment"}</h1>
      <p className="mt-2 text-muted-foreground">
        Your receipt is on its way to your email. We&apos;ll be in touch within one working day to set up your first monthly audit.
      </p>
      <div className="mt-6 flex justify-center">
        <Button asChild>
          <Link href="/audit">Run an audit now</Link>
        </Button>
      </div>
    </>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <div className="container max-w-xl py-20 text-center">
      <React.Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Result />
      </React.Suspense>
    </div>
  );
}
