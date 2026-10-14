"use client";

import * as React from "react";
import { runAudit, type AuditResult } from "@/lib/checks/audit";
import { defaultRateCard } from "@/lib/engine/defaults";
import type { ColumnMapping, InvoiceFieldKey, OrderFieldKey } from "@/lib/parsing/mapping";
import { DEFAULT_BOX, normalizeInvoice, normalizeOrders, type NormalizeResult, type WeightUnit } from "@/lib/parsing/normalize";
import type { RawTable } from "@/lib/parsing/read";
import { prepareFromText } from "@/lib/pipeline";
import { DEFAULT_ZONE_SETTINGS, type ZoneSettings } from "@/lib/pincode/zones";
import { invoicePeriod } from "@/lib/report/email";
import type { BoxSize, InvoiceLine, Order, RateCard } from "@/lib/types";

export type InvoiceInput = { table: RawTable; mapping: ColumnMapping<InvoiceFieldKey>; courier: string; weightUnit: WeightUnit };
export type OrdersInput = { table: RawTable; mapping: ColumnMapping<OrderFieldKey>; weightUnit: WeightUnit; defaultBox: BoxSize };

export type AppSettings = {
  zone: ZoneSettings;
  tolerancePercent: number;
  volumetricDivisor: number;
};

export const DEFAULT_SETTINGS: AppSettings = { zone: DEFAULT_ZONE_SETTINGS, tolerancePercent: 10, volumetricDivisor: 5000 };

export type AuditRun = {
  result: AuditResult;
  period: string;
  ranAt: string;
  source: "sample" | "upload";
  parseWarnings: number;
  /** Settings the audit ran with, to detect when a re-run is needed. */
  settingsKey: string;
};

export const settingsKey = (s: AppSettings) => JSON.stringify(s);

type State = {
  invoice: InvoiceInput | null;
  orders: OrdersInput | null;
  rateCards: RateCard[];
  settings: AppSettings;
  run: AuditRun | null;
};

type Ctx = State & {
  setInvoice: (v: InvoiceInput | null) => void;
  setOrders: (v: OrdersInput | null) => void;
  setRateCards: (cards: RateCard[]) => void;
  updateSettings: (s: AppSettings) => void;
  invoiceParsed: NormalizeResult<InvoiceLine> | null;
  ordersParsed: NormalizeResult<Order> | null;
  couriers: string[];
  runCurrent: () => Promise<AuditRun>;
  loadSample: () => Promise<AuditRun>;
  reset: () => void;
};

const AuditContext = React.createContext<Ctx | null>(null);
const SETTINGS_KEY = "shipproof.settings.v1";

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<AppSettings>;
    return {
      zone: { ...DEFAULT_ZONE_SETTINGS, ...(s.zone ?? {}) },
      tolerancePercent: typeof s.tolerancePercent === "number" ? s.tolerancePercent : DEFAULT_SETTINGS.tolerancePercent,
      volumetricDivisor: typeof s.volumetricDivisor === "number" ? s.volumetricDivisor : DEFAULT_SETTINGS.volumetricDivisor,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function AuditProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({ invoice: null, orders: null, rateCards: [], settings: DEFAULT_SETTINGS, run: null });

  // Only settings are remembered (in this browser). Uploaded files live in memory and vanish on refresh.
  React.useEffect(() => {
    const settings = loadSettings();
    setState((s) => ({ ...s, settings }));
  }, []);

  const invoiceParsed = React.useMemo(
    () => (state.invoice ? normalizeInvoice(state.invoice.table, state.invoice.mapping, { courier: state.invoice.courier, weightUnit: state.invoice.weightUnit }) : null),
    [state.invoice],
  );
  const ordersParsed = React.useMemo(
    () => (state.orders ? normalizeOrders(state.orders.table, state.orders.mapping, { weightUnit: state.orders.weightUnit }) : null),
    [state.orders],
  );
  const couriers = React.useMemo(() => [...new Set((invoiceParsed?.rows ?? []).map((r) => r.courier))].sort(), [invoiceParsed]);

  // Keep exactly one rate card per courier on the invoice.
  React.useEffect(() => {
    if (!couriers.length) return;
    setState((s) => {
      const have = new Map(s.rateCards.map((c) => [c.courier, c]));
      const template = s.rateCards[0];
      const next = couriers.map(
        (c) =>
          have.get(c) ??
          (template
            ? { ...template, courier: c }
            : { ...defaultRateCard(c, ""), tolerancePercent: s.settings.tolerancePercent, volumetricDivisor: s.settings.volumetricDivisor }),
      );
      const same = next.length === s.rateCards.length && next.every((c, i) => c === s.rateCards[i]);
      return same ? s : { ...s, rateCards: next };
    });
  }, [couriers]);

  const setInvoice = React.useCallback((invoice: InvoiceInput | null) => setState((s) => ({ ...s, invoice })), []);
  const setOrders = React.useCallback((orders: OrdersInput | null) => setState((s) => ({ ...s, orders })), []);
  const setRateCards = React.useCallback((rateCards: RateCard[]) => setState((s) => ({ ...s, rateCards })), []);
  const updateSettings = React.useCallback((settings: AppSettings) => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* private mode: settings just won't persist */
    }
    setState((s) => ({
      ...s,
      settings,
      rateCards: s.rateCards.map((c) => ({ ...c, tolerancePercent: settings.tolerancePercent, volumetricDivisor: settings.volumetricDivisor })),
    }));
  }, []);

  const runCurrent = React.useCallback(async () => {
    if (!invoiceParsed || !ordersParsed || !state.orders) throw new Error("Upload the invoice and orders first.");
    const result = await runAudit({
      invoice: invoiceParsed.rows,
      orders: ordersParsed.rows,
      rateCards: state.rateCards,
      zoneSettings: state.settings.zone,
      defaultBox: state.orders.defaultBox,
    });
    const run: AuditRun = {
      result,
      period: invoicePeriod(invoiceParsed.rows.map((r) => r.invoiceDate)),
      ranAt: new Date().toISOString(),
      source: state.run?.source === "sample" ? "sample" : "upload",
      parseWarnings: invoiceParsed.errors.length + ordersParsed.errors.length,
      settingsKey: settingsKey(state.settings),
    };
    setState((s) => ({ ...s, run }));
    return run;
  }, [invoiceParsed, ordersParsed, state.orders, state.rateCards, state.settings, state.run?.source]);

  const loadSample = React.useCallback(async () => {
    const get = async (f: string) => {
      const res = await fetch(`/samples/${f}`);
      if (!res.ok) throw new Error(`Could not load sample file ${f}`);
      return res.text();
    };
    const [invoiceCsv, ordersCsv, rateCardJson] = await Promise.all([
      get("sample_invoice_delhivery.csv"),
      get("sample_shopify_orders.csv"),
      get("sample_rate_card.json"),
    ]);
    const p = prepareFromText({ invoiceCsv, ordersCsv, rateCardJson });
    const settings = state.settings;
    const rateCards = p.rateCards.map((c) => ({ ...c, tolerancePercent: settings.tolerancePercent, volumetricDivisor: settings.volumetricDivisor }));
    const result = await runAudit({
      invoice: p.invoice.rows,
      orders: p.orders.rows,
      rateCards,
      zoneSettings: settings.zone,
      defaultBox: DEFAULT_BOX,
    });
    const run: AuditRun = {
      result,
      period: invoicePeriod(p.invoice.rows.map((r) => r.invoiceDate)),
      ranAt: new Date().toISOString(),
      source: "sample",
      parseWarnings: p.invoice.errors.length + p.orders.errors.length,
      settingsKey: settingsKey(settings),
    };
    setState((s) => ({
      ...s,
      invoice: { table: p.invoiceTable, mapping: p.invoiceMapping, courier: rateCards[0]?.courier ?? "Delhivery", weightUnit: "kg" },
      orders: { table: p.ordersTable, mapping: p.orderMapping, weightUnit: "kg", defaultBox: DEFAULT_BOX },
      rateCards,
      run,
    }));
    return run;
  }, [state.settings]);

  const reset = React.useCallback(() => setState((s) => ({ invoice: null, orders: null, rateCards: [], settings: s.settings, run: null })), []);

  const value: Ctx = {
    ...state,
    setInvoice,
    setOrders,
    setRateCards,
    updateSettings,
    invoiceParsed,
    ordersParsed,
    couriers,
    runCurrent,
    loadSample,
    reset,
  };
  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export function useAudit(): Ctx {
  const ctx = React.useContext(AuditContext);
  if (!ctx) throw new Error("useAudit must be used inside <AuditProvider>");
  return ctx;
}
