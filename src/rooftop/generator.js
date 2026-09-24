import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { Builder } from '../office/builder.js';
import { Region } from '../mall/region.js';
import { planSkyline } from '../render/skyline.js';
import { makeRoofPlan, snap } from './plan.js';
import * as R from './props.js';

// A block of Mirror's Edge rooftops: white tiled roofs behind parapets,
// stair and lift housings in ribbed cladding with a coloured band, fans,
// ducts, pipes and vents, tanks, solar panels and skylights, antenna masts,
// billboards, steel stairs and walkways painted in bright accents, ziplines,
// a crane or two, the odd rooftop garden with blossom trees, and a few
// things in runner-vision red. Around it the city runs out to the harbour,
// with a red TV mast on the skyline.

export const ROOF_ACCENTS = {
  orange: '#ff7417',
  lime: '#8fd21f',
  blue: '#2f7ee6',
  yellow: '#ffc31a',
  teal: '#16a8a0',
  magenta: '#e0348f',
};
const NAMES = Object.keys(ROOF_ACCENTS);

function pickStyle(rng) {
  const main = rng.weighted([['orange', 3], ['lime', 2], ['blue', 2.5], ['yellow', 1.4], ['teal', 1], ['magenta', 0.6]]);
  const second = rng.pick(NAMES.filter((n) => n !== main));
  const third = rng.pick(NAMES.filter((n) => n !== main && n !== second));
  return {
    accents: [main, second, third],
    steel: rng.pick(['accentB', 'accentA', 'accentC']), // stairs and walkways
    garden: rng.chance(0.35),
    helipad: rng.chance(0.35),
    sea: rng.range(0, Math.PI * 2), // bearing of the harbour
    cover: rng.range(0.3, 0.62),
  };
}

export function generateRooftop(seed) {
  const rng = new RNG(seed);
  const plan = makeRoofPlan(rng);
  const style = pickStyle(rng);
  const b = new Builder();
  b.fans = []; // spinning fan blades (props.js)
  b.steam = []; // steam vents
  const focus = [];
  const addFocus = (x, y, z, w = 1, tag = '') => focus.push({ x, y, z, weight: w, tag });
  const { lots, links, X, Z } = plan;
  const bandKeys = ['accentA', 'accentA', 'accentB', 'accentC'];
  const bandKey = () => rng.pick(bandKeys);

  // ------------------------------------------------------------ edges
  // For each lot edge: what lies across it (neighbour lot, gap).
  const nx = plan.nx;
  const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < plan.nz ? lots[j * nx + i] : null);
  const edgeInfo = (l, e) => {
    const [di, dj] = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[e];
    const q = at(l.i + di, l.j + dj);
    if (!q) return { q: null, gap: Infinity };
    const gap = di ? (di > 0 ? X.gaps[l.i] : X.gaps[l.i - 1]) : dj > 0 ? Z.gaps[l.j] : Z.gaps[l.j - 1];
    return { q, gap };
  };

  // Parapet cuts where links cross an edge: lot id -> edge -> [[a0, a1]].
  const cuts = new Map();
  const cut = (lot, e, a0, a1) => {
    if (!cuts.has(lot.id)) cuts.set(lot.id, { N: [], S: [], W: [], E: [] });
    cuts.get(lot.id)[e].push([a0, a1]);
  };

  // ------------------------------------------------------------ links
  const linkPaths = []; // walkable connections for camera paths
  const reserve = new Map(); // lot id -> rects to keep clear on its roof
  const keep = (lot, x0, z0, x1, z1) => {
    if (!reserve.has(lot.id)) reserve.set(lot.id, []);
    reserve.get(lot.id).push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  };
  const steel = style.steel;
  for (const k of links) {
    const { a, b: q, axis, s } = k;
    const eA = axis === 'x' ? 'E' : 'S';
    const eB = axis === 'x' ? 'W' : 'N';
    const cA = axis === 'x' ? a.x1 : a.z1; // a's facing edge
    const cB = axis === 'x' ? q.x0 : q.z0;
    const P = (along, across, y) => (axis === 'x' ? new THREE.Vector3(across, y, along) : new THREE.Vector3(along, y, across));
    if (k.kind === 'walkway') {
      const w = 1.4;
      cut(a, eA, s - w / 2 - 0.1, s + w / 2 + 0.1);
      cut(q, eB, s - w / 2 - 0.1, s + w / 2 + 0.1);
      const pa = P(s, cA - 0.5, a.h);
      const pb = P(s, cB + 0.5, q.h);
      R.walkway(b, pa.x, pa.z, pb.x, pb.z, a.h, q.h, steel, w);
      const ra = P(s, cA - 2.5, a.h);
      const rb = P(s, cB + 2.5, q.h);
      if (axis === 'x') {
        keep(a, cA - 3, s - 1.5, cA, s + 1.5);
        keep(q, cB, s - 1.5, cB + 3, s + 1.5);
      } else {
        keep(a, s - 1.5, cA - 3, s + 1.5, cA);
        keep(q, s - 1.5, cB, s + 1.5, cB + 3);
      }
      linkPaths.push({ a, b: q, points: [ra, pa, pb, rb], kind: 'walkway' });
      addFocus((pa.x + pb.x) / 2, (a.h + q.h) / 2 + 1, (pa.z + pb.z) / 2, 1.2, 'link');
    } else if (k.kind === 'stairs' && k.gap === 0) {
      // Stair along the taller building's wall, from the lower roof up to a
      // landing that crosses onto the taller roof.
      const lo = a.h < q.h ? a : q;
      const hi = lo === a ? q : a;
      const rise = hi.h - lo.h;
      const run = Math.round(rise / 0.19) * 0.27;
      const span = k.span[1] - k.span[0];
      if (span < run + 4) {
        k.kind = 'ladder';
      } else {
        const wall = lo === a ? cA : cB; // shared wall line
        const inward = lo === a ? -1 : 1; // from the wall into the lower roof
        const off = wall + inward * 1.2;
        const dir = rng.sign();
        const start = dir > 0 ? Math.max(k.span[0] + 1, s - run / 2) : Math.min(k.span[1] - 1, s + run / 2);
        const pos = P(start, off, lo.h);
        const rot = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const st = R.stair(b, pos.x, lo.h, pos.z, rot, rise, steel);
        // Landing past the top step, then over the parapet onto the upper roof.
        const endAlong = start + dir * run;
        const mid = endAlong + dir * 0.7;
        const l0 = P(endAlong - dir * 0.1, off + inward * 0.7, hi.h);
        const l1 = P(endAlong + dir * 1.4, wall - inward * 1.4, hi.h);
        b.box('grate', Math.min(l0.x, l1.x), hi.h - 0.08, Math.min(l0.z, l1.z), Math.max(l0.x, l1.x), hi.h + 0.03, Math.max(l0.z, l1.z));
        const eHi = hi === a ? eA : eB;
        cut(hi, eHi, mid - 1, mid + 1);
        const a0 = Math.min(start, endAlong) - 1;
        const a1 = Math.max(start, endAlong) + 1;
        if (axis === 'x') keep(lo, Math.min(wall, off + inward * 1.4), a0, Math.max(wall, off + inward * 1.4), a1);
        else keep(lo, a0, Math.min(wall, off + inward * 1.4), a1, Math.max(wall, off + inward * 1.4));
        const land = P(mid, off, hi.h);
        const top = P(mid, wall - inward * 2.4, hi.h);
        if (axis === 'x') keep(hi, Math.min(wall, top.x) - 1, mid - 1.5, Math.max(wall, top.x) + 1, mid + 1.5);
        else keep(hi, mid - 1.5, Math.min(wall, top.z) - 1, mid + 1.5, Math.max(wall, top.z) + 1);
        const foot = P(start - dir * 1.6, off, lo.h);
        const pts = [foot, st.bottom.clone(), st.top.clone(), land, top];
        linkPaths.push({ a: lo, b: hi, points: pts, kind: 'stairs' });
        addFocus(st.top.x, hi.h, st.top.z, 1, 'link');
      }
    }
    if (k.kind === 'stairs' && k.gap > 0) k.kind = 'zipline';
    if (k.kind === 'ladder') {
      const lo = a.h < q.h ? a : q;
      const hi = lo === a ? q : a;
      const wall = lo === a ? cA : cB;
      const inward = lo === a ? -1 : 1;
      const p = P(s, wall + inward * 0.06, lo.h);
      const rot = axis === 'x' ? (inward > 0 ? Math.PI / 2 : -Math.PI / 2) : inward > 0 ? 0 : Math.PI;
      R.ladder(b, p.x, lo.h, p.z, hi.h, rot, steel);
      cut(hi, hi === a ? eA : eB, s - 0.5, s + 0.5);
    } else if (k.kind === 'zipline') {
      const hi = a.h >= q.h ? a : q;
      const lo = hi === a ? q : a;
      const cHi = hi === a ? cA : cB;
      const cLo = lo === a ? cA : cB;
      const sgn = hi === a ? -1 : 1;
      const p = P(s, cHi + sgn * 2.5, hi.h + 3);
      const r = P(s, cLo - sgn * 3, lo.h + 1.6);
      if (hi.h - lo.h > 1) R.zipline(b, p, r, 'runner');
    }
  }

  // ------------------------------------------------------------ buildings
  const roofs = [];
  const facades = ['facade0', 'facade1', 'facade2', 'facade3'];
  for (const l of lots) {
    const { x0, x1, z0, z1, h } = l;
    if (l.tower) {
      b.box('curtain', x0 + 0.3, 0, z0 + 0.3, x1 - 0.3, h, z1 - 0.3);
      // Crown: a recessed glass top and a white rim.
      b.box('white', x0 + 0.1, h, z0 + 0.1, x1 - 0.1, h + 1.2, z1 - 0.1);
      b.box('curtain', x0 + 2, h + 1.2, z0 + 2, x1 - 2, h + 6, z1 - 2);
      b.box('white', x0 + 1.8, h + 6, z0 + 1.8, x1 - 1.8, h + 6.6, z1 - 1.8);
      for (let k = 0; k < 3; k++) R.condenser(b, rng, rng.range(x0 + 5, x1 - 5), h + 6.6, rng.range(z0 + 5, z1 - 5), 0, rng.range(3, 5), 2, 1.6);
      // Fins up the corners.
      for (const [cx, cz] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x0 + 0.3, z1 - 0.3], [x1 - 0.3, z1 - 0.3]]) b.box('white', cx - 0.4, 0, cz - 0.4, cx + 0.4, h + 1.2, cz + 0.4, false);
      addFocus((x0 + x1) / 2, h * 0.6, (z0 + z1) / 2, 0.8, 'tower');
      continue;
    }
    const fkey = rng.pick(facades);
    b.box(fkey, x0, 0, z0, x1, h - 0.05, z1);
    const t = 0.35;
    b.box('roofTile', x0 + 0.01, h - 0.3, z0 + 0.01, x1 - 0.01, h, z1 - 0.01);
    // Parapets on every edge that needs one, cut where links cross.
    const ph = rng.range(0.9, 1.2);
    const glassRail = rng.chance(0.18);
    const edgeCuts = cuts.get(l.id) || { N: [], S: [], W: [], E: [] };
    for (const e of ['N', 'S', 'W', 'E']) {
      const { q, gap } = edgeInfo(l, e);
      if (q && gap === 0 && !q.tower && Math.abs(q.h - h) < 0.1) continue; // continuous roof
      if (q && gap === 0 && q.h > h + 0.5) continue; // against a taller wall
      const alongX = e === 'N' || e === 'S';
      const a0 = alongX ? x0 : z0;
      const a1 = alongX ? x1 : z1;
      const c = e === 'N' ? z0 : e === 'S' ? z1 : e === 'W' ? x0 : x1;
      const inward = e === 'N' || e === 'W' ? 1 : -1;
      let cur = a0;
      const runs = [];
      for (const [p0, p1] of [...edgeCuts[e]].sort((u, v) => u[0] - v[0])) {
        if (p0 > cur) runs.push([cur, p0]);
        cur = Math.max(cur, p1);
      }
      if (cur < a1) runs.push([cur, a1]);
      for (const [r0, r1] of runs) {
        const box = (key, o0, o1, y0, y1, collide = true) => {
          const [m0, m1] = inward > 0 ? [c + o0, c + o1] : [c - o1, c - o0];
          if (alongX) b.box(key, r0, y0, m0, r1, y1, m1, collide);
          else b.box(key, m0, y0, r0, m1, y1, r1, collide);
        };
        if (glassRail) {
          box('white', 0, t, h - 0.05, h + 0.25);
          box('glass', t * 0.4, t * 0.6, h + 0.25, h + 1.1, false);
          box('metal', t * 0.3, t * 0.7, h + 1.1, h + 1.16);
          const n = Math.max(1, Math.round((r1 - r0) / 1.5));
          for (let k = 0; k <= n; k++) {
            const aa = r0 + ((r1 - r0) * k) / n;
            const [m0, m1] = inward > 0 ? [c + t * 0.3, c + t * 0.7] : [c - t * 0.7, c - t * 0.3];
            if (alongX) b.box('metal', aa - 0.03, h + 0.25, m0, aa + 0.03, h + 1.1, m1, false);
            else b.box('metal', m0, h + 0.25, aa - 0.03, m1, h + 1.1, aa + 0.03, false);
          }
          const [m0, m1] = inward > 0 ? [c, c + t] : [c - t, c];
          if (alongX) b.collider(r0, h, m0, r1, h + 1.16, m1);
          else b.collider(m0, h, r0, m1, h + 1.16, r1);
        } else {
          box('white', 0, t, h - 0.05, h + ph);
          box('whiteGloss', -0.05, t + 0.06, h + ph, h + ph + 0.08, false);
        }
      }
    }
    roofs.push({ lot: l, x0, x1, z0, z1, y: h });
  }

  // Group joined roofs (same height across a party wall) for navigation.
  const parent = new Map(roofs.map((r) => [r.lot.id, r.lot.id]));
  const find = (id) => (parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id)));
  for (const k of links) if (k.kind === 'open') parent.set(find(k.a.id), find(k.b.id));
  const groups = new Map();
  for (const r of roofs) {
    const g = find(r.lot.id);
    if (!groups.has(g)) groups.set(g, { rects: [], y: r.y, lots: [] });
    groups.get(g).rects.push(r);
    groups.get(g).lots.push(r.lot);
  }
  const roofGroups = [...groups.values()].map((g, i) => {
    const x0 = Math.min(...g.rects.map((r) => r.x0));
    const x1 = Math.max(...g.rects.map((r) => r.x1));
    const z0 = Math.min(...g.rects.map((r) => r.z0));
    const z1 = Math.max(...g.rects.map((r) => r.z1));
    return { id: i, y: g.y, rects: g.rects.map((r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 })), lots: g.lots, bounds: { x0, x1, z0, z1 } };
  });
  const groupOf = (lot) => roofGroups.find((g) => g.lots.includes(lot));
  for (const p of linkPaths) {
    p.ga = groupOf(p.a);
    p.gb = groupOf(p.b);
  }

  // ------------------------------------------------------------ roof contents
  const tallest = roofs.reduce((m, r) => (r.y > m.y ? r : m), roofs[0]);
  let gardenDone = !style.garden;
  let helipadDone = !style.helipad;
  let redRamps = rng.int(1, 2);
  let billboards = 0;
  for (const r of roofs) {
    const { x0, x1, z0, z1, y } = r;
    const inset = 1.0;
    const reg = new Region((x, z) => x > x0 + inset && x < x1 - inset && z > z0 + inset && z < z1 - inset, { x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset });
    for (const [a0, c0, a1, c1] of reserve.get(r.lot.id) || []) reg.reserve(a0, c0, a1, c1);
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    if (!helipadDone && r === tallest && w > 18 && d > 18) {
      const hr = 6.5;
      if (reg.take(cx - hr - 1, cz - hr - 1, cx + hr + 1, cz + hr + 1, 0.5)) {
        R.helipad(b, cx, y, cz, hr);
        helipadDone = true;
        addFocus(cx, y + 1, cz, 1, 'helipad');
      }
    }
    if (!gardenDone && w > 16 && d > 16 && r !== tallest) {
      // Catalyst-style terrace: black planters with blossom trees, a black
      // reflecting pool, white benches.
      gardenDone = true;
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++) {
        const s = reg.spot(rng, 3.6, 3.6, 30, 0.8);
        if (!s) continue;
        b.box('blackGloss', s.x - 1.5, y, s.z - 1.5, s.x + 1.5, y + 0.9, s.z + 1.5);
        b.box('blossom2', s.x - 1.35, y + 0.9, s.z - 1.35, s.x + 1.35, y + 0.95, s.z + 1.35, false);
        R.blossomTree(b, rng, s.x, y + 0.9, s.z, rng.range(4.5, 6.5));
        addFocus(s.x, y + 3, s.z, 1.4, 'garden');
      }
      const pool = reg.spot(rng, 7, 4, 30, 0.8);
      if (pool) {
        b.box('white', pool.x - 3.5, y, pool.z - 2, pool.x + 3.5, y + 0.4, pool.z + 2);
        b.box('water', pool.x - 3.2, y + 0.4, pool.z - 1.7, pool.x + 3.2, y + 0.42, pool.z + 1.7, false);
      }
      for (let k = 0; k < 2; k++) {
        const s = reg.spot(rng, 3.2, 1.2, 20, 0.6);
        if (s) b.box('white', s.x - 1.5, y, s.z - 0.35, s.x + 1.5, y + 0.45, s.z + 0.35);
      }
    }

    // Stair / lift housing, sometimes two.
    const nh = rng.chance(0.3) && w * d > 700 ? 2 : rng.chance(0.9) ? 1 : 0;
    for (let k = 0; k < nh; k++) {
      const hw = snap(rng.range(4, 8.5), 0.6);
      const hd = snap(rng.range(3.2, 6), 0.6);
      const rot = rng.int(0, 3) * (Math.PI / 2);
      const sw = rot % Math.PI === 0 ? hw : hd;
      const sd = rot % Math.PI === 0 ? hd : hw;
      // Hug an edge so the rest of the roof stays open.
      let s = null;
      for (let t = 0; t < 30 && !s; t++) {
        const px = rng.chance(0.5) ? rng.range(x0 + inset + sw / 2, x1 - inset - sw / 2) : rng.chance(0.5) ? x0 + inset + sw / 2 + 0.6 : x1 - inset - sw / 2 - 0.6;
        const pz = rng.range(z0 + inset + sd / 2 + 2, z1 - inset - sd / 2 - 2);
        if (reg.take(px - sw / 2, pz - sd / 2 - 2, px + sw / 2, pz + sd / 2 + 2, 0.4)) s = { x: px, z: pz };
      }
      if (!s) continue;
      const hh = rng.range(3, 4.6);
      R.housing(b, rng, s.x, y, s.z, rot, hw, hd, hh, rng.chance(0.85) ? bandKey() : null);
      addFocus(s.x, y + hh * 0.5, s.z, 1.2, 'housing');
    }

    // Condensers in a row.
    const nc = rng.int(0, 3);
    for (let k = 0; k < nc; k++) {
      const cw = rng.range(2.6, 4.6);
      const cd = rng.range(1.3, 2.0);
      const along = rng.chance(0.5);
      const sw = along ? cw : cd;
      const sd = along ? cd : cw;
      const s = reg.spot(rng, sw + 1.2, sd + 1.2, 25, 0.4);
      if (!s) continue;
      R.condenser(b, rng, s.x, y, s.z, along ? 0 : Math.PI / 2, cw, cd, rng.range(1.2, 1.9));
      if (rng.chance(0.4)) addFocus(s.x, y + 1.2, s.z, 0.6, 'plant');
    }
    // Clusters of small AC boxes.
    for (let k = 0; k < rng.int(1, 3); k++) {
      const s = reg.spot(rng, 4, 2, 25, 0.4);
      if (!s) continue;
      const n = rng.int(2, 4);
      const rot = rng.int(0, 3) * (Math.PI / 2);
      for (let m = 0; m < n; m++) {
        const o = (m - (n - 1) / 2) * 1.15;
        R.acUnit(b, s.x + (rot % Math.PI === 0 ? o : 0), y, s.z + (rot % Math.PI === 0 ? 0 : o), rot, rng.range(0.9, 1.2));
      }
    }
    // Ducts: L-shaped runs at knee to head height.
    for (let k = 0; k < rng.int(0, 2); k++) {
      const s = rng.range(0.5, 0.9);
      const yc = y + rng.range(0.6, 1.4);
      const ax = rng.range(x0 + 2, x1 - 2);
      const az = rng.range(z0 + 2, z1 - 2);
      const bx = rng.range(x0 + 2, x1 - 2);
      const bz = rng.range(z0 + 2, z1 - 2);
      const pts = [[ax, az], [bx, az], [bx, bz]];
      if (!reg.free(Math.min(ax, bx) - s, az - s, Math.max(ax, bx) + s, az + s, 0.3) || !reg.free(bx - s, Math.min(az, bz) - s, bx + s, Math.max(az, bz) + s, 0.3)) continue;
      reg.reserve(Math.min(ax, bx) - s, az - s, Math.max(ax, bx) + s, az + s);
      reg.reserve(bx - s, Math.min(az, bz) - s, bx + s, Math.max(az, bz) + s);
      R.duct(b, pts, y, yc, s, rng.chance(0.8) ? 'white' : 'steel');
      b.box('white', ax - s / 2 - 0.1, y, az - s / 2 - 0.1, ax + s / 2 + 0.1, yc + s / 2 + 0.6, az + s / 2 + 0.1);
    }
    // Pipes along a parapet.
    if (rng.chance(0.55)) {
      const e = rng.pick(['N', 'S', 'W', 'E']);
      const alongX = e === 'N' || e === 'S';
      const c = e === 'N' ? z0 + 0.9 : e === 'S' ? z1 - 0.9 : e === 'W' ? x0 + 0.9 : x1 - 0.9;
      const a0 = (alongX ? x0 : z0) + 2;
      const a1 = (alongX ? x1 : z1) - 2;
      const pts = alongX ? [[a0, c], [a1, c]] : [[c, a0], [c, a1]];
      const r0 = alongX ? [a0, c - 0.5, a1, c + 0.5] : [c - 0.5, a0, c + 0.5, a1];
      if (reg.free(r0[0], r0[1], r0[2], r0[3], 0)) {
        reg.reserve(...r0);
        R.pipes(b, pts, y + 0.3, rng.int(1, 3), rng.range(0.07, 0.14), 'steel', rng.chance(0.2));
      }
    }
    // Vents.
    for (let k = 0; k < rng.int(3, 8); k++) {
      const s = reg.spot(rng, 1, 1, 10, 0.3);
      if (s) R.vent(b, rng, s, y);
    }
    // Tank, cooling tower, solar array, skylights, mast, billboard.
    if (rng.chance(0.3)) {
      const rr = rng.range(1.3, 2.2);
      const s = reg.spot(rng, 2 * rr + 1, 2 * rr + 1.5, 25, 0.5);
      if (s) {
        R.waterTank(b, s.x, y, s.z, rr, rng.range(2, 3.5), rng.chance(0.3) ? bandKey() : 'white');
        addFocus(s.x, y + 3, s.z, 0.6, 'plant');
      }
    }
    if (rng.chance(0.25)) {
      const s = reg.spot(rng, 5, 5, 20, 0.6);
      if (s) R.coolingTower(b, s.x, y, s.z, rng.range(3.2, 4.4), rng.range(3.2, 4.4), rng.range(2.2, 3.2));
    }
    if (rng.chance(0.3)) {
      const s = reg.spot(rng, 5, 5, 20, 0.5);
      if (s) {
        R.flue(b, rng, s.x, y, s.z);
        addFocus(s.x, y + 4, s.z, 0.6, 'plant');
      }
    }
    if (rng.chance(0.38)) {
      const sw = snap(rng.range(6, Math.min(16, w - 4)), 1.1);
      const sd = snap(rng.range(5, Math.min(12, d - 4)), 2.4);
      const s = reg.spot(rng, sw, sd, 25, 0.8);
      if (s) {
        R.solarArray(b, s.x - sw / 2, s.z - sd / 2, s.x + sw / 2, s.z + sd / 2, y);
        addFocus(s.x, y + 1, s.z, 0.7, 'solar');
      }
    }
    const skyKind = rng.pick(['pyramid', 'ridge', 'grille']);
    for (let k = 0; k < rng.int(0, 3); k++) {
      const sw = rng.range(2, 3.4);
      const sd = skyKind === 'ridge' ? rng.range(4, 7) : sw;
      const s = reg.spot(rng, sw + 1, sd + 1, 20, 0.5);
      if (s) R.skylight(b, s.x, y, s.z, sw, sd, skyKind);
    }
    if (rng.chance(0.3)) {
      const s = reg.spot(rng, 3, 3, 20, 0.5);
      if (s) R.mast(b, rng, s.x, y, s.z, rng.range(6, 14));
    }
    if (billboards < 3 && rng.chance(0.4)) {
      // Along an outer edge, facing out over the street.
      const e = rng.pick(['N', 'S', 'W', 'E']);
      const { q } = edgeInfo(r.lot, e);
      if (!q || q.tower === false) {
        const alongX = e === 'N' || e === 'S';
        const len = (alongX ? w : d) - 4;
        const bw = Math.min(14, len * rng.range(0.5, 0.8));
        const bh = bw * rng.range(0.32, 0.42);
        const c = e === 'N' ? z0 + 2.6 : e === 'S' ? z1 - 2.6 : e === 'W' ? x0 + 2.6 : x1 - 2.6;
        const a = (alongX ? cx : cz) + rng.range(-0.2, 0.2) * (len - bw);
        const px = alongX ? a : c;
        const pz = alongX ? c : a;
        const rot = { N: Math.PI, S: 0, W: -Math.PI / 2, E: Math.PI / 2 }[e];
        const rect = alongX ? [px - bw / 2, pz - 2.5, px + bw / 2, pz + 2.5] : [px - 2.5, pz - bw / 2, px + 2.5, pz + bw / 2];
        if (bw > 6 && reg.free(...rect, 0)) {
          reg.reserve(...rect);
          R.billboard(b, px, y, pz, rot, bw, bh, `ad${billboards % 3}`, rng.range(1.2, 3));
          billboards++;
          addFocus(px, y + 3 + bh / 2, pz, 1, 'billboard');
        }
      }
    }
    // Runner-vision red: a ramp up against something.
    if (redRamps > 0 && rng.chance(0.45)) {
      const s = reg.spot(rng, 1.6, 4, 20, 0.4);
      if (s) {
        const f = b.frame(s.x, y, s.z, rng.int(0, 3) * (Math.PI / 2));
        const ramp = new THREE.Shape([new THREE.Vector2(-2, 0), new THREE.Vector2(2, 0), new THREE.Vector2(2, 1.3), new THREE.Vector2(1.6, 1.3)]);
        f.geo('runner', new THREE.ExtrudeGeometry(ramp, { depth: 1.4, bevelEnabled: false }).translate(0, 0, -0.7), 0, 0, 0, 0);
        b.collider(s.x - 2, y, s.z - 2, s.x + 2, y + 1.3, s.z + 2);
        redRamps--;
      }
    }
  }

  // ------------------------------------------------------------ cranes
  const craneKey = rng.pick(['runner', 'accentA', 'yellowCrane']);
  for (let k = 0; k < rng.int(1, 2); k++) {
    const a = rng.range(0, Math.PI * 2);
    const dist = rng.range(70, 160);
    const cxw = Math.cos(a) * dist;
    const czw = Math.sin(a) * dist;
    const B = plan.bounds;
    if (cxw > B.x0 - 10 && cxw < B.x1 + 10 && czw > B.z0 - 10 && czw < B.z1 + 10) continue;
    const h = plan.base + rng.range(30, 70);
    R.crane(b, rng, cxw, 0, czw, h, craneKey);
    addFocus(cxw, h, czw, 0.8, 'crane');
  }

  // ------------------------------------------------------------ landmark
  // A red and white TV mast somewhere on the skyline.
  const tvA = style.sea + Math.PI + rng.range(-1.2, 1.2);
  const tvD = rng.range(380, 700);
  const tv = { x: Math.cos(tvA) * tvD, z: Math.sin(tvA) * tvD, h: rng.range(210, 290) };
  {
    const f = b.frame(tv.x, 0, tv.z, 0);
    const bands = 9;
    for (let k = 0; k < bands; k++) {
      const y0 = (tv.h * 0.8 * k) / bands;
      const y1 = (tv.h * 0.8 * (k + 1)) / bands;
      const r0 = 7 - (k / bands) * 4.5;
      const r1 = 7 - ((k + 1) / bands) * 4.5;
      f.geo(k % 2 ? 'white' : 'tvRed', new THREE.CylinderGeometry(r1, r0, y1 - y0, 16), 0, (y0 + y1) / 2, 0);
    }
    f.geo('white', new THREE.CylinderGeometry(6, 5, 7, 20), 0, tv.h * 0.62, 0);
    f.geo('glassDark', new THREE.CylinderGeometry(6.2, 6.2, 2.2, 20), 0, tv.h * 0.62 + 1.2, 0);
    f.geo('tvRed', new THREE.CylinderGeometry(0.8, 2.4, tv.h * 0.2, 12), 0, tv.h * 0.9, 0);
    addFocus(tv.x, tv.h * 0.7, tv.z, 0.6, 'landmark');
  }

  // ------------------------------------------------------------ city
  // The sea lies beyond a shoreline on one bearing; the city stops there.
  const seaDir = new THREE.Vector2(Math.cos(style.sea), Math.sin(style.sea));
  const shore = rng.range(420, 650);
  const skyline = planSkyline(rng, {
    site: { x0: plan.bounds.x0 - 4, z0: plan.bounds.z0 - 4, x1: plan.bounds.x1 + 4, z1: plan.bounds.z1 + 4 },
    groundY: 0,
    radius: 1300,
    downtown: { x: -seaDir.x * rng.range(420, 700), z: -seaDir.y * rng.range(420, 700) },
    tints: ['#f3f3f1', '#f3f3f1', '#f3f3f1', '#eef0f2', '#e4e9ee', '#f2ede6', '#e6e8ea'],
    rise: rng.range(1.1, 1.4),
    // Roofs around the block stay near its height so the view runs across
    // rooftops; the towers stand further off.
    cap: (x, z) => {
      const d = Math.hypot(x, z);
      return d < 200 ? plan.base + 6 + d * 0.12 : d < 480 ? plan.base + 30 + (d - 200) * 0.45 : Infinity;
    },
    keep: (x, z) => x * seaDir.x + z * seaDir.y < shore - 30 && Math.hypot(x - tv.x, z - tv.z) > 30,
    realistic: true,
  });

  const B = plan.bounds;
  return {
    seed,
    plan,
    style,
    builder: b,
    roofs,
    roofGroups,
    linkPaths,
    focus,
    skyline,
    sea: { dir: seaDir, shore },
    tv,
    footprint: { x0: B.x0 - 8, x1: B.x1 + 8, z0: B.z0 - 8, z1: B.z1 + 8 },
    maxH: plan.maxH,
    sun: { azimuth: rng.range(0, 360), elevation: rng.range(34, 62) },
    colliders: b.colliders,
    fans: b.fans,
    steam: b.steam,
  };
}
