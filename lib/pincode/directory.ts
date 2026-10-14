import type { PincodeChunk, PincodeInfo } from "./types";

export type ChunkLoader = (prefix: string) => Promise<PincodeChunk | null>;

/** Lazy-loads the bundled India Post chunks (data/pincodes/<NN>.json) on demand. */
export const bundledChunkLoader: ChunkLoader = async (prefix) => {
  if (!/^\d{2}$/.test(prefix)) return null;
  try {
    const mod = (await import(`../../data/pincodes/${prefix}.json`)) as { default?: PincodeChunk } & PincodeChunk;
    return mod.default ?? mod;
  } catch {
    return null; // no chunk for this prefix → every pincode in it is unknown
  }
};

/** "110 020", "'110020", 110020.0 → "110020"; anything that isn't 6 digits → null. */
export function normalizePincode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/^'/, "");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  s = s.replace(/[\s-]/g, "");
  return /^[1-9]\d{5}$/.test(s) ? s : null;
}

export class PincodeDirectory {
  private chunks = new Map<string, PincodeChunk | null>();

  constructor(private readonly loader: ChunkLoader = bundledChunkLoader) {}

  /** Load every chunk needed for these pincodes. Call before `lookup`. */
  async preload(pincodes: Iterable<string>): Promise<void> {
    const prefixes = new Set<string>();
    for (const p of pincodes) {
      const n = normalizePincode(p);
      if (n && !this.chunks.has(n.slice(0, 2))) prefixes.add(n.slice(0, 2));
    }
    await Promise.all(
      [...prefixes].map(async (prefix) => {
        this.chunks.set(prefix, await this.loader(prefix));
      }),
    );
  }

  /** Synchronous lookup; returns null for unknown pincodes or chunks that were not preloaded. */
  lookup(pincode: string): PincodeInfo | null {
    const n = normalizePincode(pincode);
    if (!n) return null;
    const chunk = this.chunks.get(n.slice(0, 2));
    if (!chunk) return null;
    const di = chunk.pins[n];
    if (di === undefined) return null;
    const d = chunk.districts[di];
    if (!d) return null;
    const state = chunk.states[d[1]];
    if (state === undefined) return null;
    return { pincode: n, district: d[0], state };
  }
}

/** Build a directory from an in-memory map (handy for tests and for user overrides). */
export function staticDirectory(entries: Record<string, { district: string; state: string }>): PincodeDirectory {
  const byPrefix = new Map<string, PincodeChunk>();
  for (const [pin, { district, state }] of Object.entries(entries)) {
    const prefix = pin.slice(0, 2);
    const chunk = byPrefix.get(prefix) ?? { states: [], districts: [], pins: {} };
    let si = chunk.states.indexOf(state);
    if (si < 0) si = chunk.states.push(state) - 1;
    chunk.districts.push([district, si]);
    chunk.pins[pin] = chunk.districts.length - 1;
    byPrefix.set(prefix, chunk);
  }
  return new PincodeDirectory(async (prefix) => byPrefix.get(prefix) ?? null);
}
