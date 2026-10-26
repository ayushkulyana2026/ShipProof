// Shared by the browser scene (main.js) and the Node renderer (render.mjs).
// Numbers are the real engine's result on the bundled sample in public/samples.

export const DATA = {
  total: 2784.99,
  affected: 31,
  audited: 202,
  issues: 32, // money issues (the 2 unmatched AWBs are informational and excluded)
  pct: 4.8,
  invoiceTotal: 58390.54,
  url: "shipproof-ayush-c750.vercel.app",
  // [label, count, amount], largest count first
  types: [
    ["Weight overcharge", 12, 983.85],
    ["Wrong zone", 6, 454.96],
    ["COD on prepaid", 4, 165.2],
    ["COD wrong amount", 3, 78.07],
    ["RTO without return", 3, 333.89],
    ["Duplicate AWB", 2, 692.56],
    ["RTO wrong rate", 2, 76.46],
  ],
};

// Scene order and lengths (seconds). 120 BPM soundtrack, so 2 s = one bar.
const FORMATS = {
  // YouTube: 16:9, a bit longer, includes the "How it works" scene.
  yt: {
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [
      ["hook", 4],
      ["scan", 6],
      ["issues", 6],
      ["money", 6],
      ["how", 6],
      ["privacy", 4],
      ["cta", 6],
    ],
  },
  // Instagram Reels: 9:16, punchier, text kept inside the Reels safe zone.
  ig: {
    width: 1080,
    height: 1920,
    fps: 30,
    scenes: [
      ["hook", 3],
      ["scan", 5],
      ["issues", 5],
      ["money", 5],
      ["privacy", 3],
      ["cta", 5],
    ],
  },
};

// Scenes that flow straight on from the previous one (no dip to black).
export const CONTINUOUS = new Set(["issues", "money"]);

export function timeline(format) {
  const f = FORMATS[format];
  if (!f) throw new Error(`Unknown format "${format}" (use yt or ig)`);
  const scenes = {};
  const order = [];
  let acc = 0;
  for (const [id, dur] of f.scenes) {
    scenes[id] = { id, start: acc, dur, end: acc + dur };
    order.push(id);
    acc += dur;
  }
  return { format, width: f.width, height: f.height, fps: f.fps, scenes, order, total: acc };
}

export const FORMAT_IDS = Object.keys(FORMATS);
