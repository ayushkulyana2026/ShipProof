"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ColumnMapping, FieldDef } from "@/lib/parsing/mapping";
import type { RawTable } from "@/lib/parsing/read";

export function ColumnMapper<K extends string>({
  table,
  fields,
  mapping,
  onChange,
}: {
  table: RawTable;
  fields: readonly FieldDef<K>[];
  mapping: ColumnMapping<K>;
  onChange: (m: ColumnMapping<K>) => void;
}) {
  const sample = (col: number | null) => {
    if (col === null) return "";
    const vals = table.rows
      .map((r) => r[col] ?? "")
      .filter(Boolean)
      .slice(0, 3);
    return vals.join(" · ");
  };
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => {
        const col = mapping[f.key];
        const missing = f.required && col === null;
        return (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`map-${f.key}`} className="flex items-center gap-1.5">
              {col !== null ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-700" aria-hidden />
              ) : missing ? (
                <CircleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-slate-300" aria-hidden />
              )}
              {f.label}
              {f.required ? <span className="text-destructive">*</span> : <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
            </Label>
            <Select
              id={`map-${f.key}`}
              value={col === null ? "" : String(col)}
              aria-invalid={missing}
              className={missing ? "border-destructive" : undefined}
              onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">— Not in file —</option>
              {table.headers.map((h, i) => (
                <option key={i} value={i}>
                  {h}
                </option>
              ))}
            </Select>
            <p className="truncate text-xs text-muted-foreground" title={sample(col)}>
              {col !== null ? `e.g. ${sample(col) || "(empty)"}` : (f.hint ?? (f.required ? "Required" : " "))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
