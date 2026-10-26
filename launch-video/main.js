// ShipProof launch video: one three.js world, driven entirely by a time value `t`.
// Nothing depends on wall-clock time, so render.mjs can step it frame by frame.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DATA, CONTINUOUS, timeline } from "./timeline.mjs";

const params = new URLSearchParams(location.search);
const TL = timeline(params.get("format") || "yt");
const W = TL.width;
const H = TL.height;
const PORTRAIT = H > W;
const IG = TL.format === "ig";

// ---------- small helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const range = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeInCubic = (k) => k * k * k;
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k, s = 1.7) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
const easeOutBounce = (k) => {
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
};
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const inr = (v) =>
  "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}
function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  g.fillText(line, x, y);
}

// ---------- renderer / scene ----------
const stage = document.getElementById("stage");
stage.style.width = W + "px";
stage.style.height = H + "px";
const ov = document.getElementById("ov");
ov.style.setProperty("--u", Math.min(W, H) / 100 + "px");
if (PORTRAIT) document.body.classList.add("portrait");
const fade = document.getElementById("fade");

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x03140f, 0.012);
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 500);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

scene.add(new THREE.HemisphereLight(0xd8fff0, 0x0a2a1f, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(6, 10, 8);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x3ee6a0, 1.6);
rim.position.set(-8, 3, -6);
scene.add(rim);
const flare = new THREE.PointLight(0xffd36a, 0, 30, 1.5);
scene.add(flare);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.5, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Background: a gradient dome that follows the camera.
const bgMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color(0x0b3b2b) },
    bot: { value: new THREE.Color(0x010806) },
    tint: { value: new THREE.Color(0x000000) },
  },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 tint; varying vec3 vDir;
    void main(){ float h = vDir.y*0.5+0.5; vec3 c = mix(bot, top, smoothstep(0.25,0.95,h)); gl_FragColor = vec4(c + tint, 1.0); }`,
});
const bg = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), bgMat);
bg.renderOrder = -10;
bg.frustumCulled = false;
scene.add(bg);

// Soft round points whose on-screen size is capped (no giant squares near the camera).
function roundPoints(color, size, opacity, maxPx) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: `void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = clamp(${size.toFixed(3)} * ${(H / 2).toFixed(1)} / -mv.z, 1.0, ${maxPx.toFixed(1)});
      gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity;
      void main(){ float a = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5)) * opacity; gl_FragColor = vec4(color * a, a); }`,
  });
}

// Drifting dust for depth.
const dust = (() => {
  const r = rng(7);
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() - 0.5) * 70;
    pos[i * 3 + 1] = (r() - 0.5) * 40;
    pos[i * 3 + 2] = (r() - 0.5) * 70;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, roundPoints(0x7dffd0, 0.07, 0.55, 3.5));
  scene.add(p);
  return p;
})();

// ---------- camera framing ----------
// Distance needed to fit a w×h box at the target, for this aspect ratio.
function fitDist(w, h) {
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return Math.max(h / 2 / tv, w / 2 / (tv * camera.aspect));
}
function pose(target, dir, w, h, offY = 0) {
  const d = fitDist(w, h);
  const pos = target.clone().add(dir.clone().normalize().multiplyScalar(d));
  return { pos, target: target.clone(), offY };
}
function blendPose(a, b, k) {
  return {
    pos: a.pos.clone().lerp(b.pos, k),
    target: a.target.clone().lerp(b.target, k),
    offY: lerp(a.offY, b.offY, k),
  };
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- textures ----------
await document.fonts.load("800 40px Inter");
await document.fonts.load("600 40px Inter");
await document.fonts.load("500 40px 'JetBrains Mono'");

const labelTex = canvasTex(720, 480, (g, w, h) => {
  const r = rng(3);
  g.fillStyle = "#fbfaf6";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#111";
  g.fillRect(0, 0, w, 70);
  g.fillStyle = "#fff";
  g.font = "800 38px Inter";
  g.fillText("SURFACE EXPRESS", 28, 49);
  g.fillStyle = "#111";
  g.font = "600 28px 'JetBrains Mono'";
  g.fillText("AWB 1490 2283 7712", 28, 118);
  let x = 28;
  while (x < 690) {
    const bw = 2 + Math.floor(r() * 6);
    if (r() > 0.35) g.fillRect(x, 136, bw, 82);
    x += bw + 2;
  }
  g.font = "600 26px Inter";
  g.fillText("TO: 560034  BENGALURU, KA", 28, 262);
  g.fillStyle = "#333";
  g.font = "600 34px Inter";
  g.fillText("Actual weight", 28, 330);
  g.fillText("0.48 kg", 500, 330);
  g.fillStyle = "#d61f1f";
  g.font = "800 40px Inter";
  g.fillText("Billed weight", 28, 400);
  g.fillText("1.50 kg", 488, 400);
});

const invoiceTex = canvasTex(640, 860, (g, w, h) => {
  const r = rng(11);
  g.fillStyle = "#fdfdfb";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#0b3b2b";
  g.font = "800 40px Inter";
  g.fillText("TAX INVOICE", 36, 70);
  g.fillStyle = "#667";
  g.font = "500 22px Inter";
  g.fillText("Courier charges · October 2026", 36, 104);
  g.fillStyle = "#223";
  g.font = "700 20px Inter";
  const cols = [36, 290, 380, 470];
  ["AWB", "Wt", "Zone", "Amount"].forEach((c, i) => g.fillText(c, cols[i], 160));
  g.fillRect(36, 172, w - 72, 2);
  g.font = "500 21px 'JetBrains Mono'";
  for (let i = 0; i < 16; i++) {
    const y = 210 + i * 38;
    const bad = [2, 6, 7, 12].includes(i);
    if (bad) {
      g.fillStyle = "#ffe1e1";
      g.fillRect(30, y - 26, w - 60, 36);
    }
    g.fillStyle = bad ? "#c81e1e" : "#334";
    const awb = "14" + String(Math.floor(r() * 1e10)).padStart(10, "0");
    g.fillText(awb, cols[0], y);
    g.fillText((0.5 * (1 + Math.floor(r() * 4))).toFixed(1), cols[1], y);
    g.fillText("ABCDE"[Math.floor(r() * 5)], cols[2], y);
    g.fillText("₹" + (40 + r() * 140).toFixed(2), cols[3], y);
  }
  g.fillStyle = "#223";
  g.fillRect(36, h - 92, w - 72, 2);
  g.font = "800 28px Inter";
  g.fillText("Total  " + inr(DATA.invoiceTotal), 36, h - 46);
});

const coinTex = canvasTex(256, 256, (g, w) => {
  const grd = g.createRadialGradient(w * 0.4, w * 0.35, 10, w / 2, w / 2, w / 2);
  grd.addColorStop(0, "#fff1b8");
  grd.addColorStop(0.6, "#f2b93b");
  grd.addColorStop(1, "#b97a12");
  g.fillStyle = grd;
  g.fillRect(0, 0, w, w);
  g.strokeStyle = "#a36a0e";
  g.lineWidth = 10;
  g.beginPath();
  g.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#9a620c";
  g.font = "800 150px Inter";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("₹", w / 2, w / 2 + 8);
});

// =====================================================================
// Scene 1: hook — a parcel billed for weight it doesn't have
// =====================================================================
const hook = new THREE.Group();
scene.add(hook);
const cardboard = new THREE.MeshStandardMaterial({ color: 0xc58f58, roughness: 0.85 });
const tapeMat = new THREE.MeshStandardMaterial({ color: 0xe6bd86, roughness: 0.35 });
const parcel = new THREE.Group();
{
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.05, 1.15, 4, 0.05), cardboard);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.52, 1.07, 0.26), tapeMat);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.08, 0.72),
    new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.55 }),
  );
  label.position.set(0, 0, 0.577);
  parcel.add(body, tape, label);
  // Red ring around the "billed weight" line.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.23, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.4), transparent: true, side: THREE.DoubleSide }),
  );
  ring.scale.set(2.6, 0.62, 1);
  ring.position.set(0, -0.215, 0.6);
  ring.name = "ring";
  parcel.add(ring);
}
parcel.scale.setScalar(2.2);
hook.add(parcel);
const sheets = [];
for (const [x, y, z, ry] of [
  [-5.2, 1.6, -5, 0.5],
  [5.4, 0.4, -6, -0.45],
  [-1.2, -3.6, -9, 0.15],
  [3, -2.6, -8, -0.2],
]) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 3.22),
    new THREE.MeshStandardMaterial({ map: invoiceTex, color: 0xb8c4be, roughness: 0.7, side: THREE.DoubleSide, transparent: true }),
  );
  const px = PORTRAIT ? x * 0.55 : x;
  const py = PORTRAIT ? (y > 0 ? y * 0.6 - 0.8 : y * 1.6) : y;
  m.userData.base = V(px, py, z);
  m.userData.ry = ry;
  sheets.push(m);
  hook.add(m);
}

function updateHook(p, d) {
  const drop = easeOutBounce(range(p, 0, 0.9));
  parcel.position.set(0, lerp(7, 0, drop), 0);
  parcel.rotation.set(0.12, -0.55 + p * 0.16, lerp(0.4, 0, drop));
  const ring = parcel.getObjectByName("ring");
  const rk = range(p, d * 0.5, d * 0.5 + 0.35);
  ring.material.opacity = rk;
  const pulse = 1 + 0.06 * Math.sin(p * 9) * rk;
  ring.scale.set(2.6 * lerp(1.6, 1, easeOutCubic(rk)) * pulse, 0.62 * lerp(1.6, 1, easeOutCubic(rk)) * pulse, 1);
  sheets.forEach((s, i) => {
    s.material.opacity = range(p, 0.2 + i * 0.15, 0.9 + i * 0.15);
    s.position.copy(s.userData.base).add(V(0, Math.sin(p * 0.8 + i) * 0.25, 0));
    s.rotation.set(0.1 * Math.sin(p * 0.5 + i), s.userData.ry + p * 0.05, 0.05 * i);
  });
}
function poseHook(p, d) {
  const k = easeInOutCubic(range(p, 0, d));
  const w = PORTRAIT ? 6 : 8;
  return pose(V(0, 0.2, 0), V(lerp(0.35, 0.15, k), 0.22, 1), w * lerp(1.12, 0.95, k), 5.4, PORTRAIT ? -0.12 : -0.14);
}

// =====================================================================
// Scenes 2–4: every AWB as a parcel (instanced)
// =====================================================================
const NP = DATA.audited + 1; // +1 spare that pops into the duplicate bar
const COLS = PORTRAIT ? 11 : 20;
const ROWS = Math.ceil(DATA.audited / COLS);
const GX = 1.3, GZ = 1.18;
const pGeo = new RoundedBoxGeometry(1, 0.72, 0.85, 2, 0.05);
const tGeo = new THREE.BoxGeometry(1.015, 0.735, 0.17);
const pMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), NP);
const tMesh = new THREE.InstancedMesh(tGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), NP);
pMesh.frustumCulled = tMesh.frustumCulled = false;
scene.add(pMesh, tMesh);

const grid = [];
for (let i = 0; i < DATA.audited; i++) {
  const c = i % COLS, r = Math.floor(i / COLS);
  const lastRow = r === ROWS - 1;
  const inRow = lastRow ? DATA.audited - r * COLS : COLS;
  grid.push(V((c - (inRow - 1) / 2) * GX, 0, (r - (ROWS - 1) / 2) * GZ));
}
grid.push(V(0, 0, 0)); // spare

// Pick which parcels are flagged (seeded, spread over the grid).
const flagged = new Set();
{
  const r = rng(42);
  while (flagged.size < DATA.affected) flagged.add(Math.floor(r() * DATA.audited));
}
const flagList = [...flagged, DATA.audited]; // 32 slots incl. spare
// Assign each flagged parcel a bar slot, shuffled so boxes cross the screen.
const slots = [];
DATA.types.forEach(([, count], row) => {
  for (let k = 0; k < count; k++) slots.push({ row, k });
});
{
  const r = rng(9);
  const sh = flagList.slice(0, -1);
  for (let i = sh.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [sh[i], sh[j]] = [sh[j], sh[i]];
  }
  // spare must land in the duplicate row
  const dupIdx = slots.findIndex((s) => DATA.types[s.row][0] === "Duplicate AWB" && s.k === 1);
  const order = [];
  let si = 0;
  slots.forEach((_, idx) => order.push(idx === dupIdx ? DATA.audited : sh[si++]));
  var slotOf = new Map(order.map((inst, idx) => [inst, { ...slots[idx], j: idx }]));
}
const BAR_GAP = 1.5, BAR_SP = 0.8, BAR_S = 0.62;
const barX0 = -(12 * BAR_SP) / 2 + BAR_SP / 2;
const barPos = (row, k) => V(barX0 + k * BAR_SP, (3 - row) * BAR_GAP - 0.6, 0);

// Scan sweep: along x for YouTube (wide), along z for Reels (tall).
const sweepAxis = PORTRAIT ? "z" : "x";
const sweepMin = Math.min(...grid.map((g) => g[sweepAxis])) - 1.2;
const sweepMax = Math.max(...grid.map((g) => g[sweepAxis])) + 1.2;
const sweepStart = 0.9;
const sweepEnd = () => TL.scenes.scan.dur - 0.5;
function sweepAt(p) {
  return lerp(sweepMin, sweepMax, range(p, sweepStart, sweepEnd()));
}
function scannedAt(i) {
  const k = (grid[i][sweepAxis] - sweepMin) / (sweepMax - sweepMin);
  return lerp(sweepStart, sweepEnd(), k);
}

const laser = new THREE.Group();
{
  const span = PORTRAIT ? COLS * GX + 2 : ROWS * GZ + 2;
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, span),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 6, 3) }),
  );
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(span, 2.4),
    new THREE.MeshBasicMaterial({
      color: 0x3ee6a0,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  sheet.rotation.y = Math.PI / 2;
  sheet.position.y = 1.2;
  beam.position.y = 0.02;
  laser.add(beam, sheet);
  if (PORTRAIT) laser.rotation.y = Math.PI / 2;
  scene.add(laser);
}

const C_CARD = new THREE.Color(0xc58f58);
const C_DONE = new THREE.Color(0x8f8a62);
const C_GREEN = new THREE.Color(0x56ffb8);
const C_RED = new THREE.Color(0xff3434);
const C_TAPE = new THREE.Color(0xe6bd86);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const sc = new THREE.Vector3();
const col = new THREE.Color();
const colT = new THREE.Color();
const s = TL.scenes;

function parcelState(i, t) {
  const pos = grid[i].clone();
  let rx = 0, ry = 0, rz = 0, scale = 1;
  const isFlag = flagged.has(i);
  const spare = i === DATA.audited;
  col.copy(C_CARD);
  // --- scan ---
  const ps = t - s.scan.start;
  const r0 = Math.floor(i / COLS), c0 = i % COLS;
  const delay = ((PORTRAIT ? r0 : c0) / (PORTRAIT ? ROWS : COLS)) * 0.45 + (i % 7) * 0.012;
  const dk = range(ps, delay, delay + 0.5);
  pos.y += lerp(9, 0, easeOutCubic(dk));
  rz = (1 - dk) * 0.8 * ((i % 2) * 2 - 1);
  scale = dk > 0 ? 1 : 0;
  if (spare) scale = 0;
  const ts = scannedAt(i);
  const dt = ps - ts;
  if (dt > 0) {
    if (isFlag) {
      col.copy(C_RED);
      pos.y += 0.5 * easeOutBack(range(dt, 0, 0.4)) + Math.sin(t * 4 + i) * 0.06;
      rz += Math.sin(dt * 18) * 0.25 * Math.exp(-dt * 3);
    } else {
      col.copy(C_GREEN).lerp(C_DONE, range(dt, 0.05, 0.6));
    }
  }
  // --- issues: unflagged sink, flagged fly to bars ---
  const pi = t - s.issues.start;
  if (pi > 0) {
    if (!isFlag && !spare) {
      const k = easeInCubic(range(pi, 0, 0.9));
      pos.y -= 5 * k;
      scale *= 1 - range(pi, 0.3, 0.9);
    } else {
      const sl = slotOf.get(i);
      const to = barPos(sl.row, sl.k);
      if (spare) {
        pos.copy(to);
        scale = BAR_S * easeOutBack(range(pi, 1.9, 2.3), 3);
        col.copy(C_RED);
      } else {
        const a = 0.15 + sl.j * 0.035;
        const k = easeInOutCubic(range(pi, a, a + 1.0));
        const from = pos.clone();
        const ctrl = from.clone().lerp(to, 0.5).add(V(0, 4, 2));
        pos.set(
          (1 - k) ** 2 * from.x + 2 * (1 - k) * k * ctrl.x + k * k * to.x,
          (1 - k) ** 2 * from.y + 2 * (1 - k) * k * ctrl.y + k * k * to.y,
          (1 - k) ** 2 * from.z + 2 * (1 - k) * k * ctrl.z + k * k * to.z,
        );
        ry = k * Math.PI * 2;
        rx = Math.sin(k * Math.PI) * 0.6;
        scale = lerp(1, BAR_S, k);
      }
      // settled bars breathe a little
      pos.y += Math.sin(t * 3 + sl.k * 0.5) * 0.03 * range(pi, 1.5, 2);
    }
  }
  // --- money: flagged implode into the centre ---
  const pm = t - s.money.start;
  if (pm > 0) {
    const k = easeInCubic(range(pm, 0, 0.55));
    pos.lerp(V(0, 0, 0), k);
    scale *= 1 - k;
    ry += k * 4;
  }
  e.set(rx, ry, rz);
  q.setFromEuler(e);
  sc.setScalar(Math.max(scale, 0.0001));
  m4.compose(pos, q, sc);
  return m4;
}

function updateParcels(t) {
  const on = t >= s.scan.start && t < s.money.start + 0.6;
  pMesh.visible = tMesh.visible = on;
  const ps = t - s.scan.start;
  laser.visible = t >= s.scan.start && t < s.scan.end;
  if (laser.visible) {
    const v = sweepAt(ps);
    laser.position.set(sweepAxis === "x" ? v : 0, 0.3, sweepAxis === "z" ? v : 0);
    const vis = range(ps, sweepStart - 0.2, sweepStart) * (1 - range(ps, sweepEnd(), sweepEnd() + 0.3));
    laser.scale.setScalar(Math.max(vis, 0.001));
  }
  if (!on) return;
  for (let i = 0; i < NP; i++) {
    parcelState(i, t);
    pMesh.setMatrixAt(i, m4);
    tMesh.setMatrixAt(i, m4);
    pMesh.setColorAt(i, col);
    colT.copy(col).lerp(C_TAPE, 0.35);
    tMesh.setColorAt(i, colT);
  }
  pMesh.instanceMatrix.needsUpdate = tMesh.instanceMatrix.needsUpdate = true;
  pMesh.instanceColor.needsUpdate = tMesh.instanceColor.needsUpdate = true;
}

function poseScan(p, d) {
  const w = COLS * GX + 1.5;
  const h = ROWS * GZ * 0.72 + (PORTRAIT ? 2 : 5);
  const k = range(p, 0, d);
  return pose(V(0, 0, PORTRAIT ? 1.2 : 0.8), V(lerp(-0.12, 0.12, k), 1.15, 1), w * lerp(1.04, 0.97, k), h, PORTRAIT ? -0.06 : -0.08);
}
function poseIssues(p, d) {
  const w = 12 * BAR_SP + 1.6;
  const h = DATA.types.length * BAR_GAP + 1;
  return pose(V(0, -0.6, 0), V(Math.sin(p * 0.25) * 0.12, 0.05, 1), w * (PORTRAIT ? 1.05 : 1.0), h * (PORTRAIT ? 1 : 1.32), PORTRAIT ? -0.03 : -0.11);
}

// =====================================================================
// Scene 4: money — coins burst out of the flagged parcels
// =====================================================================
const NC = 260;
const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.09, 48);
const goldSide = new THREE.MeshStandardMaterial({ color: 0xe0a531, metalness: 1, roughness: 0.3 });
const goldFace = new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.85, roughness: 0.32 });
const coins = new THREE.InstancedMesh(coinGeo, [goldSide, goldFace, goldFace], NC);
coins.frustumCulled = false;
scene.add(coins);
const coinData = (() => {
  const r = rng(77);
  return Array.from({ length: NC }, () => ({
    a0: r() * Math.PI * 2,
    R: 3.4 + Math.pow(r(), 0.7) * (PORTRAIT ? 6 : 9),
    h: (r() - 0.5) * (PORTRAIT ? 12 : 7),
    w: 0.35 + r() * 0.35,
    te: 0.5 + r() * 0.45,
    spin: 1 + r() * 3,
    ph: r() * 6,
    s: 0.45 + r() * 0.35,
  }));
})();
const flash = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 16),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.5, 1.6), transparent: true }),
);
scene.add(flash);

function updateMoney(p, d) {
  coins.visible = true;
  for (let i = 0; i < NC; i++) {
    const c = coinData[i];
    const k = easeOutCubic(range(p, c.te, c.te + 1.4));
    const a = c.a0 + c.w * Math.max(0, p - c.te) * 1.2 + k * 1.5;
    const r = c.R * k;
    const pos = V(Math.cos(a) * r, c.h * k + Math.sin(p * 1.5 + c.ph) * 0.2 * k, Math.sin(a) * r);
    e.set(p * c.spin + c.ph, a, Math.PI / 2 + 0.4 * Math.sin(p * 2 + c.ph));
    q.setFromEuler(e);
    sc.setScalar(Math.max(c.s * (k > 0 ? Math.min(1, k * 3) : 0), 0.0001));
    m4.compose(pos, q, sc);
    coins.setMatrixAt(i, m4);
  }
  coins.instanceMatrix.needsUpdate = true;
  const fk = range(p, 0.42, 0.62) * (1 - range(p, 0.62, 1.2));
  flash.visible = fk > 0.001;
  flash.scale.setScalar(0.2 + easeOutCubic(range(p, 0.42, 1.2)) * 3.2);
  flash.material.opacity = fk;
  flare.intensity = 90 * fk + 15 * range(p, 0.6, 1.4);
  flare.position.set(0, 0, 0);
  bgMat.uniforms.tint.value.setRGB(0.05 * range(p, 0.5, 1.5), 0.03 * range(p, 0.5, 1.5), 0);
}
function poseMoney(p, d) {
  const a = p * 0.12;
  return pose(V(0, 0, 0), V(Math.sin(a), 0.32, Math.cos(a)), PORTRAIT ? 11 : 17, PORTRAIT ? 12 : 10, 0);
}

// =====================================================================
// Scene 5 (YouTube): how it works — three cards
// =====================================================================
const how = new THREE.Group();
scene.add(how);
const STEPS = [
  ["Upload", "Courier invoice, Shopify orders and your rate card. CSV or Excel.", "files"],
  ["We check every AWB", "Weight, slabs, pincode zone, COD, RTO, fuel and GST, re-priced.", "search"],
  ["Get your refund list", "A rupee total, the working for each AWB and ready-to-send dispute emails.", "mail"],
];
function drawIcon(g, kind, cx, cy, s) {
  g.strokeStyle = "#3ee6a0";
  g.lineWidth = s * 0.07;
  g.lineJoin = g.lineCap = "round";
  if (kind === "files") {
    for (let i = 2; i >= 0; i--) {
      const x = cx - s * 0.32 + i * s * 0.16, y = cy - s * 0.42 + i * s * 0.1;
      g.fillStyle = i === 0 ? "#0e4a37" : "#0b3b2b";
      g.beginPath();
      g.roundRect(x, y, s * 0.5, s * 0.66, s * 0.06);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    for (let l = 0; l < 3; l++) {
      g.moveTo(cx - s * 0.22, cy - s * 0.2 + l * s * 0.13);
      g.lineTo(cx + s * 0.08, cy - s * 0.2 + l * s * 0.13);
    }
    g.stroke();
  } else if (kind === "search") {
    g.beginPath();
    g.arc(cx - s * 0.08, cy - s * 0.08, s * 0.28, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + s * 0.13, cy + s * 0.13);
    g.lineTo(cx + s * 0.38, cy + s * 0.38);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - s * 0.2, cy - s * 0.07);
    g.lineTo(cx - s * 0.1, cy + s * 0.04);
    g.lineTo(cx + s * 0.06, cy - s * 0.18);
    g.stroke();
  } else {
    g.beginPath();
    g.roundRect(cx - s * 0.4, cy - s * 0.28, s * 0.8, s * 0.56, s * 0.06);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - s * 0.36, cy - s * 0.22);
    g.lineTo(cx, cy + s * 0.05);
    g.lineTo(cx + s * 0.36, cy - s * 0.22);
    g.stroke();
    g.fillStyle = "#ffd36a";
    g.font = `800 ${s * 0.3}px Inter`;
    g.textAlign = "center";
    g.fillText("₹", cx + s * 0.38, cy + s * 0.42);
    g.textAlign = "left";
  }
}
const cards = STEPS.map(([title, body, icon], i) => {
  const tex = canvasTex(880, 1120, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#0f4a37");
    grd.addColorStop(1, "#06261c");
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(0, 0, w, h, 60);
    g.fill();
    g.strokeStyle = "rgba(62,230,160,.45)";
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = "#0b7a55";
    g.beginPath();
    g.arc(130, 130, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "800 72px Inter";
    g.textAlign = "center";
    g.fillText(String(i + 1), 130, 156);
    g.textAlign = "left";
    drawIcon(g, icon, w / 2, 440, 340);
    g.fillStyle = "#fff";
    g.font = "800 70px Inter";
    wrapText(g, title, 70, 760, w - 140, 80);
    g.fillStyle = "#a9dcc7";
    g.font = "500 44px Inter";
    wrapText(g, body, 70, title.length > 14 ? 940 : 870, w - 140, 58);
  });
  const grp = new THREE.Group();
  const slab = new THREE.Mesh(
    new RoundedBoxGeometry(4.4, 5.6, 0.22, 4, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x0a3326, metalness: 0.3, roughness: 0.35 }),
  );
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 5.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
  );
  face.position.z = 0.115;
  grp.add(slab, face);
  how.add(grp);
  return grp;
});
function updateHow(p, d) {
  cards.forEach((c, i) => {
    const a = 0.25 + i * 0.45;
    const k = easeOutCubic(range(p, a, a + 1.0));
    c.position.set((i - 1) * 5.1, Math.sin(p * 1.4 + i) * 0.1, lerp(-14, 0, k));
    c.rotation.set(0, lerp(Math.PI * 0.6, 0, k) + Math.sin(p * 0.7 + i) * 0.05, 0);
    const hk = range(p, 2.4 + i * 0.9, 2.7 + i * 0.9) * (1 - range(p, 3.1 + i * 0.9, 3.5 + i * 0.9));
    c.scale.setScalar(Math.max(0.001, (k > 0 ? 1 : 0) * (1 + 0.07 * hk)));
    c.position.z += hk * 0.6;
  });
}
function poseHow(p, d) {
  return pose(V(0, 0, 0), V(Math.sin(p * 0.15 - 0.3) * 0.25, 0.08, 1), 15.6, 6.4 * 1.45, -0.07);
}

// =====================================================================
// Scene 6: privacy — a padlock snaps shut over the browser
// =====================================================================
const priv = new THREE.Group();
scene.add(priv);
const browserTex = canvasTex(1440, 900, (g, w, h) => {
  g.fillStyle = "#0b1f19";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#12322a";
  g.fillRect(0, 0, w, 96);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(52 + i * 40, 48, 13, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = "#081a14";
  g.beginPath();
  g.roundRect(190, 22, w - 240, 52, 26);
  g.fill();
  g.fillStyle = "#9fd8c2";
  g.font = "500 28px Inter";
  g.fillText("🔒  " + DATA.url + "/audit", 220, 58);
  g.fillStyle = "#fff";
  g.font = "800 54px Inter";
  g.fillText("Auditing on this device", 90, 210);
  const files = ["invoice_delhivery.csv", "shopify_orders.csv", "rate_card.json"];
  files.forEach((f, i) => {
    const y = 300 + i * 120;
    g.fillStyle = "#103a2d";
    g.beginPath();
    g.roundRect(90, y, w - 180, 92, 18);
    g.fill();
    g.fillStyle = "#3ee6a0";
    g.font = "800 44px Inter";
    g.fillText("✓", 125, y + 62);
    g.fillStyle = "#e9fff6";
    g.font = "500 38px 'JetBrains Mono'";
    g.fillText(f, 190, y + 60);
    g.fillStyle = "#7fbfa8";
    g.font = "600 30px Inter";
    g.textAlign = "right";
    g.fillText("parsed locally", w - 130, y + 58);
    g.textAlign = "left";
  });
  g.fillStyle = "#7fbfa8";
  g.font = "600 32px Inter";
  g.fillText("0 bytes uploaded", 90, 760);
});
const browser = new THREE.Group();
{
  const frame = new THREE.Mesh(
    new RoundedBoxGeometry(9.6, 6.0, 0.3, 4, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x0e2a22, metalness: 0.4, roughness: 0.35 }),
  );
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(9.3, 5.8),
    new THREE.MeshBasicMaterial({ map: browserTex, toneMapped: false }),
  );
  screen.position.z = 0.16;
  browser.add(frame, screen);
  priv.add(browser);
}
const lock = new THREE.Group();
const shackle = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x14a372, metalness: 0.7, roughness: 0.25 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe8e4, metalness: 1, roughness: 0.18 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.8, 0.8, 4, 0.18), metal);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0x03140f }));
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, 0.1, 0.41);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), hole.material);
  slot.position.set(0, -0.15, 0.41);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.15, 20, 48, Math.PI), steel);
  arc.position.y = 0.9;
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 20), steel);
  legL.position.set(-0.62, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.62;
  shackle.add(arc, legL, legR);
  shackle.position.y = 0.45;
  lock.add(body, hole, slot, shackle);
  lock.position.set(PORTRAIT ? 2.6 : 5.0, PORTRAIT ? -3.6 : -1.8, 2.0);
  priv.add(lock);
}
const shock = new THREE.Mesh(
  new THREE.TorusGeometry(1.4, 0.04, 8, 96),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 5, 2.6), transparent: true }),
);
priv.add(shock);
function updatePrivacy(p, d) {
  const k = easeOutCubic(range(p, 0, 0.7));
  browser.position.set(0, lerp(-1, 0, k), lerp(-6, 0, k));
  browser.rotation.set(0, lerp(-0.3, -0.12, k) + p * 0.02, 0);
  const lk = easeOutBack(range(p, 0.25, 0.75));
  lock.scale.setScalar(Math.max(lk, 0.001) * 1.1);
  lock.rotation.set(0.1, -0.35 + Math.sin(p * 1.2) * 0.08, 0);
  const close = easeOutBounce(range(p, 0.9, 1.25));
  shackle.position.y = lerp(1.0, 0.45, close);
  shackle.rotation.y = lerp(Math.PI * 0.9, 0, easeOutCubic(range(p, 0.6, 0.9)));
  const sk = range(p, 1.2, 2.0);
  shock.visible = sk > 0 && sk < 1;
  shock.position.copy(lock.position).add(V(0, 0.2, 0));
  shock.scale.setScalar(0.8 + easeOutCubic(sk) * 5);
  shock.material.opacity = 1 - sk;
}
function posePrivacy(p, d) {
  return pose(V(PORTRAIT ? 0.4 : 0.5, PORTRAIT ? -0.8 : -0.4, 0), V(0.18 + p * 0.02, 0.12, 1), PORTRAIT ? 11.6 : 12, PORTRAIT ? 9 : 10.4, PORTRAIT ? -0.03 : -0.1);
}

// =====================================================================
// Scene 7: call to action — the ShipProof logo
// =====================================================================
const cta = new THREE.Group();
scene.add(cta);
const logo = new THREE.Group();
const checkPts = [
  [8, 17.5],
  [13, 22.5],
  [24, 10.5],
].map(([x, y]) => V(((x - 16) / 32) * 3, (-(y - 16) / 32) * 3, 0.34));
const checkPath = new THREE.CurvePath();
checkPath.add(new THREE.LineCurve3(checkPts[0], checkPts[1]));
checkPath.add(new THREE.LineCurve3(checkPts[1], checkPts[2]));
const checkGeo = new THREE.TubeGeometry(checkPath, 128, 0.16, 16, false);
const checkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.3 });
const check = new THREE.Mesh(checkGeo, checkMat);
const capA = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), checkMat);
const capB = capA.clone();
capA.position.copy(checkPts[0]);
{
  const tile = new THREE.Mesh(
    new RoundedBoxGeometry(3, 3, 0.6, 6, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x086647, metalness: 0.35, roughness: 0.3 }),
  );
  logo.add(tile, check, capA, capB);
  cta.add(logo);
}
const sparks = (() => {
  const r = rng(5);
  const n = 220;
  const dirs = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, b = (r() - 0.5) * 1.2;
    dirs.push(V(Math.cos(a) * Math.cos(b), Math.sin(b) + (r() - 0.5) * 0.4, Math.sin(a) * Math.cos(b)).multiplyScalar(2 + r() * 5));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(g, roundPoints(new THREE.Color(0.6, 4, 2.2), 0.09, 1, 9));
  pts.frustumCulled = false;
  pts.userData.dirs = dirs;
  cta.add(pts);
  return pts;
})();
const halo = new THREE.Mesh(
  new THREE.TorusGeometry(2.4, 0.03, 8, 128),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 4, 2), transparent: true }),
);
cta.add(halo);
const CHECK_AT = 0.85, CHECK_DONE = 1.45;
function updateCta(p, d) {
  const k = range(p, 0, 1.0);
  logo.rotation.set(Math.sin(p * 0.8) * 0.06, lerp(-Math.PI * 1.5, 0, easeOutBack(k, 1.2)) + Math.sin(p * 0.6) * 0.12, 0);
  logo.scale.setScalar(Math.max(0.001, lerp(0.2, 1, easeOutCubic(k))));
  logo.position.y = Math.sin(p * 1.3) * 0.05;
  const ck = easeInOutCubic(range(p, CHECK_AT, CHECK_DONE));
  const total = checkGeo.index.count;
  const seg = 16 * 6;
  check.geometry.setDrawRange(0, Math.floor((total * ck) / seg) * seg);
  capA.visible = ck > 0;
  capB.visible = ck > 0;
  capB.position.copy(checkPath.getPointAt(Math.max(ck, 0.0001)));
  checkMat.emissiveIntensity = 0.5 + 2.5 * range(p, CHECK_DONE - 0.05, CHECK_DONE) * (1 - range(p, CHECK_DONE, CHECK_DONE + 0.8));
  const sk = range(p, CHECK_DONE, CHECK_DONE + 1.6);
  sparks.visible = sk > 0 && sk < 1;
  const arr = sparks.geometry.attributes.position.array;
  sparks.userData.dirs.forEach((dv, i) => {
    const f = easeOutCubic(sk);
    arr[i * 3] = dv.x * f;
    arr[i * 3 + 1] = dv.y * f - sk * sk * 0.6;
    arr[i * 3 + 2] = dv.z * f;
  });
  sparks.geometry.attributes.position.needsUpdate = true;
  sparks.material.uniforms.opacity.value = 1 - sk;
  const hk = range(p, CHECK_DONE, CHECK_DONE + 1.2);
  halo.visible = hk > 0 && hk < 1;
  halo.scale.setScalar(0.6 + easeOutCubic(hk) * 2.2);
  halo.material.opacity = 1 - hk;
}
function poseCta(p, d) {
  return pose(V(0, 0, 0), V(Math.sin(p * 0.2) * 0.12, 0.06, 1), PORTRAIT ? 7.6 : 7.4, PORTRAIT ? 6.6 : 7.6, PORTRAIT ? 0.17 : 0.21);
}

// =====================================================================
// Overlay text
// =====================================================================
const caps = [];
function cap(scene, at, html, cls, top, opts = {}) {
  if (!s[scene]) return null;
  const el = document.createElement("div");
  el.className = "cap " + cls;
  el.innerHTML = html;
  el.style.top = top + "%";
  ov.appendChild(el);
  const c = { el, scene, at, out: opts.out, dy: opts.dy ?? 1 };
  caps.push(c);
  return c;
}
const T = (yt, ig) => (IG ? ig : yt);
// Reels UI covers roughly the top 12% and bottom 22%: keep text between.
cap("hook", 0.35, "Is your courier", "h1", T(14, 17));
cap("hook", T(0.75, 0.6), '<span class="red">overcharging you?</span>', "h1", T(24, 23));
cap("scan", 0.25, "We check <span class='grn'>every AWB.</span>", "h1", T(8, 13));
cap("scan", 0.6, "Weight · slabs · pincode zones · COD · RTO · GST", "h2", T(18.5, 19.5));
const scanCounter = cap("scan", 0.9, "", "", T(91, 74));
cap("issues", 0.3, `<span class="red">${DATA.issues} overcharges</span> found`, "h1", T(6, 13));
cap("issues", 0.6, `across ${DATA.affected} of ${DATA.audited} shipments`, "h2", T(16, 19));
cap("money", 0.45, "", "backdrop", T(46, 45));
cap("money", 0.55, "Money you can recover", "h2", T(30, 36));
const moneyCounter = cap("money", 0.6, inr(0), "mega", T(41, 42));
cap("money", 1.9, `from one courier invoice · ${DATA.pct}% of the bill`, "h2", T(60, 54), {});
cap("how", 0.1, "How it works", "h1", 6);
cap("how", 0.5, "Three files in. A refund list out. About 2 minutes.", "h2", 16);
cap("privacy", 0.2, "Your files never<br>leave your browser.", "h1", T(12, 15));
cap("privacy", 1.1, "No upload · No sign-up · Free", "h2", T(92, 72));
cap("cta", 1.35, 'Ship<span class="grn">Proof</span>', "word", T(57, 53), { out: 99 });
cap("cta", 1.75, "Is your courier overcharging you?<br>Find out in 2 minutes.", "h2", T(70, 61), { out: 99 });
cap("cta", 2.2, '<span class="pill">Run a free audit →</span>', "", T(83, 70), { out: 99 });
cap("cta", 2.6, IG ? `Link in bio · ${DATA.url}` : DATA.url, "h3", T(93, 77), { out: 99 });

// Bar labels for the issues scene (positioned by projecting 3D points).
const barLabels = DATA.types.map(([label, count, amt]) => {
  const el = document.createElement("div");
  el.className = "barlab";
  el.innerHTML = `<span>${label}</span><span><b>${count}×</b> &nbsp;${inr(amt)}</span>`;
  ov.appendChild(el);
  return el;
});
function project(v) {
  const p = v.clone().project(camera);
  return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H };
}

function updateOverlay(t) {
  for (const c of caps) {
    const sc = s[c.scene];
    const p = t - sc.start;
    const outAt = c.out ?? sc.dur - 0.3;
    const a = easeOutCubic(range(p, c.at, c.at + 0.5));
    const o = 1 - range(p, outAt, outAt + 0.25);
    const v = t < sc.start || t > sc.end + 0.01 ? 0 : a * o;
    c.el.style.opacity = v.toFixed(3);
    c.el.style.transform = `translateY(calc(-50% + ${((1 - a) * 3 * c.dy).toFixed(2)} * var(--u))) scale(${(0.96 + 0.04 * a).toFixed(4)})`;
    c.el.style.filter = a < 1 ? `blur(${((1 - a) * 10).toFixed(1)}px)` : "";
  }
  // live counters
  if (scanCounter) {
    const p = t - s.scan.start;
    let n = 0, f = 0;
    for (let i = 0; i < DATA.audited; i++)
      if (scannedAt(i) <= p) {
        n++;
        if (flagged.has(i)) f++;
      }
    scanCounter.el.innerHTML = `<span class="counter"><span>${n}<small> / ${DATA.audited} checked</small></span><span class="red">${f}<small> flagged</small></span></span>`;
  }
  if (moneyCounter) {
    const p = t - s.money.start;
    moneyCounter.el.textContent = inr(Math.round(DATA.total * easeOutCubic(range(p, 0.6, 2.8)) * 100) / 100);
  }
  // bar labels
  const pi = t - s.issues.start;
  barLabels.forEach((el, row) => {
    const on = t >= s.issues.start && t < s.issues.end;
    const a = easeOutCubic(range(pi, 1.0 + row * 0.12, 1.5 + row * 0.12)) * (1 - range(pi, s.issues.dur - 0.45, s.issues.dur - 0.2));
    el.style.opacity = on ? a.toFixed(3) : "0";
    if (!on) return;
    const L = project(barPos(row, 0).add(V(-BAR_SP * BAR_S, BAR_S * 0.62, 0)));
    const R = project(barPos(row, 11).add(V(BAR_SP * BAR_S, BAR_S * 0.62, 0)));
    el.style.left = L.x + "px";
    el.style.width = R.x - L.x + "px";
    el.style.top = L.y + "px";
    el.style.transform = `translateY(-100%) translateX(${((1 - a) * -20).toFixed(1)}px)`;
  });
}

// =====================================================================
// Frame
// =====================================================================
const SCENES = {
  hook: { group: hook, update: updateHook, pose: poseHook },
  scan: { group: null, update: () => {}, pose: poseScan },
  issues: { group: null, update: () => {}, pose: poseIssues },
  money: { group: coins, update: updateMoney, pose: poseMoney },
  how: { group: how, update: updateHow, pose: poseHow },
  privacy: { group: priv, update: updatePrivacy, pose: posePrivacy },
  cta: { group: cta, update: updateCta, pose: poseCta },
};

function sceneAt(t) {
  for (const id of TL.order) if (t < s[id].end) return id;
  return TL.order[TL.order.length - 1];
}

function renderAt(t) {
  t = clamp(t, 0, TL.total - 1e-4);
  const cur = sceneAt(t);
  for (const id of Object.keys(SCENES)) {
    const g = SCENES[id].group;
    if (g) g.visible = id === cur;
  }
  flash.visible = false;
  flare.intensity = 0;
  bgMat.uniforms.tint.value.setRGB(0, 0, 0);
  const sc = s[cur];
  const p = t - sc.start;
  SCENES[cur].update(p, sc.dur, t);
  updateParcels(t);

  // Camera, with a smooth hand-off for continuous scenes.
  let ps = SCENES[cur].pose(p, sc.dur);
  const idx = TL.order.indexOf(cur);
  if (CONTINUOUS.has(cur) && idx > 0) {
    const prev = TL.order[idx - 1];
    const pp = SCENES[prev].pose(s[prev].dur, s[prev].dur);
    ps = blendPose(pp, ps, easeInOutCubic(range(p, 0, 1.3)));
  }
  camera.position.copy(ps.pos);
  camera.lookAt(ps.target);
  if (ps.offY) camera.setViewOffset(W, H, 0, ps.offY * H, W, H);
  else camera.clearViewOffset();
  camera.updateMatrixWorld();
  bg.position.copy(camera.position);

  dust.rotation.y = t * 0.03;
  dust.position.y = Math.sin(t * 0.2) * 0.6;

  // Quick dip to black at hard cuts.
  let f = 0;
  for (const id of TL.order.slice(1)) {
    if (CONTINUOUS.has(id)) continue;
    const dc = Math.abs(t - s[id].start);
    f = Math.max(f, 1 - range(dc, 0.04, 0.24));
  }
  f = Math.max(f, 1 - range(t, 0, 0.3));
  fade.style.opacity = f.toFixed(3);

  updateOverlay(t);
  composer.render();
}

window.__timeline = TL;
window.__seek = (t) => renderAt(t);
renderAt(params.has("t") ? parseFloat(params.get("t")) : 0);
window.__ready = true;

// Live preview in a normal browser: ?play
if (params.has("play")) {
  const t0 = performance.now();
  const loop = () => {
    renderAt(((performance.now() - t0) / 1000) % TL.total);
    requestAnimationFrame(loop);
  };
  loop();
}
