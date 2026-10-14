/**
 * Converts the raw India Post "All India Pincode Directory" CSV (data.gov.in)
 * into compact JSON chunks keyed by the first two digits of the pincode.
 *
 * Usage:
 *   npm run build:pincodes -- [path/to/raw.csv]
 *   (default input: data/raw/all_india_pincode_directory.csv)
 *
 * Expected columns (data.gov.in schema, case-insensitive):
 *   officename, pincode, district, statename  (others are ignored)
 *
 * Output: data/pincodes/<NN>.json  +  data/pincodes/index.json
 *
 * A pincode can span several post offices; we take the district/state that the
 * majority of its offices report (rows with "NA" are ignored).
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { PincodeChunk } from "../lib/pincode/types";

const input = process.argv[2] ?? "data/raw/all_india_pincode_directory.csv";
const outDir = "data/pincodes";

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(\-/])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/\bAnd\b/g, "and");
}

function main() {
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}\nDownload the All India Pincode Directory CSV from data.gov.in first.`);
    process.exit(1);
  }
  const text = fs.readFileSync(input, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const votes = new Map<string, Map<string, number>>();
  let used = 0;
  for (const row of parsed.data) {
    const pin = (row.pincode ?? "").trim();
    const district = (row.district ?? row.districtname ?? "").trim();
    const state = (row.statename ?? row.state ?? "").trim();
    if (!/^[1-9]\d{5}$/.test(pin)) continue;
    if (!district || !state || district === "NA" || state === "NA") continue;
    const key = `${titleCase(district)}|${titleCase(state)}`;
    const m = votes.get(pin) ?? new Map<string, number>();
    m.set(key, (m.get(key) ?? 0) + 1);
    votes.set(pin, m);
    used++;
  }

  const chunks = new Map<string, Map<string, string>>();
  for (const [pin, m] of votes) {
    // Majority vote; ties broken alphabetically so output is deterministic.
    const best = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    const prefix = pin.slice(0, 2);
    const c = chunks.get(prefix) ?? new Map<string, string>();
    c.set(pin, best);
    chunks.set(prefix, c);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const index: Record<string, number> = {};
  for (const [prefix, pins] of [...chunks.entries()].sort()) {
    const states: string[] = [];
    const districts: [string, number][] = [];
    const districtIdx = new Map<string, number>();
    const out: Record<string, number> = {};
    for (const [pin, key] of [...pins.entries()].sort()) {
      let di = districtIdx.get(key);
      if (di === undefined) {
        const [district, state] = key.split("|") as [string, string];
        let si = states.indexOf(state);
        if (si < 0) {
          states.push(state);
          si = states.length - 1;
        }
        districts.push([district, si]);
        di = districts.length - 1;
        districtIdx.set(key, di);
      }
      out[pin] = di;
    }
    const chunk: PincodeChunk = { states, districts, pins: out };
    fs.writeFileSync(path.join(outDir, `${prefix}.json`), JSON.stringify(chunk));
    index[prefix] = pins.size;
  }
  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify({ source: "India Post – All India Pincode Directory (data.gov.in)", builtFrom: path.basename(input), prefixes: index }, null, 2),
  );
  console.log(`Read ${used} post-office rows → ${votes.size} pincodes in ${chunks.size} chunks → ${outDir}/`);
}

main();
