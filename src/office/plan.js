// Floor plan for one storey of an office building (x east, z south; N = -z).
//
// A rectangular floor plate is organised as a "racetrack": perimeter rooms
// along both long facades, a corridor inside each, and a middle zone with
// the lift / washroom core, back-to-back rooms and a cross corridor near each
// end facade. A tall atrium takes a slice of the plate from one facade to
// the far corridor; its mezzanine looks into glass-fronted rooms on the
// floor above. Every room is an axis-aligned rectangle; rooms on the same
// level tile the plate exactly, so walls are found from shared edges.

export const FH = 4.4; // floor to floor
export const CEIL = 3.2; // room ceiling height

const snap = (v, s = 0.6) => Math.round(v / s) * s;

const PERIMETER = [
  ['office', 3],
  ['meeting', 2.2],
  ['lounge', 2],
  ['break', 0.7],
];
const MIDDLE = [
  ['meeting', 3],
  ['closed', 2.2],
  ['break', 1.2],
  ['office', 1],
  ['lounge', 1],
  ['print', 0.8],
];
const UPPER = [
  ['lounge', 3],
  ['office', 2.5],
  ['meeting', 2],
];

export function makePlan(rng) {
  const W = snap(rng.range(52, 68), 1.2);
  const D = snap(rng.range(33.6, 38.4), 1.2);
  const X0 = -W / 2;
  const X1 = W / 2;
  const Z0 = -D / 2;
  const Z1 = D / 2;
  const floors = rng.chance(0.6) ? 2 : 3;
  const HA = floors * FH;

  // Corridors, a middle zone deep enough for back-to-back rooms, and
  // perimeter rooms taking up the rest.
  const cw = snap(rng.range(3.0, 4.2));
  const dN = snap(rng.range(6.6, 8.4));
  const dS = snap(rng.range(6.6, 8.4));
  // Row boundaries: [Z0 zA] north rooms, [zA zB] north corridor,
  // [zB zC] middle, [zC zD] south corridor, [zD Z1] south rooms.
  const zA = Z0 + dN;
  const zB = zA + cw;
  const zD = Z1 - dS;
  const zC = zD - cw;

  // Atrium slice.
  const AW = snap(rng.range(16.8, 22.8), 1.2);
  let pos = rng.weighted([
    ['mid', 2],
    ['west', 1],
    ['east', 1],
  ]);
  if (pos === 'mid' && W - AW < 30) pos = rng.chance(0.5) ? 'west' : 'east';
  const ax0 = pos === 'west' ? X0 : pos === 'east' ? X1 - AW : snap(X0 + 15 + rng.range(0, W - AW - 30));
  const ax1 = ax0 + AW;
  const face = rng.chance(0.5) ? 'N' : 'S'; // facade the atrium opens onto
  const front = face === 'N' ? { rz0: Z0, rz1: zA, cz0: zA, cz1: zB } : { rz0: zD, rz1: Z1, cz0: zC, cz1: zD };
  const back = face === 'N' ? { rz0: zD, rz1: Z1, cz0: zC, cz1: zD } : { rz0: Z0, rz1: zA, cz0: zA, cz1: zB };
  const A = face === 'N' ? { x0: ax0, x1: ax1, z0: Z0, z1: zC } : { x0: ax0, x1: ax1, z0: zB, z1: Z1 };

  const rooms = [];
  const add = (r) => {
    const room = { level: 0, y: 0, h: CEIL, access: true, ...r };
    room.id = rooms.length;
    room.w = room.x1 - room.x0;
    room.d = room.z1 - room.z0;
    rooms.push(room);
    return room;
  };
  const atrium = add({ type: 'atrium', ...A, h: HA, zone: 'atrium' });

  // Split [a0, a1] into bays of roughly minW..maxW.
  const bays = (a0, a1, minW, maxW) => {
    const n = Math.max(1, Math.round((a1 - a0) / rng.range(minW, maxW)));
    const cuts = [a0];
    for (let i = 1; i < n; i++) cuts.push(snap(a0 + ((a1 - a0) * i) / n + rng.range(-0.6, 0.6)));
    cuts.push(a1);
    const out = [];
    for (let i = 0; i < n; i++) if (cuts[i + 1] - cuts[i] > 1) out.push([cuts[i], cuts[i + 1]]);
    return out;
  };

  // Perimeter row along x: bays, some merged into open-plan offices.
  const perimeterRow = (x0, x1, z0, z1, zone) => {
    const bs = bays(x0, x1, 5.4, 8.4);
    let i = 0;
    while (i < bs.length) {
      if (i + 1 < bs.length && rng.chance(0.3)) {
        const n = Math.min(bs.length - i, rng.int(2, 3));
        add({ type: 'open', x0: bs[i][0], x1: bs[i + n - 1][1], z0, z1, zone });
        i += n;
      } else {
        add({ type: rng.weighted(PERIMETER), x0: bs[i][0], x1: bs[i][1], z0, z1, zone });
        i++;
      }
    }
  };

  // Back rooms run the full width; the back corridor is split at the atrium.
  perimeterRow(X0, X1, back.rz0, back.rz1, 'back');
  for (const [a, b2] of [
    [X0, ax0],
    [ax0, ax1],
    [ax1, X1],
  ]) {
    if (b2 - a > 1) add({ type: 'corridor', x0: a, x1: b2, z0: back.cz0, z1: back.cz1, zone: 'back' });
  }

  // Wings either side of the atrium.
  const midZ0 = zB;
  const midZ1 = zC;
  const dM = midZ1 - midZ0;
  const wings = [];
  if (ax0 - X0 > 1) wings.push({ x0: X0, x1: ax0, far: 'W' });
  if (X1 - ax1 > 1) wings.push({ x0: ax1, x1: X1, far: 'E' });
  let coreDone = 0;
  for (const wg of wings) {
    perimeterRow(wg.x0, wg.x1, front.rz0, front.rz1, 'front');
    add({ type: 'corridor', x0: wg.x0, x1: wg.x1, z0: front.cz0, z1: front.cz1, zone: 'front' });
    const len = wg.x1 - wg.x0;
    let m0 = wg.x0;
    let m1 = wg.x1;
    // End rooms against the far facade and a cross corridor closing the loop.
    if (len >= 22) {
      const de = snap(rng.range(4.8, 7.2));
      const cc = snap(rng.range(2.4, 3.0));
      const [e0, e1, c0, c1] = wg.far === 'W' ? [wg.x0, wg.x0 + de, wg.x0 + de, wg.x0 + de + cc] : [wg.x1 - de, wg.x1, wg.x1 - de - cc, wg.x1 - de];
      for (const [z0, z1] of bays(midZ0, midZ1, 5, 8)) add({ type: rng.weighted([['meeting', 2], ['office', 2], ['lounge', 1.5]]), x0: e0, x1: e1, z0, z1, zone: 'end' });
      add({ type: 'corridor', x0: c0, x1: c1, z0: midZ0, z1: midZ1, zone: 'cross' });
      if (wg.far === 'W') m0 = c1;
      else m1 = c0;
    }
    // Middle: the core plus rooms, back to back when deep enough.
    const blocks = [];
    const mlen = m1 - m0;
    if (mlen >= 14.9 && coreDone < (wings.length > 1 && mlen > 24 ? 2 : 1)) {
      coreDone++;
      const cwid = snap(rng.range(7.2, 10.2));
      let c0 = snap(m0 + rng.range(0, Math.max(0, mlen - cwid)));
      let c1 = c0 + cwid;
      // No slivers beside the core: absorb them into it.
      if (c0 - m0 < 4.8) c0 = m0;
      if (m1 - c1 < 4.8) c1 = m1;
      add({ type: 'core', x0: c0, x1: c1, z0: midZ0, z1: midZ1, zone: 'middle', access: false });
      if (c0 - m0 > 1) blocks.push([m0, c0]);
      if (m1 - c1 > 1) blocks.push([c1, m1]);
    } else blocks.push([m0, m1]);
    const split = dM >= 10.8 ? snap((midZ0 + midZ1) / 2 + rng.range(-1.2, 1.2)) : null;
    for (const [b0, b1] of blocks) {
      const rows = split !== null ? [[midZ0, split], [split, midZ1]] : [[midZ0, midZ1]];
      for (const [z0, z1] of rows) {
        for (const [x0, x1] of bays(b0, b1, 4.2, 7.2)) {
          const type = x1 - x0 < 3.6 ? 'closed' : rng.weighted(MIDDLE);
          add({ type, x0, x1, z0, z1, zone: 'middle', access: type !== 'closed' });
        }
      }
    }
  }

  // Make sure the floor has one of each kind of space.
  const want = ['open', 'lounge', 'meeting', 'break', 'office'];
  for (const t of want) {
    if (rooms.some((r) => r.type === t)) continue;
    const pool = rooms.filter((r) => ['office', 'meeting', 'lounge'].includes(r.type) && rooms.filter((q) => q.type === r.type).length > 1 && (t !== 'open' || r.w >= 8));
    if (pool.length) rng.pick(pool).type = t;
  }
  for (const r of rooms) {
    if (r.type === 'closed' || r.type === 'core') r.access = false;
  }

  // Mezzanines: always along the back edge, sometimes also down one side.
  const MD = snap(rng.range(3.6, 4.8));
  const mezz = [];
  const backEdge = face === 'N' ? A.z1 : A.z0;
  const mzBack = face === 'N' ? { x0: A.x0, x1: A.x1, z0: A.z1 - MD, z1: A.z1, open: 'N' } : { x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z0 + MD, open: 'S' };
  mezz.push(mzBack);
  const sides = [];
  if (A.x0 > X0 + 1) sides.push('W');
  if (A.x1 < X1 - 1) sides.push('E');
  let sideMezz = null;
  if (sides.length && rng.chance(0.45)) {
    sideMezz = rng.pick(sides);
    const MS = snap(rng.range(3.0, 4.2));
    const zr = face === 'N' ? [A.z0, mzBack.z0] : [mzBack.z1, A.z1];
    mezz.push(sideMezz === 'W' ? { x0: A.x0, x1: A.x0 + MS, z0: zr[0], z1: zr[1], open: 'E' } : { x0: A.x1 - MS, x1: A.x1, z0: zr[0], z1: zr[1], open: 'W' });
  }

  // Stair along a side wall with no side mezzanine, arriving at the back mezzanine.
  const stairSide = sideMezz ? (sideMezz === 'W' ? 'E' : 'W') : rng.pick(['W', 'E']);

  // Rooms upstairs, looking into the atrium through glass.
  const upper = (level, access) => {
    const y = level * FH;
    const ud = Math.min(snap(rng.range(4.2, 6.6)), back.rz1 - back.rz0 + (back.cz1 - back.cz0));
    const bz = face === 'N' ? [backEdge, backEdge + ud] : [backEdge - ud, backEdge];
    const fullDepth = Math.abs(ud - (back.rz1 - back.rz0 + (back.cz1 - back.cz0))) < 0.01;
    for (const [x0, x1] of bays(A.x0, A.x1, 4.8, 7.8)) add({ type: rng.weighted(UPPER), x0, x1, z0: bz[0], z1: bz[1], level, y, zone: 'upper', access, fullDepth });
    for (const s of sides) {
      const withMezz = s === sideMezz;
      if (!withMezz && !(level === 1 ? rng.chance(0.5) : rng.chance(0.6))) continue;
      const us = snap(rng.range(4.2, 6));
      const xr = s === 'W' ? [A.x0 - us, A.x0] : [A.x1, A.x1 + us];
      for (const [z0, z1] of bays(A.z0, A.z1, 4.8, 7.8)) add({ type: rng.weighted(UPPER), x0: xr[0], x1: xr[1], z0, z1, level, y, zone: 'upper', access: access && withMezz });
    }
  };
  upper(1, true);
  if (floors === 3 && rng.chance(0.7)) upper(2, false);

  return {
    W,
    D,
    fp: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
    floors,
    HA,
    face,
    rooms,
    atrium,
    mezz,
    stairSide,
    rows: { zA, zB, zC, zD, cw },
  };
}
