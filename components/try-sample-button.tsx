"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";
import { useAudit } from "./audit/store";

export function TrySampleButton(props: ButtonProps) {
  const { loadSample } = useAudit();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="lg"
        {...props}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await loadSample();
            router.push("/audit/results");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load the sample.");
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Try with sample data
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
