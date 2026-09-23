import { WORLD } from '../config.js';

// 2.5D occupancy map: the max solid height in every 5 m cell. Used for camera
// collision and for scoring candidate viewpoints with cheap ray marches.
// A coarse max-pyramid level lets rays skip over empty air quickly.

const COARSE = 16; // fine cells per coarse cell

export class HeightField {
  constructor(terrain) {
    const { half, cell } = WORLD;
    this.half = half;
    this.cell = cell;
    this.n = Math.round((2 * half) / cell);
    this.data = new Float32Array(this.n * this.n);
    this.maxHeight = 0;
    const { n, data } = this;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + (i + 0.5) * cell;
        const z = -half + (j + 0.5) * cell;
        data[j * n + i] = terrain.sample(x, z) > 0 ? 0 : WORLD.waterY;
      }
    }
  }

  // Rotated rectangle footprint (angle uses the same convention as
  // Object3D.rotation.y) raised to `top`.
  raster(x, z, hw, hd, angle, top) {
    if (top > this.maxHeight) this.maxHeight = top;
    const { half, cell, n, data } = this;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ex = Math.abs(hw * c) + Math.abs(hd * s);
    const ez = Math.abs(hw * s) + Math.abs(hd * c);
    const i0 = Math.max(0, Math.floor((x - ex + half) / cell));
    const i1 = Math.min(n - 1, Math.floor((x + ex + half) / cell));
    const j0 = Math.max(0, Math.floor((z - ez + half) / cell));
    const j1 = Math.min(n - 1, Math.floor((z + ez + half) / cell));
    const pad = cell * 0.5;
    for (let j = j0; j <= j1; j++) {
      const dz = -half + (j + 0.5) * cell - z;
      for (let i = i0; i <= i1; i++) {
        const dx = -half + (i + 0.5) * cell - x;
        const lu = dx * c - dz * s;
        const lv = dx * s + dz * c;
        if (Math.abs(lu) <= hw + pad && Math.abs(lv) <= hd + pad) {
          const k = j * n + i;
          if (data[k] < top) data[k] = top;
        }
      }
    }
  }

  finalize() {
    const { n, data } = this;
    this.cn = Math.ceil(n / COARSE);
    this.coarse = new Float32Array(this.cn * this.cn).fill(-Infinity);
    for (let j = 0; j < n; j++) {
      const cj = Math.floor(j / COARSE);
      for (let i = 0; i < n; i++) {
        const k = cj * this.cn + Math.floor(i / COARSE);
        if (data[j * n + i] > this.coarse[k]) this.coarse[k] = data[j * n + i];
      }
    }
  }

  heightAt(x, z) {
    const { half, cell, n } = this;
    const i = Math.floor((x + half) / cell);
    const j = Math.floor((z + half) / cell);
    if (i < 0 || j < 0 || i >= n || j >= n) return WORLD.waterY;
    return this.data[j * n + i];
  }

  maxAround(x, z, r) {
    const { half, cell, n, data } = this;
    const i0 = Math.max(0, Math.floor((x - r + half) / cell));
    const i1 = Math.min(n - 1, Math.floor((x + r + half) / cell));
    const j0 = Math.max(0, Math.floor((z - r + half) / cell));
    const j1 = Math.min(n - 1, Math.floor((z + r + half) / cell));
    let m = WORLD.waterY;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (data[j * n + i] > m) m = data[j * n + i];
    return m;
  }

  // Distance along (dx, dz) from (x, z) until the map square is entered.
  entryDistance(x, z, dx, dz) {
    const h = this.half;
    let tmin = 0;
    let tmax = Infinity;
    for (const [p, d] of [
      [x, dx],
      [z, dz],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (p < -h || p > h) return Infinity;
        continue;
      }
      const t1 = (-h - p) / d;
      const t2 = (h - p) / d;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
    return tmax < tmin ? Infinity : tmin;
  }

  // Ray march. Returns hit distance (Infinity for sky) and sets out.water.
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 6000, out = {}) {
    const { half, cell, n, data, coarse, cn } = this;
    const cw = cell * COARSE;
    const fine = cell * 0.7;
    let t = 0;
    out.water = false;
    out.x = ox;
    out.z = oz;
    while (t < maxDist) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      if (y > this.maxHeight + 1 && dy >= 0) return Infinity;
      const fi = (x + half) / cell;
      const fj = (z + half) / cell;
      if (fi < 0 || fj < 0 || fi >= n || fj >= n) {
        // Outside the map is open sea: either hit the water plane or jump to
        // where the ray enters the map.
        const entry = this.entryDistance(x, z, dx, dz);
        const tw = dy < -1e-6 ? (WORLD.waterY - y) / dy : Infinity;
        if (tw < entry) {
          if (t + tw > maxDist) return Infinity;
          out.water = true;
          out.x = x + dx * tw;
          out.z = z + dz * tw;
          return t + tw;
        }
        if (entry === Infinity) return Infinity;
        t += entry + 0.01;
        continue;
      }
      // Coarse skip: if we are above everything in this coarse cell, jump to its exit.
      const ci = Math.floor(fi / COARSE);
      const cj = Math.floor(fj / COARSE);
      const cmax = coarse[cj * cn + ci];
      const yNext = y + Math.min(0, dy) * cw * 1.5;
      if (yNext > cmax + 0.5) {
        const bx0 = -half + ci * cw;
        const bz0 = -half + cj * cw;
        const txExit = dx > 1e-6 ? (bx0 + cw - x) / dx : dx < -1e-6 ? (bx0 - x) / dx : Infinity;
        const tzExit = dz > 1e-6 ? (bz0 + cw - z) / dz : dz < -1e-6 ? (bz0 - z) / dz : Infinity;
        const step = Math.min(txExit, tzExit, cw * 1.5);
        t += Math.max(step, 0) + 0.05;
        continue;
      }
      const h = data[Math.floor(fj) * n + Math.floor(fi)];
      if (y <= h) {
        out.water = h <= WORLD.waterY + 0.01;
        out.x = x;
        out.z = z;
        return t;
      }
      t += fine;
    }
    return Infinity;
  }
}
