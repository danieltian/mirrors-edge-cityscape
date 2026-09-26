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
  const walls = ['wall0', 'wall1', 'wall2', 'wall3'];
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
      for (const [cx, cz] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x0 + 0.3, z1 - 0.3], [x1 - 0.3, z1 - 0.3]]) b.box('white', cx - 0.4, 0, cz - 0.4, cx + 0.4, h + 1.1, cz + 0.4, false);
      addFocus((x0 + x1) / 2, h * 0.6, (z0 + z1) / 2, 0.8, 'tower');
      continue;
    }
    // Walls (cladding with windows) up to a full-width roof slab; nothing
    // overlaps anything else, so nothing can flicker at a distance.
    l.wall = rng.pick(walls);
    b.faceBox(l.wall, x0, 0, z0, x1, h - 0.12, z1);
    const t = 0.35;
    b.box('roofTile', x0, h - 0.12, z0, x1, h, z1);
    // Parapets on every edge that needs one, cut where links cross. The
    // side ones stop short of the corners so no two overlap.
    const ph = rng.range(0.9, 1.2);
    const glassRail = rng.chance(0.18);
    const edgeCuts = cuts.get(l.id) || { N: [], S: [], W: [], E: [] };
    const needs = (e) => {
      const { q, gap } = edgeInfo(l, e);
      if (q && gap === 0 && !q.tower && Math.abs(q.h - h) < 0.1) return false; // continuous roof
      if (q && gap === 0 && q.h > h + 0.5) return false; // against a taller wall
      return true;
    };
    const has = Object.fromEntries(['N', 'S', 'W', 'E'].map((e) => [e, needs(e)]));
    l.parapets = has;
    for (const e of ['N', 'S', 'W', 'E']) {
      if (!has[e]) continue;
      const alongX = e === 'N' || e === 'S';
      const a0 = alongX ? x0 : z0 + (has.N ? t : 0);
      const a1 = alongX ? x1 : z1 - (has.S ? t : 0);
      // Copings overhang, so the side ones stop a little further in.
      const a0c = alongX ? x0 : z0 + (has.N ? t + 0.06 : 0);
      const a1c = alongX ? x1 : z1 - (has.S ? t + 0.06 : 0);
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
        const box = (key, o0, o1, y0, y1, collide = true, cap = false) => {
          const [m0, m1] = inward > 0 ? [c + o0, c + o1] : [c - o1, c - o0];
          const s0 = cap && r0 === a0 ? a0c : r0;
          const s1 = cap && r1 === a1 ? a1c : r1;
          if (alongX) b.box(key, s0, y0, m0, s1, y1, m1, collide);
          else b.box(key, m0, y0, s0, m1, y1, s1, collide);
        };
        if (glassRail) {
          box('white', 0, t, h, h + 0.25);
          box('glass', t * 0.4, t * 0.6, h + 0.25, h + 1.1, false);
          box('metal', t * 0.3, t * 0.7, h + 1.1, h + 1.16, true, true);
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
          box('white', 0, t, h, h + ph);
          box('whiteGloss', -0.05, t + 0.06, h + ph, h + ph + 0.08, false, true);
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
  // Each roof is laid out like a real one: a stair/lift core against one
  // edge with a clear apron at its door; a band of plant along the opposite
  // edge (a fenced condenser yard, units up on a steel platform, an air
  // handler whose duct crosses to the core, a cooling tower on a stand);
  // pipes from the plant along the side to the core; services and signs
  // round the other edges; skylights and vents in rows down the middle; and
  // the walls of taller neighbours dressed with fire escapes, wall units,
  // billboards and scaffolding.
  const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
  const ROT_IN = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
  // One edge of a roof as a frame: `a` runs along it, `d` is the distance in.
  const edgeOf = (r, e) => {
    const alongX = e === 'N' || e === 'S';
    const c = e === 'N' ? r.z0 : e === 'S' ? r.z1 : e === 'W' ? r.x0 : r.x1;
    const inward = e === 'N' || e === 'W' ? 1 : -1;
    const xz = (a, d) => (alongX ? [a, c + inward * d] : [c + inward * d, a]);
    return {
      e,
      alongX,
      c,
      inward,
      a0: alongX ? r.x0 : r.z0,
      a1: alongX ? r.x1 : r.z1,
      depth: alongX ? r.z1 - r.z0 : r.x1 - r.x0,
      rot: ROT_IN[e],
      xz,
      rect(pa0, pa1, d0, d1) {
        const [ax, az] = xz(pa0, d0);
        const [bx, bz] = xz(pa1, d1);
        return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
      },
    };
  };
  const pipeSet = () => {
    const all = [
      { r: rng.range(0.09, 0.13), key: 'steel' },
      { r: rng.range(0.12, 0.16), key: 'whiteGloss' },
      { r: rng.range(0.06, 0.08), key: rng.chance(0.35) ? 'runner' : rng.pick(['accentA', 'accentB', 'yellowCrane']) },
      { r: rng.range(0.05, 0.07), key: 'darkMetal' },
    ];
    return all.slice(0, rng.int(2, 4));
  };
  const tallest = roofs.reduce((m, r) => (r.y > m.y ? r : m), roofs[0]);
  let gardenDone = !style.garden;
  let helipadDone = !style.helipad;
  let redRamps = rng.int(1, 2);
  let billboards = 0;
  for (const r of roofs) {
    const { x0, x1, z0, z1, y } = r;
    const inset = 1.0;
    const e = 0.02; // (things may stand right on the inset line)
    const reg = new Region((x, z) => x > x0 + inset - e && x < x1 - inset + e && z > z0 + inset - e && z < z1 - inset + e, { x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset });
    for (const [a0, c0, a1, c1] of reserve.get(r.lot.id) || []) reg.reserve(a0, c0, a1, c1);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = x1 - x0;
    const d = z1 - z0;
    const role = !helipadDone && r === tallest && w > 18 && d > 18 ? 'helipad' : !gardenDone && w > 16 && d > 16 && r !== tallest ? 'garden' : 'plant';

    // --- the core: a stair / lift housing against an edge, door inward.
    const edgePref = ['N', 'S', 'W', 'E'].map((e) => {
      const { q, gap } = edgeInfo(r.lot, e);
      return [e, !q ? 3 : gap > 0 ? 2 : q.h > y + 0.5 ? 0.4 : 1];
    });
    let core = null;
    for (let t = 0; t < 4 && !core; t++) {
      const ec = rng.weighted(edgePref);
      const L = edgeOf(r, ec);
      const len = L.a1 - L.a0;
      const cw = snap(rng.range(5, Math.min(8.5, len * 0.38)), 0.6);
      const cd = snap(rng.range(3.6, 5.4), 0.6);
      for (let k = 0; k < 12 && !core; k++) {
        const a = rng.range(L.a0 + inset + cw / 2 + 0.6, L.a1 - inset - cw / 2 - 0.6);
        const rect = L.rect(a - cw / 2, a + cw / 2, inset, inset + cd);
        const apron = L.rect(a - 1.4, a + 1.4, inset + cd, inset + cd + 2.6);
        if (reg.free(...rect, 0.3) && reg.free(...apron, 0)) {
          reg.reserve(rect[0] - 0.4, rect[1] - 0.4, rect[2] + 0.4, rect[3] + 0.4);
          reg.reserve(...apron);
          core = { ec, L, a, cw, cd, ch: rng.range(3.2, 4.4) };
        }
      }
    }
    if (core) {
      const [hx, hz] = core.L.xz(core.a, inset + core.cd / 2);
      R.housing(b, rng, hx, y, hz, core.L.rot, core.cw, core.cd, core.ch, rng.chance(0.9) ? bandKey() : null);
      addFocus(hx, y + core.ch * 0.5, hz, 1.3, 'core');
      if (rng.chance(0.35)) {
        const [mx, mz] = core.L.xz(core.a + (core.cw / 2 - 0.8) * rng.sign(), inset + 0.8);
        R.mast(b, rng, mx, y + core.ch + 0.28, mz, rng.range(4, 9));
      }
    }

    if (role === 'helipad') {
      const hr = 6.5;
      if (reg.take(cx - hr - 1, cz - hr - 1, cx + hr + 1, cz + hr + 1, 0.5)) {
        R.helipad(b, cx, y, cz, hr);
        helipadDone = true;
        addFocus(cx, y + 1, cz, 1, 'helipad');
      }
    } else if (role === 'garden') {
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

    // --- the plant band along the edge opposite the core.
    const pieces = [];
    const eo = core ? OPP[core.ec] : rng.pick(['N', 'S', 'W', 'E']);
    const Lo = edgeOf(r, eo);
    if (role === 'plant') {
      const bandD = Math.min(9.5, Math.max(4.6, (Lo.depth - 2 * inset - (core ? core.cd + 3 : 0)) * 0.5));
      const span = Lo.a1 - Lo.a0 - 2 * inset;
      const nP = span > 23 ? 3 : span > 13 ? 2 : 1;
      const lane = 1.8;
      const ws = Array.from({ length: nP }, () => rng.range(0.7, 1.3));
      const sum = ws.reduce((a, v) => a + v, 0);
      let at = Lo.a0 + inset;
      const kinds = { ahu: core ? 2.6 : 0, yard: 3, platform: 2, tower: 1, tanks: 0.6 };
      for (let k = 0; k < nP; k++) {
        const pw = ((span - lane * (nP - 1)) * ws[k]) / sum;
        const pa0 = at;
        const pa1 = at + pw;
        at = pa1 + lane;
        const kind = rng.weighted(Object.entries(kinds));
        if (kind === 'ahu' || kind === 'tower') kinds[kind] = 0;
        const rect = Lo.rect(pa0, pa1, inset, inset + bandD);
        if (!reg.free(...rect, 0.2)) continue;
        const piece = { kind, pa0, pa1, d0: inset, d1: inset + bandD, rect };
        const [pcx, pcz] = Lo.xz((pa0 + pa1) / 2, inset + bandD / 2);
        const rotA = Lo.alongX ? 0 : Math.PI / 2;
        if (kind === 'yard') {
          // Condensers in a row on a concrete pad inside a chain-link fence,
          // the gate on the side facing the roof.
          const [fx0, fz0, fx1, fz1] = Lo.rect(pa0 + 0.2, pa1 - 0.2, inset + 0.2, inset + bandD - 0.2);
          b.box('concrete', fx0 + 0.3, y, fz0 + 0.3, fx1 - 0.3, y + 0.15, fz1 - 0.3);
          const len = pw - 1.6;
          const cw = rng.range(2.4, 3.6);
          const n = Math.max(1, Math.floor((len + 0.8) / (cw + 0.8)));
          const cd = Math.min(rng.range(1.3, 1.9), bandD - 2.2);
          for (let m = 0; m < n; m++) {
            const a = pa0 + 0.8 + (len - n * cw - (n - 1) * 0.8) / 2 + cw / 2 + m * (cw + 0.8);
            const [ux, uz] = Lo.xz(a, inset + bandD / 2);
            R.condenser(b, rng, ux, y + 0.15, uz, rotA, cw, cd, rng.range(1.2, 1.8));
          }
          const [p0, p1] = [Lo.xz(pa0 + 0.2, inset + bandD - 0.2), Lo.xz(pa0 + 0.2, inset + 0.2)];
          const [p2, p3] = [Lo.xz(pa1 - 0.2, inset + 0.2), Lo.xz(pa1 - 0.2, inset + bandD - 0.2)];
          const gm = (pa0 + pa1) / 2 + rng.range(-0.3, 0.3) * pw;
          const g0 = Lo.xz(gm + 0.75, inset + bandD - 0.2);
          const g1 = Lo.xz(gm - 0.75, inset + bandD - 0.2);
          R.fence(b, [p0, p1, p2, p3, g0, g1, p0], y, rng.range(1.8, 2.2), [4]);
          addFocus(pcx, y + 1.3, pcz, 1.3, 'plant');
        } else if (kind === 'platform' || kind === 'tower') {
          // Units up on a steel stand, a stair on the side facing the roof.
          const [sx0, sz0, sx1, sz1] = Lo.rect(pa0 + 0.3, pa1 - 0.3, inset + 0.3, inset + bandD - (kind === 'tower' ? 2.4 : 0.3));
          const h = kind === 'tower' ? rng.range(1.8, 2.4) : rng.range(0.9, 1.6);
          const inSide = OPP[eo];
          const top = R.platform(b, sx0, sz0, sx1, sz1, y, h, steel, inSide, ['N', 'S', 'W', 'E']);
          const ux = (sx0 + sx1) / 2;
          const uz = (sz0 + sz1) / 2;
          const dw = Math.min(sx1 - sx0, sz1 - sz0);
          const lw = Math.max(sx1 - sx0, sz1 - sz0);
          if (kind === 'tower') R.coolingTower(b, ux, top, uz, Math.min(dw - 1, 4.2), Math.min(dw - 1, 4.2), rng.range(2.2, 3));
          else if (rng.chance(0.6)) R.rtu(b, rng, ux, top, uz, rotA, Math.min(lw - 1.6, rng.range(3, 5)), Math.min(dw - 1.6, rng.range(1.8, 2.4)), rng.range(1.2, 1.7));
          else {
            const n = Math.max(1, Math.floor((lw - 1.4) / 3.2));
            for (let m = 0; m < n; m++) {
              const a = (Lo.alongX ? sx0 : sz0) + 0.7 + 1.5 + m * 3.2;
              const [qx, qz] = Lo.alongX ? [a, uz] : [ux, a];
              R.condenser(b, rng, qx, top, qz, rotA, 2.6, Math.min(1.7, dw - 1.4), rng.range(1.1, 1.5));
            }
          }
          const [ax, az] = Lo.xz((pa0 + pa1) / 2, inset + bandD + 3);
          reg.reserve(Math.min(ax, pcx) - 1, Math.min(az, pcz) - 1, Math.max(ax, pcx) + 1, Math.max(az, pcz) + 1);
          addFocus(ux, top + 1, uz, 1.3, 'plant');
        } else if (kind === 'ahu') {
          const L = Math.min(pw - 1.2, rng.range(5, 8));
          const W = Math.min(bandD - 1.6, rng.range(2, 2.6));
          const H = rng.range(2.1, 2.7);
          const [ux, uz] = Lo.xz((pa0 + pa1) / 2, inset + 0.8 + W / 2);
          const S = R.ahu(b, rng, ux, y, uz, rotA + (rng.chance(0.5) ? Math.PI : 0), L, W, H);
          piece.duct = S;
          addFocus(ux, y + H * 0.6, uz, 1.3, 'plant');
        } else {
          const rr = Math.min(rng.range(1.3, 2.2), bandD / 2 - 0.8);
          const n = Math.max(1, Math.min(2, Math.floor((pw - 1) / (2 * rr + 1.4))));
          for (let m = 0; m < n; m++) {
            const [tx, tz] = Lo.xz(pa0 + 0.8 + rr + m * (2 * rr + 1.4), inset + bandD / 2);
            R.waterTank(b, tx, y, tz, rr, rng.range(2, 3.2), rng.chance(0.4) ? bandKey() : 'white');
          }
          addFocus(pcx, y + 3, pcz, 0.8, 'plant');
        }
        reg.reserve(...rect);
        pieces.push(piece);
      }
    }

    // --- pipes from a yard or platform along the side to the core.
    const src = pieces.find((p) => p.kind === 'yard' || p.kind === 'platform' || p.kind === 'tower');
    let pipeSide = null;
    if (src && core && rng.chance(0.85)) {
      const L = core.L;
      // Work in the core's frame: band pieces use the same `a` axis.
      const nearLow = (src.pa0 + src.pa1) / 2 < (L.a0 + L.a1) / 2;
      const lane = nearLow ? L.a0 + inset + 0.7 : L.a1 - inset - 0.7;
      const dBand = L.depth - inset - (src.d1 - src.d0) - 0.5;
      const aStart = nearLow ? src.pa0 + 1.0 : src.pa1 - 1.0;
      const dCore = inset + core.cd / 2;
      const coreSide = nearLow ? core.a - core.cw / 2 - 0.35 : core.a + core.cw / 2 + 0.35;
      const laneClear = nearLow ? lane < core.a - core.cw / 2 - 0.8 : lane > core.a + core.cw / 2 + 0.8;
      if (laneClear && dBand > dCore + 3) {
        const path = [L.xz(aStart, dBand), L.xz(lane, dBand), L.xz(lane, dCore), L.xz(coreSide, dCore)];
        const yc = y + rng.range(0.45, 0.7);
        R.pipeRack(b, path, y, yc, pipeSet(), { startDrop: true, endRise: y + rng.range(2.2, 2.8) });
        for (let i = 0; i < path.length - 1; i++) {
          const [ax, az] = path[i];
          const [bx, bz] = path[i + 1];
          reg.reserve(Math.min(ax, bx) - 0.6, Math.min(az, bz) - 0.6, Math.max(ax, bx) + 0.6, Math.max(az, bz) + 0.6);
        }
        // A step-over half way along the long run.
        const [ax, az] = path[1];
        const [bx, bz] = path[2];
        if (Math.hypot(bx - ax, bz - az) > 7) R.stepOver(b, (ax + bx) / 2, y, (az + bz) / 2, Math.abs(bx - ax) > Math.abs(bz - az) ? 0 : Math.PI / 2, yc - y + 0.45, steel);
        pipeSide = nearLow ? 'low' : 'high';
        addFocus((ax + bx) / 2, y + 0.8, (az + bz) / 2, 0.9, 'services');
      }
    }

    // --- the air handler's duct: up off the unit, along the side of the
    // roof (the side the pipes don't use) and into the side of the core.
    const ah = pieces.find((p) => p.duct);
    if (ah && core) {
      const L = core.L;
      const S = ah.duct;
      const dw = rng.range(0.8, 1.1);
      const dh = rng.range(0.55, 0.75);
      const dy = Math.max(S.y + 0.9, y + 3.1);
      const aS = L.alongX ? S.x : S.z;
      const dS = L.inward * ((L.alongX ? S.z : S.x) - L.c);
      let low = aS < (L.a0 + L.a1) / 2;
      if (pipeSide && (pipeSide === 'low') === low) low = !low;
      const lane = low ? L.a0 + inset + 0.3 + dw / 2 : L.a1 - inset - 0.3 - dw / 2;
      const dCore = inset + core.cd / 2;
      const coreSide = low ? core.a - core.cw / 2 : core.a + core.cw / 2;
      const clear = low ? lane + dw / 2 < coreSide - 0.8 : lane - dw / 2 > coreSide + 0.8;
      const P = (a, dd) => {
        const [px, pz] = L.xz(a, dd);
        return new THREE.Vector3(px, dy, pz);
      };
      const pts = [S.clone(), S.clone().setY(dy)];
      if (clear) pts.push(P(lane, dS), P(lane, dCore), P(coreSide, dCore));
      else if (Math.abs(aS - core.a) < core.cw / 2 - dw / 2 - 0.2) pts.push(P(aS, inset + core.cd));
      else pts.push(P(aS, dCore), P(coreSide, dCore));
      R.ductRun(b, pts, y, dw, dh, 'galv');
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        reg.reserve(Math.min(p.x, q.x) - dw / 2 - 0.3, Math.min(p.z, q.z) - dw / 2 - 0.3, Math.max(p.x, q.x) + dw / 2 + 0.3, Math.max(p.z, q.z) + dw / 2 + 0.3);
      }
      const m = pts[Math.floor(pts.length / 2)];
      addFocus(m.x, dy, m.z, 1.1, 'services');
    }

    // --- round the other edges: services, units and signs.
    for (const e of ['N', 'S', 'W', 'E']) {
      if (core && (e === core.ec || e === eo)) continue;
      const L = edgeOf(r, e);
      const { q, gap } = edgeInfo(r.lot, e);
      if (q && gap === 0 && q.h > y + 0.5) continue; // a wall there (see below)
      if (pipeSide && core) {
        const low = e === (core.L.alongX ? 'W' : 'N');
        if ((pipeSide === 'low') === low) continue;
      }
      const pick = rng.weighted([['acRow', 3], ['pipeRun', 2.5], ['billboard', !q && billboards < 3 ? 2 : 0], ['none', 1.5]]);
      if (pick === 'acRow') {
        const n = rng.int(3, 7);
        const s = rng.range(0.9, 1.15);
        const len = n * 1.25;
        const a = rng.range(L.a0 + inset + 1, Math.max(L.a0 + inset + 1, L.a1 - inset - 1 - len));
        const rect = L.rect(a, a + len, inset, inset + 0.9);
        if (reg.take(...rect, 0.2)) {
          for (let m = 0; m < n; m++) {
            const [ux, uz] = L.xz(a + 0.62 + m * 1.25, inset + 0.4);
            R.acUnit(b, ux, y, uz, L.rot, s);
          }
          const [fx, fz] = L.xz(a + len / 2, inset + 0.5);
          addFocus(fx, y + 0.6, fz, 0.8, 'plant');
        }
      } else if (pick === 'pipeRun') {
        const a0 = L.a0 + inset + rng.range(1, 3);
        const a1 = L.a1 - inset - rng.range(1, 3);
        const dd = inset + 0.45;
        const rect = L.rect(a0 - 0.4, a1 + 0.4, dd - 0.45, dd + 0.45);
        if (a1 - a0 > 6 && reg.take(...rect, 0)) {
          const yc = y + rng.range(0.28, 0.4);
          R.pipeRack(b, [L.xz(a0, dd), L.xz(a1, dd)], y, yc, pipeSet().slice(0, rng.int(1, 3)), { startDrop: true, endRise: y + 0.2 });
          const [fx, fz] = L.xz((a0 + a1) / 2, dd);
          addFocus(fx, y + 0.5, fz, 0.7, 'services');
        }
      } else if (pick === 'billboard') {
        const len = L.a1 - L.a0 - 2 * inset - 4;
        const bw = Math.min(16, len * rng.range(0.55, 0.85));
        const bh = bw * rng.range(0.32, 0.42);
        const a = (L.a0 + L.a1) / 2 + rng.range(-0.2, 0.2) * (len - bw);
        const [px, pz] = L.xz(a, 2.6);
        const rect = L.alongX ? [px - bw / 2, pz - 2.5, px + bw / 2, pz + 2.5] : [px - 2.5, pz - bw / 2, px + 2.5, pz + bw / 2];
        if (bw > 6 && reg.take(...rect, 0)) {
          R.billboard(b, px, y, pz, L.rot + Math.PI, bw, bh, `ad${billboards % 3}`, rng.range(1.4, 3));
          billboards++;
          addFocus(px, y + 3 + bh / 2, pz, 1.1, 'billboard');
        }
      }
    }

    // --- down the middle: skylights and vents in rows, sometimes panels.
    const mid = core ? core.L : edgeOf(r, 'N');
    const dMid = core ? inset + core.cd + 3.6 + rng.range(0, 2) : mid.depth / 2;
    if (role === 'plant' && rng.chance(0.3)) {
      const sw = snap(rng.range(6, Math.min(14, w - 6)), 1.1);
      const sd = snap(rng.range(4.8, 7.2), 2.4);
      const s = reg.spot(rng, sw, sd, 25, 0.8);
      if (s) {
        R.solarArray(b, s.x - sw / 2, s.z - sd / 2, s.x + sw / 2, s.z + sd / 2, y);
        addFocus(s.x, y + 1, s.z, 0.7, 'solar');
      }
    }
    const skyKind = rng.pick(['pyramid', 'ridge', 'grille']);
    const nSky = rng.int(0, 3);
    const skyW = rng.range(2, 3.2);
    const skyD = skyKind === 'ridge' ? rng.range(4, 6.5) : skyW;
    const rowA = (mid.a0 + mid.a1) / 2 - ((nSky - 1) * (skyW + 2.2)) / 2;
    for (let k = 0; k < nSky; k++) {
      const [sx, sz] = mid.xz(rowA + k * (skyW + 2.2), dMid + skyD / 2);
      const [ew, ed] = mid.alongX ? [skyW, skyD] : [skyD, skyW];
      if (reg.take(sx - ew / 2 - 0.3, sz - ed / 2 - 0.3, sx + ew / 2 + 0.3, sz + ed / 2 + 0.3, 0.3)) R.skylight(b, sx, y, sz, ew, ed, skyKind);
    }
    const nv = rng.int(3, 7);
    const dv = dMid + (nSky ? skyD + 1.6 : 0);
    const va = rng.range(mid.a0 + inset + 2, mid.a0 + inset + 5);
    for (let k = 0; k < nv; k++) {
      const [vx, vz] = mid.xz(va + k * rng.range(2.2, 3.2), dv);
      if (reg.take(vx - 0.5, vz - 0.5, vx + 0.5, vz + 0.5, 0.3)) R.vent(b, rng, new THREE.Vector3(vx, y, vz), y);
    }
    if (role === 'plant' && rng.chance(0.3)) {
      const s = reg.spot(rng, 5, 5, 20, 0.5);
      if (s) R.flue(b, rng, s.x, y, s.z);
    }

    // --- the walls of taller neighbours facing this roof.
    for (const e of ['N', 'S', 'W', 'E']) {
      const { q, gap } = edgeInfo(r.lot, e);
      // Across an alley: a fire escape up the neighbour's wall, hanging in
      // the alley from a couple of floors below this roof.
      if (q && !q.tower && gap > 3 && gap < 8 && q.h > y + 2.5 && rng.chance(0.45)) {
        const L = edgeOf(r, e);
        const qa0 = Math.max(L.a0, L.alongX ? q.x0 : q.z0) + 0.8;
        const qa1 = Math.min(L.a1, L.alongX ? q.x1 : q.z1) - 0.8;
        const len = Math.round(3.4 / 0.19) * 0.27 + 2.6;
        const y0 = Math.max(0, y - 2 * 3.4);
        const floors = Math.min(6, Math.floor((q.h - y0 - 1.2) / 3.4));
        if (floors >= 2 && qa1 - qa0 > len) {
          const a = rng.range(qa0 + len / 2, qa1 - len / 2);
          const [fx, fz] = L.xz(a, -gap);
          R.fireEscape(b, fx, y0, fz, L.rot, floors, rng.pick(['accentA', 'accentB', 'accentC', steel]));
          addFocus(fx, y + 2, fz, 1.2, 'wall');
        }
      }
      if (!q || gap !== 0 || q.h < y + 5) continue;
      const L = edgeOf(r, e);
      const qa0 = Math.max(L.a0, L.alongX ? q.x0 : q.z0) + 0.8;
      const qa1 = Math.min(L.a1, L.alongX ? q.x1 : q.z1) - 0.8;
      const dy = q.h - y;
      const glass = q.tower;
      const free = (a0, a1, dd) => reg.free(...L.rect(a0, a1, 0.05, dd), 0);
      // Fire escape (not on glass towers).
      if (!glass && dy >= 7 && rng.chance(0.55)) {
        const floors = Math.min(4, Math.floor((dy - 1.5) / 3.4));
        const len = Math.round(3.4 / 0.19) * 0.27 + 2.6;
        const a = rng.range(qa0 + len / 2, Math.max(qa0 + len / 2, qa1 - len / 2));
        if (floors >= 1 && qa1 - qa0 > len && free(a - len / 2, a + len / 2, 1.5)) {
          const [fx, fz] = L.xz(a, 0);
          R.fireEscape(b, fx, y, fz, L.rot, floors, rng.pick(['accentA', 'accentB', steel]));
          reg.reserve(...L.rect(a - len / 2, a + len / 2, 0, 1.6));
          addFocus(fx, y + floors * 1.7, fz, 1.3, 'wall');
        }
      }
      // Split units on brackets.
      if (!glass && rng.chance(0.6)) {
        const n = rng.int(2, 5);
        const a = rng.range(qa0 + 1, Math.max(qa0 + 1, qa1 - n * 2.4));
        for (let m = 0; m < n; m++) {
          const [ux, uz] = L.xz(a + m * rng.range(2, 2.8), 0);
          const hy = y + rng.pick([2.2, 2.2, 5.6]) + (rng.next() - 0.5) * 0.3;
          if (hy < q.h - 1.5) R.wallAC(b, ux, hy, uz, L.rot);
        }
      }
      // A billboard fixed high on the wall.
      if (dy >= 9 && rng.chance(glass ? 0.25 : 0.35)) {
        const bw = Math.min(qa1 - qa0 - 1, rng.range(6, 12));
        const bh = bw * rng.range(0.32, 0.42);
        const a = (qa0 + qa1) / 2 + rng.range(-0.25, 0.25) * (qa1 - qa0 - bw);
        const [px, pz] = L.xz(a, 0);
        const by = y + Math.min(dy - bh - 1.5, rng.range(4.5, 9));
        if (bw > 4 && by > y + 3.5) {
          R.wallBoard(b, px, by, pz, L.rot, bw, bh, `ad${billboards % 3}`);
          billboards++;
          addFocus(px, by + bh / 2, pz, 1, 'wall');
        }
      }
      // Scaffolding going up the wall.
      if (!glass && dy >= 5 && rng.chance(0.25)) {
        const len = Math.min(qa1 - qa0, rng.range(6, 11));
        const a = rng.range(qa0 + len / 2, Math.max(qa0 + len / 2, qa1 - len / 2));
        if (free(a - len / 2, a + len / 2, 1.8)) {
          const [sx, sz] = L.xz(a, 0);
          R.scaffold(b, rng, sx, y, sz, L.rot, len, Math.min(dy - 1, rng.range(6, 12)));
          reg.reserve(...L.rect(a - len / 2, a + len / 2, 0, 1.8));
          addFocus(sx, y + 3, sz, 1, 'wall');
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
