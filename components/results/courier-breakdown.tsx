"use client";

import * as React from "react";
import { Check, Copy, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditResult } from "@/lib/checks/audit";
import { formatINR } from "@/lib/engine/money";
import { disputeCsv, disputeEmail, issuesForCourier, slug, sortByAmount, type AuditSummary } from "@/lib/report";
import { copyText, downloadText } from "@/lib/utils";

export function CourierBreakdown({ result, summary, period }: { result: AuditResult; summary: AuditSummary; period: string }) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const emailFor = (courier: string) => disputeEmail({ courier, issues: issuesForCourier(result.issues, courier), period });

  async function copyEmail(courier: string) {
    const e = emailFor(courier);
    if (await copyText(`Subject: ${e.subject}\n\n${e.body}`)) {
      setCopied(courier);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  const previewEmail = preview ? emailFor(preview) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Breakdown by courier</CardTitle>
        <CardDescription>Send each courier its own dispute: the CSV has every AWB with the working; the email summarises it.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Courier</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Issues</TableHead>
              <TableHead className="text-right">Shipments</TableHead>
              <TableHead className="text-right">Overcharged</TableHead>
              <TableHead className="text-right">Dispute</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.byCourier.map((c) => (
              <TableRow key={c.courier} className="tabular">
                <TableCell className="font-medium">{c.courier}</TableCell>
                <TableCell className="text-right">{formatINR(c.invoiceTotal)}</TableCell>
                <TableCell className="text-right">{c.issues}</TableCell>
                <TableCell className="text-right">{c.shipmentsAffected}</TableCell>
                <TableCell className="text-right font-semibold text-brand-800">
                  {formatINR(c.amount)}
                  {c.invoiceTotal > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({((c.amount / c.invoiceTotal) * 100).toFixed(1)}%)</span>}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!c.issues}
                      onClick={() => downloadText(`shipproof-dispute-${slug(c.courier)}.csv`, disputeCsv(sortByAmount(issuesForCourier(result.issues, c.courier))))}
                    >
                      <Download /> Dispute CSV
                    </Button>
                    <Button variant="outline" size="sm" disabled={!c.issues} onClick={() => copyEmail(c.courier)}>
                      {copied === c.courier ? <Check /> : <Copy />} {copied === c.courier ? "Copied" : "Copy email"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!c.issues} onClick={() => setPreview(c.courier)} aria-label={`Preview dispute email for ${c.courier}`}>
                      <Mail />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <div className="border-b px-6 py-4 pr-12">
            <DialogTitle>Dispute email · {preview}</DialogTitle>
            <DialogDescription className="mt-1">Template-based — edit freely before sending. Attach the dispute CSV.</DialogDescription>
          </div>
          {previewEmail && (
            <div className="space-y-3 overflow-y-auto px-6 py-4">
              <p className="text-sm">
                <span className="text-muted-foreground">Subject:</span> <span className="font-medium">{previewEmail.subject}</span>
              </p>
              <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-mono text-xs leading-relaxed">{previewEmail.body}</pre>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t px-6 py-3">
            {preview && (
              <>
                <Button
                  variant="outline"
                  onClick={() => downloadText(`shipproof-dispute-${slug(preview)}.csv`, disputeCsv(sortByAmount(issuesForCourier(result.issues, preview))))}
                >
                  <Download /> Dispute CSV
                </Button>
                <Button onClick={() => copyEmail(preview)}>
                  {copied === preview ? <Check /> : <Copy />} {copied === preview ? "Copied" : "Copy email"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
