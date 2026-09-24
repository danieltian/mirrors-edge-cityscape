// Layout of a multi-storey shopping mall (x east, z south; N = -z).
//
// A long central void rises through every level to the skylight. Its
// outline has a shape family per mall (chamfered, rounded or square
// corners, stadium ends, a rotunda at one end, pointed lozenge ends) and
// changes from level to level: ends step out, rotundas widen, and
// balconies jut into the void or recess from it. Galleries ring the void;
// shop units line them. Escalator pairs climb through the void, either as a
// switchback stack or a cascade, landing on bridges that span it. A glass
// lift runs up one end. The entrance faces a plaza on the south.

export const FH = 5.2; // floor to floor
export const SOFFIT = 0.8; // gallery ceiling sits this far below the next floor
export const RUN = FH * Math.sqrt(3); // escalator rise at 30 degrees
export const LAND = 1.4; // escalator landings
export const BRIDGE = 3.6;

const snap = (v, s = 0.6) => Math.round(v / s) * s;

export function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// One end of the void, built as if it were the east end at xEnd: returns how
// far the straight edges stop short of xEnd and the outline points from the
// north edge round to the south edge.
function endShape(spec, xEnd, z0, z1) {
  const zc = (z0 + z1) / 2;
  const h = (z1 - z0) / 2;
  const arc = (cx, cz, r, a0, a1, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    return out;
  };
  if (spec.kind === 'square') return { inset: 0, pts: [[xEnd, z0], [xEnd, z1]] };
  if (spec.kind === 'chamfer') {
    const c = Math.min(spec.c, h);
    return { inset: c, pts: [[xEnd - c, z0], [xEnd, z0 + c], [xEnd, z1 - c], [xEnd - c, z1]] };
  }
  if (spec.kind === 'round') {
    const c = Math.min(spec.c, h);
    return { inset: c, pts: [...arc(xEnd - c, z0 + c, c, -Math.PI / 2, 0, 5), ...arc(xEnd - c, z1 - c, c, 0, Math.PI / 2, 5)] };
  }
  if (spec.kind === 'semi') return { inset: h, pts: arc(xEnd - h, zc, h, -Math.PI / 2, Math.PI / 2, 14) };
  // Rotunda: a circle wider than the void, bulging past both long edges.
  const R = Math.max(spec.R, h + 0.6);
  const cx = xEnd - R;
  const s = Math.sqrt(R * R - h * h);
  // From the north-edge intersection round the far side (through east) to
  // the south-edge intersection.
  const a0 = Math.atan2(-h, -s);
  return { inset: R + s, pts: arc(cx, zc, R, a0, -a0, 32) };
}

function outline(x0, x1, z0, z1, west, east, bumps) {
  const E = endShape(east, x1, z0, z1);
  const Wm = endShape(west, -x0, z0, z1); // mirrored east end
  const W = { inset: Wm.inset, pts: Wm.pts.map(([x, z]) => [-x, z]).reverse() };
  const pts = [];
  pts.push(W.pts[W.pts.length - 1]);
  for (const b of bumps.filter((q) => q.side === 'N').sort((p, q) => p.a0 - q.a0)) pts.push(...bumpPts(b, z0, 1));
  pts.push(...E.pts);
  for (const b of bumps.filter((q) => q.side === 'S').sort((p, q) => q.a0 - p.a0)) pts.push(...bumpPts(b, z1, -1));
  pts.push(...W.pts.slice(0, -1));
  // Drop repeated points.
  return pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3;
  });
}

// A balcony (p > 0, into the void) or recess (p < 0) on a long edge.
function bumpPts(b, z, dir) {
  const ap = Math.abs(b.p);
  const dz = b.p * dir;
  const [a0, a1] = dir > 0 ? [b.a0, b.a1] : [b.a1, b.a0];
  const sgn = dir > 0 ? 1 : -1;
  if (b.round) {
    const out = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push([a0 + (a1 - a0) * t, z + dz * Math.sin(Math.PI * t)]);
    }
    return out;
  }
  return [[a0, z], [a0 + sgn * ap, z + dz], [a1 - sgn * ap, z + dz], [a1, z]];
}

export function makeMallPlan(rng) {
  const levels = rng.weighted([
    [3, 4],
    [4, 3],
    [5, 1],
  ]);
  const shape = rng.weighted([
    ['chamfer', 3],
    ['round', 2],
    ['square', 1],
    ['stadium', 1.5],
    ['rotunda', 1.5],
    ['lozenge', 1],
  ]);
  // A cascade of escalators (all climbing the same way) needs a long void.
  const wantCascade = levels === 3 && rng.chance(0.4);
  const long = shape === 'rotunda' || wantCascade;
  const VL = snap(rng.range(long ? 44 : 36, long ? 52 : 45.6), 1.2);
  const VW = snap(rng.range(15.6, 19.2), 1.2);
  const g = snap(rng.range(6.6, 8.4));
  const sw = snap(rng.range(9.6, 12), 1.2);
  const sd = snap(rng.range(8.4, 10.8), 1.2);
  const W = VL + 2 * (g + sw);
  const D = VW + 2 * (g + sd);
  const B = { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 };
  const V = { x0: -VL / 2, x1: VL / 2, z0: -VW / 2, z1: VW / 2 };
  const G = { x0: V.x0 - g, x1: V.x1 + g, z0: V.z0 - g, z1: V.z1 + g };
  const h = VW / 2;

  // End shapes per level (upper levels step out and open up).
  const stepW = rng.pick([0, 0, 1.2, 1.8]);
  const stepE = rng.pick([0, 0, 1.2, 1.8]);
  const rotEnd = rng.pick(['W', 'E']);
  const maxR = h + g - 3.2;
  const ends = [null];
  for (let L = 1; L < levels; L++) {
    const endFor = (side) => {
      if (shape === 'square') return { kind: 'square' };
      if (shape === 'stadium') return { kind: 'semi' };
      if (shape === 'lozenge') return { kind: 'chamfer', c: h };
      if (shape === 'rotunda') return side === rotEnd ? { kind: 'circle', R: Math.min(maxR, h + 1.2 + (L - 1) * rng.range(0.4, 1.0)) } : { kind: 'chamfer', c: rng.pick([1.8, 2.4, 3.0]) };
      return { kind: shape, c: rng.pick([1.8, 2.4, 3.0, 3.6, 4.2]) };
    };
    ends.push({ W: endFor('W'), E: endFor('E'), x0: V.x0 - Math.min(g - 3.2, (L - 1) * stepW), x1: V.x1 + Math.min(g - 3.2, (L - 1) * stepE) });
  }
  // Straight stretch common to every level (for bridges, escalators, lift).
  let s0 = -Infinity;
  let s1 = Infinity;
  for (let L = 1; L < levels; L++) {
    const e = ends[L];
    s0 = Math.max(s0, e.x0 + endShape(e.W, -e.x0, V.z0, V.z1).inset);
    s1 = Math.min(s1, e.x1 - endShape(e.E, e.x1, V.z0, V.z1).inset);
  }

  // Escalators.
  const unit = RUN + 2 * LAND;
  const cascadeSpan = (levels - 1) * (unit + BRIDGE);
  const layout = wantCascade && s1 - s0 > cascadeSpan + 1 ? 'cascade' : 'switchback';
  const zMid = (V.z0 + V.z1) / 2;
  const laneShift = rng.weighted([
    [0, 3],
    [-1, 1],
    [1, 1],
  ]);
  const flights = [];
  const bridges = [];
  const dir0 = rng.sign();
  let chain;
  if (layout === 'switchback') {
    const span = unit + 2 * BRIDGE;
    const slack = Math.max(0, (s1 - s0 - span) / 2 - 1.5);
    const cx = snap((s0 + s1) / 2 + rng.range(-slack, slack));
    const xa = cx - unit / 2;
    const xb = cx + unit / 2;
    const zc = snap(zMid + laneShift * (h - 3.8));
    const lanes = { A: [zc - 2.4, zc - 1.0], B: [zc + 1.0, zc + 2.4] };
    for (let t = 0; t < levels - 1; t++) {
      const dir = t % 2 === 0 ? dir0 : -dir0;
      const lane = t % 2 === 0 ? 'A' : 'B';
      const x0 = dir > 0 ? xa : xb;
      const end = dir > 0 ? xb : xa;
      flights.push({ t, level: t, dir, x0, x1: end, zs: lanes[lane] });
      bridges.push({ level: t + 1, x0: dir > 0 ? end : end - BRIDGE, x1: dir > 0 ? end + BRIDGE : end, arriveEdge: dir > 0 ? 'W' : 'E' });
    }
    chain = { x0: Math.min(xa, xb) - BRIDGE, x1: Math.max(xa, xb) + BRIDGE };
  } else {
    // Cascade: every flight carries on in the same direction.
    const slack = Math.max(0, (s1 - s0 - cascadeSpan) / 2 - 1.5);
    const cx = (s0 + s1) / 2 + rng.range(-slack, slack);
    const start = dir0 > 0 ? cx - cascadeSpan / 2 : cx + cascadeSpan / 2;
    const zc = snap(zMid + laneShift * (h - 2.6));
    const zs = [zc - 0.7, zc + 0.7];
    for (let t = 0; t < levels - 1; t++) {
      const x0 = start + dir0 * t * (unit + BRIDGE);
      const end = x0 + dir0 * unit;
      flights.push({ t, level: t, dir: dir0, x0, x1: end, zs });
      bridges.push({ level: t + 1, x0: dir0 > 0 ? end : end - BRIDGE, x1: dir0 > 0 ? end + BRIDGE : end, arriveEdge: dir0 > 0 ? 'W' : 'E' });
    }
    const xs = flights.flatMap((f) => [f.x0, f.x1]).concat(bridges.flatMap((b) => [b.x0, b.x1]));
    chain = { x0: Math.min(...xs), x1: Math.max(...xs) };
  }

  // Glass lift in the straight stretch away from the escalators.
  const lift = { none: !rng.chance(0.75) };
  if (!lift.none) {
    const west = chain.x0 - s0 > s1 - chain.x1;
    const room = west ? chain.x0 - s0 : s1 - chain.x1;
    if (room < 6) lift.none = true;
    else {
      lift.x0 = snap(west ? s0 + 1.2 : s1 - 1.2 - 2.6);
      lift.x1 = lift.x0 + 2.6;
      lift.side = rng.pick(['N', 'S']);
      lift.z0 = lift.side === 'N' ? V.z0 : V.z1 - 2.6;
      lift.z1 = lift.z0 + 2.6;
    }
  }

  // Balconies and recesses, different on every level.
  const voids = [null];
  for (let L = 1; L < levels; L++) {
    const e = ends[L];
    const bumps = [];
    const n = rng.weighted([
      [0, 1],
      [1, 2],
      [2, 1.5],
    ]);
    const blocked = [[chain.x0 - 1, chain.x1 + 1]];
    if (!lift.none) blocked.push([lift.x0 - 1.5, lift.x1 + 1.5]);
    for (let k = 0; k < n; k++) {
      const side = rng.pick(['N', 'S']);
      const len = snap(rng.range(5.4, 10.8));
      const out = rng.chance(0.65);
      const p = out ? snap(rng.range(1.8, Math.min(3.6, h - 3.6))) : -snap(rng.range(1.2, Math.min(2.4, g - 3.4)));
      if (Math.abs(p) < 1) continue;
      for (let t = 0; t < 12; t++) {
        const a0 = snap(rng.range(s0 + 0.6, s1 - 0.6 - len));
        const a1 = a0 + len;
        if (a1 > s1 - 0.6 || blocked.some(([b0, b1]) => a1 > b0 && a0 < b1) || bumps.some((q) => q.side === side && a1 > q.a0 - 1 && a0 < q.a1 + 1)) continue;
        bumps.push({ side, a0, a1, p, round: rng.chance(0.4) });
        blocked.push([a0 - 0.5, a1 + 0.5]);
        break;
      }
    }
    voids.push({ level: L, x0: e.x0, x1: e.x1, z0: V.z0, z1: V.z1, bumps, pts: outline(e.x0, e.x1, V.z0, V.z1, e.W, e.E, bumps) });
  }

  // Entrance on the south side, facing the plaza.
  const ew = snap(rng.range(10.8, 14.4), 1.2);
  const ex0 = snap(rng.range(G.x0 + 4, G.x1 - 4 - ew));
  const entrance = { x0: ex0, x1: ex0 + ew, z0: G.z1, z1: B.z1, depth: 4.8 };

  // Shop units in the bands between the galleries and the outer walls.
  const mix = { shutter: rng.range(1.5, 4.5), open: rng.range(1.5, 4), blank: rng.range(0.6, 1.4) };
  const units = [];
  const bays = (a0, a1, minW, maxW) => {
    const k = Math.max(1, Math.round((a1 - a0) / rng.range(minW, maxW)));
    const cuts = [a0];
    for (let i = 1; i < k; i++) cuts.push(snap(a0 + ((a1 - a0) * i) / k + rng.range(-0.6, 0.6)));
    cuts.push(a1);
    return cuts.slice(0, -1).map((c, i) => [c, cuts[i + 1]]);
  };
  const [bw0, bw1] = rng.pick([[6.6, 10.2], [5.4, 8.4], [8.4, 12]]);
  const kind = (L) =>
    rng.weighted([
      ['shutter', mix.shutter * (L === 0 ? 0.7 : 1)],
      ['open', mix.open * (L === 0 ? 1.4 : 1)],
      ['blank', mix.blank],
    ]);
  for (let L = 0; L < levels; L++) {
    for (const side of ['N', 'S']) {
      const segs = side === 'S' && L === 0 ? [[G.x0, entrance.x0], [entrance.x1, G.x1]] : [[G.x0, G.x1]];
      for (const [q0, q1] of segs) {
        if (q1 - q0 < 3) continue;
        for (const [a0, a1] of bays(q0, q1, bw0, bw1)) units.push({ level: L, side, a0, a1, front: side === 'N' ? G.z0 : G.z1, back: side === 'N' ? B.z0 : B.z1, kind: kind(L) });
      }
    }
    for (const side of ['W', 'E']) {
      for (const [a0, a1] of bays(G.z0, G.z1, bw0 + 0.6, bw1 + 0.8)) units.push({ level: L, side, a0, a1, front: side === 'W' ? G.x0 : G.x1, back: side === 'W' ? B.x0 : B.x1, kind: kind(L) });
    }
  }

  const plaza = { x0: B.x0 - 14, x1: B.x1 + 14, z0: B.z1, z1: B.z1 + snap(rng.range(38, 50)) };

  return { levels, HA: levels * FH, shape, layout, B, V, G, g, voids, straight: [s0, s1], flights, bridges, chain, lift, entrance, units, plaza };
}
