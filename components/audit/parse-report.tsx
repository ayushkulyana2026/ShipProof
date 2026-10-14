"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RowError } from "@/lib/parsing/normalize";

export function ParseReport({ valid, errors, skipped, noun }: { valid: number; errors: RowError[]; skipped: number; noun: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-800">
          <CheckCircle2 className="h-4 w-4" /> {valid.toLocaleString("en-IN")} {noun} ready
        </span>
        {errors.length > 0 && <span className="text-amber-700">{errors.length} row{errors.length === 1 ? "" : "s"} with problems</span>}
        {skipped > 0 && <span className="text-muted-foreground">{skipped} row{skipped === 1 ? "" : "s"} without an AWB skipped</span>}
      </div>
      {errors.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Some rows could not be used</AlertTitle>
          <AlertDescription>
            <p className="mb-2">These rows will be left out of the audit. Fix the column mapping above or the file, then re-upload.</p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs">
              {errors.slice(0, 50).map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
              {errors.length > 50 && <li>…and {errors.length - 50} more</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
