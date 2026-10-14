/**
 * v2 — PDF invoices and rate cards (NOT implemented in v1).
 *
 * TODO(v2): implement `PdfExtractor` with the Claude API: send the PDF as a
 * document block, ask for JSON matching `InvoiceLine[]` / `RateCard`, then run
 * the result through the same Zod schemas (`invoiceLineSchema`, `rateCardSchema`)
 * before it reaches the engine. The LLM only *extracts*; every rupee is still
 * computed by lib/engine. Because this sends the file to an API, it must be an
 * explicit opt-in with its own privacy notice, and needs a server route (the API
 * key must never ship to the browser) plus a CSP change for that route only.
 */
import type { InvoiceLine, RateCard } from "../types";

export type PdfExtraction<T> = { rows: T; warnings: string[] };

export interface PdfExtractor {
  extractInvoice(pdf: ArrayBuffer, opts: { courier?: string }): Promise<PdfExtraction<InvoiceLine[]>>;
  extractRateCard(pdf: ArrayBuffer, opts: { courier?: string }): Promise<PdfExtraction<RateCard>>;
}

export const pdfSupported = false;
