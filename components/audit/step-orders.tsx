"use client";

import * as React from "react";
import { AlertCircle, Box } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/engine/money";
import { autoMap, missingRequired, ORDER_FIELDS } from "@/lib/parsing/mapping";
import { countMissingDimensions, DEFAULT_BOX, type WeightUnit } from "@/lib/parsing/normalize";
import { readFile } from "@/lib/parsing/read";
import { guessWeightUnit } from "@/lib/pipeline";
import type { BoxSize } from "@/lib/types";
import { ColumnMapper } from "./column-mapper";
import { FileDrop, MAX_FILE_BYTES } from "./file-drop";
import { ParseReport } from "./parse-report";
import { useAudit } from "./store";

export function StepOrders() {
  const { orders, setOrders, ordersParsed, invoiceParsed } = useAudit();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) return setError("That file is larger than 25 MB. Export a shorter date range.");
    setBusy(true);
    try {
      const table = await readFile(file);
      if (!table.rows.length) throw new Error("No data rows found in this file.");
      const mapping = autoMap(table.headers, ORDER_FIELDS);
      setOrders({ table, mapping, weightUnit: guessWeightUnit(table, mapping.actualWeightKg), defaultBox: orders?.defaultBox ?? DEFAULT_BOX });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  }

  const missing = orders ? missingRequired(orders.mapping, ORDER_FIELDS) : [];
  const noDims = ordersParsed ? countMissingDimensions(ordersParsed.rows) : 0;
  const matched = React.useMemo(() => {
    if (!ordersParsed || !invoiceParsed) return null;
    const awbs = new Set(ordersParsed.rows.map((o) => o.awb));
    const invoiceAwbs = new Set(invoiceParsed.rows.map((l) => l.awb));
    let n = 0;
    for (const a of invoiceAwbs) if (awbs.has(a)) n++;
    return { matched: n, total: invoiceAwbs.size };
  }, [ordersParsed, invoiceParsed]);

  const setBox = (patch: Partial<BoxSize>) => orders && setOrders({ ...orders, defaultBox: { ...orders.defaultBox, ...patch } });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload your Shopify order export</CardTitle>
          <CardDescription>
            Needs the AWB / tracking number, destination pincode, weight, payment method and order value for each order. Box dimensions are optional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDrop
            label="Drop the order export here, or click to choose"
            hint="CSV, XLSX or XLS · up to 25 MB"
            fileName={orders?.table.fileName}
            rowCount={orders?.table.rows.length}
            busy={busy}
            onFile={onFile}
            onClear={() => setOrders(null)}
          />
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {orders && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Confirm the columns</CardTitle>
              <CardDescription>Map each field to a column in your export.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ColumnMapper table={orders.table} fields={ORDER_FIELDS} mapping={orders.mapping} onChange={(mapping) => setOrders({ ...orders, mapping })} />
              <div className="grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ord-unit">Order weight is in</Label>
                  <Select id="ord-unit" value={orders.weightUnit} onChange={(e) => setOrders({ ...orders, weightUnit: e.target.value as WeightUnit })}>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g) — Shopify&apos;s default</option>
                  </Select>
                  <p className="text-xs text-muted-foreground">Use product + packaging weight.</p>
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

          {ordersParsed && missing.length === 0 && (
            <>
              {noDims > 0 && (
                <Card className="border-amber-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Box className="h-5 w-5 text-amber-600" /> Default box size
                    </CardTitle>
                    <CardDescription>
                      {noDims.toLocaleString("en-IN")} order{noDims === 1 ? " has" : "s have"} no box dimensions. We&apos;ll assume this box for volumetric weight and list it
                      under &ldquo;Assumptions&rdquo; in the results.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid max-w-md grid-cols-3 gap-3">
                      {(
                        [
                          ["lengthCm", "Length"],
                          ["breadthCm", "Breadth"],
                          ["heightCm", "Height"],
                        ] as const
                      ).map(([k, label]) => (
                        <div key={k} className="space-y-1.5">
                          <Label htmlFor={`box-${k}`}>{label} (cm)</Label>
                          <Input
                            id={`box-${k}`}
                            type="number"
                            min={1}
                            step="0.5"
                            value={orders.defaultBox[k]}
                            onChange={(e) => setBox({ [k]: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>First 5 orders as ShipProof understood them.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>AWB</TableHead>
                        <TableHead>Pincode</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead>Box (cm)</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersParsed.rows.slice(0, 5).map((o, i) => (
                        <TableRow key={i} className="tabular">
                          <TableCell>{o.orderId}</TableCell>
                          <TableCell className="font-mono text-xs">{o.awb}</TableCell>
                          <TableCell>{o.destinationPincode}</TableCell>
                          <TableCell className="text-right">{o.actualWeightKg} kg</TableCell>
                          <TableCell>{o.lengthCm && o.breadthCm && o.heightCm ? `${o.lengthCm}×${o.breadthCm}×${o.heightCm}` : <span className="text-amber-700">default</span>}</TableCell>
                          <TableCell>{o.paymentMode}</TableCell>
                          <TableCell className="text-right">{formatINR(o.orderValue)}</TableCell>
                          <TableCell>{o.status ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ParseReport valid={ordersParsed.rows.length} errors={ordersParsed.errors} skipped={ordersParsed.skipped} noun="orders" />
                  {matched && (
                    <p className={`text-sm ${matched.matched === 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {matched.matched.toLocaleString("en-IN")} of {matched.total.toLocaleString("en-IN")} invoice AWBs match an order.
                      {matched.matched === 0 && " Check that the AWB / tracking number column is mapped correctly."}
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function ordersStepReady(ctx: ReturnType<typeof useAudit>): boolean {
  const { orders, ordersParsed } = ctx;
  if (!orders || !ordersParsed) return false;
  if (missingRequired(orders.mapping, ORDER_FIELDS).length) return false;
  const b = orders.defaultBox;
  if (countMissingDimensions(ordersParsed.rows) > 0 && !(b.lengthCm > 0 && b.breadthCm > 0 && b.heightCm > 0)) return false;
  return ordersParsed.rows.length > 0;
}
