// Renders the launch video frame by frame in headless Chromium and encodes it with ffmpeg.
//
//   node launch-video/render.mjs                 # both formats -> launch-video/renders/
//   node launch-video/render.mjs --format ig     # just the Instagram Reel
//   node launch-video/render.mjs --stills 1,6,12 # PNG stills at those seconds (quick check)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { FORMAT_IDS, timeline } from "./timeline.mjs";
import { writeSoundtrack } from "./audio.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(here, "renders");
fs.mkdirSync(outDir, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return acc;
  }, []),
);
const formats = args.format ? [args.format] : FORMAT_IDS;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/launch-video/index.html`;

// Uses Playwright's own Chromium, or CHROMIUM_PATH if set (e.g. a preinstalled build).
// Each worker gets its own browser so WebGL rendering runs in parallel across CPU cores.
const browsers = [];
async function openPage(format) {
  const tl = timeline(format);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: tl.width, height: tl.height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[${format}] page error:`, e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && console.error(`[${format}]`, m.text()));
  await page.goto(`${base}?format=${format}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  return { page, tl };
}

async function stills(format, times) {
  const { page } = await openPage(format);
  for (const t of times) {
    await page.evaluate((t) => window.__seek(t), t);
    const f = path.join(outDir, `still-${format}-${String(t).replace(".", "_")}.png`);
    await page.screenshot({ path: f });
    console.log("wrote", path.relative(root, f));
  }
  await page.close();
}

function run(cmd, argv, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ["pipe", "inherit", "inherit"], ...opts });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
    if (opts.feed) opts.feed(p);
  });
}

// Render frames [f0, f1) to a video-only segment.
async function segment(format, k, f0, f1, file) {
  const { page, tl } = await openPage(format);
  const t0 = Date.now();
  await run(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(tl.fps), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-r", String(tl.fps), "-g", String(tl.fps * 2), "-an",
      file,
    ],
    {
      feed: async (ff) => {
        for (let i = f0; i < f1; i++) {
          await page.evaluate((t) => window.__seek(t), i / tl.fps);
          const buf = await page.screenshot({ type: "png" });
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
          if ((i - f0) % 60 === 0) console.log(`[${format}#${k}] frame ${i - f0}/${f1 - f0} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
        ff.stdin.end();
      },
    },
  );
  if (k === 0) {
    // Cover image: the money reveal.
    await page.evaluate((t) => window.__seek(t), tl.scenes.money.start + 3.2);
    await page.screenshot({ path: path.join(outDir, `cover-${format}.png`) });
  }
  await page.close();
}

async function video(format, workers) {
  const tl = timeline(format);
  const frames = Math.round(tl.total * tl.fps);
  const wav = path.join(outDir, `soundtrack-${format}.wav`);
  writeSoundtrack(tl, wav);
  // Split on 2-second GOP boundaries so the segments join cleanly.
  const gop = tl.fps * 2;
  const per = Math.ceil(frames / gop / workers) * gop;
  const parts = [];
  for (let k = 0; k * per < frames; k++) parts.push([k, k * per, Math.min(frames, (k + 1) * per), path.join(outDir, `.part-${format}-${k}.mp4`)]);
  await Promise.all(parts.map(([k, a, b, f]) => segment(format, k, a, b, f)));
  const list = path.join(outDir, `.parts-${format}.txt`);
  fs.writeFileSync(list, parts.map((p) => `file '${p[3]}'`).join("\n"));
  const name = format === "ig" ? "shipproof-launch-instagram-1080x1920.mp4" : "shipproof-launch-youtube-1920x1080.mp4";
  const out = path.join(outDir, name);
  await run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", list, "-i", wav,
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-shortest", "-movflags", "+faststart", out,
  ]);
  for (const p of parts) fs.unlinkSync(p[3]);
  fs.unlinkSync(list);
  fs.unlinkSync(wav);
  console.log("wrote", path.relative(root, out));
}

try {
  if (args.stills) {
    const times = args.stills.split(",").map(Number);
    await Promise.all(formats.map((f) => stills(f, times)));
  } else {
    // --workers N: parallel browsers per format (default: split the CPU cores between formats).
    const workers = Number(args.workers) || Math.max(1, Math.round(os.cpus().length / formats.length));
    await Promise.all(formats.map((f) => video(f, workers)));
  }
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  server.close();
}
