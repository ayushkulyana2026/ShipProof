# ShipProof launch video

A launch video made with three.js. Every frame is generated from code, and so is the soundtrack. It comes in two cuts:

| File | Format | Length | Scenes |
|---|---|---|---|
| `renders/shipproof-launch-youtube-1920x1080.mp4` | YouTube, 16:9 | 38 s | hook → scan → issues → money → how it works → privacy → CTA |
| `renders/shipproof-launch-instagram-1080x1920.mp4` | Instagram Reels, 9:16 | 26 s | hook → scan → issues → money → privacy → CTA ("Link in bio") |

All figures on screen (202 AWBs, 31 shipments flagged, 32 overcharges, ₹2,784.99, 4.8%) come from the real audit engine run on the bundled sample in `public/samples`.

## Files

- `timeline.mjs`: scene order and lengths for each format, plus the data shown on screen.
- `main.js` + `index.html`: the three.js world (parcels, laser scan, bar chart, rupee coins, padlock, logo). It is driven only by a time value, so every render comes out the same.
- `audio.mjs`: generated 120 BPM soundtrack (pad, bass, drums, whooshes, coin and lock sounds) timed to the scene cuts.
- `render.mjs`: steps through each frame in headless Chromium, takes a screenshot of each one and encodes them with ffmpeg (H.264 + AAC, `+faststart`). It also saves a `cover-*.png` of the money reveal.

## Re-render

Needs `ffmpeg` on the PATH and the Playwright Chromium (`npx playwright install chromium`).

```bash
node launch-video/render.mjs                  # both formats
node launch-video/render.mjs --format ig      # one format (yt | ig)
node launch-video/render.mjs --stills 3,9,15  # PNG stills at those seconds, for quick checks
CHROMIUM_PATH=/path/to/chrome node launch-video/render.mjs   # use a different Chromium
```

To preview live in a browser, serve the repo root (for example `npx serve .`) and open
`/launch-video/index.html?format=yt&play` (or `format=ig`).

To change copy, timing or numbers, edit `timeline.mjs` and the `cap(...)` lines near the end of `main.js`.
