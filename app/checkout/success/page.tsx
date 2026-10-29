import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

type Search = Promise<{ status?: string | string[]; payment_id?: string | string[] }>;

/**
 * Dodo redirects here with ?payment_id=…&status=…. The status is only a hint for the UI:
 * the verified webhook (app/api/webhooks/dodo) is the source of truth.
 */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const paymentId = typeof params.payment_id === "string" ? params.payment_id : undefined;

  const view =
    status === "succeeded" || status === "active"
      ? { icon: CheckCircle2, tone: "text-brand-700", title: "Payment received. Thank you!", body: "A receipt is on its way to your email." }
      : status === "failed" || status === "expired" || status === "cancelled"
        ? { icon: XCircle, tone: "text-destructive", title: "Payment didn't go through", body: "You haven't been charged. You can try again from the pricing page." }
        : { icon: Clock, tone: "text-amber-600", title: "Payment is processing", body: "This can take a few minutes. You'll get an email once it's confirmed." };

  const failed = view.icon === XCircle;
  return (
    <section className="container max-w-lg py-20 text-center">
      <view.icon className={`mx-auto h-12 w-12 ${view.tone}`} />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{view.title}</h1>
      <p className="mt-2 text-slate-600">{view.body}</p>
      {paymentId ? <p className="mt-4 font-mono text-xs text-muted-foreground">Reference: {paymentId}</p> : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {failed ? (
          <Button asChild>
            <Link href="/pricing">Back to pricing</Link>
          </Button>
        ) : null}
        <Button asChild variant={failed ? "outline" : "default"}>
          <Link href="/audit">Run an audit</Link>
        </Button>
      </div>
    </section>
  );
}
