# ShipProof

**Is your courier overcharging you? Find out in 2 minutes.**

ShipProof audits Indian D2C shipping invoices. Upload a courier invoice (Shiprocket, Delhivery, Xpressbees, Blue Dart, …), your Shopify order export and your agreed rate card. ShipProof matches every shipment by AWB, re-prices it, and flags:

| Check | What it catches |
|---|---|
| `WEIGHT_OVERCHARGE` | Billed weight > chargeable weight × (1 + tolerance) **and** in a higher slab |
| `WRONG_ZONE` | Billed zone ≠ the zone the pincodes resolve to, and it costs more |
| `RATE_MISMATCH` | Freight above the rate card for the courier's *own* billed weight and zone (₹1 tolerance) |
| `COD_ON_PREPAID` | COD fee on a prepaid order |
| `COD_WRONG_AMOUNT` | COD fee > max(fixed, % × order value) + ₹1 |
| `DUPLICATE_AWB` | Same AWB billed more than once with the same shipment type |
| `RTO_WITHOUT_RETURN` | RTO charge on an order Shopify says was delivered |
| `RTO_WRONG_RATE` | RTO charge above the rate-card RTO rule (₹1 tolerance) |
| `UNMATCHED_AWB` | Invoice AWB with no matching order (informational, ₹0) |

The output is a total "money you can recover" figure, a filterable per-AWB issue table where every row expands to show its full working, and per-courier dispute CSVs and emails.

**Payments:** an optional one-time Pro plan is sold through [Dodo Payments](https://dodopayments.com) Checkout Sessions (`/pricing`). Checkout never sees your audit files.

**Privacy:** every file is parsed and audited in the browser. Nothing is uploaded, stored or sent anywhere. There's no backend, no database and no analytics, and a `connect-src 'self'` Content-Security-Policy makes the browser block any attempt to send data to another origin.

**Accuracy:** all money maths is deterministic TypeScript in `lib/engine` (no LLM anywhere), rounded to paise at each step. The main acceptance test (`tests/e2e-sample.test.ts`) runs the full pipeline on sample data with 34 planted errors and asserts that exactly those are found, with nothing extra flagged.

---

## Run locally

Requires Node 18.18+ (tested on Node 22).

```bash
npm install
npm run dev            # http://localhost:3000
```

Other scripts:

```bash
npm test               # 85 unit + end-to-end engine tests (Vitest)
npm run typecheck      # tsc --noEmit (strict)
npm run build && npm start      # production build on http://localhost:3000
npm run test:ui        # browser smoke test against a running server (see TESTING.md)
npm run generate:samples        # regenerate public/samples (deterministic)
npm run build:pincodes -- path/to/india_post.csv   # rebuild data/pincodes from the India Post CSV
```

## Deploy to Vercel

Every page is prerendered. The only server code is the two Dodo Payments routes (`/api/checkout`, `/api/webhooks/dodo`). The audit works without any environment variables; checkout needs the ones below.

### Checkout setup (Dodo Payments)

1. In the Dodo dashboard, create a one-time product for Pro and copy its `pdt_…` id. Keep the price in sync with `lib/plans.ts` (display only).
2. Create an API key, and a webhook pointing at `https://<your-domain>/api/webhooks/dodo`; copy its signing secret.
3. Set the env vars from `.env.example` (in `.env.local` locally, or in Vercel → Project → Settings → Environment Variables):
   `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_PRODUCT_ID_PRO`, and `DODO_PAYMENTS_ENVIRONMENT` (`test_mode` until you go live).

The webhook verifies the signature and currently logs successful payments. There's no database yet, so wire fulfilment in `app/api/webhooks/dodo/route.ts` when you add one. The `/checkout/success` page only reflects the redirect status; it is not proof of payment.

**Option A: Git integration (recommended)**
1. Push this repo to GitHub.
2. In Vercel, go to **Add New → Project**, import the repo and keep the defaults (framework *Next.js*, build `next build`, output auto-detected).
3. Click **Deploy**. Every push to the default branch then redeploys; PRs get preview URLs.

**Option B: CLI**
```bash
npm i -g vercel
vercel            # preview deployment
vercel --prod     # production
```

## Project structure

```
app/
  page.tsx                 landing (hero numbers come from a real build-time audit of the sample)
  pricing/page.tsx         Free vs Pro, Pro button starts a Dodo checkout
  checkout/success/        post-payment return page
  api/checkout/            creates a Dodo Checkout Session (plan slug → allowlisted product id)
  api/webhooks/dodo/       signature-verified Dodo webhook
  audit/page.tsx           4-step flow: invoice → orders → rate card → run
  audit/results/page.tsx   results, filters, exports, assumptions
components/
  ui/                      shadcn/ui-style primitives (Button, Card, Table, Sheet, …)
  audit/                   upload, column mapping, rate-card form, settings drawer, client store
  results/                 courier breakdown + dispute email, issues table, assumptions panel
lib/
  engine/                  pure cost engine: money, volumetric/slab weight, freight, COD, RTO, GST
  pincode/                 lazy chunk loader for India Post data + zone resolver (A–E, editable)
  checks/                  one file per audit check + audit.ts orchestrator (no double counting)
  parsing/                 CSV/XLSX reading, fuzzy column mapping, value parsers, Zod validation,
                           rate-card import, pdf.ts (v2 interface, not implemented)
  report/                  summary, dispute/full-report CSV, dispute email template
  pipeline.ts              auto-map + normalise helper (sample data and tests)
data/pincodes/             India Post directory preprocessed into 70 chunks (~8 KB each, lazy-loaded)
scripts/                   build-pincodes.ts, generate-samples.ts
public/samples/            tester files (see TESTING.md)
tests/                     Vitest suites      tests-ui/   Playwright smoke test
```

### How an AWB is costed (`lib/engine`)

1. `volumetricKg = L × B × H / divisor` (default box size if the order has no dimensions)
2. `chargeableKg = max(actual, volumetric)`
3. Slabs: the first slab covers `firstSlabKg`; extra weight is rounded **up** to the next `additionalSlabKg` (0.5 → 1 slab, 0.51 → 2, 1.0 → 2)
4. `freight = firstSlab + extraSlabs × additionalSlab` for the expected zone
5. `fuel = freight × fuel%`, `cod = max(codFixed, codPercent% × orderValue)` for COD orders, `rto` per the RTO rule for RTO orders
6. `gst = (freight + fuel + cod + rto) × gst%`, `total = sum`

### No double counting

When one AWB has several issues (e.g. wrong weight **and** wrong zone), the component deltas telescope: zone is priced at the billed weight, weight at the accepted zone, and rate against the courier's own weight and zone. Only the flagged components are corrected; fuel and GST are scaled pro rata to match what the courier actually applied. The AWB's overcharge (`billed total − corrected total`) is then split across its issues in whole paise, so the per-issue amounts always add up exactly to the AWB total.

## Assumptions

1. **Within city (A)** = same district, where each metro cluster counts as one city. Delhi NCR = all of Delhi plus Gurugram, Gautam Buddha Nagar (Noida), Ghaziabad and Faridabad; Mumbai includes Mumbai Suburban and Thane; Bengaluru includes Bengaluru Rural; Kolkata includes Howrah; Hyderabad includes Ranga Reddy and Medchal-Malkajgiri. All editable in Settings.
2. **Zone precedence** is A → B → E → C → D. Delivery within the same state beats "special": Guwahati → Guwahati is A, not E. E applies when the **destination** is in a special state.
3. **Within region (B)** = same state by default; optional region groups can be added in Settings.
4. **Unknown pincodes** (not in the India Post directory) → zone "Unknown"; zone checks are skipped and the billed zone is used for pricing. Nothing is guessed.
5. A pincode served by post offices in several districts takes the district most of its offices report.
6. **Pincode data:** the India Post *All India Pincode Directory* in its current data.gov.in schema (165k post offices → 19,486 pincodes). data.gov.in wasn't reachable from the build machine, so the raw CSV came from the MIT-licensed `india-pincode` npm package, which redistributes that dataset. `npm run build:pincodes` accepts the official CSV directly.
7. A shipment counts as **RTO** when its Shopify status is RTO / returned. An RTO charge on a "Delivered" order is `RTO_WITHOUT_RETURN`. Charges on "In transit" orders are checked against the RTO rule.
8. **COD applies whenever the order is COD**, including RTO'd COD orders, per the spec's cost formula.
9. **Fuel surcharge** is a percentage of freight. When correcting a bill, fuel and GST are scaled by the ratio the courier actually used.
10. **Weight tolerance** (default 10%) only suppresses `WEIGHT_OVERCHARGE`. A weight within tolerance is accepted, even if it crosses a slab, and is used for the other checks.
11. A **cheaper** billed zone is never flagged; it's accepted as billed.
12. **Invoice lines:** an RTO line with no separate RTO column carries the RTO amount in its freight column. A forward line may also have an RTO column. The first line of each AWB + type is the original; later ones are duplicates and are charged in full.
13. If GST is missing but the total is more than ₹1 above the components, the difference is treated as tax. If the total is missing, it's the sum of the components.
14. **Invoice period** in the dispute email comes from the earliest and latest invoice dates.
15. **Default box size** is 20 × 15 × 10 cm unless the user changes it, and it's only used for orders without dimensions. Without any box size, chargeable weight = actual weight.
16. When an invoice has a courier with no rate card and only one rate card exists, that card is used (and listed under Assumptions). With several rate cards, that courier is skipped.
17. AWBs are matched case-insensitively with spaces removed, and leading zeros are kept. AWBs that Excel has turned into scientific notation (`1.43E+11`) are rejected with a clear message, because their digits are lost.
18. **Severity:** clear-cut errors (duplicate, RTO on a delivered order, COD on prepaid) are high; anything ≥ ₹100 is high; ≥ ₹20 is medium; otherwise low. Unmatched AWBs are low.
19. **No persistence:** uploads and results live only in the tab's memory and vanish on refresh. Only Settings (zone rules, tolerance, divisor) are saved, in `localStorage`.
20. **Sample data:** origin is Gurugram 122016, and the rates are typical surface B2C rates (illustrative, not any courier's real tariff).

## Out of scope (v1)

No login, database, Pro feature gating, PDF parsing (see the `lib/parsing/pdf.ts` interface and TODO), Shopify/courier API integrations, or automatic email sending.
