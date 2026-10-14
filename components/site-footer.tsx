import { Lock } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> All processing happens in your browser. Nothing you upload is stored or sent to a server.
        </p>
        <p>© {new Date().getFullYear()} ShipProof · Pincode data: India Post, All India Pincode Directory</p>
      </div>
    </footer>
  );
}
