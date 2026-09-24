import { RNG } from '../util/rng.js';
import { Builder } from './builder.js';
import * as F from './furniture.js';
import { makePlan, FH, CEIL } from './plan.js';
import { furnish, Placer, shuffle, EDGE_IN, edgeCoord } from './decor.js';

// Procedural Mirror's Edge style office floor: a whole storey of a tower
// with a tall atrium, corridors, private offices, open-plan areas, meeting
// rooms, break rooms and a lift core, plus glass-fronted rooms upstairs
// around the mezzanine. One bold accent colour per office against white,
// glass, steel and concrete. Everything is boxes on an axis-aligned plan, so
// collision and ray queries use a flat list of AABB colliders.

export { FH, CEIL };
const T = 0.2; // wall thickness
const DOOR_H = 2.35;

export const PALETTES = [
  { name: 'lime', accent: '#86c830', accent2: '#c5ea6a', dark: '#4d8710', leaf: '#76c043', pop: ['#20b2c8', '#ff7a1a'] },
  { name: 'yellow', accent: '#ffc914', accent2: '#ffe27a', dark: '#c29000', leaf: '#7cc04a', pop: ['#26c1a5', '#ff6a1a'] },
  { name: 'orange', accent: '#ff5f12', accent2: '#ffa14d', dark: '#bd4500', leaf: '#7cc04a', pop: ['#1a9fe0', '#ffd21a'] },
  { name: 'blue', accent: '#1e74f0', accent2: '#72b2ff', dark: '#0c3f9a', leaf: '#5c9fd8', pop: ['#ff7a1a', '#23c4d8'] },
  { name: 'magenta', accent: '#e02b8b', accent2: '#ff8cc8', dark: '#95104f', leaf: '#e3b6cc', pop: ['#6d3cff', '#ffb01a'] },
  { name: 'red', accent: '#df242c', accent2: '#ff7b70', dark: '#931016', leaf: '#7cc04a', pop: ['#1a1a1a', '#ffb01a'] },
  { name: 'teal', accent: '#10b3a0', accent2: '#72e0d1', dark: '#0a7568', leaf: '#6fbf2a', pop: ['#ff6a1a', '#1a5ee0'] },
];

const SURNAMES = ['Halden', 'Voss', 'Carrow', 'Mendel', 'Aster', 'Kessler', 'Dray', 'Lindqvist', 'Okafor', 'Tamura', 'Brandt', 'Ferro', 'Quill', 'Marlowe', 'Ivers', 'Rook', 'Vance', 'Hale', 'Draper', 'Coyle', 'Lund', 'Strand', 'Keane', 'Ashby', 'Pryce', 'Wexler', 'Moreau', 'Castell', 'Sorensen', 'Whitlock', 'Mercer', 'Novak', 'Abara', 'Hollis'];
const FIRMS = [
  ['& Associates', '&A'],
  ['& Partners', '&P'],
  ['& Co', '&C'],
];
const CORP = ['Group', 'Holdings', 'Systems', 'Capital', 'Dynamics'];
const SYL_A = ['Vel', 'Nor', 'Kal', 'Tor', 'Ar', 'Sen', 'Hal', 'Mer', 'Lux', 'Ost', 'Vor', 'Cal', 'Dra', 'Iver', 'Pal', 'Ren', 'Sol', 'Tev', 'Zan', 'Mar'];
const SYL_B = ['tris', 'ven', 'ex', 'ora', 'dane', 'mark', 'ion', 'ith', 'vale', 'cor', 'nova', 'lyn', 'dor', 'tek', 'ara', 'well'];

// A fictional firm: display name plus a short mark for monograms.
export function makeCompany(rng) {
  if (rng.chance(0.6)) {
    const a = rng.pick(SURNAMES);
    let c = rng.pick(SURNAMES);
    if (c === a) c = SURNAMES[(SURNAMES.indexOf(a) + 7) % SURNAMES.length];
    const [suf, m] = rng.pick(FIRMS);
    if (rng.chance(0.6)) return { name: `${a} ${c} ${suf}`, mark: `${a[0]}${c[0]}${m}` };
    return { name: `${a} ${suf}`, mark: `${a[0]}${m}` };
  }
  const base = rng.pick(SYL_A) + rng.pick(SYL_B);
  if (rng.chance(0.5)) {
    const c = rng.pick(CORP);
    return { name: `${base} ${c}`, mark: `${base[0]}${c[0]}` };
  }
  return { name: base, mark: base.slice(0, 3).toUpperCase() };
}

const snap = (v, s = 0.6) => Math.round(v / s) * s;
const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
const EDGES = ['N', 'S', 'W', 'E'];
const axisOf = (e) => (e === 'N' || e === 'S' ? 'x' : 'z');
// Which face of a wall (negative / positive side along its normal) a room sees.
const faceOf = (e) => (e === 'N' || e === 'W' ? 'pos' : 'neg');

export function generateOffice(seed) {
  const rng = new RNG(seed);
  const pal = rng.pick(PALETTES);
  const mono = rng.chance(0.28);
  const company = makeCompany(rng);
  const plan = makePlan(rng);
  const { rooms, atrium, fp, HA, floors } = plan;
  const b = new Builder();

  // --------------------------------------------------------- finishes
  const finishPick = () =>
    mono
      ? rng.weighted([
          ['wallAccent', 3],
          ['wallAccent2', 1.5],
          ['wallPanel', 1],
        ])
      : rng.weighted([
          ['wallAccent', 4],
          ['concrete', 2],
          ['wallAccent2', 1],
          ['wallPanel', 1.5],
          [null, 1.2],
        ]);
  for (const r of rooms) {
    r.finish = { N: null, S: null, W: null, E: null };
    r.spans = { N: [], S: [], W: [], E: [] };
    r.doors = 0;
    const edges = shuffle(rng, EDGES);
    const n = mono ? rng.int(2, 4) : rng.int(1, 2);
    for (let i = 0; i < n; i++) r.finish[edges[i]] = finishPick();
    if (r.type === 'corridor' && rng.chance(mono ? 0.6 : 0.3)) {
      const long = r.w > r.d ? ['N', 'S'] : ['W', 'E'];
      for (const e of long) r.finish[e] = 'wallAccent';
    }
  }
  atrium.upper = {};
  for (const e of EDGES) atrium.upper[e] = atrium.finish[e] || rng.weighted([['wallAccent', 3], ['concrete', 1.5], ['wallPanel', 1]]);

  // ------------------------------------------------- floors and ceilings
  const floorKey = (r) => {
    const t = r.type;
    const pick = (opts) => rng.weighted(opts);
    if (t === 'atrium') return pick([['floorTile', 3], ['floorDark', 1]]);
    if (t === 'corridor') return 'floorTile';
    if (t === 'lounge') return pick([['carpet', mono ? 4 : 2.5], ['floorTile', 1], ['carpetGray', 0.8]]);
    if (t === 'office') return pick([['floorDark', 1.4], ['carpet', mono ? 3 : 1.2], ['carpetGray', 1], ['floorTile', 0.6]]);
    if (t === 'open') return pick([['carpetGray', 2], ['carpet', mono ? 3 : 1.4], ['floorTile', 0.6]]);
    if (t === 'meeting') return pick([['carpet', mono ? 4 : 2.2], ['carpetGray', 1], ['floorTile', 0.8]]);
    if (t === 'break') return pick([['floorTile', 2], ['floorDark', 1.2]]);
    return 'floorTile';
  };
  const ceilKey = (r) => {
    const t = r.type;
    if (t === 'corridor') return rng.weighted([['ceilPerf', 2], ['ceilLayIn', 2], ['plaster', 1]]);
    if (t === 'office' || t === 'meeting') return rng.weighted([['ceilPerf', 3], ['ceilLayIn', 2]]);
    return rng.weighted([['ceilLayIn', 3], ['plaster', 1], ['ceilPerf', 1]]);
  };
  for (const r of rooms) {
    r.floor = floorKey(r);
    r.ceiling = ceilKey(r);
  }
  const placers = new Map(rooms.map((r) => [r, new Placer(r)]));

  // -------------------------------------------------------------- walls
  function edgeSegments(r, edge, list) {
    const horiz = edge === 'N' || edge === 'S';
    const a0 = horiz ? r.x0 : r.z0;
    const a1 = horiz ? r.x1 : r.z1;
    const segs = [];
    for (const q of list) {
      if (q === r) continue;
      const touch =
        edge === 'N' ? Math.abs(q.z1 - r.z0) < 1e-3 :
        edge === 'S' ? Math.abs(q.z0 - r.z1) < 1e-3 :
        edge === 'W' ? Math.abs(q.x1 - r.x0) < 1e-3 :
        Math.abs(q.x0 - r.x1) < 1e-3;
      if (!touch) continue;
      const lo = Math.max(a0, horiz ? q.x0 : q.z0);
      const hi = Math.min(a1, horiz ? q.x1 : q.z1);
      if (hi - lo > 0.05) segs.push({ a0: lo, a1: hi, nb: q });
    }
    segs.sort((p, q) => p.a0 - q.a0);
    const out = [];
    let cur = a0;
    for (const s of segs) {
      if (s.a0 > cur + 0.05) out.push({ a0: cur, a1: s.a0, nb: null });
      out.push(s);
      cur = s.a1;
    }
    if (cur < a1 - 0.05) out.push({ a0: cur, a1, nb: null });
    return out;
  }
  const isExterior = (r, e) =>
    e === 'N' ? Math.abs(r.z0 - fp.z0) < 1e-3 : e === 'S' ? Math.abs(r.z1 - fp.z1) < 1e-3 : e === 'W' ? Math.abs(r.x0 - fp.x0) < 1e-3 : Math.abs(r.x1 - fp.x1) < 1e-3;

  function wallRects(a0, a1, y0, y1, openings) {
    const rects = [];
    let cur = a0;
    const ops = openings.filter((o) => o.a1 > a0 && o.a0 < a1).sort((p, q) => p.a0 - q.a0);
    for (const o of ops) {
      const oa0 = Math.max(o.a0, a0);
      const oa1 = Math.min(o.a1, a1);
      if (oa0 > cur) rects.push([cur, oa0, y0, y1]);
      if (y0 + o.top < y1) rects.push([oa0, oa1, y0 + o.top, y1]);
      cur = Math.max(cur, oa1);
    }
    if (cur < a1) rects.push([cur, a1, y0, y1]);
    return rects;
  }

  const along = (axis, c, a0, y0, a1, y1, o0, o1, key, collide = false) => b.wallBox(key, axis, c, a0, a1, y0, y1, o0, o1, collide);

  // Solid wall with optional cladding on either face and skirting boards.
  function solidWall(axis, c, a0, a1, y0, y1, openings, faces, skirt = { neg: true, pos: true }) {
    for (const [ra, rb, ya, yb] of wallRects(a0, a1, y0, y1, openings)) {
      along(axis, c, ra, ya, rb, yb, -T / 2, T / 2, 'wall', true);
      if (faces.neg) along(axis, c, ra, ya, rb, yb, -T / 2 - 0.015, -T / 2, faces.neg);
      if (faces.pos) along(axis, c, ra, ya, rb, yb, T / 2, T / 2 + 0.015, faces.pos);
      if (ya <= y0 + 1e-3) {
        if (skirt.neg) along(axis, c, ra, ya, rb, ya + 0.07, -T / 2 - 0.028, -T / 2, 'skirting');
        if (skirt.pos) along(axis, c, ra, ya, rb, ya + 0.07, T / 2, T / 2 + 0.028, 'skirting');
      }
    }
  }

  const glassFrame = rng.chance(0.6) ? 'metal' : 'darkMetal';
  function glassWall(axis, c, a0, a1, y0, y1, openings) {
    for (const [ra, rb, ya, yb] of wallRects(a0, a1, y0, y1, openings)) {
      if (ya > y0 + 0.01) {
        // Transom panel above a door.
        along(axis, c, ra, ya, rb, yb, -0.01, 0.01, 'glass');
        continue;
      }
      along(axis, c, ra, ya, rb, yb, -0.01, 0.01, 'glass');
      const col = axis === 'x' ? b.collider(ra, ya, c - 0.05, rb, yb, c + 0.05) : b.collider(c - 0.05, ya, ra, c + 0.05, yb, rb);
      col.glass = true;
      const n = Math.max(1, Math.round((rb - ra) / 1.2));
      for (let i = 0; i <= n; i++) {
        const a = ra + ((rb - ra) * i) / n;
        along(axis, c, a - 0.025, ya, a + 0.025, yb, -0.04, 0.04, glassFrame);
      }
      // Frosted manifestation bands.
      along(axis, c, ra, ya + 1.05, rb, ya + 1.3, -0.013, 0.013, 'frosted');
      along(axis, c, ra, ya + 1.36, rb, ya + 1.4, -0.013, 0.013, 'frosted');
      along(axis, c, ra, ya, rb, ya + 0.08, -0.05, 0.05, glassFrame);
    }
    along(axis, c, a0, y1 - 0.08, a1, y1, -0.05, 0.05, glassFrame);
  }

  // Exterior glazing: deep mullions, sill, head and spandrels at each floor.
  const mullSpacing = rng.pick([1.5, 1.8]);
  const mullKey = rng.chance(0.6) ? 'darkMetal' : 'white';
  const headAccent = rng.chance(0.3);
  const canopy = rng.chance(0.25) ? rng.pick(['accent', 'white']) : null;
  function curtain(r, e, axis, c, a0, a1, y0, y1) {
    const n = Math.max(1, Math.round((a1 - a0) / mullSpacing));
    const [ix, iz] = EDGE_IN[e];
    const inward = ix + iz;
    along(axis, c, a0, y0, a1, y1, -0.01, 0.01, 'glass');
    const col = axis === 'x' ? b.collider(a0, y0, c - 0.1, a1, y1, c + 0.1) : b.collider(c - 0.1, y0, a0, c + 0.1, y1, a1);
    col.glass = true;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      along(axis, c, a - 0.04, y0, a + 0.04, y1, -0.22, 0.12, mullKey);
    }
    along(axis, c, a0, y0, a1, y0 + 0.12, -0.14, 0.14, mullKey);
    along(axis, c, a0, y0, a1, y0 + 0.1, -0.05, inward * 0.2 + 0.05 * inward, 'white');
    for (let lv = y0; lv < y1 - 0.5; lv += FH) {
      const top = lv + FH;
      if (top < y1 - 0.5) along(axis, c, a0, top - 0.4, a1, top + 0.3, -0.14, 0.14, 'white');
      if (lv + CEIL + 0.3 < y1) along(axis, c, a0, lv + CEIL - 0.06, a1, lv + CEIL, -0.12, 0.12, mullKey);
    }
    along(axis, c, a0, y1 - 0.2, a1, y1, -0.14, 0.14, headAccent ? 'accent' : mullKey);
    if (canopy && y0 < 0.1) {
      // Sunshade fins outside, above the windows.
      const out = -inward;
      const o0 = Math.min(out * 0.2, out * 1.1);
      const o1 = Math.max(out * 0.2, out * 1.1);
      along(axis, c, a0, CEIL + 0.35, a1, CEIL + 0.42, o0, o1, canopy);
      for (let i = 0; i <= n; i += 2) {
        const a = a0 + ((a1 - a0) * i) / n;
        along(axis, c, a - 0.03, CEIL + 0.42, a + 0.03, CEIL + 0.9, o0, o1, canopy);
      }
    }
  }

  // Door / opening policy between two ground-floor spaces.
  function openingsBetween(r, q, seg) {
    const len = seg.a1 - seg.a0;
    const ops = [];
    const doors = [];
    const has = (t) => r.type === t || q.type === t;
    const other = (t) => (r.type === t ? q : r);
    const place = (w) => {
      if (len < w + 1.2) return null;
      const s = Math.round(rng.range(seg.a0 + 0.6, seg.a1 - 0.6 - w) * 10) / 10;
      return { a0: s, a1: s + w };
    };
    const addDoor = (w, opts) => {
      const p = place(w);
      if (!p) return false;
      ops.push({ ...p, top: DOOR_H, door: true });
      doors.push({ ...p, ...opts });
      return true;
    };
    if (has('corridor') && (has('atrium') || r.type === q.type)) {
      const cor = r.type === 'corridor' ? r : q;
      if (r.type === q.type || Math.abs(len - Math.min(cor.w, cor.d)) < 0.05) {
        ops.push({ a0: seg.a0, a1: seg.a1, top: CEIL });
        return { style: 'open', ops, doors };
      }
      const style = rng.weighted([
        ['colonnade', 1.5],
        ['arcade', 1],
        ['glass', 1.2],
      ]);
      if (style === 'arcade') {
        const w = rng.range(3, 4.2);
        const pier = rng.range(1.2, 2.2);
        for (let a = seg.a0 + pier; a + w < seg.a1 - pier / 2; a += w + pier) ops.push({ a0: a, a1: a + w, top: 3.0 });
      } else if (style === 'glass') {
        for (let k = 0; k < Math.max(1, Math.floor(len / 9)); k++) addDoor(1.8, { glass: true, open: true, room: cor, double: true });
      }
      return { style, ops, doors };
    }
    if (has('core')) {
      const core = r.type === 'core' ? r : q;
      return { style: 'solid', ops, doors, core: other('core').type === 'corridor' ? core : null };
    }
    if (!r.access || !q.access) {
      if (has('corridor') || has('atrium')) addDoor(1.0, { open: false });
      return { style: 'solid', ops, doors };
    }
    if (has('corridor') || has('atrium')) {
      const room = has('atrium') ? other('atrium') : other('corridor');
      if (room.type === 'open' && rng.chance(0.5) && len > 4) {
        const w = Math.min(len - 1.4, rng.range(2.4, 4.2));
        const s = rng.range(seg.a0 + 0.7, seg.a1 - 0.7 - w);
        ops.push({ a0: s, a1: s + w, top: 2.7 });
        room.doors++;
        return { style: rng.chance(0.5) ? 'glass' : 'solid', ops, doors };
      }
      const style = rng.chance(room.type === 'meeting' || room.type === 'office' ? 0.65 : 0.45) ? 'glass' : 'solid';
      if (room.doors === 0 || rng.chance(0.25)) {
        if (addDoor(1.2, { glass: style === 'glass', open: true, room })) room.doors++;
      }
      return { style, ops, doors };
    }
    if (rng.chance(0.2)) addDoor(1.2, { open: true, room: r });
    return { style: 'solid', ops, doors };
  }

  const record = (room, edge, seg, kind, ops, level) => room.spans[edge].push({ a0: seg.a0, a1: seg.a1, kind, ops, level });
  const reserveOps = (room, axis, c, ops) => {
    const P = placers.get(room);
    for (const o of ops) {
      if (axis === 'x') P.reserve(o.a0 - 0.2, c - 1.4, o.a1 + 0.2, c + 1.4);
      else P.reserve(c - 1.4, o.a0 - 0.2, c + 1.4, o.a1 + 0.2);
    }
  };
  // Normal sign (+1/-1) pointing into `room` across edge e of room r.
  const intoSign = (r, e, room) => {
    const [ix, iz] = EDGE_IN[e];
    return (room === r ? 1 : -1) * (ix + iz);
  };

  for (let level = 0; level < floors; level++) {
    const L = rooms.filter((r) => r.level === level || (level > 0 && r === atrium));
    const y0 = level * FH;
    const y1 = y0 + FH;
    for (const r of L) {
      for (const e of EDGES) {
        const c = edgeCoord(r, e);
        const axis = axisOf(e);
        for (const seg of edgeSegments(r, e, L)) {
          const q = seg.nb;
          if (q && q.id < r.id) continue; // built from the other side
          const faces = { neg: null, pos: null };
          const finishOf = (room, edge) => (room === atrium && level > 0 ? atrium.upper[edge] : room.finish[edge]);
          faces[faceOf(e)] = finishOf(r, e);
          if (q) faces[faceOf(OPP[e])] = finishOf(q, OPP[e]);

          if (q && level === 0) {
            const o = openingsBetween(r, q, seg);
            if (o.style === 'open') {
              along(axis, c, seg.a0, CEIL, seg.a1, FH, -T / 2, T / 2, 'wall', true);
            } else if (o.style === 'colonnade') {
              const n = Math.max(2, Math.round((seg.a1 - seg.a0) / 4.5));
              const colKey = rng.chance(0.4) ? 'accent' : 'white';
              for (let i = 0; i <= n; i++) {
                const a = seg.a0 + ((seg.a1 - seg.a0) * i) / n;
                if (axis === 'x') F.column(b, a, c, 0, 3.4, 0.28, colKey, true, colKey === 'accent');
                else F.column(b, c, a, 0, 3.4, 0.28, colKey, true, colKey === 'accent');
              }
              along(axis, c, seg.a0, 3.4, seg.a1, FH, -T / 2, T / 2, 'wall', true);
              o.ops.push({ a0: seg.a0, a1: seg.a1, top: 3.4 });
            } else if (o.style === 'glass') {
              glassWall(axis, c, seg.a0, seg.a1, 0, CEIL, o.ops);
              along(axis, c, seg.a0, CEIL, seg.a1, FH, -T / 2, T / 2, 'wall', true);
            } else {
              solidWall(axis, c, seg.a0, seg.a1, 0, FH, o.ops, faces);
            }
            for (const d of o.doors) {
              const glass = o.style === 'glass' && d.glass;
              if (d.double) {
                const mid = (d.a0 + d.a1) / 2;
                F.door(b, axis, c, d.a0, mid, 0, DOOR_H, { open: true, into: intoSign(r, e, d.room), glass, frame: glassFrame });
                F.door(b, axis, c, mid, d.a1, 0, DOOR_H, { open: true, into: -intoSign(r, e, d.room), glass, frame: glassFrame });
              } else {
                F.door(b, axis, c, d.a0, d.a1, 0, DOOR_H, { open: d.open, into: d.room ? intoSign(r, e, d.room) : 1, glass, frame: glass ? glassFrame : rng.pick(['metal', 'white']) });
              }
            }
            if (o.core) {
              const core = o.core;
              const eCore = core === r ? e : OPP[e];
              const side = -intoSign(r, e, core); // outward from the core
              if (core.elevSide === undefined) core.elevSide = eCore;
              if (core.elevSide === eCore && seg.a1 - seg.a0 > 3) F.elevators(b, axis, c, seg.a0 + 0.6, seg.a1 - 0.6, 0, side, T);
              else if (seg.a1 - seg.a0 > 4) {
                // Washroom doors.
                for (const t of [0.3, 0.7]) {
                  const m = seg.a0 + (seg.a1 - seg.a0) * t;
                  F.door(b, axis, c, m - 0.45, m + 0.45, 0, DOOR_H, { open: false, frame: 'metal', leaf: 'doorWhite' });
                  b.wallBox('darkMetal', axis, c, m + 0.6, m + 0.8, 1.45, 1.65, ...(side > 0 ? [T / 2, T / 2 + 0.02] : [-T / 2 - 0.02, -T / 2]));
                }
              }
            }
            record(r, e, seg, o.style, o.ops, 0);
            record(q, OPP[e], seg, o.style, o.ops, 0);
            reserveOps(r, axis, c, o.ops);
            reserveOps(q, axis, c, o.ops);
          } else if (q) {
            // Upstairs: glass fronts onto the atrium, solid walls between rooms.
            const up = r === atrium ? q : q === atrium ? r : null;
            if (up) {
              const ops = [];
              if (up.access) {
                const w = 1.2;
                if (seg.a1 - seg.a0 > w + 1.4) {
                  const s = rng.range(seg.a0 + 0.7, seg.a1 - 0.7 - w);
                  ops.push({ a0: s, a1: s + w, top: DOOR_H });
                  F.door(b, axis, c, s, s + w, y0, DOOR_H, { open: true, into: intoSign(r, e, up), glass: true, frame: glassFrame });
                }
              }
              glassWall(axis, c, seg.a0, seg.a1, y0, y0 + CEIL, ops);
              along(axis, c, seg.a0, y0 + CEIL, seg.a1, y1, -T / 2, T / 2, 'wall', true);
              const ue = up === r ? e : OPP[e];
              record(up, ue, seg, 'glass', ops, level);
              reserveOps(up, axis, c, ops);
            } else {
              solidWall(axis, c, seg.a0, seg.a1, y0, y1, [], faces);
              record(r, e, seg, 'solid', [], level);
              record(q, OPP[e], seg, 'solid', [], level);
            }
          } else if (isExterior(r, e)) {
            if (r === atrium) {
              if (level === 0) curtain(r, e, axis, c, seg.a0, seg.a1, 0, HA);
            } else curtain(r, e, axis, c, seg.a0, seg.a1, y0, y1);
            record(r, e, seg, 'window', [], level);
          } else {
            const skirt = { neg: faceOf(e) === 'neg', pos: faceOf(e) === 'pos' };
            solidWall(axis, c, seg.a0, seg.a1, y0, y1, [], faces, skirt);
            record(r, e, seg, 'solid', [], level);
          }
        }
      }
    }
  }

  // ------------------------------------------------ floors and ceilings
  for (const r of rooms) {
    const y = r.y;
    if (r.level === 0) b.box(r.floor, r.x0, -0.3, r.z0, r.x1, 0, r.z1);
    else {
      b.box('wall', r.x0, y - 0.32, r.z0, r.x1, y - 0.02, r.z1);
      b.box(r.floor, r.x0, y - 0.02, r.z0, r.x1, y + 0.008, r.z1);
    }
    if (r === atrium) continue;
    b.box(`ceil:${r.ceiling}`, r.x0, y + CEIL, r.z0, r.x1, y + CEIL + 0.04, r.z1);
    b.box('ceil:roof', r.x0 - 0.1, y + FH - 0.3, r.z0 - 0.1, r.x1 + 0.1, y + FH - 0.04, r.z1 + 0.1, false);
  }

  // Atrium ceiling: skylight, a grid of light panels, and sometimes a
  // serpentine accent soffit.
  const A = atrium;
  const AW = A.x1 - A.x0;
  const AD = A.z1 - A.z0;
  const sky = rng.chance(0.45) ? { x0: snap(A.x0 + AW * 0.22), x1: snap(A.x1 - AW * 0.22), z0: snap(A.z0 + AD * 0.25), z1: snap(A.z1 - AD * 0.3) } : null;
  const atriumCeil = rng.chance(0.6) ? 'ceil:ceilLayIn' : 'ceil:plaster';
  const withHole = (y0, y1, key, pad) => {
    if (!sky) return b.box(key, A.x0 - pad, y0, A.z0 - pad, A.x1 + pad, y1, A.z1 + pad);
    b.box(key, A.x0 - pad, y0, A.z0 - pad, A.x1 + pad, y1, sky.z0);
    b.box(key, A.x0 - pad, y0, sky.z1, A.x1 + pad, y1, A.z1 + pad);
    b.box(key, A.x0 - pad, y0, sky.z0, sky.x0, y1, sky.z1);
    b.box(key, sky.x1, y0, sky.z0, A.x1 + pad, y1, sky.z1);
  };
  withHole(HA - 0.05, HA, atriumCeil, 0);
  withHole(HA, HA + 0.3, 'ceil:roof', 0.1);
  if (sky) {
    b.box('ceil:glass', sky.x0, HA + 0.28, sky.z0, sky.x1, HA + 0.3, sky.z1, false);
    const bays = Math.max(1, Math.round((sky.x1 - sky.x0) / 2));
    for (let i = 0; i <= bays; i++) {
      const x = sky.x0 + ((sky.x1 - sky.x0) * i) / bays;
      b.box('ceil:white', x - 0.08, HA, sky.z0, x + 0.08, HA + 0.3, sky.z1, false);
    }
  } else {
    for (let x = snap(A.x0 + 2.4, 1.2); x < A.x1 - 2; x += 3.6) for (let z = snap(A.z0 + 2.4, 1.2); z < A.z1 - 2; z += 3.6) F.lightPanel(b, x, z, x + 1.2, z + 0.6, HA - 0.05);
  }

  // ----------------------------------------------------------- mezzanine
  const Pa = placers.get(atrium);
  const mezzFloor = atrium.floor;
  const SW = 1.6;
  const back = plan.mezz[0];
  const stairWest = plan.stairSide === 'W';
  const sx = stairWest ? A.x0 + 0.35 + SW / 2 : A.x1 - 0.35 - SW / 2;
  const nSteps = Math.round(FH / 0.18);
  const run = nSteps * 0.29;
  const toBack = back.open === 'N' ? 1 : -1; // stair climbs toward the back mezzanine
  const edgeZ = back.open === 'N' ? back.z0 : back.z1;
  const stairRot = toBack > 0 ? 0 : Math.PI;
  F.stairs(b, sx, 0, edgeZ - toBack * run, stairRot, { width: SW, rise: FH, railSide: (stairWest ? 1 : -1) * toBack });
  Pa.reserve(sx - SW / 2 - 0.6, Math.min(edgeZ, edgeZ - toBack * (run + 1.6)), sx + SW / 2 + 0.6, Math.max(edgeZ, edgeZ - toBack * (run + 1.6)));
  const stair = { x: sx, z0: Math.min(edgeZ, edgeZ - toBack * run), z1: Math.max(edgeZ, edgeZ - toBack * run), w: SW };

  const railStyle = rng.chance(0.6) ? 'glass' : 'bars';
  const colKey = rng.chance(0.35) ? 'accent' : 'white';
  for (const m of plan.mezz) {
    b.box('wall', m.x0, FH - 0.36, m.z0, m.x1, FH - 0.02, m.z1);
    b.box(mezzFloor, m.x0, FH - 0.02, m.z0, m.x1, FH + 0.008, m.z1);
    const alongX = m.open === 'N' || m.open === 'S';
    const ec = m.open === 'N' ? m.z0 : m.open === 'S' ? m.z1 : m.open === 'W' ? m.x0 : m.x1;
    const out = m.open === 'N' || m.open === 'W' ? -1 : 1; // toward the void
    const a0 = alongX ? m.x0 : m.z0;
    const a1 = alongX ? m.x1 : m.z1;
    const axis = alongX ? 'x' : 'z';
    // Fascia and underside lights.
    b.wallBox('accent', axis, ec, a0, a1, FH - 0.52, FH + 0.04, Math.min(0, out * 0.05), Math.max(0, out * 0.05));
    const inner = ec - out * ((alongX ? m.z1 - m.z0 : m.x1 - m.x0) / 2);
    for (let a = a0 + 2.4; a < a1 - 1.8; a += 4.8) {
      if (alongX) F.lightPanel(b, a, inner - 0.3, a + 1.2, inner + 0.3, FH - 0.36);
      else F.lightPanel(b, inner - 0.3, a, inner + 0.3, a + 1.2, FH - 0.36);
    }
    // Columns under the edge.
    const colN = Math.max(2, Math.round((a1 - a0) / 6));
    for (let i = 1; i < colN; i++) {
      const a = a0 + ((a1 - a0) * i) / colN;
      const cx = alongX ? a : ec - out * 0.35;
      const cz = alongX ? ec - out * 0.35 : a;
      if (Math.abs(cx - sx) < SW && cz > stair.z0 - 0.6 && cz < stair.z1 + 0.6) continue;
      F.column(b, cx, cz, 0, FH - 0.36, 0.2, colKey);
      Pa.reserve(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5);
    }
    // Railing along the open edge, minus where another strip continues and the stair.
    const gaps = [];
    for (const o of plan.mezz) {
      if (o === m) continue;
      const adj = alongX ? (out < 0 ? Math.abs(o.z1 - ec) < 1e-3 : Math.abs(o.z0 - ec) < 1e-3) : out < 0 ? Math.abs(o.x1 - ec) < 1e-3 : Math.abs(o.x0 - ec) < 1e-3;
      if (adj) gaps.push(alongX ? [o.x0, o.x1] : [o.z0, o.z1]);
    }
    if (m === back) gaps.push([sx - SW / 2 - 0.05, sx + SW / 2 + 0.05]);
    gaps.sort((p, q) => p[0] - q[0]);
    let cur = a0 + 0.1;
    const rc = ec - out * 0.06;
    const rail = (p, q) => {
      if (q - p < 0.2) return;
      if (alongX) F.railing(b, p, rc, q, rc, FH, railStyle);
      else F.railing(b, rc, p, rc, q, FH, railStyle);
    };
    for (const [g0, g1] of gaps) {
      rail(cur, g0);
      cur = Math.max(cur, g1);
    }
    rail(cur, a1 - 0.1);
  }

  // ----------------------------------------------------------- furnishing
  const ctx = { b, rng, pal, mono, company, plan, rooms, atrium, placers, sky, stair, T, DOOR_H };
  const decor = furnish(ctx);

  // ------------------------------------------------------------- exterior
  const elev = rng.range(24, 80); // this floor's height above the street
  b.box('ground', fp.x0 - 900, -elev - 0.2, fp.z0 - 900, fp.x1 + 900, -elev, fp.z1 + 900, false);
  const towers = [];
  const pad = 26;
  for (let i = 0; i < 220; i++) {
    const a = rng.range(0, Math.PI * 2);
    const near = i < 24;
    const dist = near ? rng.range(40, 110) : rng.range(90, 900);
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const w = rng.range(16, 42);
    const d = rng.range(16, 42);
    if (x + w / 2 > fp.x0 - pad && x - w / 2 < fp.x1 + pad && z + d / 2 > fp.z0 - pad && z - d / 2 < fp.z1 + pad) continue;
    const h = elev * rng.range(0.4, 1.3) + rng.range(0, 1) ** 2 * rng.range(20, 220);
    towers.push({ x, z, w, d, y0: -elev, h });
  }

  // Sun from outside the atrium's facade.
  const baseAz = { S: 0, E: 90, N: 180, W: 270 }[plan.face];

  return {
    seed,
    palette: pal,
    mono,
    company,
    builder: b,
    plan,
    rooms,
    atrium,
    mezz: plan.mezz,
    footprint: fp,
    HA,
    FH,
    floors,
    sky,
    stair,
    towers,
    elev,
    decor,
    sun: { azimuth: (baseAz + rng.range(-40, 40) + 360) % 360, elevation: rng.range(26, 44) },
    colliders: b.colliders,
  };
}
