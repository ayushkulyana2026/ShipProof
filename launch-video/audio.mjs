// Procedurally generated soundtrack (no samples): 120 BPM pad + bass + drums,
// with whooshes, hits and sound effects placed on the video's scene timeline.
import fs from "node:fs";

const SR = 44100;
const BEAT = 0.5;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function writeSoundtrack(tl, file) {
  const S = tl.scenes;
  const total = tl.total;
  const N = Math.ceil(total * SR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const rand = rng(1234);
  const add = (i, v, pan = 0) => {
    if (i < 0 || i >= N) return;
    L[i] += v * (1 - pan) * 0.5 * 2 ** 0.5;
    R[i] += v * (1 + pan) * 0.5 * 2 ** 0.5;
  };

  const dropAt = S.scan.start;
  const ctaAt = S.cta.start;

  // --- pad: Am F C G, one chord per bar, brighter after the drop ---
  const chords = [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [55, 60, 64, 67],
    [55, 59, 62, 67],
  ];
  const final = [48, 55, 60, 64, 67, 72]; // C major on the logo
  const padVoice = (t0, dur, notes, amp, harm, att = 0.25, rel = 0.6) => {
    const n0 = Math.floor(t0 * SR), n1 = Math.min(N, Math.floor((t0 + dur + rel) * SR));
    for (const note of notes) {
      for (const det of [-0.0035, 0.0035]) {
        const f = midi(note) * (1 + det);
        const ph0 = rand() * 6.28;
        for (let i = n0; i < n1; i++) {
          const t = (i - n0) / SR;
          const env = Math.min(1, t / att) * (t > dur ? Math.max(0, 1 - (t - dur) / rel) : 1);
          let v = 0;
          for (let h = 1; h <= harm; h++) v += Math.sin(6.2832 * f * h * t + ph0 * h) / (h * h * 0.6 + 0.4);
          add(i, v * env * amp, det > 0 ? 0.35 : -0.35);
        }
      }
    }
  };
  for (let bar = 0; bar * 2 < ctaAt; bar++) {
    const t0 = bar * 2;
    const dur = Math.min(2, ctaAt - t0);
    padVoice(t0, dur, chords[bar % 4], 0.018, t0 < dropAt ? 3 : 5, 0.3, 0.5);
  }
  padVoice(ctaAt, total - ctaAt - 0.2, final, 0.02, 5, 0.05, 1.2);

  // --- bass: pulsing eighths on the chord root after the drop ---
  for (let t = dropAt; t < ctaAt; t += BEAT / 2) {
    const bar = Math.floor(t / 2);
    const f = midi(chords[bar % 4][0] - 24);
    const n0 = Math.floor(t * SR);
    for (let i = 0; i < SR * 0.24; i++) {
      const tt = i / SR;
      const env = Math.exp(-tt * 9) * Math.min(1, tt * 400);
      add(n0 + i, (Math.sin(6.2832 * f * tt) + 0.3 * Math.sin(6.2832 * f * 2 * tt)) * env * 0.16);
    }
  }

  // --- drums ---
  const kick = (t, amp = 0.55) => {
    const n0 = Math.floor(t * SR);
    let ph = 0;
    for (let i = 0; i < SR * 0.45; i++) {
      const tt = i / SR;
      const f = 45 + 110 * Math.exp(-tt * 28);
      ph += (6.2832 * f) / SR;
      add(n0 + i, Math.sin(ph) * Math.exp(-tt * 7) * amp);
    }
  };
  const hat = (t, amp = 0.05, decay = 60) => {
    const n0 = Math.floor(t * SR);
    let prev = 0;
    for (let i = 0; i < SR * 0.08; i++) {
      const w = rand() * 2 - 1;
      const hp = w - prev;
      prev = w;
      add(n0 + i, hp * Math.exp(-(i / SR) * decay) * amp, 0.3);
    }
  };
  const clap = (t, amp = 0.12) => {
    const n0 = Math.floor(t * SR);
    for (let i = 0; i < SR * 0.18; i++) {
      const tt = i / SR;
      const env = (Math.exp(-tt * 30) + 0.5 * Math.exp(-Math.max(0, tt - 0.012) * 25)) * Math.min(1, tt * 2000);
      add(n0 + i, (rand() * 2 - 1) * env * amp, -0.15);
    }
  };
  // heartbeat during the hook
  for (let t = 0.5; t < dropAt - 0.6; t += 1) {
    kick(t, 0.32);
    kick(t + 0.22, 0.2);
  }
  for (let t = dropAt; t < ctaAt - 0.01; t += BEAT) {
    const inPrivacy = S.privacy && t >= S.privacy.start;
    kick(t, inPrivacy ? 0.35 : 0.55);
    hat(t + BEAT / 2, 0.06);
    hat(t + BEAT / 4, 0.025, 90);
    const beatInBar = Math.round((t - dropAt) / BEAT) % 4;
    if (beatInBar === 1 || beatInBar === 3) clap(t, inPrivacy ? 0.06 : 0.1);
  }

  // --- transitions: whoosh into each cut, impact on it ---
  const whoosh = (tEnd, len = 0.7, amp = 0.22) => {
    const n0 = Math.floor((tEnd - len) * SR);
    let lp = 0;
    for (let i = 0; i < len * SR; i++) {
      const k = i / (len * SR);
      const a = 0.02 + 0.5 * k * k;
      lp += a * ((rand() * 2 - 1) - lp);
      add(n0 + i, lp * k * k * amp * 3, Math.sin(k * 3.14) * 0.6 - 0.3);
    }
  };
  const impact = (t, amp = 0.5) => {
    const n0 = Math.floor(t * SR);
    for (let i = 0; i < SR * 1.2; i++) {
      const tt = i / SR;
      add(n0 + i, Math.sin(6.2832 * 52 * tt) * Math.exp(-tt * 3.2) * amp + (rand() * 2 - 1) * Math.exp(-tt * 40) * amp * 0.25);
    }
  };
  for (const id of tl.order.slice(1)) {
    whoosh(S[id].start);
    impact(S[id].start, id === "scan" || id === "cta" ? 0.55 : 0.32);
  }

  // --- sfx ---
  const bell = (t, f, amp = 0.08, decay = 3, pan = 0) => {
    const n0 = Math.floor(t * SR);
    const parts = [
      [1, 1],
      [2.76, 0.45],
      [5.4, 0.22],
      [8.93, 0.1],
    ];
    for (let i = 0; i < SR * 1.6; i++) {
      const tt = i / SR;
      let v = 0;
      for (const [m, a] of parts) v += Math.sin(6.2832 * f * m * tt) * a * Math.exp(-tt * decay * m ** 0.5);
      add(n0 + i, v * amp * Math.min(1, tt * 800), pan);
    }
  };
  const blip = (t, f, amp = 0.07, pan = 0) => {
    const n0 = Math.floor(t * SR);
    for (let i = 0; i < SR * 0.12; i++) {
      const tt = i / SR;
      add(n0 + i, Math.sin(6.2832 * f * tt) * Math.exp(-tt * 35) * amp, pan);
    }
  };
  // hook: ominous ding on the red ring
  bell(S.hook.dur * 0.5, midi(81), 0.06, 2.5);
  // scan: blips for flagged parcels as the laser passes
  const sweep0 = S.scan.start + 0.9, sweep1 = S.scan.end - 0.5;
  for (let k = 0; k < 31; k++) {
    const t = sweep0 + (sweep1 - sweep0) * rand();
    blip(t, midi([76, 79, 81, 84][k % 4]), 0.05, rand() - 0.5);
  }
  // issues: plucks as boxes land in their bars (rising pentatonic)
  const penta = [69, 72, 74, 76, 79, 81, 84, 86];
  for (let j = 0; j < 31; j++) {
    const t = S.issues.start + 0.15 + j * 0.035 + 1.0;
    blip(t, midi(penta[j % penta.length] + (j > 15 ? 12 : 0)), 0.035, (j / 31) * 1.2 - 0.6);
  }
  // money: riser into the reveal, then coins
  {
    const t0 = S.money.start - 1.2, len = 1.7;
    const n0 = Math.floor(t0 * SR);
    let ph = 0, lp = 0;
    for (let i = 0; i < len * SR; i++) {
      const k = i / (len * SR);
      ph += (6.2832 * (200 + 900 * k * k)) / SR;
      lp += (0.05 + 0.4 * k) * ((rand() * 2 - 1) - lp);
      add(n0 + i, (Math.sin(ph) * 0.05 + lp * 0.25) * k * k);
    }
    impact(S.money.start + 0.5, 0.6);
    for (let c = 0; c < 46; c++) {
      const t = S.money.start + 0.55 + Math.pow(rand(), 1.6) * 2.6;
      bell(t, 1800 + rand() * 1600, 0.022, 9, rand() * 1.4 - 0.7);
    }
    bell(S.money.start + 2.8, midi(88), 0.07, 2.2); // counter lands
  }
  // privacy: lock clicks shut
  if (S.privacy) {
    const t = S.privacy.start + 1.0;
    const n0 = Math.floor(t * SR);
    for (let i = 0; i < SR * 0.06; i++) add(n0 + i, (rand() * 2 - 1) * Math.exp(-(i / SR) * 90) * 0.35);
    impact(t, 0.25);
    bell(t + 0.05, midi(76), 0.04, 4);
  }
  // cta: shimmering ding as the check completes
  bell(ctaAt + 1.45, midi(84), 0.09, 1.6, -0.2);
  bell(ctaAt + 1.47, midi(91), 0.05, 1.8, 0.2);

  // --- simple stereo echo for space ---
  const dl = Math.floor(0.375 * SR);
  for (let i = dl; i < N; i++) {
    L[i] += R[i - dl] * 0.22;
    R[i] += L[i - dl] * 0.22;
  }

  // --- master: soft clip, fades, normalise ---
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fadeIn = Math.min(1, t / 0.05);
    const fadeOut = Math.min(1, (total - t) / 1.2);
    L[i] = Math.tanh(L[i] * 1.3) * fadeIn * fadeOut;
    R[i] = Math.tanh(R[i] * 1.3) * fadeIn * fadeOut;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / (peak || 1);
  const buf = Buffer.alloc(44 + N * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + N * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}
