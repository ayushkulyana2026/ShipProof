"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, Copy, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/engine/money";
import { ISSUE_LABELS } from "@/lib/report/labels";
import { ISSUE_TYPES, type Issue, type IssueType, type Severity } from "@/lib/types";
import { copyText } from "@/lib/utils";

type SortKey = "amount" | "awb" | "type" | "severity";
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const PAGE = 50;

export function IssuesTable({ issues, typeFilter, onTypeFilter }: { issues: Issue[]; typeFilter: IssueType | ""; onTypeFilter: (t: IssueType | "") => void }) {
  const [courier, setCourier] = React.useState("");
  const [severity, setSeverity] = React.useState<Severity | "">("");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "amount", dir: -1 });
  const [open, setOpen] = React.useState<Set<number>>(new Set());
  const [page, setPage] = React.useState(0);
  const [copied, setCopied] = React.useState<number | null>(null);

  const couriers = React.useMemo(() => [...new Set(issues.map((i) => i.courier))].sort(), [issues]);
  const indexed = React.useMemo(() => issues.map((issue, id) => ({ issue, id })), [issues]);

  const rows = React.useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = indexed.filter(
      ({ issue: i }) =>
        (!typeFilter || i.type === typeFilter) &&
        (!courier || i.courier === courier) &&
        (!severity || i.severity === severity) &&
        (!q || i.awb.includes(q) || (i.orderId ?? "").toUpperCase().includes(q)),
    );
    const cmp = (a: Issue, b: Issue): number => {
      switch (sort.key) {
        case "amount":
          return a.overchargeAmount - b.overchargeAmount;
        case "awb":
          return a.awb.localeCompare(b.awb);
        case "type":
          return ISSUE_LABELS[a.type].localeCompare(ISSUE_LABELS[b.type]);
        case "severity":
          return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      }
    };
    return filtered.sort((a, b) => cmp(a.issue, b.issue) * sort.dir || a.issue.awb.localeCompare(b.issue.awb));
  }, [indexed, typeFilter, courier, severity, query, sort]);

  React.useEffect(() => setPage(0), [typeFilter, courier, severity, query, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);
  const filteredTotal = rows.reduce((a, r) => a + r.issue.overchargeAmount, 0);

  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase hover:text-slate-900"
        onClick={() => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: k === "amount" ? -1 : 1 }))}
      >
        {children}
        {sort.key === k ? sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Every flagged shipment</CardTitle>
        <CardDescription>Click a row to see the full working: expected vs billed, step by step.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search AWB or order" placeholder="Search AWB or order ID" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Select aria-label="Filter by issue type" value={typeFilter} onChange={(e) => onTypeFilter(e.target.value as IssueType | "")}>
            <option value="">All issue types</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {ISSUE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by courier" value={courier} onChange={(e) => setCourier(e.target.value)}>
            <option value="">All couriers</option>
            {couriers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")}>
            <option value="">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          Showing {rows.length.toLocaleString("en-IN")} issue{rows.length === 1 ? "" : "s"} · {formatINR(filteredTotal)}
        </p>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <SortHead k="awb">AWB</SortHead>
                <SortHead k="type">Issue</SortHead>
                <TableHead className="hidden md:table-cell">Expected</TableHead>
                <TableHead className="hidden md:table-cell">Billed</TableHead>
                <SortHead k="severity">Severity</SortHead>
                <SortHead k="amount" className="text-right">
                  Overcharge
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No issues match these filters.
                  </TableCell>
                </TableRow>
              )}
              {visible.map(({ issue: i, id }) => {
                const isOpen = open.has(id);
                return (
                  <React.Fragment key={id}>
                    <TableRow
                      data-state={isOpen ? "open" : "closed"}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => toggle(id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(id))}
                      tabIndex={0}
                      aria-expanded={isOpen}
                    >
                      <TableCell className="pr-0 text-muted-foreground">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{i.awb}</div>
                        <div className="text-xs text-muted-foreground">
                          {i.orderId ?? "no order"} · {i.courier}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{ISSUE_LABELS[i.type]}</TableCell>
                      <TableCell className="hidden max-w-[220px] text-xs md:table-cell">{i.expected}</TableCell>
                      <TableCell className="hidden max-w-[220px] text-xs md:table-cell">{i.billed}</TableCell>
                      <TableCell>
                        <Badge variant={i.severity}>{i.severity}</Badge>
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-semibold">{formatINR(i.overchargeAmount)}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                        <TableCell />
                        <TableCell colSpan={6} className="py-4">
                          <div className="space-y-3">
                            <div className="grid gap-2 text-sm md:hidden">
                              <p>
                                <span className="text-muted-foreground">Expected:</span> {i.expected}
                              </p>
                              <p>
                                <span className="text-muted-foreground">Billed:</span> {i.billed}
                              </p>
                            </div>
                            <div className="flex items-start gap-2 rounded-md border bg-white p-3">
                              <p className="flex-1 text-sm">{i.explanation}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (await copyText(i.explanation)) {
                                    setCopied(id);
                                    setTimeout(() => setCopied(null), 1500);
                                  }
                                }}
                              >
                                {copied === id ? <Check /> : <Copy />} {copied === id ? "Copied" : "Copy"}
                              </Button>
                            </div>
                            {i.working && (
                              <ol className="space-y-1 font-mono text-xs leading-relaxed text-slate-700">
                                {i.working.map((w, k) =>
                                  w.startsWith("—") ? (
                                    <li key={k} className="pt-2 font-sans text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      {w.replace(/—/g, "").trim()}
                                    </li>
                                  ) : (
                                    <li key={k}>{w}</li>
                                  ),
                                )}
                              </ol>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
