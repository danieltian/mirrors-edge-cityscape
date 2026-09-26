import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { once, canvas, toTexture, field, samp, normalMap, grayMap, paint, FONT } from '../office/textures.js';

// Rooftop surfaces, drawn in code and weathered: roof pavers with grout
// dirt, water marks and cracks; tiled, panelled and rendered wall cladding
// with rain streaks; stained render; ribbed metal cladding; galvanised
// ductwork with seams and spangle; equipment cabinets with doors, handles
// and labels; louvres, fan guards and grating; chain-link fencing; scaffold
// boards; solar cells, curtain-wall glass and a helipad. Built once and
// shared by every rooftop world. (Large-scale grime on top of these is
// added in the shader, see weather() in index.js, so the repeats don't show.)

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A crack: a jittery line drawn into the albedo canvas and the height map.
function crack(g, hgt, W, H, rng, x, y, len, angle) {
  g.strokeStyle = `rgba(95,95,92,${rng.range(0.35, 0.6)})`;
  g.lineWidth = rng.range(0.7, 1.3);
  g.beginPath();
  g.moveTo(x, y);
  for (let s = 0; s < len; s += 3) {
    angle += rng.range(-0.5, 0.5);
    x += Math.cos(angle) * 3;
    y += Math.sin(angle) * 3;
    g.lineTo(x, y);
    const xi = ((Math.round(x) % W) + W) % W;
    const yi = ((Math.round(y) % H) + H) % H;
    hgt[yi * W + xi] -= 0.4;
  }
  g.stroke();
}

// 0.6 m concrete pavers, 4 x 4 per texture (2.4 m): per-paver tone, dirt
// settling along the grout, water marks, specks, the odd chipped corner and
// cracked paver, slightly uneven surfaces.
export function roofTiles() {
  return once('roofTiles', () => {
    const rng = new RNG(311);
    const S = 1024;
    const P = S / 4;
    const grime = field(rng, 256, 4, 5, 0.6);
    const stain = field(rng, 256, 6, 3, 0.55);
    const speck = field(rng, 512, 96, 2, 0.5);
    const tiles = Array.from({ length: 16 }, () => ({ t: rng.range(-1, 1), w: rng.range(-1, 1), ax: rng.range(-1, 1), ay: rng.range(-1, 1) }));
    const hgt = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    const [c, g] = paint(S, S, (x, y, out) => {
      const tx = Math.floor(x / P);
      const ty = Math.floor(y / P);
      const lx = x - tx * P + 0.5;
      const ly = y - ty * P + 0.5;
      const e = Math.min(lx, P - lx, ly, P - ly);
      const i = y * S + x;
      const u = x / S;
      const v = y / S;
      const gr = samp(grime, u, v) - 0.5;
      const n = rng.next() - 0.5;
      if (e < 3) {
        const val = 150 + gr * 40 + n * 10;
        out[0] = val + 2;
        out[1] = val;
        out[2] = val - 2;
        hgt[i] = 0;
        rough[i] = 0.95;
        return;
      }
      const T = tiles[ty * 4 + tx];
      const mark = smooth(0.6, 0.63, samp(stain, u, v));
      const dirt = Math.pow(Math.max(0, 1 - (e - 3) / 12), 2) * 16;
      const val = 234 + T.t * 4 + gr * 26 - mark * 9 + (samp(speck, u, v) - 0.5) * 9 + n * 4 - dirt;
      out[0] = val + T.w * 1.5 + 1;
      out[1] = val;
      out[2] = val - T.w * 1.5 - 1;
      hgt[i] = 0.25 + 0.75 * smooth(3, 9, e) + (T.ax * (lx / P - 0.5) + T.ay * (ly / P - 0.5)) * 0.12;
      rough[i] = 0.64 + gr * 0.3 + mark * 0.12;
    });
    // Chipped corners and a few cracked pavers.
    for (let k = 0; k < 16; k++) {
      const tx = k % 4;
      const ty = Math.floor(k / 4);
      if (rng.chance(0.3)) {
        const cx = tx * P + (rng.chance(0.5) ? 4 : P - 4);
        const cy = ty * P + (rng.chance(0.5) ? 4 : P - 4);
        g.fillStyle = 'rgba(160,158,152,0.9)';
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + rng.sign() * rng.range(6, 14), cy);
        g.lineTo(cx, cy + rng.sign() * rng.range(6, 14));
        g.fill();
      }
      if (rng.chance(0.2)) crack(g, hgt, S, S, rng, tx * P + rng.range(20, P - 20), ty * P + rng.range(20, P - 20), rng.range(40, 140), rng.range(0, Math.PI * 2));
    }
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 2.2), roughnessMap: grayMap(rough, S, S) };
  });
}

// Wall cladding, sampled in metres (see wallBox in generator.js):
//   tile   - 0.6 m square glazed tiles (covers 2.4 x 2.4 m)
//   panel  - 1.2 x 0.6 m flat panels (covers 2.4 x 1.2 m)
//   render - smooth render with a joint every 1.2 m (covers 2.4 x 2.4 m)
// All with faint rain streaks and per-unit tone.
export function cladding(kind) {
  return once(`cladding-${kind}`, () => {
    const rng = new RNG({ tile: 5, panel: 6, render: 7 }[kind]);
    const W = 512;
    const H = kind === 'panel' ? 256 : 512;
    const [cw, ch] = kind === 'tile' ? [128, 128] : kind === 'panel' ? [256, 128] : [256, 256];
    const seam = kind === 'render' ? 1.5 : 2.2;
    const base = { tile: 233, panel: 224, render: 236 }[kind];
    const streak = field(rng, 128, 20, 3, 0.55, 2);
    const cloud = field(rng, 128, 4, 4, 0.6);
    const tone = Array.from({ length: 64 }, () => rng.range(-1, 1));
    const hgt = new Float32Array(W * H);
    const [c] = paint(W, H, (x, y, out) => {
      const ix = Math.floor(x / cw);
      const iy = Math.floor(y / ch);
      const lx = x - ix * cw + 0.5;
      const ly = y - iy * ch + 0.5;
      const e = Math.min(lx, cw - lx, ly, ch - ly);
      const u = x / W;
      const v = y / H;
      const s = samp(streak, u, v) - 0.5;
      const n = rng.next() - 0.5;
      let val = base + tone[(iy * 8 + ix) % 64] * (kind === 'render' ? 1.5 : 4) + (samp(cloud, u, v) - 0.5) * 10 + Math.min(0, s) * 22 + n * 3;
      let h = 1;
      if (e < seam) {
        val -= kind === 'render' ? 26 : 48;
        h = 0;
      } else if (e < seam + 2) h = 0.6;
      out[0] = val;
      out[1] = val + 0.5;
      out[2] = val + (kind === 'panel' ? 2.5 : 1);
      hgt[y * W + x] = h;
    });
    const tex = toTexture(c);
    const nrm = normalMap(hgt, W, H, 2.5);
    for (const t of [tex, nrm]) t.repeat.set(1 / 2.4, 1 / (H === 256 ? 1.2 : 2.4));
    return { map: tex, normalMap: nrm };
  });
}

// Stained white render (parapets, trims, bases; 2.4 m).
export function plaster() {
  return once('plaster', () => {
    const rng = new RNG(83);
    const S = 512;
    const cloud = field(rng, 128, 5, 5, 0.6);
    const stain = field(rng, 128, 7, 3, 0.55);
    const hgt = new Float32Array(S * S);
    const [c, g] = paint(S, S, (x, y, out) => {
      const u = x / S;
      const v = y / S;
      const cl = samp(cloud, u, v) - 0.5;
      const mark = smooth(0.6, 0.64, samp(stain, u, v));
      const n = rng.next() - 0.5;
      const val = 238 + cl * 12 - mark * 8 + n * 5;
      out[0] = val + 1;
      out[1] = val;
      out[2] = val - 1;
      hgt[y * S + x] = cl * 0.4 + n * 0.25;
    });
    for (let k = 0; k < 5; k++) crack(g, hgt, S, S, rng, rng.range(0, S), rng.range(0, S), rng.range(30, 90), rng.range(0, Math.PI * 2));
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 1.2) };
  });
}

// Vertical corrugated cladding: trapezoid ribs every 0.2 m over 1.2 m,
// fixings on the troughs, streaks running down from them.
export function ribbed() {
  return once('ribbed', () => {
    const rng = new RNG(97);
    const S = 512;
    const streak = field(rng, 128, 12, 3, 0.5, 2);
    const hgt = new Float32Array(S * S);
    const P = S / 6;
    const [c, g] = paint(S, S, (x, y, out) => {
      const f = (x % P) / P;
      const prof = f < 0.12 ? f / 0.12 : f < 0.42 ? 1 : f < 0.54 ? 1 - (f - 0.42) / 0.12 : 0;
      const s = samp(streak, x / S, y / S) - 0.5;
      const val = 224 + prof * 12 + s * 18 + (rng.next() - 0.5) * 4;
      out[0] = val;
      out[1] = val + 1;
      out[2] = val + 3;
      hgt[y * S + x] = prof;
    });
    for (let i = 0; i < 6; i++) {
      for (const fy of [0.1, 0.6]) {
        const x = i * P + P * 0.77;
        const y = fy * S;
        const sg = g.createLinearGradient(x, y, x, y + rng.range(40, 110));
        sg.addColorStop(0, 'rgba(120,112,100,0.22)');
        sg.addColorStop(1, 'rgba(120,112,100,0)');
        g.fillStyle = sg;
        g.fillRect(x - 2, y, 4, 110);
        g.fillStyle = '#8c9096';
        g.beginPath();
        g.arc(x, y, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 3.5) };
  });
}

// Galvanised sheet (ducts): spangle, a raised joint every 1.2 m and the
// faint cross-break creases of a duct panel.
export function galvanized() {
  return once('galvanized', () => {
    const rng = new RNG(141);
    const S = 512;
    const spangle = field(rng, 256, 26, 2, 0.45);
    const cloud = field(rng, 128, 4, 3, 0.6);
    const hgt = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const u = x / S;
      const v = y / S;
      const sp = Math.floor(samp(spangle, u, v) * 7) / 7 - 0.5;
      const cl = samp(cloud, u, v) - 0.5;
      const cross = Math.max(0, 1 - Math.min(Math.abs(u - v), Math.abs(u + v - 1)) * 90);
      let val = 196 + sp * 14 + cl * 14 + cross * 6 + (rng.next() - 0.5) * 4;
      let h = 0.5 + cross * 0.1;
      const d = Math.min(y, S - y);
      if (d < 3) {
        val -= 40;
        h = 0.2;
      } else if (d < 9) {
        val += 10;
        h = 1;
      }
      out[0] = val - 2;
      out[1] = val;
      out[2] = val + 3;
      hgt[y * S + x] = h;
      rough[y * S + x] = 0.34 + cl * 0.2 + (sp + 0.5) * 0.08;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 2), roughnessMap: grayMap(rough, S, S) };
  });
}

// Equipment cabinet side (AHUs, packaged units): 1.2 m panels with seams,
// an access door with handles and hinges, a rating plate and a grille,
// bolts at the corners (covers 2.4 x 1.2 m).
export function cabinet() {
  return once('cabinet', () => {
    const rng = new RNG(163);
    const W = 1024;
    const H = 512;
    const cloud = field(rng, 128, 4, 4, 0.6);
    const hgt = new Float32Array(W * H);
    const [c, g] = paint(W, H, (x, y, out) => {
      const px = x % 512;
      const e = Math.min(px, 512 - px, y, H - y);
      const val = 214 + (samp(cloud, x / W, y / H) - 0.5) * 12 + (rng.next() - 0.5) * 3 + (e < 4 ? -60 : 0);
      out[0] = val + 1;
      out[1] = val;
      out[2] = val - 3;
      hgt[y * W + x] = e < 4 ? 0 : e < 8 ? 0.7 : 1;
    });
    const box = (x, y, w, h, fill, hv) => {
      g.fillStyle = fill;
      g.fillRect(x, y, w, h);
      for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) hgt[yy * W + xx] = hv;
    };
    // Door on the first panel: recessed outline, handles, hinges.
    g.strokeStyle = 'rgba(90,90,88,0.9)';
    g.lineWidth = 3;
    g.strokeRect(60, 40, 392, 432);
    box(400, 200, 18, 60, '#3b3e42', 1.4);
    box(400, 300, 18, 60, '#3b3e42', 1.4);
    for (const hy of [90, 400]) box(52, hy, 12, 36, '#6c7075', 1.2);
    // Plate and grille on the second.
    box(600, 80, 150, 90, '#e9e9e4', 1.05);
    g.fillStyle = '#6a6d70';
    for (let k = 0; k < 6; k++) g.fillRect(612, 96 + k * 12, rng.range(60, 126), 4);
    g.fillStyle = '#d23b2e';
    g.fillRect(612, 150, 40, 10);
    for (let k = 0; k < 9; k++) box(620, 260 + k * 22, 340, 10, '#55595e', 0.2);
    // Bolts.
    g.fillStyle = '#9ea2a7';
    for (const bx of [16, 496, 528, 1008]) {
      for (const by of [16, 256, 496]) {
        g.beginPath();
        g.arc(bx, by, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    return { map: toTexture(c), normalMap: normalMap(hgt, W, H, 2.5) };
  });
}

// Louvres: angled slats with dark gaps, 0.1 m pitch over 1 m.
export function louver() {
  return once('louver', () => {
    const rng = new RNG(19);
    const S = 256;
    const grime = field(rng, 64, 4, 3, 0.6);
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const f = ((y / S) * 10) % 1;
      const gap = f > 0.7;
      const gr = samp(grime, x / S, y / S) - 0.5;
      const val = gap ? 48 + f * 30 : 218 - f * 56 + gr * 16;
      out[0] = out[1] = val;
      out[2] = val + 4;
      hgt[y * S + x] = gap ? 0 : 1 - f;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 3) };
  });
}

// Wire fan guard over a spinning fan: rings and spokes on transparency
// (the well and the blades are separate, so the blades show through).
export function fanGrille() {
  return once('fanGrille', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const r = S / 2;
    g.clearRect(0, 0, S, S);
    g.strokeStyle = '#c9cdd1';
    g.lineWidth = 3;
    for (let k = 1; k <= 7; k++) {
      g.beginPath();
      g.arc(r, r, r * 0.13 * k, 0, Math.PI * 2);
      g.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(r + Math.cos(a) * r * 0.14, r + Math.sin(a) * r * 0.14);
      g.lineTo(r + Math.cos(a) * r * 0.95, r + Math.sin(a) * r * 0.95);
      g.stroke();
    }
    g.fillStyle = '#c9cdd1';
    g.beginPath();
    g.arc(r, r, r * 0.14, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.beginPath();
    g.arc(r, r, r * 0.94, 0, Math.PI * 2);
    g.stroke();
    return toTexture(c, { repeat: false });
  });
}

// Chain-link mesh on transparency (0.6 m square, 5 cm diamonds).
export function chainLink() {
  return once('chainLink', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = '#bcc2c8';
    g.lineWidth = 2.4;
    const step = S / 12;
    for (let k = -12; k <= 24; k++) {
      g.beginPath();
      g.moveTo(k * step, 0);
      g.lineTo(k * step + S, S);
      g.stroke();
      g.beginPath();
      g.moveTo(k * step, S);
      g.lineTo(k * step + S, 0);
      g.stroke();
    }
    return toTexture(c);
  });
}

// Weathered scaffold boards along u: five 0.225 m boards (covers 2.4 x 1.2 m).
export function planks() {
  return once('planks', () => {
    const rng = new RNG(211);
    const W = 512;
    const H = 256;
    const grain = field(rng, 256, 3, 4, 0.55, 40);
    const tone = Array.from({ length: 5 }, () => rng.range(-1, 1));
    const hgt = new Float32Array(W * H);
    const [c] = paint(W, H, (x, y, out) => {
      const bw = H / 5;
      const k = Math.floor(y / bw);
      const ly = y - k * bw;
      const gap = ly < 2 || ly > bw - 2;
      const gr = samp(grain, x / W, y / H) - 0.5;
      const val = gap ? 70 : 176 + tone[k] * 10 + gr * 34 + (rng.next() - 0.5) * 6;
      out[0] = val + 8;
      out[1] = val - 4;
      out[2] = val - 22;
      hgt[y * W + x] = gap ? 0 : 1 + gr * 0.2;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, W, H, 2) };
  });
}

// Dark steel grating (vent grilles, stairs and decks): 10 x 10 holes per 1.2 m.
export function grate() {
  return once('grate', () => {
    const S = 256;
    const P = S / 10;
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const lx = (x % P) / P;
      const ly = (y % P) / P;
      const bar = lx < 0.18 || ly < 0.18;
      const val = bar ? 104 : 18 + ly * 18;
      out[0] = out[1] = val;
      out[2] = val + 4;
      hgt[y * S + x] = bar ? 1 : 0;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 2) };
  });
}

// One solar panel: 6 x 10 blue cells in a silver frame.
export function solar() {
  return once('solar', () => {
    const W = 256;
    const H = 400;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#c9ced4';
    g.fillRect(0, 0, W, H);
    const m = 8;
    const cw = (W - 2 * m) / 6;
    const ch = (H - 2 * m) / 10;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 10; j++) {
        const x = m + i * cw;
        const y = m + j * ch;
        const gr = g.createLinearGradient(x, y, x + cw, y + ch);
        gr.addColorStop(0, '#1f4fb8');
        gr.addColorStop(1, '#173c93');
        g.fillStyle = gr;
        g.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + cw / 2 - 0.5, y + 1.5, 1, ch - 3);
      }
    }
    return toTexture(c, { repeat: false });
  });
}

// Curtain wall: dark glass panels 1.5 m wide, a spandrel at each 3.6 m floor.
export function curtain() {
  return once('curtain', () => {
    const rng = new RNG(58);
    const W = 256;
    const H = 512;
    const [c, g] = canvas(W, H);
    const cols = 2;
    const rows = 2;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const v = rng.range(-10, 10);
        g.fillStyle = `rgb(${38 + v},${52 + v},${70 + v})`;
        g.fillRect((i * W) / cols, (j * H) / rows, W / cols, H / rows);
      }
    }
    g.fillStyle = '#1e2733';
    for (let j = 0; j < rows; j++) g.fillRect(0, (j * H) / rows + H / rows - 34, W, 34);
    g.fillStyle = '#cfd6de';
    for (let i = 0; i <= cols; i++) g.fillRect((i * W) / cols - 3, 0, 6, H);
    for (let j = 0; j <= rows; j++) g.fillRect(0, (j * H) / rows - 3, W, 6);
    return toTexture(c);
  });
}

export function helipad() {
  return once('helipad', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#e9ebec';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#f2c230';
    g.lineWidth = 22;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#2d3136';
    g.font = `800 ${S * 0.46}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', S / 2, S / 2 + S * 0.02);
    return toTexture(c, { repeat: false });
  });
}
