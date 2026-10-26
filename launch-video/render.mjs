// Renders the launch video frame by frame in headless Chromium and encodes it with ffmpeg.
//
//   node launch-video/render.mjs                 # both formats -> launch-video/renders/
//   node launch-video/render.mjs --format ig     # just the Instagram Reel
//   node launch-video/render.mjs --stills 1,6,12 # PNG stills at those seconds (quick check)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function openPage(format) {
  const tl = timeline(format);
  const page = await browser.newPage({ viewport: { width: tl.width, height: tl.height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[${format}] page error:`, e.message));
  page.on("console", (m) => m.type() === "error" && console.error(`[${format}]`, m.text()));
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

async function video(format) {
  const { page, tl } = await openPage(format);
  const wav = path.join(outDir, `soundtrack-${format}.wav`);
  writeSoundtrack(tl, wav);
  const name = format === "ig" ? "shipproof-launch-instagram-1080x1920.mp4" : "shipproof-launch-youtube-1920x1080.mp4";
  const out = path.join(outDir, name);
  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(tl.fps), "-c:v", "png", "-i", "-",
      "-i", wav,
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-r", String(tl.fps), "-g", String(tl.fps * 2),
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-shortest", "-movflags", "+faststart",
      out,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));
  const frames = Math.round(tl.total * tl.fps);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.__seek(t), i / tl.fps);
    const buf = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 60 === 0) console.log(`[${format}] frame ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await done;
  // Cover image: the money reveal.
  await page.evaluate((t) => window.__seek(t), tl.scenes.money.start + 3.2);
  await page.screenshot({ path: path.join(outDir, `cover-${format}.png`) });
  await page.close();
  fs.unlinkSync(wav);
  console.log("wrote", path.relative(root, out));
}

try {
  if (args.stills) {
    const times = args.stills.split(",").map(Number);
    await Promise.all(formats.map((f) => stills(f, times)));
  } else {
    await Promise.all(formats.map((f) => video(f)));
  }
} finally {
  await browser.close();
  server.close();
}
