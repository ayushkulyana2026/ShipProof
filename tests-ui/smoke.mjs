/**
 * Browser smoke test for the real app (production build).
 *
 *   npm run build && npm start            # in one terminal
 *   npm run test:ui                       # in another (BASE_URL defaults to http://localhost:3000)
 *
 * Env: BASE_URL, SCREENSHOT_DIR (default ./tests-ui/screenshots), CHROMIUM_PATH (optional).
 * Exits non-zero on the first failed assertion.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? path.join("tests-ui", "screenshots");
const SAMPLES = path.join(process.cwd(), "public", "samples");
const expected = JSON.parse(fs.readFileSync(path.join(SAMPLES, "sample_expected_results.json"), "utf8"));
fs.mkdirSync(SHOTS, { recursive: true });

const inr = (n) => {
  const [i, f] = n.toFixed(2).split(".");
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${rest ? rest + "," : ""}${last3}.${f}`;
};
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
};

try {
  // 1. Landing page
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE);
  check(await page.getByRole("heading", { name: "Is your courier overcharging you?" }).isVisible(), "landing headline");
  check(await page.getByText("Your files never leave your browser").first().isVisible(), "landing privacy note");
  const heroTotal = (await page.locator('[aria-label="Example result"] p.tabular').innerText()).trim();
  await page.screenshot({ path: path.join(SHOTS, "01-landing.png"), fullPage: true });

  // 2. Try with sample data → results
  await page.getByRole("button", { name: "Try with sample data" }).first().click();
  await page.waitForURL("**/audit/results");
  await page.getByText("overcharged", { exact: false }).first().waitFor();
  const headline = await page.locator("h1").first().innerText();
  const shown = Number(headline.replace(/[^\d.]/g, ""));
  check(Math.abs(shown - expected.totalOvercharge) <= 0.5, `results headline ≈ ${inr(expected.totalOvercharge)} (got "${headline.split("\n")[0]}")`);
  check(headline.startsWith(heroTotal), `landing example (${heroTotal}) matches the real audit`);
  await page.screenshot({ path: path.join(SHOTS, "02-results.png"), fullPage: true });

  // Expand a row → working
  const firstRow = page.locator("#issues tbody tr").first();
  await firstRow.click();
  check(await page.locator("#issues ol li").first().isVisible(), "row expands to full working");
  await page.screenshot({ path: path.join(SHOTS, "03-row-expanded.png"), fullPage: false });

  // Filter by type
  await page.getByLabel("Filter by issue type").selectOption("DUPLICATE_AWB");
  check(await page.getByText(`Showing ${expected.counts.DUPLICATE_AWB} issues`).isVisible(), "type filter narrows the table");
  await page.getByLabel("Filter by issue type").selectOption("");
  await page.getByPlaceholder("Search AWB or order ID").fill(expected.planted[0].awb);
  check((await page.locator("#issues tbody tr").count()) >= 1, "AWB search finds the planted AWB");
  await page.getByPlaceholder("Search AWB or order ID").fill("");

  // Downloads
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download full report CSV" }).click()]);
  const reportPath = path.join(SHOTS, dl.suggestedFilename());
  await dl.saveAs(reportPath);
  check(fs.readFileSync(reportPath, "utf8").includes("Shipment,"), "full report CSV downloads");
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Dispute CSV" }).first().click()]);
  check(dl2.suggestedFilename().startsWith("shipproof-dispute-"), "dispute CSV downloads");

  // Email preview
  await page.getByRole("button", { name: /Preview dispute email/ }).first().click();
  check(await page.getByText("Billing dispute – Invoice", { exact: false }).isVisible(), "dispute email preview");
  await page.screenshot({ path: path.join(SHOTS, "04-email.png") });
  await page.keyboard.press("Escape");

  // Settings drawer
  await page.getByRole("button", { name: "Settings" }).click();
  check(await page.getByText("Metro list").isVisible(), "settings drawer opens");
  await page.screenshot({ path: path.join(SHOTS, "05-settings.png") });
  await page.keyboard.press("Escape");
  await ctx.close();

  // 3. Full manual flow with the sample files
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p2 = await ctx2.newPage();
  watch(p2);
  await p2.goto(`${BASE}/audit`);
  await p2.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, "sample_invoice_delhivery.xlsx")); // Excel path
  await p2.getByText("Confirm the columns").waitFor();
  check((await p2.locator("#map-awb").inputValue()) !== "", "invoice AWB column auto-mapped");
  check((await p2.locator("#courier").inputValue()) === "Delhivery", "courier guessed from file name");
  await p2.getByText(`${expected.invoiceLines} invoice lines ready`).waitFor();
  check(true, `invoice preview: ${expected.invoiceLines} lines ready`);
  await p2.screenshot({ path: path.join(SHOTS, "06-step-invoice.png"), fullPage: true });
  await p2.getByRole("button", { name: "Continue" }).click();

  await p2.locator('input[type="file"]').first().setInputFiles(path.join(SAMPLES, "sample_shopify_orders.csv"));
  await p2.getByText(`${expected.shipments} orders ready`).waitFor();
  check(true, `orders preview: ${expected.shipments} orders ready`);
  await p2.screenshot({ path: path.join(SHOTS, "07-step-orders.png"), fullPage: true });
  await p2.getByRole("button", { name: "Continue" }).click();

  await p2.locator('input[type="file"][accept=".csv,.json"]').setInputFiles(path.join(SAMPLES, "sample_rate_card.json"));
  await p2.getByText("Imported 1 rate card").waitFor();
  await p2.getByText("Gurugram, Haryana").waitFor();
  check(true, "rate card imported and origin pincode resolved");
  await p2.screenshot({ path: path.join(SHOTS, "08-step-rate-card.png"), fullPage: true });
  await p2.getByRole("button", { name: "Continue" }).click();
  await p2.getByRole("button", { name: "Run audit", exact: true }).click();
  await p2.waitForURL("**/audit/results");
  const h2 = await p2.locator("h1").first().innerText();
  check(h2.split(" ")[0] === headline.split(" ")[0], `manual upload flow gives the same total (${h2.split(" ")[0]})`);
  await ctx2.close();

  // 4. Mobile
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p3 = await ctx3.newPage();
  watch(p3);
  await p3.goto(BASE);
  const overflow = await p3.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "no horizontal scroll on mobile landing");
  await p3.screenshot({ path: path.join(SHOTS, "09-mobile-landing.png"), fullPage: true });
  await p3.getByRole("button", { name: "Try with sample data" }).first().click();
  await p3.waitForURL("**/audit/results");
  await p3.getByText("overcharged").first().waitFor();
  await p3.screenshot({ path: path.join(SHOTS, "10-mobile-results.png"), fullPage: true });
  await ctx3.close();

  check(errors.length === 0, `no browser console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
} catch (e) {
  console.error("✗ smoke test crashed:", e);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll UI checks passed");
process.exit(failures ? 1 : 0);
