import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { Builder } from '../office/builder.js';
import * as F from '../office/furniture.js';
import * as M from './props.js';
import { makeMallPlan, inPoly, FH, SOFFIT, RUN, LAND } from './plan.js';

// Procedural shopping mall in the style of Mirror's Edge's New Eden Mall:
// a tall void ringed by galleries with orange-and-black fascias, black
// handrails and striped columns; escalators criss-crossing the void; roller
// shutters and glass shopfronts under brand signs; a space-frame skylight
// with blue banners and glass-tube chandeliers; white-painted trees. Outside,
// a glazed entrance faces a sunny plaza.

export { FH };

export const MALL_PALETTES = [
  { name: 'amber', accent: '#ffae00', accent2: '#ff8400', banner: '#1f8fe6', pop: '#e8363c', w: 4 },
  { name: 'tangerine', accent: '#ff8a17', accent2: '#ffc02e', banner: '#1f6fe0', pop: '#e02b8b', w: 2 },
  { name: 'lemon', accent: '#ffcf14', accent2: '#f39a00', banner: '#0e9fd0', pop: '#ff5f12', w: 2 },
  { name: 'coral', accent: '#ff6446', accent2: '#ffab8f', banner: '#119f9c', pop: '#1f6fe0', w: 1 },
  { name: 'lime', accent: '#9bcb28', accent2: '#dcec58', banner: '#2a62d6', pop: '#ff7a1a', w: 1 },
  { name: 'aqua', accent: '#16b3c7', accent2: '#86e0e8', banner: '#ff7a1a', pop: '#1f5fe0', w: 1 },
  { name: 'scarlet', accent: '#e2372f', accent2: '#ff8b6a', banner: '#1f8fe6', pop: '#1a1a1a', w: 1 },
  { name: 'violet', accent: '#8c52e0', accent2: '#c7a4ff', banner: '#ffb000', pop: '#e0287a', w: 0.7 },
  { name: 'green', accent: '#2fb35a', accent2: '#9be07a', banner: '#e8363c', pop: '#1f6fe0', w: 0.7 },
  { name: 'sky', accent: '#2f8fe6', accent2: '#8cc8ff', banner: '#ffb000', pop: '#e8363c', w: 0.8 },
];

// Per-mall design choices on top of the layout.
function pickStyle(rng) {
  const w = (opts) => rng.weighted(opts);
  const courts = ['sofas', 'fountain', 'cafe', 'grove', 'kiosk', 'stage'];
  const main = w([['sofas', 2], ['fountain', 2], ['cafe', 1.5], ['grove', 1.5], ['kiosk', 1], ['stage', 1]]);
  const second = rng.chance(0.6) ? rng.pick(courts.filter((c) => c !== main)) : null;
  return {
    fascia: w([['stripe', 4], ['double', 1.5], ['white', 1.5], ['black', 1.2], ['slim', 1]]),
    rail: w([['glass', 4], ['bars', 1.5], ['solid', 1.5]]),
    parapet: w([['white', 2], ['accent', 1], ['accent2', 1]]),
    colRound: rng.chance(0.5),
    colScheme: w([['band', 4], ['tiled', 1.2], ['plain', 1.2], ['accent', 1]]),
    escBody: w([['accentGloss', 4], ['white', 1.5], ['darkMetal', 1.2], ['accent2', 1]]),
    escGlass: rng.chance(0.35),
    skylight: w([['spaceframe', 3], ['barrel', 2], ['ridge', 1.5], ['grid', 1.2]]),
    chandelier: w([['tubes', 3], ['spheres', 1.5], ['rings', 1.5], ['discs', 1], ['none', 0.8]]),
    banners: w([[0, 1], [3, 1.5], [5, 2], [7, 1.5]]),
    court: second ? [main, second] : [main],
    floor: w([['plain', 2], ['border', 2], ['court', 2], ['stripes', 1]]),
    inlay: w([['inlayDark', 2], ['accent2', 1], ['blackGloss', 1], ['inlayLight', 1]]),
    floorTint: rng.pick(['#e2ddd4', '#dcdcda', '#e8e2d6', '#d2d4d6', '#e4d9c8', '#ece9e4']),
    pilaster: w([['white', 2], ['mosaic', 1.5], ['wallAccent', 1], ['blackGloss', 0.8]]),
    plaza: { cafe: rng.chance(0.5), fountain: rng.chance(0.35) },
    light: { open: rng.range(0.85, 0.98), shade0: rng.range(0.26, 0.36), shade1: rng.range(0.34, 0.44), falloff: rng.range(2.0, 3.2), tint: rng.range(0.42, 0.6) },
  };
}
const NAMES = ['Meridian', 'Arcadia', 'Halcyon', 'Solstice', 'Paragon', 'Sunfield', 'Aurora', 'Harbour Point', 'Vista', 'Crescent', 'Lakeside', 'Northgate'];
const SUFFIX = ['Mall', 'Centre', 'Galleria', 'Plaza'];
const SLOGANS = ['Grand opening', 'Summer sale', 'Now open', 'Late nights', 'New season'];

export function mallName(rng) {
  const n = rng.pick(NAMES);
  return { name: `${n} ${rng.pick(SUFFIX)}`, mark: n[0] + n[1].toLowerCase(), slogans: [rng.pick(SLOGANS), rng.pick(SLOGANS)] };
}

const snap = (v, s = 0.6) => Math.round(v / s) * s;

// Free-space bookkeeping inside an arbitrary walkable region.
class Region {
  constructor(test, bounds) {
    this.test = test;
    this.bounds = bounds;
    this.used = [];
  }
  reserve(x0, z0, x1, z1) {
    this.used.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }
  free(x0, z0, x1, z1, pad = 0.4) {
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) if (!this.test(x, z)) return false;
    for (const u of this.used) if (x0 < u[2] + pad && x1 > u[0] - pad && z0 < u[3] + pad && z1 > u[1] - pad) return false;
    return true;
  }
  take(x0, z0, x1, z1, pad) {
    if (!this.free(x0, z0, x1, z1, pad)) return false;
    this.reserve(x0, z0, x1, z1);
    return true;
  }
  spot(rng, w, d, tries = 40, pad) {
    const r = this.bounds;
    for (let i = 0; i < tries; i++) {
      const x = rng.range(r.x0 + w / 2, r.x1 - w / 2);
      const z = rng.range(r.z0 + d / 2, r.z1 - d / 2);
      if (this.take(x - w / 2, z - d / 2, x + w / 2, z + d / 2, pad)) return { x, z };
    }
    return null;
  }
}

export function generateMall(seed) {
  const rng = new RNG(seed);
  const pal = rng.weighted(MALL_PALETTES.map((p) => [p, p.w]));
  const mall = mallName(rng);
  const plan = makeMallPlan(rng);
  const style = pickStyle(rng);
  const { levels, HA, B, V, G, voids, flights, bridges, lift, entrance: E, units, plaza } = plan;
  const b = new Builder();
  const ceilY = (L) => (L + 1) * FH - SOFFIT;
  const roundCols = style.colRound;
  const railStyle = style.rail;
  const focus = [];
  const addFocus = (x, y, z, w = 1, tag = '') => focus.push({ x, y, z, weight: w, tag });

  const rect = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
  const shape = (outer, holes, flip) => {
    const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, flip ? -z : z)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, flip ? -z : z))));
    return s;
  };
  // Flat polygon (with holes) facing up or down at height y.
  const flat = (key, outer, holes, y, up) => {
    const g = new THREE.ShapeGeometry(shape(outer, holes, up));
    g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    g.translate(0, y, 0);
    b.push(key, g);
  };
  // Colliders for a slab: the plate minus a polygonal hole, as row runs.
  const slabColliders = (poly, y0, y1) => {
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    const hb = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    b.collider(B.x0, y0, B.z0, B.x1, y1, hb.z0);
    b.collider(B.x0, y0, hb.z1, B.x1, y1, B.z1);
    b.collider(B.x0, y0, hb.z0, hb.x0, y1, hb.z1);
    b.collider(hb.x1, y0, hb.z0, B.x1, y1, hb.z1);
    const s = 0.6;
    for (let z = hb.z0; z < hb.z1 - 1e-6; z += s) {
      let run = null;
      for (let x = hb.x0; x < hb.x1 + s; x += s) {
        const solid = x < hb.x1 && !inPoly(poly, x + s / 2, z + s / 2);
        if (solid && run === null) run = x;
        if (!solid && run !== null) {
          b.collider(run, y0, z, x, y1, Math.min(z + s, hb.z1));
          run = null;
        }
      }
    }
  };

  // ------------------------------------------------------------- floors
  b.box('floorTile', B.x0, -0.3, B.z0, B.x1, 0, B.z1);
  for (let L = 1; L < levels; L++) {
    const poly = voids[L].pts;
    flat('floorTile', rect(B), [poly], L * FH, true);
    flat('ceil:ceilLayIn', rect(B), [poly], L * FH - SOFFIT, false);
    slabColliders(poly, L * FH - 0.6, L * FH);
  }
  // Roof with the skylight opening.
  const top = voids[levels - 1].pts;
  flat('ceil:roof', rect(B), [top], HA + 0.05, true);
  flat('ceil:ceilLayIn', rect(B), [top], HA - SOFFIT, false);
  slabColliders(top, HA - 0.6, HA + 0.05);

  // Bridges across the void where the escalators land.
  for (const br of bridges) {
    const y = br.level * FH;
    b.box('floorTile', br.x0, y - 0.03, V.z0, br.x1, y, V.z1);
    b.box('white', br.x0, y - 0.7, V.z0, br.x1, y - 0.03, V.z1);
  }

  // Floor inlays: a band tracing the void, a field under it, or stripes.
  if (style.floor === 'court') {
    const poly = voids[1].pts;
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
    const cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    flat(style.inlay, poly.map(([x, z]) => [cx + (x - cx) * 0.86, cz + (z - cz) * 0.8]), [], 0.008, true);
  } else if (style.floor === 'stripes') {
    for (let z = G.z0 + 2.4; z < G.z1 - 2; z += 2.4) b.box(style.inlay, G.x0 + 1.5, 0, z - 0.15, G.x1 - 1.5, 0.008, z + 0.15, false);
  }

  // ----------------------------------------------- void edges: fascias, rails
  const splitGaps = (p, q, gaps) => {
    // Only N/S (x-aligned) edges carry gaps.
    if (Math.abs(p[1] - q[1]) > 1e-3 || !gaps.length) return [[p, q]];
    const z = p[1];
    const lo = Math.min(p[0], q[0]);
    const hi = Math.max(p[0], q[0]);
    const pieces = [];
    let cur = lo;
    for (const [g0, g1] of [...gaps].sort((a, c) => a[0] - c[0])) {
      if (g1 <= lo || g0 >= hi) continue;
      if (g0 > cur) pieces.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < hi) pieces.push([cur, hi]);
    const fwd = q[0] > p[0];
    return pieces.map(([a, c]) => (fwd ? [[a, z], [c, z]] : [[c, z], [a, z]]));
  };
  const edgeSide = (poly, p, q) => {
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const len = Math.hypot(dx, dz);
    const mx = (p[0] + q[0]) / 2 - (dz / len) * 0.3;
    const mz = (p[1] + q[1]) / 2 + (dx / len) * 0.3;
    return inPoly(poly, mx, mz) ? 1 : -1;
  };
  for (let L = 1; L <= levels; L++) {
    const poly = voids[Math.min(L, levels - 1)].pts;
    const y = L < levels ? L * FH : HA;
    const gaps = [];
    const br = bridges.find((q) => q.level === L);
    if (br) gaps.push([br.x0, br.x1]);
    const liftGap = !lift.none && L < levels ? [lift.x0, lift.x1] : null;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const side = edgeSide(poly, p, q);
      const edgeZ = p[1];
      const g = [...gaps];
      if (liftGap && Math.abs(p[1] - q[1]) < 1e-3 && Math.abs(edgeZ - (lift.side === 'N' ? V.z0 : V.z1)) < 1e-3) g.push(liftGap);
      if (style.floor === 'border') {
        // Ground-floor band under the gallery edge, and a strip by each railing.
        if (L === 1) M.inlay(b, p, q, 0.002, -side * 0.5, -side * 1.1, style.inlay);
        if (L < levels) M.inlay(b, p, q, y, -side * 0.45, -side * 0.75, style.inlay);
      }
      for (const [a, c] of splitGaps(p, q, g)) {
        M.fascia(b, a, c, y, side, style.fascia);
        if (L < levels) M.railing(b, a, c, y, side, railStyle);
      }
    }
    if (br) {
      // Bridge edges, open where escalators meet them.
      for (const edge of ['W', 'E']) {
        const x = edge === 'W' ? br.x0 : br.x1;
        const lanesHere = flights.filter((f) => (f.level + 1 === L && br.arriveEdge === edge) || (f.level === L && (f.dir > 0 ? f.x0 === x : f.x0 === x)));
        const gz = lanesHere.map((f) => [Math.min(...f.zs) - 0.8, Math.max(...f.zs) + 0.8]).sort((a, c) => a[0] - c[0]);
        let cur = V.z0;
        const pieces = [];
        for (const [g0, g1] of gz) {
          if (g0 > cur) pieces.push([cur, g0]);
          cur = Math.max(cur, g1);
        }
        if (cur < V.z1) pieces.push([cur, V.z1]);
        const side = edge === 'W' ? 1 : -1; // void to the left when walking +z on the W edge
        for (const [z0, z1] of pieces) {
          M.fascia(b, [x, z0], [x, z1], y, side, style.fascia);
          M.railing(b, [x, z0], [x, z1], y, side, railStyle);
        }
      }
    }
  }

  // ------------------------------------------------------------ columns
  const inAnyBridge = (L, x, z, m = 0) => bridges.some((q) => q.level === L && x > q.x0 - m && x < q.x1 + m && z > V.z0 - m && z < V.z1 + m);
  const chainZone = (x) => x > plan.chain.x0 - 1.5 && x < plan.chain.x1 + 1.5;
  for (let L = 0; L < levels; L++) {
    const poly = voids[Math.min(L + 1, levels - 1)].pts;
    const here = L >= 1 ? voids[L].pts : null;
    const y1 = ceilY(L);
    let per = 0;
    const off = rng.range(0, 4);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const side = edgeSide(poly, p, q);
      const nx = (-(q[1] - p[1]) / len) * side;
      const nz = ((q[0] - p[0]) / len) * side;
      for (let a = ((off - per) % 9 + 9) % 9; a < len; a += 9) {
        const x = p[0] + ((q[0] - p[0]) * a) / len - nx * 0.9;
        const z = p[1] + ((q[1] - p[1]) * a) / len - nz * 0.9;
        const clear = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].every(([dx, dz]) => !inPoly(poly, x + dx, z + dz) && !(here && inPoly(here, x + dx, z + dz)));
        if (!clear || inAnyBridge(L, x, z, 1) || inAnyBridge(L + 1, x, z, 1)) continue;
        if (Math.abs(z - (V.z0 + V.z1) / 2) < 4 && chainZone(x)) continue;
        if (x < G.x0 + 1 || x > G.x1 - 1 || z < G.z0 + 1 || z > G.z1 - 1) continue;
        M.column(b, x, z, L * FH, y1, 0.42, roundCols, style.colScheme);
      }
      per += len;
    }
  }

  // ---------------------------------------------------------- escalators
  for (const f of flights) {
    f.paths = f.zs.map((z) => M.escalator(b, f.x0, f.level * FH, z, f.dir, FH, RUN, LAND, { body: style.escBody, side: style.escGlass ? 'glass' : style.escBody }));
    addFocus((f.x0 + f.x1) / 2, f.level * FH + FH / 2, (f.zs[0] + f.zs[1]) / 2, 1.5, 'escalator');
  }

  // --------------------------------------------------------------- lift
  if (!lift.none) {
    const { x0, x1, z0, z1 } = lift;
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.box('darkMetal', px - 0.08, 0, pz - 0.08, px + 0.08, HA + 0.6, pz + 0.08, false);
    const gz = lift.side === 'N' ? z0 : z1; // gallery-facing side
    const oz = lift.side === 'N' ? z1 : z0;
    b.box('glass', x0, 0, oz - 0.02, x1, HA, oz + 0.02, false);
    b.box('glass', x0 - 0.02, 0, z0, x0 + 0.02, HA, z1, false);
    b.box('glass', x1 - 0.02, 0, z0, x1 + 0.02, HA, z1, false);
    for (let L = 0; L < levels; L++) {
      b.box('darkMetal', x0, L * FH, gz - 0.04, x1, L * FH + 0.12, gz + 0.04, false);
      b.box('metal', x0 + 0.3, L * FH, gz - 0.03, x1 - 0.3, L * FH + 2.3, gz + 0.03, false);
      b.box('glass', x0, L * FH + 2.3, gz - 0.02, x1, (L + 1) * FH, gz + 0.02, false);
    }
    const cy = snap(rng.range(0.5, HA - 3.5), 0.1);
    b.box('darkMetal', x0 + 0.15, cy, z0 + 0.15, x1 - 0.15, cy + 0.15, z1 - 0.15, false);
    b.box('darkMetal', x0 + 0.15, cy + 2.5, z0 + 0.15, x1 - 0.15, cy + 2.7, z1 - 0.15, false);
    b.box('emissiveSoft', x0 + 0.4, cy + 2.49, z0 + 0.4, x1 - 0.4, cy + 2.5, z1 - 0.4, false);
    b.collider(x0, 0, z0, x1, HA, z1, { glass: true });
    addFocus((x0 + x1) / 2, cy + 1.2, (z0 + z1) / 2, 0.6, 'lift');
  }

  // ------------------------------------------------------------- shops
  const brandCells = 16;
  let cell = rng.int(0, brandCells - 1);
  const pilasterKey = style.pilaster;
  const bandLines = new Map();
  const openShops = [];
  for (const u of units) {
    const y0 = u.level * FH;
    const ceil = ceilY(u.level) - y0;
    const axis = u.side === 'N' || u.side === 'S' ? 'x' : 'z';
    const c = u.front;
    const inward = u.side === 'N' || u.side === 'W' ? -1 : 1; // toward the shop
    const out = -inward; // toward the gallery
    const depth = Math.abs(u.back - u.front);
    const o = (a, d) => [Math.min(a * out, d * out), Math.max(a * out, d * out)];
    const oi = (a, d) => [Math.min(a * inward, d * inward), Math.max(a * inward, d * inward)];
    // Party walls (once per line).
    const key = `${u.level}${u.side}`;
    if (!bandLines.has(key)) bandLines.set(key, new Set());
    for (const a of [u.a0, u.a1]) {
      const k = a.toFixed(2);
      if (bandLines.get(key).has(k)) continue;
      bandLines.get(key).add(k);
      if (axis === 'x') b.box('wall', a - 0.1, y0, Math.min(c, u.back), a + 0.1, y0 + ceil, Math.max(c, u.back));
      else b.box('wall', Math.min(c, u.back), y0, a - 0.1, Math.max(c, u.back), y0 + ceil, a + 0.1);
    }
    // Pilasters and the sign band.
    const pw = 0.4;
    b.wallBox(pilasterKey, axis, c, u.a0, u.a0 + pw, y0, y0 + ceil, ...o(-0.15, 0.25), true);
    b.wallBox(pilasterKey, axis, c, u.a1 - pw, u.a1, y0, y0 + ceil, ...o(-0.15, 0.25), true);
    const oa0 = u.a0 + pw;
    const oa1 = u.a1 - pw;
    const top = 3.3;
    b.wallBox('white', axis, c, oa0, oa1, y0 + top, y0 + ceil, ...o(-0.15, 0.2), true);
    b.wallBox('blackGloss', axis, c, oa0, oa1, y0 + top - 0.04, y0 + top, ...o(-0.15, 0.22));
    // Brand sign.
    if (u.kind !== 'blank') {
      const sw = Math.min(oa1 - oa0 - 0.6, 4.4);
      const sh = sw / 4;
      const mid = (oa0 + oa1) / 2;
      const px = axis === 'x' ? mid : c + out * 0.205;
      const pz = axis === 'x' ? c + out * 0.205 : mid;
      const rot = axis === 'x' ? (out > 0 ? 0 : Math.PI) : out > 0 ? Math.PI / 2 : -Math.PI / 2;
      const f = b.frame(px, y0 + top + (ceil - top) / 2, pz, rot);
      M.signPlane(b, f, 'signs', 0, 0, 0, sw, Math.min(sh, ceil - top - 0.15), cell % brandCells, 2, 8);
      cell += rng.int(1, 3);
    }
    if (u.kind === 'shutter') {
      b.wallBox('shutter', axis, c, oa0, oa1, y0, y0 + top, -0.03, 0.03, true);
      b.wallBox('white', axis, c, oa0, oa1, y0 + top - 0.3, y0 + top, ...o(0.03, 0.18));
      b.wallBox('metal', axis, c, oa0, oa1, y0, y0 + 0.08, ...o(0.02, 0.06));
      for (const a of [oa0, oa1 - 0.08]) b.wallBox('metal', axis, c, a, a + 0.08, y0, y0 + top, ...o(-0.03, 0.08));
      if (rng.chance(0.3)) {
        // A shutter left half open.
        const h = rng.range(0.4, 1.1);
        b.wallBox('shopDark', axis, c, oa0 + 0.1, oa1 - 0.1, y0, y0 + h, ...oi(0.05, 0.3));
      }
    } else if (u.kind === 'open') {
      // Glass front with an open door; lit interior behind.
      const dw = 1.8;
      const ds = snap(rng.range(oa0 + 0.6, oa1 - 0.6 - dw), 0.1);
      for (const [g0, g1] of [[oa0, ds], [ds + dw, oa1]]) {
        if (g1 - g0 < 0.1) continue;
        b.wallBox('glass', axis, c, g0, g1, y0 + 0.1, y0 + top, -0.01, 0.01);
        const col = axis === 'x' ? b.collider(g0, y0, c - 0.05, g1, y0 + top, c + 0.05) : b.collider(c - 0.05, y0, g0, c + 0.05, y0 + top, g1);
        col.glass = true;
        const n = Math.max(1, Math.round((g1 - g0) / 1.6));
        for (let i = 0; i <= n; i++) {
          const a = g0 + ((g1 - g0) * i) / n;
          b.wallBox('darkMetal', axis, c, a - 0.025, a + 0.025, y0, y0 + top, -0.04, 0.04);
        }
      }
      b.wallBox('darkMetal', axis, c, oa0, oa1, y0, y0 + 0.1, -0.05, 0.05);
      openShops.push({ u, y0, ceil, axis, c, inward, depth });
    } else {
      // Tiled wall with a billboard.
      const tile = rng.chance(0.6) ? 'mosaic' : 'wallAccent';
      b.wallBox(tile, axis, c, oa0, oa1, y0, y0 + top, ...o(-0.15, 0.02), true);
      const bw = Math.min(oa1 - oa0 - 1, 6);
      if (bw > 2) {
        const mid = (oa0 + oa1) / 2;
        const px = axis === 'x' ? mid : c + out * 0.02;
        const pz = axis === 'x' ? c + out * 0.02 : mid;
        const rot = axis === 'x' ? (out > 0 ? 0 : Math.PI) : out > 0 ? Math.PI / 2 : -Math.PI / 2;
        M.billboard(b, px, y0 + 0.8, pz, rot, bw, bw * 0.375, `ad${rng.int(0, 3)}`, rng.chance(0.5) ? 'white' : 'blackGloss');
        addFocus(px + (axis === 'x' ? 0 : out * 0.5), y0 + 1.8, pz + (axis === 'x' ? out * 0.5 : 0), 0.7, 'billboard');
      }
    }
  }

  // Shop interiors behind the glass fronts.
  for (const s of openShops) {
    const { u, y0, ceil, axis, c, inward, depth } = s;
    const back = u.back - inward * 0.3;
    const lo = Math.min(c, back);
    const hi = Math.max(c, back);
    const a0 = u.a0 + 0.1;
    const a1 = u.a1 - 0.1;
    const fx = (a, d) => (axis === 'x' ? [a, d] : [d, a]);
    const theme = rng.weighted([['accent', 1.2], ['white', 2], ['wood', 1], ['black', 0.8]]);
    // Back wall finish, shelves along the side walls, a display table or racks.
    const backKey = theme === 'accent' ? 'wallAccent' : theme === 'wood' ? 'wood' : theme === 'black' ? 'blackGloss' : 'white';
    if (axis === 'x') b.box(backKey, a0, y0, back - 0.01, a1, y0 + ceil, back + 0.01, false);
    else b.box(backKey, back - 0.01, y0, a0, back + 0.01, y0 + ceil, a1, false);
    const shelfKey = theme === 'black' ? 'white' : rng.pick(['white', 'blackGloss', 'wood']);
    for (const [a, d] of [[a0 + 0.1, a0 + 0.55], [a1 - 0.55, a1 - 0.1]]) {
      const [x0, x1] = axis === 'x' ? [a, d] : [lo + 0.8, hi - 0.8];
      const [z0, z1] = axis === 'x' ? [lo + 0.8, hi - 0.8] : [a, d];
      b.box(shelfKey, x0, y0, z0, x1, y0 + 2.2, z1);
      for (let k = 1; k <= 4; k++) {
        const sy = y0 + 0.3 + k * 0.42;
        for (let t = 0; t < 6; t++) {
          const along = lo + 1.0 + ((hi - lo - 2.0) * (t + rng.range(0.1, 0.9))) / 6;
          const [px, pz] = axis === 'x' ? [(x0 + x1) / 2, along] : [along, (z0 + z1) / 2];
          const sz = rng.range(0.12, 0.28);
          b.box(rng.pick(['white', 'accent', 'accent2', 'blackGloss', 'upholstery']), px - 0.12, sy, pz - sz / 2, px + 0.12, sy + rng.range(0.15, 0.32), pz + sz / 2, false);
        }
      }
    }
    const mid = (a0 + a1) / 2;
    const md = (c + back) / 2;
    const [tx, tz] = fx(mid, md);
    if (rng.chance(0.6)) {
      const f = b.frame(tx, y0, tz, axis === 'x' ? 0 : Math.PI / 2);
      f.box(theme === 'wood' ? 'wood' : 'whiteGloss', -1.2, 0.7, -0.5, 1.2, 0.76, 0.5, true);
      f.box('darkMetal', -1.1, 0, -0.4, -1.0, 0.7, 0.4);
      f.box('darkMetal', 1.0, 0, -0.4, 1.1, 0.7, 0.4);
      for (let k = 0; k < 5; k++) {
        const px = rng.range(-1.0, 0.9);
        const pz = rng.range(-0.35, 0.25);
        f.box(rng.pick(['accent', 'white', 'blackGloss', 'accent2']), px, 0.76, pz, px + rng.range(0.1, 0.25), 0.76 + rng.range(0.05, 0.25), pz + rng.range(0.1, 0.2));
      }
    } else {
      // Clothes rails.
      for (const k of [-1, 1]) {
        const f = b.frame(tx + (axis === 'x' ? k * 1.2 : 0), y0, tz + (axis === 'x' ? 0 : k * 1.2), axis === 'x' ? Math.PI / 2 : 0);
        f.box('metal', -0.9, 1.5, -0.02, 0.9, 1.54, 0.02);
        for (const s2 of [-1, 1]) f.box('metal', s2 * 0.9 - 0.02, 0, -0.02, s2 * 0.9 + 0.02, 1.54, 0.02);
        for (let i = 0; i < 12; i++) f.box(rng.pick(['white', 'accent', 'blackGloss', 'accent2', 'wallAccent2']), -0.85 + i * 0.15, 0.7, -0.22, -0.8 + i * 0.15, 1.48, 0.22);
        f.collide(-0.95, 0, -0.25, 0.95, 1.6, 0.25);
      }
    }
    for (let i = 0; i < Math.floor((a1 - a0) / 2); i++) {
      for (let j = 0; j < Math.floor((hi - lo) / 2.4); j++) {
        const [px, pz] = fx(a0 + 1 + i * 2, lo + 1.2 + j * 2.4);
        F.downlight(b, px, y0 + ceil, pz);
      }
    }
    addFocus(tx, y0 + 1.2, tz, 0.6, 'shop');
  }

  // ------------------------------------------------------ outer walls
  const wallH = HA + 1.2;
  const facadeWall = (axis, c, a0, a1, outward, openings = []) => {
    const ops = [...openings].sort((p, q) => p[0] - q[0]);
    let cur = a0;
    const pieces = [];
    for (const [o0, o1, oh] of ops) {
      if (o0 > cur) pieces.push([cur, o0, 0]);
      pieces.push([o0, o1, oh]);
      cur = o1;
    }
    if (cur < a1) pieces.push([cur, a1, 0]);
    for (const [p0, p1, oh] of pieces) {
      b.wallBox('wall', axis, c, p0, p1, oh, wallH, -0.15, 0.15, true);
      b.wallBox('stone', axis, c, p0, p1, oh, wallH, ...(outward > 0 ? [0.15, 0.2] : [-0.2, -0.15]));
    }
    for (let L = 1; L <= levels; L++) b.wallBox('stoneBand', axis, c, a0, a1, L * FH - 0.35, L * FH + 0.15, ...(outward > 0 ? [0.2, 0.32] : [-0.32, -0.2]));
    b.wallBox('stoneBand', axis, c, a0, a1, wallH - 0.3, wallH, ...(outward > 0 ? [0.2, 0.34] : [-0.34, -0.2]));
  };
  facadeWall('x', B.z0, B.x0, B.x1, -1);
  facadeWall('x', B.z1, B.x0, B.x1, 1, [[E.x0, E.x1, 3.4]]);
  facadeWall('z', B.x0, B.z0, B.z1, -1);
  facadeWall('z', B.x1, B.z0, B.z1, 1);

  // ----------------------------------------------------------- entrance
  // Doors at the facade: the middle pair stands open.
  {
    const n = Math.max(4, Math.round((E.x1 - E.x0) / 1.8));
    const dw = (E.x1 - E.x0) / n;
    const z = B.z1;
    for (let i = 0; i < n; i++) {
      const a = E.x0 + i * dw;
      b.box('darkMetal', a - 0.04, 0, z - 0.06, a + 0.04, 3.4, z + 0.06, false);
      const open = Math.abs(i + 0.5 - n / 2) < 1.1;
      if (!open) {
        b.box('glass', a, 0, z - 0.015, a + dw, 3.3, z + 0.015, false);
        b.collider(a, 0, z - 0.05, a + dw, 3.4, z + 0.05, { glass: true });
        b.box('metal', a + dw / 2 - 0.02, 0.9, z - 0.08, a + dw / 2 + 0.02, 1.6, z + 0.08, false);
      }
    }
    b.box('darkMetal', E.x0, 3.3, z - 0.08, E.x1, 3.45, z + 0.08, false);
  }
  // Glazed entrance box with a lattice of diagonal struts, the mall's name above.
  const VB = { x0: E.x0 - 1.2, x1: E.x1 + 1.2, z0: B.z1 + 0.2, z1: B.z1 + E.depth, h: Math.min(HA, 2 * FH + 1.6) };
  {
    const { x0, x1, z0, z1, h } = VB;
    b.box('white', x0 - 0.3, h, z0, x1 + 0.3, h + 0.5, z1 + 0.3);
    b.box('white', x0 - 0.3, h - 2.0, z1, x1 + 0.3, h + 0.5, z1 + 0.3);
    const signH = Math.min(1.4, ((x1 - x0) * 0.9) / 8);
    const sf = b.frame((x0 + x1) / 2, h - 1.0 - signH / 2, z1 + 0.305, 0);
    sf.geo('mallSign', new THREE.PlaneGeometry(1, 1), 0, 0, 0, 0, signH * 8, signH, 1);
    // Front glazing and struts.
    const gh = h - 2.0;
    b.box('glass', x0, 0, z1 - 0.02, x1, gh, z1 + 0.02, false);
    b.collider(x0, 0, z1 - 0.05, (x0 + x1) / 2 - 1.6, gh, z1 + 0.05, { glass: true });
    b.collider((x0 + x1) / 2 + 1.6, 0, z1 - 0.05, x1, gh, z1 + 0.05, { glass: true });
    const s = 2.4;
    const node = (x, y) => new THREE.Vector3(x, y, z1 - 0.12);
    for (let k = -Math.ceil(gh / s); k <= Math.ceil((x1 - x0) / s) + 1; k++) {
      for (const sg of [1, -1]) {
        // Line x = x0 + k*s + sg*y, clipped to the rectangle.
        const pts = [];
        for (const y of [0, gh]) {
          const x = x0 + k * s + sg * y;
          if (x >= x0 - 1e-6 && x <= x1 + 1e-6) pts.push(node(x, y));
        }
        for (const x of [x0, x1]) {
          const y = (x - x0 - k * s) * sg;
          if (y > 0 && y < gh) pts.push(node(x, y));
        }
        if (pts.length >= 2) b.between('frame', new THREE.CylinderGeometry(1, 1, 1, 6), pts[0], pts[1], 0.07);
      }
    }
    for (const x of [x0, x1]) b.box('white', x - 0.15, 0, z1 - 0.2, x + 0.15, gh, z1);
    b.box('white', x0, gh - 0.3, z1 - 0.25, x1, gh, z1);
    b.box('white', x0, 3.4, z1 - 0.2, x1, 3.6, z1);
    // Sides.
    for (const x of [x0, x1]) {
      b.box('glass', x - 0.02, 0, z0, x + 0.02, gh, z1, false);
      b.collider(x - 0.05, 0, z0, x + 0.05, gh, z1, { glass: true });
      for (let z = z0; z <= z1; z += (z1 - z0) / 2) b.box('darkMetal', x - 0.05, 0, z - 0.05, x + 0.05, gh, z + 0.05, false);
    }
    // Accent wall behind the glass with the mall mark.
    b.box('wallAccent', E.x0 - 1.1, 3.6, B.z1 + 0.2, E.x1 + 1.1, h, B.z1 + 0.25, false);
    const mf = b.frame((x0 + x1) / 2, 3.8 + (gh - 3.8) / 2, B.z1 + 0.26, 0);
    const ms = Math.min(gh - 4.2, 6);
    mf.geo('mallMark', new THREE.PlaneGeometry(1, 1), 0, 0, 0, 0, ms, ms, 1);
    addFocus((x0 + x1) / 2, h * 0.5, z1, 2, 'entrance');
  }

  // ------------------------------------------------------------- plaza
  b.box('paving', plaza.x0, -0.3, plaza.z0, plaza.x1, 0, plaza.z1);
  b.box('ground', plaza.x0 - 400, -0.5, plaza.z0 - 400, plaza.x1 + 400, -0.3, plaza.z1 + 400, false);
  // Kerb and a strip of road beyond the plaza.
  b.box('concrete', plaza.x0, 0, plaza.z1 - 0.3, plaza.x1, 0.15, plaza.z1, false);
  b.box('asphalt', plaza.x0 - 400, -0.29, plaza.z1, plaza.x1 + 400, -0.28, plaza.z1 + 14, false);

  // Buildings framing the plaza, with a colonnade at street level.
  const sideBlocks = [];
  for (const sgn of [-1, 1]) {
    const x0 = sgn < 0 ? plaza.x0 - 16 : plaza.x1;
    const x1 = sgn < 0 ? plaza.x0 : plaza.x1 + 16;
    const z0 = plaza.z0 - 8;
    const z1 = plaza.z1 - 2;
    const h = rng.range(14, 22);
    const face = sgn < 0 ? x1 : x0; // facing the plaza
    const inner = sgn < 0 ? x1 - 4 : x0 + 4;
    const [m0, m1] = sgn < 0 ? [x0, inner] : [inner, x1];
    b.box('stone', m0, 0, z0, m1, 4.4, z1, false);
    b.box('facade', x0, 4.4, z0, x1, h, z1, false);
    const [s0, s1] = sgn < 0 ? [inner, x1 + 0.15] : [x0 - 0.15, inner];
    b.box('concrete', s0, 4.2, z0, s1, 4.8, z1, false);
    for (let z = z0 + 3; z < z1 - 2; z += 6) F.column(b, (face + inner) / 2, z, 0, 4.2, 0.35, 'mosaicBlue');
    // Shop windows with blue screens under the colonnade.
    for (let z = z0 + 2; z < z1 - 3; z += 4) {
      const sx = inner - sgn * 0.06;
      b.box('shopDark', sx - 0.02, 0.2, z, sx + 0.02, 3.6, z + 3.2, false);
      if (rng.chance(0.6)) b.box('blueScreen', sx - sgn * 0.03 - 0.01, 1.2, z + 1.0, sx - sgn * 0.03 + 0.01, 2.6, z + 2.1, false);
    }
    b.collider(m0, 0, z0, m1, 4.2, z1);
    b.collider(x0, 4.2, z0, x1, h, z1);
    // Billboards on the upper wall.
    const bx = face - sgn * 0.02;
    const rot = sgn < 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let k = 0; k < 2; k++) {
      const z = z0 + (z1 - z0) * (0.3 + 0.4 * k);
      M.billboard(b, bx, 5.4, z, rot, 7, 2.6, `plazaAd${k % 2}`, 'white');
    }
    sideBlocks.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0, z1 });
  }
  // Giant banners on the mall facade either side of the entrance box.
  for (const sgn of [-1, 1]) {
    const x = sgn < 0 ? (B.x0 + VB.x0) / 2 : (VB.x1 + B.x1) / 2;
    M.billboard(b, x, FH + 0.6, B.z1 + 0.34, 0, 9, 3.4, `plazaAd${sgn < 0 ? 0 : 1}`, 'white');
  }

  // ----------------------------------------------------------- decor
  const Lplaza = new Region((x, z) => x > plaza.x0 + 1 && x < plaza.x1 - 1 && z > VB.z1 + 2 && z < plaza.z1 - 1.5 && !sideBlocks.some((s) => x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 && z < s.z1), { x0: plaza.x0, x1: plaza.x1, z0: VB.z1, z1: plaza.z1 });
  // Keep an approach to the entrance clear.
  Lplaza.reserve((VB.x0 + VB.x1) / 2 - 3, VB.z1, (VB.x0 + VB.x1) / 2 + 3, plaza.z1);
  for (let i = 0; i < rng.int(2, 3); i++) {
    const w = rng.range(4.8, 7.2);
    const s = Lplaza.spot(rng, w + 1.6, w + 1.6, 40, 1);
    if (!s) continue;
    M.planterBox(b, s.x, 0, s.z, w, w, 0.6, 'concrete');
    M.whiteTree(b, rng, s.x, 0.6, s.z, rng.range(6, 8));
    for (let k = 0; k < 3; k++) M.fronds(b, rng, s.x + rng.range(-w / 3, w / 3), 0.6, s.z + rng.range(-w / 3, w / 3), rng.range(0.9, 1.4));
    for (const [dx, dz, rot] of [[0, w / 2 + 0.45, 0], [0, -w / 2 - 0.45, Math.PI]]) M.slatBench(b, s.x + dx, 0, s.z + dz, rot, w * 0.7, 'wood');
    addFocus(s.x, 2.5, s.z, 1, 'plaza');
  }
  for (let i = 0; i < rng.int(2, 4); i++) {
    const s = Lplaza.spot(rng, 3.2, 3.2, 40, 0.8);
    if (!s) continue;
    M.planterBox(b, s.x, 0, s.z, 2, 2, 0.75, 'mosaicBlue');
    M.fronds(b, rng, s.x, 0.75, s.z, rng.range(0.7, 1.1));
    M.slatBench(b, s.x + 1.8, 0, s.z, -Math.PI / 2, 1.8, 'wood');
    M.bin(b, s.x - 1.5, 0, s.z + 1.2, 0);
  }
  {
    const s = Lplaza.spot(rng, 2.4, 2.4, 30, 1);
    if (s) {
      const f = b.frame(s.x, 0, s.z, rng.range(0, Math.PI));
      f.box('concrete', -1.2, 0, -0.6, 1.2, 0.4, 0.6, true);
      f.geo('stone', new THREE.BoxGeometry(1.4, 4, 0.5), 0, 2.2, 0, 0, 1, 1, 1, 0.12, 0.08);
      b.collider(s.x - 0.8, 0, s.z - 0.8, s.x + 0.8, 4.2, s.z + 0.8);
      addFocus(s.x, 2, s.z, 0.6, 'plaza');
    }
  }
  if (style.plaza.fountain) {
    const s = Lplaza.spot(rng, 8, 8, 30, 1);
    if (s) {
      M.fountain(b, rng, s.x, 0, s.z, rng.range(2.6, 3.6));
      addFocus(s.x, 1.2, s.z, 1, 'plaza');
    }
  }
  if (style.plaza.cafe) {
    const s = Lplaza.spot(rng, 10, 7, 30, 1);
    if (s) {
      for (const [dx, dz] of [[-3.2, -1.8], [0, -1.8], [3.2, -1.8], [-3.2, 1.8], [0, 1.8], [3.2, 1.8]]) {
        if (rng.chance(0.2)) continue;
        F.cafeTable(b, s.x + dx, 0, s.z + dz, 'whiteGloss');
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          F.simpleChair(b, s.x + dx + Math.sin(a) * 0.72, 0, s.z + dz + Math.cos(a) * 0.72, a + Math.PI, 'whiteGloss');
        }
        M.umbrella(b, s.x + dx, 0, s.z + dz, 1.4, rng.chance(0.5) ? 'canvas' : 'canvasWhite');
      }
      addFocus(s.x, 1.5, s.z, 1, 'plaza');
    }
  }
  for (let x = B.x0 + 4; x < B.x1 - 3; x += rng.range(6, 8)) {
    if (x > VB.x0 - 2 && x < VB.x1 + 2) continue;
    M.bannerPole(b, x, 0, B.z1 + 2.6, 7.5, 'plazaBanner', 0);
  }

  // The court: rug and sofas, sculpture, planters with white trees, lightboxes.
  const courtTest = (x, z) => x > G.x0 + 1.6 && x < G.x1 - 1.6 && z > G.z0 + 1.6 && z < G.z1 - 1.6;
  const court = new Region(courtTest, G);
  for (const f of flights) {
    if (f.level !== 0) continue;
    const xs = [f.x0, f.x1];
    court.reserve(Math.min(...xs) - 3, Math.min(...f.zs) - 1.2, Math.max(...xs) + 1, Math.max(...f.zs) + 1.2);
  }
  for (const q of flights) court.reserve(Math.min(q.x0, q.x1) - 1, Math.min(...q.zs) - 1.2, Math.max(q.x0, q.x1) + 1, Math.max(...q.zs) + 1.2);
  if (!lift.none) court.reserve(lift.x0 - 1.5, lift.z0 - 1.5, lift.x1 + 1.5, lift.z1 + 1.5);
  court.reserve(E.x0 - 1, G.z1 - 5, E.x1 + 1, G.z1 + 1);
  // Columns in the court are colliders already; keep furniture off them by sampling.
  const colClear = (x0, z0, x1, z1) => !b.colliders.some((c) => c.y0 < 1 && c.y1 > 1 && c.x1 - c.x0 < 1.2 && c.z1 - c.z0 < 1.2 && x0 < c.x1 + 0.4 && x1 > c.x0 - 0.4 && z0 < c.z1 + 0.4 && z1 > c.z0 - 0.4);
  const courtSpot = (w, d, pad = 0.6) => {
    for (let t = 0; t < 40; t++) {
      const s = court.spot(rng, w, d, 1, pad);
      if (!s) continue;
      if (colClear(s.x - w / 2, s.z - d / 2, s.x + w / 2, s.z + d / 2)) return s;
      court.used.pop();
    }
    return null;
  };
  const centre = {
    sofas() {
      const s = courtSpot(6.4, 5.2, 1);
      if (!s) return;
      b.box('rug', s.x - 3.2, 0, s.z - 2.6, s.x + 3.2, 0.018, s.z + 2.6, false);
      const st = rng.pick(['box', 'tub', 'pod']);
      F.sofa(b, s.x, 0, s.z - 1.5, 0, { w: 2.3, key: 'upholstery', style: st });
      F.sofa(b, s.x, 0, s.z + 1.5, Math.PI, { w: 2.3, key: 'upholstery', style: st });
      F.sofa(b, s.x - 2.4, 0, s.z, Math.PI / 2, { w: 1.0, key: 'upholstery', style: st });
      F.coffeeTable(b, s.x, 0, s.z, 0, { w: 1.3, d: 0.7, style: rng.pick(['white', 'glass']) });
      addFocus(s.x, 0.9, s.z, 1, 'court');
    },
    fountain() {
      const R = rng.range(2.2, 3.4);
      const s = courtSpot(2 * R + 2.4, 2 * R + 2.4, 1);
      if (!s) return;
      M.fountain(b, rng, s.x, 0, s.z, R);
      for (const [dx, dz, rot] of [[0, R + 1.0, 0], [0, -R - 1.0, Math.PI], [R + 1.0, 0, Math.PI / 2], [-R - 1.0, 0, -Math.PI / 2]]) if (rng.chance(0.6)) M.slatBench(b, s.x + dx, 0, s.z + dz, rot, 2.2, rng.pick(['upholstery', 'wood']));
      addFocus(s.x, 1.2, s.z, 1.5, 'court');
    },
    cafe() {
      const s = courtSpot(8.4, 6.6, 1);
      if (!s) return;
      b.box(rng.pick(['rug', 'inlayDark', 'wood']), s.x - 4.2, 0, s.z - 3.3, s.x + 4.2, 0.018, s.z + 3.3, false);
      const f = b.frame(s.x - 3.2, 0, s.z, Math.PI / 2);
      f.box('accentGloss', -1.6, 0, -0.45, 1.6, 1.05, 0.45, true);
      f.box('whiteGloss', -1.65, 1.05, -0.5, 1.65, 1.1, 0.5);
      f.box('black', -1.2, 1.1, -0.3, -0.7, 1.5, 0.1);
      f.box('darkMetal', -1.6, 2.2, -0.05, 1.6, 2.9, 0.05);
      f.box('emissiveWarm', -1.5, 2.3, 0.051, 1.5, 2.8, 0.06);
      for (const [dx, dz] of [[-0.6, -1.6], [1.8, -1.6], [-0.6, 1.6], [1.8, 1.6], [0.6, 0]]) {
        F.cafeTable(b, s.x + dx, 0, s.z + dz, rng.pick(['whiteGloss', 'wood']));
        const n = rng.int(2, 4);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.3;
          F.simpleChair(b, s.x + dx + Math.sin(a) * 0.72, 0, s.z + dz + Math.cos(a) * 0.72, a + Math.PI, rng.pick(['upholstery', 'whiteGloss', 'accent2']));
        }
      }
      addFocus(s.x, 1.0, s.z, 1.2, 'court');
    },
    grove() {
      const s = courtSpot(8.4, 5.4, 1);
      if (!s) return;
      M.planterBox(b, s.x, 0, s.z, 6.6, 3.6, 0.6, rng.pick(['concrete', 'mosaic', 'darkMetal']));
      for (const dx of [-2.2, 0, 2.2]) M.whiteTree(b, rng, s.x + dx + rng.range(-0.3, 0.3), 0.6, s.z + rng.range(-0.6, 0.6), rng.range(4.5, 7));
      for (let k = 0; k < 4; k++) M.fronds(b, rng, s.x + rng.range(-3, 3), 0.6, s.z + rng.range(-1.4, 1.4), rng.range(0.8, 1.2));
      M.slatBench(b, s.x, 0, s.z + 2.25, 0, 5.4, rng.pick(['upholstery', 'wood']));
      M.slatBench(b, s.x, 0, s.z - 2.25, Math.PI, 5.4, rng.pick(['upholstery', 'wood']));
      addFocus(s.x, 2.5, s.z, 1.2, 'court');
    },
    kiosk() {
      const s = courtSpot(4.4, 4.4, 1);
      if (!s) return;
      M.kiosk(b, s.x, 0, s.z);
      addFocus(s.x, 1.2, s.z, 1, 'court');
    },
    stage() {
      const s = courtSpot(6.6, 6.6, 1);
      if (!s) return;
      const f = b.frame(s.x, 0, s.z, 0);
      f.geo('whiteGloss', new THREE.CylinderGeometry(3, 3, 0.3, 40), 0, 0.15, 0);
      f.geo('accentGloss', new THREE.CylinderGeometry(3.05, 3.05, 0.06, 40), 0, 0.03, 0);
      b.collider(s.x - 3, 0, s.z - 3, s.x + 3, 0.3, s.z + 3);
      M.ribbonSculpture(b, rng, s.x, 0.3, s.z);
      addFocus(s.x, 2, s.z, 1.3, 'court');
    },
  };
  for (const c of style.court) centre[c]();
  if (!style.court.includes('stage') && rng.chance(0.6)) {
    const s = courtSpot(1.6, 1.6, 1);
    if (s) {
      M.ribbonSculpture(b, rng, s.x, 0, s.z);
      addFocus(s.x, 1.8, s.z, 1.2, 'court');
    }
  }
  for (let i = 0; i < rng.int(1, 3); i++) {
    const w = rng.range(2.4, 3.6);
    const s = courtSpot(w + 1.4, w + 1.4, 0.8);
    if (!s) continue;
    M.planterBox(b, s.x, 0, s.z, w, w, 0.55, rng.pick(['concrete', 'darkMetal', 'mosaic']));
    if (rng.chance(0.6)) M.whiteTree(b, rng, s.x, 0.55, s.z, rng.range(4, 6));
    else F.planter(b, rng, s.x, 0.0, s.z, { w: w - 0.2, d: w - 0.2, h: 0.6, key: 'concrete', plant: 'bamboo', leaf: 'leafWhite' });
    M.fronds(b, rng, s.x + w / 4, 0.55, s.z - w / 4, 1.0);
    for (const [dx, dz, rot] of [[0, w / 2 + 0.4, 0], [w / 2 + 0.4, 0, Math.PI / 2]]) M.slatBench(b, s.x + dx, 0, s.z + dz, rot, w * 0.8, 'upholstery');
    addFocus(s.x, 2, s.z, 0.8, 'court');
  }
  for (let i = 0; i < rng.int(2, 4); i++) {
    const s = courtSpot(1.2, 0.8, 0.5);
    if (s) M.lightbox(b, s.x, 0, s.z, rng.pick([0, Math.PI / 2]), `poster${rng.int(0, 3)}`);
  }
  {
    const s = courtSpot(1.2, 0.8, 0.5);
    if (s) M.lightbox(b, s.x, 0, s.z, rng.pick([0, Math.PI / 2]), 'directory');
  }
  for (let i = 0; i < rng.int(2, 4); i++) {
    const s = courtSpot(0.5, 0.5, 0.4);
    if (s) F.trash(b, s.x, 0, s.z);
  }

  // Galleries: planters and benches along the railings, lightboxes by the shops.
  for (let L = 1; L < levels; L++) {
    const poly = voids[L].pts;
    const y = L * FH;
    const nearVoid = (x, z) => inPoly(poly, x, z) || inPoly(poly, x + 0.8, z) || inPoly(poly, x - 0.8, z) || inPoly(poly, x, z + 0.8) || inPoly(poly, x, z - 0.8);
    const gal = new Region((x, z) => x > G.x0 + 1.8 && x < G.x1 - 1.8 && z > G.z0 + 1.8 && z < G.z1 - 1.8 && !nearVoid(x, z) && !inAnyBridge(L, x, z, 1.5), G);
    if (!lift.none) gal.reserve(lift.x0 - 2, lift.z0 - 3, lift.x1 + 2, lift.z1 + 3);
    for (const f of flights) if (f.level + 1 === L || f.level === L) gal.reserve(Math.min(f.x0, f.x1) - 2, V.z0 - 3, Math.max(f.x0, f.x1) + 2, V.z1 + 3);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 4) continue;
      const side = edgeSide(poly, p, q);
      const nx = (-(q[1] - p[1]) / len) * side;
      const nz = ((q[0] - p[0]) / len) * side;
      for (let a = 2; a < len - 2; a += rng.range(5, 9)) {
        const x = p[0] + ((q[0] - p[0]) * a) / len - nx * 0.75;
        const z = p[1] + ((q[1] - p[1]) * a) / len - nz * 0.75;
        const rot = Math.atan2(nx, nz);
        const alongX = Math.abs(q[0] - p[0]) > Math.abs(q[1] - p[1]);
        const hw = 1.1;
        const [x0, z0, x1, z1] = alongX ? [x - hw, z - 0.4, x + hw, z + 0.4] : [x - 0.4, z - hw, x + 0.4, z + hw];
        if (inAnyBridge(L, x, z, 2) || gal.used.some((u) => x0 < u[2] && x1 > u[0] && z0 < u[3] && z1 > u[1])) continue;
        if (!(x > G.x0 + 1 && x < G.x1 - 1 && z > G.z0 + 1 && z < G.z1 - 1) || inPoly(poly, x, z)) continue;
        gal.reserve(x0, z0, x1, z1);
        if (rng.chance(0.5)) {
          M.planterBox(b, x, y, z, alongX ? 2.0 : 0.6, alongX ? 0.6 : 2.0, 0.55, rng.pick(['concrete', 'white', 'darkMetal']));
          M.fronds(b, rng, x, y + 0.55, z, rng.range(0.9, 1.3));
        } else M.slatBench(b, x, y, z, rot, 2.0, rng.pick(['upholstery', 'wood']));
      }
    }
    for (let i = 0; i < rng.int(1, 3); i++) {
      const s = gal.spot(rng, 1.2, 0.8, 30, 0.6);
      if (s) M.lightbox(b, s.x, y, s.z, rng.pick([0, Math.PI / 2]), `poster${rng.int(0, 3)}`);
    }
    if (rng.chance(0.6)) {
      const s = gal.spot(rng, 5.4, 2.4, 30, 0.8);
      if (s) {
        F.sofa(b, s.x - 1.3, y, s.z, 0, { w: 2.2, key: 'upholstery', style: 'box' });
        F.sofa(b, s.x + 1.3, y, s.z, 0, { w: 2.2, key: 'upholstery', style: 'box' });
        F.trash(b, s.x, y, s.z - 0.2);
      }
    }
  }

  // Ceilings: light panels, dark vents and cameras under every gallery.
  for (let L = 0; L < levels; L++) {
    const above = voids[Math.min(L + 1, levels - 1)].pts;
    const y = ceilY(L);
    for (let x = snap(G.x0 + 1.8, 1.2); x < G.x1 - 1.2; x += 3.6) {
      for (let z = snap(G.z0 + 1.8, 1.2); z < G.z1 - 1.2; z += 3.6) {
        if ([[0, 0], [1.2, 0.8], [-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8]].some(([dx, dz]) => inPoly(above, x + dx, z + dz))) continue;
        if (L < levels - 1 && inAnyBridge(L + 1, x, z, 1)) continue;
        const r = rng.next();
        if (r < 0.62) F.lightPanel(b, x - 0.6, z - 0.3, x + 0.6, z + 0.3, y);
        else if (r < 0.8) b.box('ceil:vent', x - 0.5, y - 0.02, z - 0.3, x + 0.5, y, z + 0.3, false);
        else if (r < 0.83) M.cctv(b, x, y, z, rng.range(0, Math.PI * 2));
      }
    }
    // A row of spots washing the shopfronts.
    for (const u of units.filter((q) => q.level === L)) {
      const n = Math.max(1, Math.floor((u.a1 - u.a0) / 2.4));
      const out = u.side === 'N' || u.side === 'W' ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const a = u.a0 + ((u.a1 - u.a0) * (i + 0.5)) / n;
        const x = u.side === 'N' || u.side === 'S' ? a : u.front + out * 0.9;
        const z = u.side === 'N' || u.side === 'S' ? u.front + out * 0.9 : a;
        F.downlight(b, x, y, z);
      }
    }
  }

  // Exit signs by the corners of each gallery.
  for (let L = 0; L < levels; L++) {
    for (const [x, z, rot] of [[G.x0 + 0.3, G.z0 + 3, Math.PI / 2], [G.x1 - 0.3, G.z1 - 3, -Math.PI / 2]]) F.exitSign(b, x, L * FH + 2.8, z, rot);
  }

  // Overhead: banners from the skylight and a chandelier of blue glass tubes.
  const tv = voids[levels - 1];
  const sky = { x0: tv.x0 - 0.6, x1: tv.x1 + 0.6, z0: V.z0 - 0.6, z1: V.z1 + 0.6 };
  const skyW = sky.z1 - sky.z0;
  if (style.skylight === 'barrel') M.barrelVault(b, sky.x0, sky.x1, sky.z0, sky.z1, HA + 0.1, skyW * 0.32);
  else if (style.skylight === 'ridge') M.ridgeRoof(b, sky.x0, sky.x1, sky.z0, sky.z1, HA + 0.1, skyW * 0.28);
  else if (style.skylight === 'grid') M.beamGrid(b, sky.x0, sky.x1, sky.z0, sky.z1, HA + 0.1);
  else M.spaceFrame(b, sky.x0, sky.x1, sky.z0, sky.z1, HA + 0.1, 2.4, 1.6);
  const bannerY = HA + 0.1;
  const escTop = (levels - 1) * FH + 3;
  for (let i = 0; i < style.banners; i++) {
    const x = rng.range(tv.x0 + 3, tv.x1 - 3);
    const z = rng.range(V.z0 + 2, V.z1 - 2);
    const overChain = x > plan.chain.x0 - 1 && x < plan.chain.x1 + 1;
    const maxLen = overChain ? bannerY - escTop - 0.5 : Math.min(9, bannerY - FH - 3);
    if (maxLen < 3) continue;
    M.hangingBanner(b, x, bannerY - 3, z, rng.range(1.4, 1.9), Math.min(maxLen - 3, rng.range(4, 7)), rng.chance(0.5) ? 0 : Math.PI / 2, `banner${i % 2}`);
  }
  {
    const far = plan.chain.x0 - tv.x0 > tv.x1 - plan.chain.x1 ? [tv.x0 + 4, plan.chain.x0 - 3] : [plan.chain.x1 + 3, tv.x1 - 4];
    if (far[1] - far[0] > 3) {
      const x = (far[0] + far[1]) / 2;
      const z = (V.z0 + V.z1) / 2 + rng.range(-2, 2);
      const spread = Math.min(3, (far[1] - far[0]) / 2);
      const drop = HA - FH - 2;
      if (style.chandelier === 'tubes') M.tubes(b, rng, x, z, HA + 0.1, rng.int(14, 24), spread, drop);
      else if (style.chandelier === 'spheres') M.spheres(b, rng, x, z, HA + 0.1, rng.int(14, 26), spread + 1, drop);
      else if (style.chandelier === 'rings') M.ringStack(b, rng, x, z, HA + 0.1, rng.int(3, 5), drop);
      else if (style.chandelier === 'discs') M.discMobile(b, rng, x, z, HA + 0.1, rng.int(10, 18), spread + 1, drop, ['accentGloss', 'white', 'banner0', 'accent2']);
      if (style.chandelier !== 'none') addFocus(x, HA * 0.55, z, 1.2, 'tubes');
    }
  }
  addFocus((V.x0 + V.x1) / 2, HA + 1, (V.z0 + V.z1) / 2, 0.8, 'skylight');

  // ------------------------------------------------------------ skyline
  const towers = [];
  for (let i = 0; i < 160; i++) {
    const a = rng.range(0, Math.PI * 2);
    const dist = i < 20 ? rng.range(70, 140) : rng.range(120, 800);
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const w = rng.range(18, 44);
    const d = rng.range(18, 44);
    const nearPlaza = x + w / 2 > plaza.x0 - 30 && x - w / 2 < plaza.x1 + 30 && z + d / 2 > B.z0 - 30 && z - d / 2 < plaza.z1 + 20;
    if (nearPlaza) continue;
    towers.push({ x, z, w, d, y0: -0.4, h: rng.range(20, 50) + rng.next() ** 2 * rng.range(20, 180), tint: rng.pick(['#f1d9c8', '#f3f3f1', '#e9d2c9', '#dde6ee', '#f4e6d4']) });
  }
  // A tall glass tower right behind the mall.
  towers.push({ x: rng.range(B.x0 + 10, B.x1 - 10), z: B.z0 - rng.range(30, 45), w: 30, d: 26, y0: -0.4, h: rng.range(110, 160), tint: '#cfdcea' });

  return {
    seed,
    palette: pal,
    mall,
    plan,
    builder: b,
    levels,
    HA,
    FH,
    footprint: { x0: Math.min(B.x0, plaza.x0), x1: Math.max(B.x1, plaza.x1), z0: B.z0, z1: plaza.z1 },
    building: B,
    vestibule: VB,
    focus,
    towers,
    style,
    sun: { azimuth: rng.range(0, 360), elevation: rng.range(46, 68) },
    colliders: b.colliders,
  };
}
