"use client";

import * as React from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function FileDrop({
  label,
  hint,
  accept = ".csv,.xlsx,.xls",
  fileName,
  rowCount,
  busy,
  onFile,
  onClear,
}: {
  label: string;
  hint: string;
  accept?: string;
  fileName?: string;
  rowCount?: number;
  busy?: boolean;
  onFile: (file: File) => void;
  onClear?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  if (fileName) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-white p-4">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-brand-700" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{fileName}</p>
            {rowCount !== undefined && <p className="text-xs text-muted-foreground">{rowCount.toLocaleString("en-IN")} data rows read in your browser</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Replace
          </Button>
          {onClear && (
            <Button variant="ghost" size="icon" onClick={onClear} aria-label="Remove file">
              <X />
            </Button>
          )}
        </div>
        <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files)} />
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white px-6 py-10 text-center transition-colors hover:border-brand-600 hover:bg-brand-50/40",
        dragging && "border-brand-600 bg-brand-50/60",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <Upload className="h-8 w-8 text-brand-700" />
      <span className="text-sm font-medium">{busy ? "Reading file…" : label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files)} />
    </label>
  );
}
