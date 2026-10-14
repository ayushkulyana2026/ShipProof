"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/engine/money";
import { autoMap, INVOICE_FIELDS, missingRequired } from "@/lib/parsing/mapping";
import type { WeightUnit } from "@/lib/parsing/normalize";
import { readFile } from "@/lib/parsing/read";
import { guessWeightUnit } from "@/lib/pipeline";
import { ColumnMapper } from "./column-mapper";
import { FileDrop, MAX_FILE_BYTES } from "./file-drop";
import { ParseReport } from "./parse-report";
import { useAudit } from "./store";

export const KNOWN_COURIERS = ["Delhivery", "Shiprocket", "Xpressbees", "Blue Dart", "Ecom Express", "DTDC", "Ekart", "Shadowfax", "India Post", "Amazon Shipping"];

function courierFromFileName(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  return KNOWN_COURIERS.find((c) => n.includes(c.toLowerCase().replace(/[^a-z]/g, ""))) ?? "";
}

export function StepInvoice() {
  const { invoice, setInvoice, invoiceParsed } = useAudit();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) return setError("That file is larger than 25 MB. Split it by month and audit each part.");
    setBusy(true);
    try {
      const table = await readFile(file);
      if (!table.rows.length) throw new Error("No data rows found in this file.");
      const mapping = autoMap(table.headers, INVOICE_FIELDS);
      setInvoice({ table, mapping, courier: invoice?.courier || courierFromFileName(file.name), weightUnit: guessWeightUnit(table, mapping.billedWeightKg) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  }

  const missing = invoice ? missingRequired(invoice.mapping, INVOICE_FIELDS) : [];
  const needCourier = invoice && invoice.mapping.courier === null && !invoice.courier.trim();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload your courier invoice</CardTitle>
          <CardDescription>CSV or Excel export from Shiprocket, Delhivery, Xpressbees, Blue Dart or any other courier. One row per shipment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDrop
            label="Drop the invoice here, or click to choose"
            hint="CSV, XLSX or XLS · up to 25 MB"
            fileName={invoice?.table.fileName}
            rowCount={invoice?.table.rows.length}
            busy={busy}
            onFile={onFile}
            onClear={() => setInvoice(null)}
          />
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {invoice && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Confirm the columns</CardTitle>
              <CardDescription>We matched your headers automatically. Check each one and fix anything that looks wrong.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ColumnMapper table={invoice.table} fields={INVOICE_FIELDS} mapping={invoice.mapping} onChange={(mapping) => setInvoice({ ...invoice, mapping })} />
              <div className="grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="courier">Courier for this file{invoice.mapping.courier === null && <span className="text-destructive"> *</span>}</Label>
                  <Input
                    id="courier"
                    list="courier-list"
                    placeholder="e.g. Delhivery"
                    value={invoice.courier}
                    aria-invalid={!!needCourier}
                    disabled={invoice.mapping.courier !== null}
                    onChange={(e) => setInvoice({ ...invoice, courier: e.target.value })}
                  />
                  <datalist id="courier-list">
                    {KNOWN_COURIERS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    {invoice.mapping.courier !== null ? "Taken from the Courier column." : "Used for every row, since the file has no courier column."}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-unit">Billed weight is in</Label>
                  <Select id="inv-unit" value={invoice.weightUnit} onChange={(e) => setInvoice({ ...invoice, weightUnit: e.target.value as WeightUnit })}>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g)</option>
                  </Select>
                </div>
              </div>
              {missing.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>Map the required column{missing.length > 1 ? "s" : ""}: {missing.map((f) => f.label).join(", ")}.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {invoiceParsed && missing.length === 0 && !needCourier && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>First 5 rows as ShipProof understood them.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>AWB</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead className="text-right">Freight</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead className="text-right">RTO</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceParsed.rows.slice(0, 5).map((r, i) => {
                      // An RTO line without its own RTO column carries the RTO amount in the freight column.
                      const rtoLine = r.shipmentType === "rto" && !r.rtoCharge;
                      const freight = rtoLine ? 0 : r.freightCharge;
                      const rto = rtoLine ? r.freightCharge : (r.rtoCharge ?? 0);
                      return (
                      <TableRow key={i} className="tabular">
                        <TableCell className="font-mono text-xs">{r.awb}</TableCell>
                        <TableCell>{r.courier}</TableCell>
                        <TableCell>{r.shipmentType === "rto" ? "RTO" : "Forward"}</TableCell>
                        <TableCell className="text-right">{r.billedWeightKg} kg</TableCell>
                        <TableCell>{r.billedZone ?? "—"}</TableCell>
                        <TableCell className="text-right">{freight ? formatINR(freight) : "—"}</TableCell>
                        <TableCell className="text-right">{r.codCharge ? formatINR(r.codCharge) : "—"}</TableCell>
                        <TableCell className="text-right">{rto ? formatINR(rto) : "—"}</TableCell>
                        <TableCell className="text-right">{r.gst !== undefined ? formatINR(r.gst) : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatINR(r.totalCharge)}</TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <ParseReport valid={invoiceParsed.rows.length} errors={invoiceParsed.errors} skipped={invoiceParsed.skipped} noun="invoice lines" />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function invoiceStepReady(ctx: ReturnType<typeof useAudit>): boolean {
  const { invoice, invoiceParsed } = ctx;
  if (!invoice || !invoiceParsed) return false;
  if (missingRequired(invoice.mapping, INVOICE_FIELDS).length) return false;
  if (invoice.mapping.courier === null && !invoice.courier.trim()) return false;
  return invoiceParsed.rows.length > 0;
}
