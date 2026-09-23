import * as THREE from 'three';
import { createNoise2D, fbm } from '../util/noise.js';
import { WORLD } from '../config.js';

// The terrain is a signed "land field" sampled on a regular grid:
// positive = land (roughly metres to the shore), negative = water.
// Land is a noisy island, cut by a meandering river, lagoons and bays, with
// rectangular piers and slips added around a few port zones.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Terrain {
  constructor(rng) {
    const { half, cell } = WORLD;
    this.half = half;
    this.cell = cell;
    this.n = Math.round((2 * half) / cell);
    this.stride = this.n + 1;
    this.field = new Float32Array(this.stride * this.stride);
    this.rng = rng;

    this.buildIsland(rng.fork('island'));
    this.buildRiver(rng.fork('river'));
    this.buildBasins(rng.fork('basins'));
  }

  // ---------------------------------------------------------------- sampling

  idx(i, j) {
    return j * this.stride + i;
  }

  // Bilinear sample of the land field. Outside the grid is open sea.
  sample(x, z) {
    const { half, cell, n } = this;
    const fx = (x + half) / cell;
    const fz = (z + half) / cell;
    if (fx < 0 || fz < 0 || fx >= n || fz >= n) return -500;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const f = this.field;
    const s = this.stride;
    const a = f[j * s + i];
    const b = f[j * s + i + 1];
    const c = f[(j + 1) * s + i];
    const d = f[(j + 1) * s + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  isLand(x, z, margin = 0) {
    return this.sample(x, z) > margin;
  }

  // Gradient points toward land (increasing field).
  gradient(x, z, out = new THREE.Vector2()) {
    const e = this.cell * 2;
    out.set(this.sample(x + e, z) - this.sample(x - e, z), this.sample(x, z + e) - this.sample(x, z - e));
    const l = out.length();
    if (l > 1e-6) out.divideScalar(l);
    return out;
  }

  // Applies fn(fieldValue, x, z) -> newValue over grid vertices within a box.
  stamp(minX, minZ, maxX, maxZ, fn) {
    const { half, cell, n, stride, field } = this;
    const i0 = clamp(Math.floor((minX + half) / cell), 0, n);
    const i1 = clamp(Math.ceil((maxX + half) / cell), 0, n);
    const j0 = clamp(Math.floor((minZ + half) / cell), 0, n);
    const j1 = clamp(Math.ceil((maxZ + half) / cell), 0, n);
    for (let j = j0; j <= j1; j++) {
      const z = -half + j * cell;
      for (let i = i0; i <= i1; i++) {
        const x = -half + i * cell;
        const k = j * stride + i;
        field[k] = fn(field[k], x, z);
      }
    }
  }

  // ------------------------------------------------------------------ shapes

  buildIsland(rng) {
    const { half, cell, stride, field } = this;
    const noise = createNoise2D(rng);
    const R0 = rng.range(2350, 2600);
    const harmonics = [];
    for (let k = 2; k <= 6; k++) {
      harmonics.push({ k, a: rng.range(0.02, 0.09) / Math.sqrt(k - 1), p: rng.range(0, Math.PI * 2) });
    }
    this.islandRadius = R0;
    this.islandRadiusAt = (theta) => {
      let r = 1;
      for (const h of harmonics) r += h.a * Math.cos(h.k * theta + h.p);
      return R0 * r;
    };
    for (let j = 0; j < stride; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < stride; i++) {
        const x = -half + i * cell;
        const r = Math.hypot(x, z);
        const th = Math.atan2(z, x);
        const rad = this.islandRadiusAt(th) + fbm(noise, x * 0.0009, z * 0.0009, 4) * 240;
        field[j * stride + i] = rad - r;
      }
    }

    // A couple of small islets offshore.
    this.islets = [];
    const count = rng.int(1, 3);
    for (let n = 0; n < count; n++) {
      const th = rng.range(0, Math.PI * 2);
      const r = rng.range(140, 320);
      const dist = this.islandRadiusAt(th) + r + rng.range(180, 420);
      const cx = Math.cos(th) * dist;
      const cz = Math.sin(th) * dist;
      if (Math.abs(cx) > half - r - 50 || Math.abs(cz) > half - r - 50) continue;
      this.islets.push({ x: cx, z: cz, r });
      this.stamp(cx - r - 40, cz - r - 40, cx + r + 40, cz + r + 40, (f, x, z) => {
        const d = r * (1 + 0.12 * Math.sin(Math.atan2(z - cz, x - cx) * 3 + n)) - Math.hypot(x - cx, z - cz);
        return Math.max(f, d);
      });
    }
  }

  buildRiver(rng) {
    const { half } = this;
    const rot = rng.range(0, Math.PI * 2);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const K = 7;
    const pts = [];
    let x = rng.range(-450, 450);
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const z = THREE.MathUtils.lerp(half + 700, -half - 700, t);
      if (k > 0) x = clamp(x + rng.range(-700, 700), -1250, 1250);
      // rotate the whole river so it doesn't always run north/south
      pts.push(new THREE.Vector3(x * cr - z * sr, 0, x * sr + z * cr));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const count = 700;
    const samples = curve.getSpacedPoints(count);
    const widths = [];
    for (let k = 0; k <= K; k++) widths.push(rng.range(80, 145));
    widths[K] = rng.range(170, 260); // wider mouth
    const halfWidth = (t) => {
      const f = t * K;
      const k = Math.min(K - 1, Math.floor(f));
      const u = f - k;
      const s = u * u * (3 - 2 * u);
      return widths[k] * (1 - s) + widths[k + 1] * s;
    };

    const river = [];
    for (let i = 0; i <= count; i++) {
      const p = samples[i];
      const a = samples[Math.max(0, i - 1)];
      const b = samples[Math.min(count, i + 1)];
      const tan = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
      river.push({ x: p.x, z: p.z, tx: tan.x, tz: tan.y, hw: halfWidth(i / count), t: i / count });
    }
    this.river = river;

    for (let i = 0; i < count; i++) {
      const a = river[i];
      const b = river[i + 1];
      const pad = Math.max(a.hw, b.hw) + 90;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      this.stamp(Math.min(a.x, b.x) - pad, Math.min(a.z, b.z) - pad, Math.max(a.x, b.x) + pad, Math.max(a.z, b.z) + pad, (f, x, z) => {
        let u = ((x - a.x) * abx + (z - a.z) * abz) / len2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const px = a.x + abx * u - x;
        const pz = a.z + abz * u - z;
        const d = Math.sqrt(px * px + pz * pz) - (a.hw + (b.hw - a.hw) * u);
        return d < f ? d : f;
      });
    }
  }

  stampEllipse(cx, cz, a, b, rot, mode) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pad = Math.max(a, b) + 60;
    this.stamp(cx - pad, cz - pad, cx + pad, cz + pad, (f, x, z) => {
      const dx = x - cx;
      const dz = z - cz;
      const lu = dx * c - dz * s;
      const lv = dx * s + dz * c;
      const d = (Math.hypot(lu / a, lv / b) - 1) * Math.min(a, b);
      return mode === 'water' ? Math.min(f, d) : Math.max(f, -d);
    });
  }

  buildBasins(rng) {
    const river = this.river;
    this.basins = [];
    // Lagoons hanging off the river inside the island.
    const lagoons = rng.int(1, 2);
    for (let n = 0; n < lagoons; n++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const p = river[rng.int(Math.floor(river.length * 0.2), Math.floor(river.length * 0.8))];
        if (this.sample(p.x + p.tz * 600, p.z - p.tx * 600) < 300 && this.sample(p.x - p.tz * 600, p.z + p.tx * 600) < 300) continue;
        const side = rng.sign();
        const off = p.hw + rng.range(120, 320);
        const cx = p.x + p.tz * off * side;
        const cz = p.z - p.tx * off * side;
        if (this.sample(cx, cz) < 350) continue;
        const a = rng.range(330, 560);
        const b = rng.range(220, 380);
        const rot = rng.range(0, Math.PI);
        this.stampEllipse(cx, cz, a, b, rot, 'water');
        this.basins.push({ x: cx, z: cz, a, b });
        break;
      }
    }
    // Bays carved into the coast.
    const bays = rng.int(1, 2);
    for (let n = 0; n < bays; n++) {
      const th = rng.range(0, Math.PI * 2);
      const R = this.islandRadiusAt(th) * rng.range(0.92, 1.02);
      const cx = Math.cos(th) * R;
      const cz = Math.sin(th) * R;
      const a = rng.range(450, 800);
      const b = rng.range(300, 520);
      this.stampEllipse(cx, cz, a, b, th + rng.range(-0.4, 0.4), 'water');
      this.basins.push({ x: cx, z: cz, a, b });
    }
  }

  // Piers and slips around a few port zones. Called after the district grid
  // exists so the piers can align with the street grid.
  addPorts(rng, axesAt) {
    const { half, cell, stride, field } = this;
    this.piers = [];
    const shore = [];
    for (let j = 4; j < stride - 4; j += 3) {
      for (let i = 4; i < stride - 4; i += 3) {
        const f = field[j * stride + i];
        if (f > 0 && f < cell * 1.5) shore.push([-half + i * cell, -half + j * cell]);
      }
    }
    if (!shore.length) return;
    const zones = [];
    const zoneCount = rng.int(3, 5);
    const g = new THREE.Vector2();
    for (let attempt = 0; attempt < 200 && zones.length < zoneCount; attempt++) {
      const [x, z] = rng.pick(shore);
      if (zones.some((q) => Math.hypot(q.x - x, q.z - z) < 900)) continue;
      // Needs open water in front.
      this.gradient(x, z, g);
      const nx = -g.x;
      const nz = -g.y;
      if (this.sample(x + nx * 260, z + nz * 260) > -30) continue;
      zones.push({ x, z });
    }

    for (const zone of zones) {
      const { U, V } = axesAt(zone.x, zone.z);
      this.gradient(zone.x, zone.z, g);
      const n = new THREE.Vector2(-g.x, -g.y);
      // Snap outward direction to the local street grid.
      let best = null;
      let bestDot = -2;
      for (const cand of [U, V, U.clone().negate(), V.clone().negate()]) {
        const d = cand.dot(n);
        if (d > bestDot) {
          bestDot = d;
          best = cand.clone();
        }
      }
      if (bestDot < 0.55) continue;
      n.copy(best);
      const t = new THREE.Vector2(-n.y, n.x);
      const count = rng.int(3, 8);
      const spacing = rng.range(48, 80);
      const width = rng.range(14, 24);
      const baseLen = rng.range(80, 170);
      for (let k = 0; k < count; k++) {
        const off = (k - (count - 1) / 2) * spacing;
        const bx = zone.x + t.x * off;
        const bz = zone.z + t.y * off;
        // Find the shoreline along n.
        let s = -150;
        let found = false;
        for (; s < 150; s += 2) {
          if (this.sample(bx + n.x * s, bz + n.y * s) < 0) {
            found = true;
            break;
          }
        }
        if (!found) continue;
        const sx = bx + n.x * s;
        const sz = bz + n.y * s;
        const len = baseLen * rng.range(0.85, 1.15);
        let ok = true;
        for (let d = 12; d < len + 110; d += 10) {
          if (this.sample(sx + n.x * d, sz + n.y * d) > -2) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        this.stampRect(sx, sz, n, t, -18, len, width, 'land');
        this.piers.push({ x: sx + n.x * (len / 2), z: sz + n.y * (len / 2), nx: n.x, nz: n.y, len, width });
      }
      // Occasionally cut a slip (rectangular dock basin) into the land.
      if (rng.chance(0.6)) {
        const off = ((count + 1) / 2) * spacing * rng.sign();
        const bx = zone.x + t.x * off;
        const bz = zone.z + t.y * off;
        const depth = rng.range(110, 220);
        const w = rng.range(34, 60);
        let ok = true;
        for (let d = 20; d < depth; d += 20) if (this.sample(bx - n.x * d, bz - n.y * d) < 30) ok = false;
        if (ok) this.stampRect(bx, bz, n, t, -depth, 30, w, 'water');
      }
    }
  }

  // Rectangle along direction n from a0 to a1, width w (centred on t axis).
  stampRect(x, z, n, t, a0, a1, w, mode) {
    const corners = [
      [x + n.x * a0 + t.x * w, z + n.y * a0 + t.y * w],
      [x + n.x * a1 + t.x * w, z + n.y * a1 + t.y * w],
      [x + n.x * a0 - t.x * w, z + n.y * a0 - t.y * w],
      [x + n.x * a1 - t.x * w, z + n.y * a1 - t.y * w],
    ];
    const xs = corners.map((c) => c[0]);
    const zs = corners.map((c) => c[1]);
    const hw = w / 2;
    this.stamp(Math.min(...xs) - 10, Math.min(...zs) - 10, Math.max(...xs) + 10, Math.max(...zs) + 10, (f, px, pz) => {
      const dx = px - x;
      const dz = pz - z;
      const a = dx * n.x + dz * n.y;
      const b = dx * t.x + dz * t.y;
      const inside = Math.min(a - a0, a1 - a, hw - Math.abs(b));
      return mode === 'land' ? Math.max(f, inside) : Math.min(f, -inside);
    });
  }

  // ------------------------------------------------------------------- mesh

  // Marching squares over the land field: flat tops at y=0 plus vertical quay
  // walls down below the waterline. Fully-land cells are merged into row runs.
  buildMesh() {
    const { half, cell, n, stride, field } = this;
    const pos = [];
    const nor = [];
    const top = 0;
    const bot = WORLD.wallBottom;

    const pushTri = (ax, az, bx, bz, cx, cz) => {
      // Ensure upward-facing winding.
      const cross = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (cross >= 0) pos.push(ax, top, az, bx, top, bz, cx, top, cz);
      else pos.push(ax, top, az, cx, top, cz, bx, top, bz);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    };

    const pushWall = (px, pz, qx, qz, cx, cz) => {
      // Outward normal points away from the land centroid (cx, cz).
      let nx = qz - pz;
      let nz = -(qx - px);
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      const mx = (px + qx) / 2;
      const mz = (pz + qz) / 2;
      if ((cx - mx) * nx + (cz - mz) * nz > 0) {
        nx = -nx;
        nz = -nz;
      }
      // Quad p_top, q_top, q_bot, p_bot; pick winding that faces (nx, nz).
      const ex = qx - px;
      const ez = qz - pz;
      // Face normal of (p_top, p_bot, q_top) = (p_bot - p_top) x (q_top - p_top)
      // = (0,-h,0) x (ex,0,ez) = (-h*ez, 0, h*ex)  (h = top - bot > 0)
      const fx = -ez;
      const fz = ex;
      const a = [px, top, pz];
      const b = [px, bot, pz];
      const c = [qx, top, qz];
      const d = [qx, bot, qz];
      if (fx * nx + fz * nz > 0) pos.push(...a, ...b, ...c, ...c, ...b, ...d);
      else pos.push(...a, ...c, ...b, ...c, ...d, ...b);
      for (let k = 0; k < 6; k++) nor.push(nx, 0, nz);
    };

    const cx = new Float32Array(4);
    const cz = new Float32Array(4);
    const cv = new Float32Array(4);
    const poly = [];

    for (let j = 0; j < n; j++) {
      let runStart = -1;
      const z0 = -half + j * cell;
      const z1 = z0 + cell;
      for (let i = 0; i <= n; i++) {
        let full = false;
        let any = false;
        if (i < n) {
          const v0 = field[j * stride + i];
          const v1 = field[j * stride + i + 1];
          const v2 = field[(j + 1) * stride + i + 1];
          const v3 = field[(j + 1) * stride + i];
          full = v0 > 0 && v1 > 0 && v2 > 0 && v3 > 0;
          any = v0 > 0 || v1 > 0 || v2 > 0 || v3 > 0;
          if (!full && any) {
            const x0 = -half + i * cell;
            const x1 = x0 + cell;
            cx[0] = x0; cz[0] = z0; cv[0] = v0;
            cx[1] = x1; cz[1] = z0; cv[1] = v1;
            cx[2] = x1; cz[2] = z1; cv[2] = v2;
            cx[3] = x0; cz[3] = z1; cv[3] = v3;
            const saddle = (v0 > 0) === (v2 > 0) && (v1 > 0) === (v3 > 0) && (v0 > 0) !== (v1 > 0);
            const centre = (v0 + v1 + v2 + v3) / 4;
            if (saddle && centre <= 0) {
              // Two separate corner triangles.
              for (let k = 0; k < 4; k++) {
                if (!(cv[k] > 0)) continue;
                const kp = (k + 3) % 4;
                const kn = (k + 1) % 4;
                const tn = cv[k] / (cv[k] - cv[kn]);
                const tp = cv[k] / (cv[k] - cv[kp]);
                const ax = cx[k] + (cx[kn] - cx[k]) * tn;
                const az = cz[k] + (cz[kn] - cz[k]) * tn;
                const bx = cx[k] + (cx[kp] - cx[k]) * tp;
                const bz = cz[k] + (cz[kp] - cz[k]) * tp;
                pushTri(cx[k], cz[k], ax, az, bx, bz);
                pushWall(ax, az, bx, bz, cx[k], cz[k]);
              }
            } else {
              poly.length = 0;
              for (let k = 0; k < 4; k++) {
                const kn = (k + 1) % 4;
                const a = cv[k];
                const b = cv[kn];
                if (a > 0) poly.push(cx[k], cz[k], 0);
                if (a > 0 !== b > 0) {
                  const t = a / (a - b);
                  poly.push(cx[k] + (cx[kn] - cx[k]) * t, cz[k] + (cz[kn] - cz[k]) * t, 1);
                }
              }
              const m = poly.length / 3;
              let sx = 0;
              let sz = 0;
              for (let k = 0; k < m; k++) {
                sx += poly[k * 3];
                sz += poly[k * 3 + 1];
              }
              sx /= m;
              sz /= m;
              for (let k = 1; k < m - 1; k++) {
                pushTri(poly[0], poly[1], poly[k * 3], poly[k * 3 + 1], poly[(k + 1) * 3], poly[(k + 1) * 3 + 1]);
              }
              // Walls between consecutive edge points.
              for (let k = 0; k < m; k++) {
                const kn = (k + 1) % m;
                if (poly[k * 3 + 2] === 1 && poly[kn * 3 + 2] === 1) {
                  pushWall(poly[k * 3], poly[k * 3 + 1], poly[kn * 3], poly[kn * 3 + 1], sx, sz);
                }
              }
            }
          }
        }
        if (full) {
          if (runStart < 0) runStart = i;
        } else if (runStart >= 0) {
          const xa = -half + runStart * cell;
          const xb = -half + i * cell;
          pushTri(xa, z0, xb, z0, xb, z1);
          pushTri(xa, z0, xb, z1, xa, z1);
          runStart = -1;
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}
