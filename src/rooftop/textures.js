import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { once, canvas, toTexture, field, samp, normalMap, grayMap, paint, FONT } from '../office/textures.js';

// Rooftop surfaces, drawn in code: white roof tiles, ribbed metal cladding,
// louvres, fan grilles, steel grating, solar cells, dark curtain-wall glass
// and a helipad. All shared between rooftop worlds and built once.

// 0.6 m roof tiles, 4 x 4 per texture, faintly weathered.
export function roofTiles() {
  return once('roofTiles', () => {
    const rng = new RNG(311);
    const S = 1024;
    const P = S / 4;
    const grime = field(rng, 256, 4, 5, 0.6);
    const streak = field(rng, 256, 9, 3, 0.5);
    const tone = Array.from({ length: 16 }, () => rng.range(-1, 1));
    const hgt = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const tx = Math.floor(x / P);
      const ty = Math.floor(y / P);
      const lx = x - tx * P + 0.5;
      const ly = y - ty * P + 0.5;
      const e = Math.min(lx, P - lx, ly, P - ly);
      const i = y * S + x;
      const u = x / S;
      const v = y / S;
      const g = samp(grime, u, v) - 0.5;
      const n = rng.next() - 0.5;
      if (e < 2.2) {
        out[0] = out[1] = out[2] = 176 + g * 30 + n * 8;
        out[2] += 4;
        hgt[i] = 0;
        rough[i] = 0.95;
        return;
      }
      const bev = Math.min(1, (e - 2.2) / 3);
      let val = 238 + tone[ty * 4 + tx] * 3 + g * 16 + (samp(streak, u, v) - 0.5) * 6 + n * 3;
      val *= 0.95 + 0.05 * bev;
      out[0] = val - 1;
      out[1] = val;
      out[2] = val;
      hgt[i] = 0.3 + 0.7 * Math.sqrt(bev);
      rough[i] = 0.55 + g * 0.4;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 2), roughnessMap: grayMap(rough, S, S) };
  });
}

// Vertical corrugated cladding: trapezoid ribs every 0.2 m over 1.2 m.
export function ribbed() {
  return once('ribbed', () => {
    const rng = new RNG(97);
    const S = 512;
    const streak = field(rng, 128, 12, 3, 0.5, 2);
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const p = (x / S) * 6;
      const f = p - Math.floor(p);
      const prof = f < 0.12 ? f / 0.12 : f < 0.42 ? 1 : f < 0.54 ? 1 - (f - 0.42) / 0.12 : 0;
      const s = samp(streak, x / S, y / S) - 0.5;
      const val = 226 + prof * 12 + s * 14 + (rng.next() - 0.5) * 3;
      out[0] = val;
      out[1] = val + 1;
      out[2] = val + 3;
      hgt[y * S + x] = prof;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 3.5) };
  });
}

// Louvres: horizontal slats with dark gaps, 0.1 m pitch over 1 m.
export function louver() {
  return once('louver', () => {
    const S = 256;
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const f = ((y / S) * 10) % 1;
      const gap = f > 0.72;
      const val = gap ? 60 + f * 40 : 214 - f * 50;
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

// Dark steel grating (vent grilles on the roof): 10 x 10 holes per 1.2 m.
export function grate() {
  return once('grate', () => {
    const S = 256;
    const P = S / 10;
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const lx = (x % P) / P;
      const ly = (y % P) / P;
      const bar = lx < 0.18 || ly < 0.18;
      const val = bar ? 96 : 18 + ly * 18;
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

