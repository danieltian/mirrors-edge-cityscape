import * as THREE from 'three';
import { RNG } from '../util/rng.js';

// Procedural office textures, all drawn on canvases: albedo plus normal and
// roughness maps for floors, carpet, ceilings, walls, concrete, wood, leather
// and brushed metal; decals (diffusers, wall-wash light, exit signs); the
// skyline facades; and per-office artwork, TV screens and logos.
// Surface textures are shared by every office and built once.

const shared = new Map();
function once(key, make) {
  if (!shared.has(key)) shared.set(key, make());
  return shared.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function toTexture(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Tileable fbm value noise on a small grid (res x res), sampled bilinearly.
function field(rng, res, cells, octaves = 4, gain = 0.5, cellsY = cells) {
  const out = new Float32Array(res * res);
  let amp = 1;
  let total = 0;
  let cx = cells;
  let cy = cellsY;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(cx * cy);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
    for (let y = 0; y < res; y++) {
      const gy = (y / res) * cy;
      const y0 = Math.floor(gy);
      let fy = gy - y0;
      fy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % cy) * cx;
      const r1 = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < res; x++) {
        const gx = (x / res) * cx;
        const x0 = Math.floor(gx);
        let fx = gx - x0;
        fx = fx * fx * (3 - 2 * fx);
        const x1 = (x0 + 1) % cx;
        const a = lat[r0 + x0] + (lat[r0 + x1] - lat[r0 + x0]) * fx;
        const b = lat[r1 + x0] + (lat[r1 + x1] - lat[r1 + x0]) * fx;
        out[y * res + x] += (a + (b - a) * fy) * amp;
      }
    }
    total += amp;
    amp *= gain;
    cx *= 2;
    cy *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return { res, data: out };
}

// Bilinear, wrapping lookup of a field at u, v in [0, 1).
function samp(f, u, v) {
  const { res, data } = f;
  const x = u * res - 0.5;
  const y = v * res - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = ((x0 % res) + res) % res;
  const xb = (xa + 1) % res;
  const ya = (((y0 % res) + res) % res) * res;
  const yb = ((ya / res + 1) % res) * res;
  const a = data[ya + xa] + (data[ya + xb] - data[ya + xa]) * fx;
  const b = data[yb + xa] + (data[yb + xb] - data[yb + xa]) * fx;
  return a + (b - a) * fy;
}

// Height field -> tangent-space normal map (wrapping, canvas y down = -v).
function normalMap(hgt, w, h, strength) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w;
    const yp = ((y + 1) % h) * w;
    const yc = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w;
      const xp = (x + 1) % w;
      const nx = -(hgt[yc + xp] - hgt[yc + xm]) * strength;
      const ny = (hgt[yp + x] - hgt[ym + x]) * strength;
      const l = Math.sqrt(nx * nx + ny * ny + 1);
      const i = (yc + x) * 4;
      d[i] = (nx / l) * 127.5 + 127.5;
      d[i + 1] = (ny / l) * 127.5 + 127.5;
      d[i + 2] = (1 / l) * 127.5 + 127.5;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

function grayMap(vals, w, h) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < vals.length; i++) {
    const v = clamp01(vals[i]) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

// Per-pixel writer for albedo canvases.
function paint(w, h, fn) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const d = img.data;
  const rgb = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn(x, y, rgb);
      const i = (y * w + x) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return [c, g];
}

// ------------------------------------------------------------------ floors

// Large-format porcelain: 0.6 m tiles, 4 x 4 per texture (covers 2.4 m).
export function floorTiles(dark = false) {
  return once(dark ? 'tileDark' : 'tile', () => {
    const rng = new RNG(dark ? 71 : 17);
    const S = 1024;
    const N = 4;
    const P = S / N;
    const mott = field(rng, 256, 5, 5, 0.55);
    const cloud = field(rng, 256, 3, 3, 0.6);
    const smudge = field(rng, 256, 7, 4, 0.6);
    const tone = Array.from({ length: N * N }, () => rng.range(-1, 1));
    const hgt = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    const G = 1.7;
    const [c] = paint(S, S, (x, y, out) => {
      const tx = Math.floor(x / P);
      const ty = Math.floor(y / P);
      const lx = x - tx * P + 0.5;
      const ly = y - ty * P + 0.5;
      const e = Math.min(lx, P - lx, ly, P - ly);
      const i = y * S + x;
      const u = x / S;
      const v = y / S;
      const grain = rng.next() - 0.5;
      if (e < G) {
        const gv = dark ? 118 : 120;
        out[0] = out[1] = out[2] = gv + grain * 6;
        hgt[i] = 0;
        rough[i] = 0.85;
        return;
      }
      const bev = Math.min(1, (e - G) / 2.5);
      const t = tone[ty * N + tx];
      const m = samp(mott, u, v) - 0.5;
      const cl = samp(cloud, u + tx * 0.13, v + ty * 0.29) - 0.5;
      let val = dark ? 70 + t * 5 + m * 16 + cl * 10 + grain * 7 : 221 + t * 3 + m * 8 + cl * 6 + grain * 4;
      val *= 0.93 + 0.07 * bev;
      out[0] = val + (dark ? 0 : 1);
      out[1] = val + (dark ? 1 : 0.5);
      out[2] = val + (dark ? 3 : -1.5);
      hgt[i] = 0.4 + 0.6 * Math.sqrt(bev) + grain * 0.015;
      const s = samp(smudge, u, v);
      rough[i] = (dark ? 0.16 : 0.15) + s * s * 0.3 + Math.abs(t) * 0.04;
    });
    return {
      map: toTexture(c),
      normalMap: normalMap(hgt, S, S, 2.2),
      roughnessMap: grayMap(rough, S, S),
    };
  });
}

// Carpet tiles: 0.5 m, laid quarter-turned (checkerboard of pile direction),
// 4 x 4 per texture (covers 2 m). Neutral, tinted by the material colour.
export function carpet() {
  return once('carpet', () => {
    const rng = new RNG(29);
    const S = 1024;
    const P = S / 4;
    const tuft = field(rng, 512, 96, 2, 0.5);
    const low = field(rng, 128, 6, 3, 0.5);
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const tx = Math.floor(x / P);
      const ty = Math.floor(y / P);
      const along = (tx + ty) % 2 === 0;
      const q = along ? y : x;
      const stripe = 0.5 + 0.5 * Math.sin(q * 2.1 + samp(tuft, x / S, y / S) * 6);
      const n = rng.next();
      const t = samp(tuft, x / S, y / S);
      const edge = Math.min(x % P, P - 1 - (x % P), y % P, P - 1 - (y % P)) < 1 ? 0.06 : 0;
      const shade = along ? 0.015 : -0.015;
      let v = 0.84 + (t - 0.5) * 0.26 + (n - 0.5) * 0.2 + (stripe - 0.5) * 0.06 + (samp(low, x / S, y / S) - 0.5) * 0.06 + shade - edge;
      v = clamp01(v) * 255;
      out[0] = out[1] = out[2] = v;
      hgt[y * S + x] = t * 0.7 + n * 0.35 + stripe * 0.15;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 2.4) };
  });
}

// ---------------------------------------------------------------- ceilings

// Mineral-fibre lay-in tiles on an exposed grid: 0.6 m, covers 2.4 m.
export function ceilingLayIn() {
  return once('ceilLayIn', () => {
    const rng = new RNG(41);
    const S = 1024;
    const P = S / 4;
    const hgt = new Float32Array(S * S);
    const mott = field(rng, 128, 8, 3, 0.5);
    const [c, g] = paint(S, S, (x, y, out) => {
      const lx = (x % P) + 0.5;
      const ly = (y % P) + 0.5;
      const e = Math.min(lx, P - lx, ly, P - ly);
      const n = rng.next() - 0.5;
      let v;
      if (e < 5) {
        v = 238 + n * 3;
        hgt[y * S + x] = 1;
      } else {
        const bev = Math.min(1, (e - 5) / 2);
        v = (e < 6.5 ? 196 : 244) + (samp(mott, x / S, y / S) - 0.5) * 6 + n * 5;
        hgt[y * S + x] = 0.55 - bev * 0.15 + n * 0.05;
      }
      out[0] = v;
      out[1] = v;
      out[2] = v - 1;
    });
    // Fissures and pinholes.
    g.lineCap = 'round';
    for (let i = 0; i < 1600; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const lx = x % P;
      const ly = y % P;
      if (lx < 12 || ly < 12 || lx > P - 12 || ly > P - 12) continue;
      g.strokeStyle = `rgba(120,120,116,${rng.range(0.12, 0.3)})`;
      g.lineWidth = rng.range(0.8, 1.6);
      g.beginPath();
      g.moveTo(x, y);
      let a = rng.range(0, Math.PI * 2);
      let px = x;
      let py = y;
      for (let k = 0; k < rng.int(2, 4); k++) {
        a += rng.range(-1, 1);
        px += Math.cos(a) * rng.range(2, 5);
        py += Math.sin(a) * rng.range(2, 5);
        g.lineTo(px, py);
      }
      g.stroke();
    }
    for (let i = 0; i < 9000; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const lx = x % P;
      const ly = y % P;
      if (lx < 9 || ly < 9 || lx > P - 9 || ly > P - 9) continue;
      g.fillStyle = `rgba(110,110,106,${rng.range(0.15, 0.4)})`;
      g.fillRect(x, y, 1.3, 1.3);
    }
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 1.6) };
  });
}

// Perforated metal ceiling tiles: plain border, micro-perforated field.
export function ceilingPerf() {
  return once('ceilPerf', () => {
    const rng = new RNG(43);
    const S = 1024;
    const P = S / 4;
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const lx = (x % P) + 0.5;
      const ly = (y % P) + 0.5;
      const e = Math.min(lx, P - lx, ly, P - ly);
      const n = rng.next() - 0.5;
      let v;
      let h;
      if (e < 2) {
        v = 150;
        h = 0;
      } else if (e < 30) {
        v = e < 3.5 ? 214 : 243;
        h = e < 3.5 ? 0.6 : 1;
      } else if (e < 32) {
        v = 226;
        h = 0.9;
      } else {
        // Diagonal hole pattern, 7 px pitch.
        const row = Math.floor(ly / 7);
        const ox = row % 2 ? 3.5 : 0;
        const dx = ((lx + ox) % 7) - 3.5;
        const dy = (ly % 7) - 3.5;
        const hole = dx * dx + dy * dy < 2.6;
        v = hole ? 150 : 236;
        h = hole ? 0.55 : 1;
      }
      out[0] = v + n * 3;
      out[1] = v + n * 3;
      out[2] = v + n * 3 - 1;
      hgt[y * S + x] = h;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 1.2) };
  });
}

// ------------------------------------------------------------------- walls

// Painted plaster, optionally in large panels with shadow-gap reveals
// (1.2 m wide, 2.4 m tall). Neutral: tinted by the material colour.
export function wallTexture(panel) {
  return once(panel ? 'wallPanel' : 'wall', () => {
    const rng = new RNG(panel ? 53 : 51);
    const S = 1024;
    const mott = field(rng, 256, 4, 5, 0.55);
    const stip = field(rng, 512, 160, 2, 0.5);
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const u = x / S;
      const v = y / S;
      const st = samp(stip, u, v);
      let val = 236 + (samp(mott, u, v) - 0.5) * 9 + (st - 0.5) * 7;
      let h = st * 0.35;
      if (panel) {
        const ex = Math.min(x % 512, 512 - (x % 512));
        const ey = Math.min(y, S - y);
        const e = Math.min(ex, ey);
        if (e < 2.5) {
          val = 150;
          h = -1;
        } else if (e < 4) {
          val -= 18;
          h = -0.3;
        }
        // Slight tone difference per panel.
        val += (Math.floor(x / 512) ? 1.5 : -1.5);
      }
      out[0] = val;
      out[1] = val;
      out[2] = val - 1;
      hgt[y * S + x] = h;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 1.8) };
  });
}

// Architectural concrete: 2.4 x 1.2 m formwork panels with tie holes,
// bug holes and cloudy tone (covers 4.8 x 2.4 m).
export function concrete() {
  return once('concrete', () => {
    const rng = new RNG(61);
    const W = 2048;
    const H = 1024;
    const PW = 1024;
    const PH = 512;
    const cloud = field(rng, 256, 4, 5, 0.6);
    const fine = field(rng, 512, 64, 2, 0.5);
    const tone = Array.from({ length: 4 }, () => rng.range(-1, 1));
    const hgt = new Float32Array(W * H);
    const [c, g] = paint(W, H, (x, y, out) => {
      const u = x / W;
      const v = y / H;
      const px = Math.floor(x / PW);
      const py = Math.floor(y / PH);
      const e = Math.min(x % PW, PW - (x % PW), y % PH, PH - (y % PH));
      const cl = samp(cloud, u, v);
      const f = samp(fine, u, v);
      const n = rng.next() - 0.5;
      let val = 186 + tone[py * 2 + px] * 5 + (cl - 0.5) * 26 + (f - 0.5) * 10 + n * 6;
      let h = 0.6 + cl * 0.08 + f * 0.08;
      if (e < 1.8) {
        val -= 42;
        h = 0;
      } else if (e < 3.5) {
        val += 6;
        h = 0.45;
      }
      out[0] = val;
      out[1] = val - 0.5;
      out[2] = val - 3;
      hgt[y * W + x] = h;
    });
    // Bug holes.
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(0.7, 2.4);
      g.fillStyle = `rgba(70,70,68,${rng.range(0.25, 0.6)})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= r * r) hgt[(((yi + dy + H) % H) * W) + ((xi + dx + W) % W)] = 0.35;
    }
    // Tie holes with faint rust-free drip streaks.
    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        for (const fx of [1 / 6, 1 / 2, 5 / 6]) {
          for (const fy of [1 / 4, 3 / 4]) {
            const x = px * PW + fx * PW;
            const y = py * PH + fy * PH;
            const sg = g.createLinearGradient(x, y, x, y + rng.range(40, 140));
            sg.addColorStop(0, `rgba(90,90,88,${rng.range(0.05, 0.12)})`);
            sg.addColorStop(1, 'rgba(90,90,88,0)');
            g.fillStyle = sg;
            g.fillRect(x - 3, y, 6, 150);
            g.fillStyle = 'rgba(225,225,220,0.5)';
            g.beginPath();
            g.arc(x, y, 12, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(58,58,56,0.9)';
            g.beginPath();
            g.arc(x, y, 7, 0, Math.PI * 2);
            g.fill();
            for (let dy = -12; dy <= 12; dy++) {
              for (let dx = -12; dx <= 12; dx++) {
                const d2 = dx * dx + dy * dy;
                if (d2 > 144) continue;
                hgt[Math.floor(y + dy) * W + Math.floor(x + dx)] = d2 < 49 ? 0.05 : 0.5;
              }
            }
          }
        }
      }
    }
    return { map: toTexture(c), normalMap: normalMap(hgt, W, H, 2.0) };
  });
}

// ------------------------------------------------------------- materials

// Walnut veneer, grain along u (covers 2 x 1 m).
export function wood() {
  return once('wood', () => {
    const rng = new RNG(67);
    const W = 1024;
    const H = 512;
    const grain = field(rng, 512, 2, 4, 0.55, 48);
    const fig = field(rng, 128, 6, 3, 0.5);
    const hgt = new Float32Array(W * H);
    const rough = new Float32Array(W * H);
    const [c] = paint(W, H, (x, y, out) => {
      const u = x / W;
      const v = y / H;
      const gr = samp(grain, u, v);
      const ring = 0.5 + 0.5 * Math.sin(gr * 70 + samp(fig, u, v) * 5);
      const n = rng.next() - 0.5;
      const t = ring * 0.55 + (samp(fig, u, v) - 0.5) * 0.4 + n * 0.08;
      out[0] = 104 + t * 58;
      out[1] = 56 + t * 34;
      out[2] = 34 + t * 20;
      hgt[y * W + x] = ring * 0.3 + n * 0.05;
      rough[y * W + x] = 0.26 + ring * 0.12;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, W, H, 0.8), roughnessMap: grayMap(rough, W, H) };
  });
}

// Brushed steel: streaky roughness only.
export function brushed() {
  return once('brushed', () => {
    const rng = new RNG(73);
    const S = 512;
    const streak = field(rng, 512, 3, 3, 0.5, 220);
    const rough = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) rough[y * S + x] = 0.22 + samp(streak, x / S, y / S) * 0.2 + (rng.next() - 0.5) * 0.04;
    return { roughnessMap: grayMap(rough, S, S) };
  });
}

// Pebbled leather / vinyl upholstery.
export function leather() {
  return once('leather', () => {
    const rng = new RNG(79);
    const S = 512;
    const cell = field(rng, 512, 40, 2, 0.4);
    const crease = field(rng, 256, 6, 3, 0.5);
    const hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const c = samp(cell, x / S, y / S);
        const k = Math.abs(samp(crease, x / S, y / S) - 0.5);
        hgt[y * S + x] = Math.abs(c - 0.5) * 0.8 + Math.min(k * 6, 1) * 0.3;
      }
    }
    return { normalMap: normalMap(hgt, S, S, 1.4) };
  });
}

// ------------------------------------------------------------------ decals

// Square ceiling air diffuser.
export function diffuser() {
  return once('diffuser', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#e9e9e7';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 6; k++) {
      const m = 22 + k * 17;
      g.strokeStyle = k % 2 ? '#b8b8b5' : '#8f8f8c';
      g.lineWidth = 5;
      g.strokeRect(m, m, 256 - 2 * m, 256 - 2 * m);
    }
    g.fillStyle = '#6e6e6b';
    g.fillRect(118, 118, 20, 20);
    return toTexture(c, { repeat: false });
  });
}

// Wall-wash light from a downlight near the wall: a bright cusp fanning down.
export function scallop() {
  return once('scallop', () => {
    const w = 256;
    const h = 512;
    const [c, g] = canvas(w, h);
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x / w - 0.5) * 2;
        const v = y / h;
        // Parabolic cusp: narrow at the top, spreading downward.
        const spread = 0.12 + v * 1.05;
        const lateral = Math.exp(-((u / spread) ** 2) * 2.2);
        const top = clamp01((v - 0.02) / 0.08);
        const cusp = Math.exp(-(((u * u) / (0.02 + v * 0.35) - v * 0.9) ** 2) * 1.5) * 0.45;
        const fall = Math.exp(-v * 2.6);
        const a = clamp01((lateral * fall * 0.9 + cusp * fall) * top);
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = a * 255;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { repeat: false });
  });
}

export function exitSign() {
  return once('exit', () => {
    const [c, g] = canvas(256, 128);
    g.fillStyle = '#16a34a';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#f4fff6';
    g.fillRect(8, 8, 240, 112);
    g.fillStyle = '#16a34a';
    g.fillRect(14, 14, 228, 100);
    g.fillStyle = '#ffffff';
    // Running figure.
    g.beginPath();
    g.arc(70, 34, 10, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 11;
    g.lineCap = 'round';
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.moveTo(66, 50);
    g.lineTo(58, 78);
    g.lineTo(40, 100);
    g.moveTo(58, 78);
    g.lineTo(80, 88);
    g.lineTo(84, 108);
    g.moveTo(64, 56);
    g.lineTo(84, 66);
    g.moveTo(64, 56);
    g.lineTo(46, 64);
    g.stroke();
    // Door + arrow.
    g.fillRect(104, 26, 36, 80);
    g.fillStyle = '#16a34a';
    g.fillRect(110, 32, 24, 74);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(160, 52);
    g.lineTo(206, 52);
    g.lineTo(206, 36);
    g.lineTo(236, 66);
    g.lineTo(206, 96);
    g.lineTo(206, 80);
    g.lineTo(160, 80);
    g.closePath();
    g.fill();
    return toTexture(c, { repeat: false });
  });
}

// Skyline facades: 4 styles in a 2x2 atlas, one 3.6 m bay each.
// R = frame / spandrel lightness, G = glass mask.
export function facadeAtlas() {
  return once('facade', () => {
    const S = 1024;
    const H = 512;
    const [c, g] = canvas(S, S);
    g.fillStyle = 'rgb(235,0,0)';
    g.fillRect(0, 0, S, S);
    const glass = (x, y, w, h) => {
      g.fillStyle = 'rgb(0,255,0)';
      g.fillRect(x, y, w, h);
    };
    const frame = (x, y, w, h, v = 150) => {
      g.fillStyle = `rgb(${v},0,0)`;
      g.fillRect(x, y, w, h);
    };
    // A: ribbon windows.
    glass(0, 120, H, 250);
    for (let k = 0; k <= 3; k++) frame((k * H) / 3 - 4, 120, 8, 250);
    // B: punched windows.
    for (const x of [60, 316]) glass(H + x, 110, 150, 270);
    // C: full curtain wall.
    glass(0, H, H, H);
    for (let k = 0; k <= 2; k++) frame((k * H) / 2 - 5, H, 10, H, 120);
    frame(0, H + 440, H, 18, 200);
    // D: vertical fins.
    glass(H, H, H, H);
    for (let k = 0; k < 3; k++) frame(H + (k * H) / 3 - 22, H, 44, H, 240);
    frame(H, H + 470, H, 30, 225);
    return toTexture(c, { srgb: false, repeat: false });
  });
}

// ------------------------------------------------------ per-office artwork

function canvasWeave(g, w, h, rng) {
  g.save();
  g.globalAlpha = 0.05;
  g.fillStyle = '#000';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
  g.restore();
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * 8;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// A dry-brush stroke along a quadratic curve, drawn as many bristles.
function brushStroke(g, rng, color, p0, p1, p2, width) {
  const n = Math.max(12, Math.floor(width / 1.6));
  const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  const steps = Math.max(16, Math.floor(len / 14));
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (let b = 0; b < n; b++) {
    const o = (b / (n - 1) - 0.5) * width;
    const s0 = rng.range(0, 0.12);
    const s1 = rng.range(0.82, 1);
    g.globalAlpha = rng.range(0.35, 0.95);
    g.lineWidth = rng.range(1.2, 3.2);
    g.beginPath();
    for (let k = 0; k <= steps; k++) {
      const t = s0 + ((s1 - s0) * k) / steps;
      const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
      const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
      const tx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
      const ty = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
      const tl = Math.hypot(tx, ty) || 1;
      const taper = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.3 + 0.7;
      const px = x + (-ty / tl) * o * taper + rng.range(-0.6, 0.6);
      const py = y + (tx / tl) * o * taper + rng.range(-0.6, 0.6);
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

// Abstract painting: sweeping dry-brush strokes and angular shards in the
// office palette on a pale canvas.
export function painting(rng, colors, w = 1024, h = 640) {
  const [c, g] = canvas(w, h);
  g.fillStyle = rng.pick(['#f2f0ea', '#eef0ef', '#f4efe4']);
  g.fillRect(0, 0, w, h);
  const pal = [
    [colors[0], 4],
    [colors[1], 2.5],
    [colors[2], 2],
    ['#1a1a1c', 2],
    ['#ffffff', 1],
  ];
  const diag = rng.range(-0.8, 0.8);
  const sweeps = rng.int(3, 6);
  for (let i = 0; i < sweeps; i++) {
    const col = rng.weighted(pal);
    const y0 = rng.range(0.2, 0.9) * h;
    const x0 = rng.range(-0.2, 0.3) * w;
    const x2 = rng.range(0.7, 1.2) * w;
    const y2 = y0 - diag * h * rng.range(0.6, 1.2) + rng.range(-0.2, 0.2) * h;
    const p1 = [(x0 + x2) / 2 + rng.range(-0.2, 0.2) * w, (y0 + y2) / 2 + rng.range(-0.4, 0.4) * h];
    brushStroke(g, rng, col, [x0, y0], p1, [x2, y2], rng.range(0.07, 0.28) * h);
  }
  const shards = rng.int(2, 7);
  for (let i = 0; i < shards; i++) {
    g.fillStyle = rng.weighted(pal);
    g.globalAlpha = rng.range(0.75, 1);
    const x = rng.range(0, 1) * w;
    const y = rng.range(0, 1) * h;
    const a = Math.atan2(-diag, 1) + rng.range(-0.35, 0.35) + (rng.chance(0.5) ? Math.PI : 0);
    const len = rng.range(0.15, 0.55) * w;
    const wid = rng.range(0.02, 0.09) * h;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dx * len * 0.35 - dy * wid, y + dy * len * 0.35 + dx * wid);
    g.lineTo(x + dx * len, y + dy * len);
    g.lineTo(x + dx * len * 0.7 + dy * wid * 0.4, y + dy * len * 0.7 - dx * wid * 0.4);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  // Speed lines and a few spatters.
  g.strokeStyle = '#18181a';
  for (let i = 0; i < rng.int(1, 4); i++) {
    const y = rng.range(0.1, 0.9) * h;
    g.lineWidth = rng.range(1.5, 4);
    g.globalAlpha = rng.range(0.5, 0.9);
    g.beginPath();
    g.moveTo(rng.range(0, 0.5) * w, y);
    g.lineTo(rng.range(0.55, 1) * w, y - diag * rng.range(40, 160));
    g.stroke();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rng.weighted(pal);
    g.beginPath();
    g.arc(rng.range(0, w), rng.range(0, h), rng.range(0.8, 3.5), 0, Math.PI * 2);
    g.fill();
  }
  canvasWeave(g, w, h, rng);
  return toTexture(c, { repeat: false });
}

function emblem(g, x, y, r, accent) {
  g.fillStyle = accent;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x - r * 0.55, y + r * 0.45);
  g.lineTo(x + r * 0.1, y - r * 0.6);
  g.lineTo(x + r * 0.6, y - r * 0.6);
  g.lineTo(x - r * 0.05, y + r * 0.45);
  g.closePath();
  g.fill();
}

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// TV content. kind: 'stairs' (glowing stairwell), 'city' (dusk skyline with
// the company mark) or 'brand' (accent slide).
export function screen(company, accent, kind, rng) {
  const w = 1024;
  const h = 576;
  const [c, g] = canvas(w, h);
  if (kind === 'stairs') {
    const bg = g.createRadialGradient(w * 0.5, h * 0.4, 20, w * 0.5, h * 0.5, w * 0.7);
    bg.addColorStop(0, '#ffd27a');
    bg.addColorStop(0.35, '#ff8a2a');
    bg.addColorStop(1, '#8a1c08');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const vx = w * 0.5;
    const vy = h * 0.3;
    // Steps converging to the vanishing point.
    for (let k = 0; k < 26; k++) {
      const t = k / 26;
      const y = h - (h - vy) * (1 - (1 - t) ** 2);
      const hw = (w * 0.34) * (1 - t) + 26;
      g.fillStyle = k % 2 ? 'rgba(120,25,5,0.55)' : 'rgba(255,190,110,0.35)';
      g.fillRect(vx - hw, y - 6 * (1 - t) - 2, hw * 2, 6 * (1 - t) + 2);
    }
    // Light bars on the side walls.
    g.strokeStyle = 'rgba(255,248,220,0.95)';
    g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const x = w * 0.08 + t * (vx - w * 0.08) * 0.8;
      const y = h * 0.2 + t * (vy - h * 0.2) * 0.8;
      g.lineWidth = 10 * (1 - t) + 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 60 * (1 - t) + 10, y + 26 * (1 - t) + 4);
      g.stroke();
      g.beginPath();
      g.moveTo(w - x, y);
      g.lineTo(w - x - 60 * (1 - t) - 10, y + 26 * (1 - t) + 4);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = `700 34px ${FONT}`;
    g.textAlign = 'right';
    g.fillText(company.mark, w - 36, 60);
  } else if (kind === 'city') {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#20303f');
    sky.addColorStop(0.6, '#4b5d6d');
    sky.addColorStop(1, '#9aa7ae');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    let x = -20;
    while (x < w) {
      const bw = rng.range(40, 120);
      const bh = rng.range(120, 430);
      g.fillStyle = `rgb(${rng.int(22, 40)},${rng.int(28, 46)},${rng.int(36, 54)})`;
      g.fillRect(x, h - bh, bw - 4, bh);
      g.fillStyle = 'rgba(255,220,160,0.35)';
      for (let yy = h - bh + 10; yy < h - 10; yy += 14) for (let xx = x + 6; xx < x + bw - 12; xx += 12) if (rng.chance(0.3)) g.fillRect(xx, yy, 5, 6);
      x += bw;
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, h * 0.62, w, h * 0.22);
    emblem(g, 90, h * 0.73, 42, accent);
    g.fillStyle = '#ffffff';
    g.font = `600 44px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(company.name.toUpperCase(), 150, h * 0.73);
  } else {
    g.fillStyle = accent;
    g.fillRect(0, 0, w, h);
    const shade = g.createLinearGradient(0, 0, w, h);
    shade.addColorStop(0, 'rgba(255,255,255,0.18)');
    shade.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      g.moveTo(0, h * 0.2 + k * 50);
      g.lineTo(w, h * 0.1 + k * 50 - 120);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 150px ${FONT}`;
    g.fillText(company.mark, w / 2, h * 0.44);
    g.font = `400 34px ${FONT}`;
    g.fillText(company.name, w / 2, h * 0.7);
  }
  // Glass sheen.
  const sheen = g.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h);
  return toTexture(c, { repeat: false });
}

// Computer desktop: company wallpaper and a taskbar.
export function desktop(company, accent) {
  const w = 512;
  const h = 320;
  const [c, g] = canvas(w, h);
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#e9ecef');
  bg.addColorStop(1, '#bfc6cc');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2b2f33';
  g.fillRect(0, h - 22, w, 22);
  g.fillStyle = accent;
  g.fillRect(6, h - 17, 12, 12);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(14, 16 + i * 36, 18, 18);
  }
  g.fillStyle = '#5f6368';
  g.textAlign = 'right';
  g.font = `600 30px ${FONT}`;
  g.fillText(company.mark, w - 24, h - 44);
  return toTexture(c, { repeat: false });
}

// Emblem + name, fixed 8:1.
export function logo(company, accent) {
  const w = 2048;
  const h = 256;
  const [c, g] = canvas(w, h);
  const text = company.name.toUpperCase();
  let size = 150;
  g.letterSpacing = '14px';
  g.font = `700 ${size}px ${FONT}`;
  const maxW = w - 300;
  const tw = g.measureText(text).width;
  if (tw > maxW) {
    size = Math.floor((size * maxW) / tw);
    g.font = `700 ${size}px ${FONT}`;
  }
  const total = 230 + g.measureText(text).width;
  const x0 = (w - total) / 2;
  emblem(g, x0 + 90, h / 2, 90, accent);
  g.fillStyle = accent;
  g.textBaseline = 'middle';
  g.fillText(text, x0 + 230, h / 2 + 6);
  return toTexture(c, { repeat: false });
}

// Big painted monogram with the full name underneath, 2:1. The ampersand
// picks up the accent colour.
export function monogram(company, accent) {
  const w = 1024;
  const h = 512;
  const [c, g] = canvas(w, h);
  const ink = '#5f6368';
  g.textBaseline = 'alphabetic';
  let size = 300;
  g.font = `500 ${size}px ${FONT}`;
  const parts = company.mark.split('&');
  const measure = () => parts.reduce((s, p, i) => s + g.measureText(p).width + (i ? g.measureText('&').width : 0), 0);
  let tw = measure();
  if (tw > w * 0.92) {
    size = Math.floor((size * w * 0.92) / tw);
    g.font = `500 ${size}px ${FONT}`;
    tw = measure();
  }
  let x = (w - tw) / 2;
  const y = h * 0.66;
  parts.forEach((p, i) => {
    if (i) {
      g.fillStyle = accent;
      g.fillText('&', x, y);
      x += g.measureText('&').width;
    }
    g.fillStyle = ink;
    g.fillText(p, x, y);
    x += g.measureText(p).width;
  });
  g.font = `400 ${Math.round(size * 0.17)}px ${FONT}`;
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.fillText(company.name, w / 2, y + size * 0.26);
  return toTexture(c, { repeat: false });
}

// Tall freestanding sign with the name running vertically and accent stripes.
export function pylon(company, accent) {
  const w = 256;
  const h = 1024;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#f1f1ef';
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(150, 0, 22, h);
  g.fillRect(186, 0, 8, h);
  g.fillRect(24, h - 190, 102, 150);
  g.fillStyle = '#ffffff';
  g.fillRect(34, h - 180, 82, 130);
  g.save();
  g.translate(96, h - 230);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#6a6e73';
  g.font = `600 44px ${FONT}`;
  g.letterSpacing = '6px';
  g.fillText(company.name.toUpperCase(), 0, 0);
  g.restore();
  return toTexture(c, { repeat: false });
}
