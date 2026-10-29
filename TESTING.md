# Testing ShipProof

## Tester files (`public/samples/`)

On the deployed site these are also downloadable at `/samples/<file name>`.

| File | Use it for |
|---|---|
| `sample_invoice_delhivery.csv` | Courier invoice: 232 lines (200 forward + 28 RTO + 2 duplicate repeats + 2 unmatched AWBs), with ₹ symbols in some cells and one blank row |
| `sample_invoice_delhivery.xlsx` | The same invoice as Excel (AWBs stored as text) to test the `.xlsx` path |
| `sample_shopify_orders.csv` | 200 Shopify-style orders: Indian pincodes across all zones, ~35% COD, 25 RTO, 0.2–2.5 kg, 8 box sizes, some AWBs with leading zeros |
| `sample_rate_card.json` | Rate card for Delhivery, origin 122016 (Gurugram). Import it on step 3 |
| `rate_card_template.csv` | Rate-card CSV template (one row per zone; add rows for more couriers) |
| `sample_expected_results.json` | Answer key: every planted error, the expected ₹ per AWB, and the near-misses that must **not** be flagged |
| `tester_shiprocket_style_invoice.csv` | Messy invoice in a different layout: uppercase Shiprocket-style headers, weight in **grams**, "Rs." amounts, an Excel-mangled AWB, a non-numeric weight and a TOTAL footer row |

### Planted errors in the sample invoice

12 weight overcharges · 6 wrong zones · 4 COD on prepaid · 3 COD wrong amounts · 2 duplicates · 3 RTO without return · 2 RTO wrong rate · 2 unmatched AWBs.
One AWB has **both** a weight and a zone error, to prove the overcharge isn't double-counted. Four near-miss shipments must **not** be flagged: three are billed 5% over chargeable weight (crossing a slab but within the 10% tolerance), and one is billed a cheaper zone.

## Manual test script

| # | Steps | Expected result |
|---|---|---|
| 1 | Open `/` and click **Try with sample data** | Results page: **₹2,784.99 overcharged across 31 shipments (4.8% of your ₹58,390.54 invoice)**, 34 issues. The landing hero shows the same ₹2,784.99 |
| 2 | Click the **Wrong zone** summary card | Table filters to 6 issues |
| 3 | Search one AWB from `sample_expected_results.json` and click its row | The row expands: expected vs billed, step-by-step working and a copyable dispute sentence |
| 4 | Find AWB `143265104838` | Two issues (weight + wrong zone): ₹76.47 + ₹54.80 = ₹131.27, which equals its billed − corrected total |
| 5 | Click **Dispute CSV**, **Copy email**, and the ✉ icon | CSV downloads, the email is copied, and the preview shows the subject `Billing dispute – Invoice 1 Sept 2026 – 28 Sept 2026 – 31 shipments, ₹2,784.99` plus a top-10 table |
| 6 | Click **Download full report CSV** | CSV with one row per AWB (202) plus one per issue (34) |
| 7 | Open **Settings**, set tolerance to 0, save | A "Settings changed" banner appears. Click **Re-run audit**: the near-miss AWBs (e.g. `143265104888`) are now flagged |
| 8 | Go to `/audit`. Step 1: upload `sample_invoice_delhivery.xlsx` | Columns are auto-mapped, courier "Delhivery" is guessed from the file name, the preview shows 5 rows and "232 invoice lines ready" |
| 9 | Step 2: upload `sample_shopify_orders.csv` | "200 orders ready", "200 of 202 invoice AWBs match an order" |
| 10 | Step 3: **Import CSV / JSON** → `sample_rate_card.json` (or `rate_card_template.csv`) | Fields fill in; the origin shows "Gurugram, Haryana" |
| 11 | Step 4: **Run audit** | Same ₹2,784.99 as test 1 |
| 12 | Repeat step 1 with `tester_shiprocket_style_invoice.csv` | Everything auto-maps, including Courier; "Billed weight is in" switches to **Grams**; 60 lines ready, 2 problem rows (row 62: scientific-notation AWB, row 63: weight not a number), 1 row without an AWB skipped. With the sample orders and rate card: **₹310.96**, 4 weight overcharges |
| 13 | Step 1: change the AWB dropdown to "— Not in file —" | Red required marker and Continue is disabled |
| 14 | Step 2: unmap Length/Breadth/Height | The "Default box size" card appears, and its values show under **Assumptions used** on the results page |
| 15 | Step 3: clear a zone rate or enter origin `999999` | Validation error / "Not found in the India Post directory" |
| 16 | Refresh `/audit/results` | "No audit yet": nothing was persisted |
| 17 | DevTools → Network while running an audit on your own files | Only same-origin static assets (pincode chunks). No uploads |
| 18 | Phone width (≤ 400 px) | No horizontal page scroll, and tables scroll inside their cards |

## Automated tests

```bash
npm test                 # Vitest: engine, zones (real India Post data), each check, parsing, reports, e2e acceptance
npm run build && npm start &
npm run test:ui          # Playwright: 19 checks across landing, sample results, filters, downloads, email,
                         # settings, the full upload flow (xlsx), mobile layout, and zero console errors
```

`test:ui` uses `BASE_URL` (default `http://localhost:3000`). Set `CHROMIUM_PATH` if Playwright's own browser isn't installed. Screenshots go to `tests-ui/screenshots/`.

The main acceptance check is `tests/e2e-sample.test.ts`. It takes the raw sample CSVs through auto column mapping, parsing and the audit, and asserts that every planted error is found and nothing else is flagged, with per-AWB amounts within ₹0.05 of the independently computed answer key.

## Backend

| # | Steps | Expected result |
|---|---|---|
| B1 | `GET /api/health` | JSON with `database`, `payments`, `webhooks` status; no secrets |
| B2 | Landing → Pricing → **Talk to us**, submit an invalid email, then a valid one | "Enter a valid email address.", then "Thanks! We'll be in touch…"; a row in `leads` |
| B3 | Monthly card → enter email → **Start monthly audits** (payments not configured) | Switches to "Reserve my spot" with the email prefilled; submitting stores a `monthly` lead |
| B4 | Same, with Dodo test keys configured | Redirects to Dodo's test checkout; after paying with a test card you land on `/checkout/success` and a `subscriptions` row appears (via webhook) |
| B5 | `curl -X POST /api/leads` with `Origin: https://evil.com` | 403 `forbidden_origin` |
| B6 | Six lead submissions within a minute from one IP | The sixth returns 429 |
| B7 | `curl -X POST /api/webhooks/dodo` without signature headers | 401 `invalid_signature` |

Automated: `tests/backend.test.ts` (24 tests: validation, origin checks, rate limits, checkout, signature verification, replay window, idempotency, out-of-order events, rollback). For the real-database tests run
`TEST_DATABASE_URL=postgres://postgres@localhost:5432/shipproof_test npm test` (it drops and recreates ShipProof tables in that database).
