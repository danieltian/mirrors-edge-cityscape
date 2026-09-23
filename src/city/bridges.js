import { BOX, WEDGE } from './prims.js';

// Bridges are placed along the river wherever both banks are close enough.
// Each one reserves a corridor so no buildings are placed on its ramps.

export function planBridges(rng, terrain) {
  const river = terrain.river;
  const bridges = [];
  const corridors = [];
  let acc = rng.range(250, 650);
  for (let i = 1; i < river.length - 1; i++) {
    const p = river[i];
    const q = river[i - 1];
    acc -= Math.hypot(p.x - q.x, p.z - q.z);
    if (acc > 0) continue;
    const nx = p.tz;
    const nz = -p.tx;
    const bank = (sgn) => {
      for (let s = 10; s < 700; s += 4) {
        if (terrain.sample(p.x + nx * s * sgn, p.z + nz * s * sgn) > 3) return s;
      }
      return null;
    };
    const sA = bank(1);
    const sB = bank(-1);
    if (sA == null || sB == null || sA + sB > 600) {
      acc = 60;
      continue;
    }
    // Both ends must land on solid ground, not a sliver.
    const deepA = terrain.sample(p.x + nx * (sA + 70), p.z + nz * (sA + 70));
    const deepB = terrain.sample(p.x - nx * (sB + 70), p.z - nz * (sB + 70));
    if (deepA < 40 || deepB < 40) {
      acc = 60;
      continue;
    }
    const cx = p.x + (nx * (sA - sB)) / 2;
    const cz = p.z + (nz * (sA - sB)) / 2;
    const span = sA + sB;
    const width = rng.range(22, 34);
    const style = rng.weighted([
      ['girder', 3],
      ['pylon', 2],
      ['truss', 2],
    ]);
    bridges.push({ x: cx, z: cz, nx, nz, span, width, style });
    corridors.push({ x: cx, z: cz, ux: nx, uz: nz, hl: span / 2 + 75, hw: width / 2 + 12 });
    acc = rng.range(650, 1050);
  }
  return { bridges, corridors };
}

export function buildBridges(sink, rng, bridges, tint) {
  const deckTop = 4.5;
  const deckT = 2.2;
  const rampL = 42;
  for (const b of bridges) {
    const rot = Math.atan2(-b.nz, b.nx); // local x along the span
    const at = (s, t) => [b.x + b.nx * s - b.nz * t, b.z + b.nz * s + b.nx * t];
    const len = b.span + 20;
    let [x, z] = at(0, 0);
    sink.add(BOX, x, deckTop - deckT, z, len, deckT, b.width, rot, tint);
    // Railings.
    for (const side of [-1, 1]) {
      [x, z] = at(0, side * (b.width / 2 - 0.3));
      sink.add(BOX, x, deckTop, z, len, 1.1, 0.4, rot, tint);
    }
    // Ramps down to street level on both banks.
    for (const sgn of [-1, 1]) {
      [x, z] = at(sgn * (len / 2 + rampL / 2), 0);
      const wrot = Math.atan2(b.nx * sgn, b.nz * sgn); // local +z points away from the bridge
      sink.add(WEDGE, x, 0, z, b.width, deckTop, rampL, wrot, tint);
    }
    // Piers.
    const piers = Math.max(1, Math.round(b.span / 60) - 1);
    for (let k = 1; k <= piers; k++) {
      const s = -b.span / 2 + (b.span * k) / (piers + 1);
      [x, z] = at(s, 0);
      sink.add(BOX, x, -2, z, 3.5, deckTop - deckT + 2, b.width * 0.8, rot, tint);
    }
    if (b.style === 'truss') {
      for (const side of [-1, 1]) {
        [x, z] = at(0, side * (b.width / 2 + 0.4));
        sink.add(BOX, x, deckTop - deckT, z, b.span, deckT + 3.6, 0.8, rot, tint);
      }
    } else if (b.style === 'pylon') {
      const h = rng.range(35, 75);
      for (const f of [-0.28, 0.28]) {
        for (const side of [-1, 1]) {
          [x, z] = at(b.span * f, side * (b.width / 2 + 1.5));
          sink.add(BOX, x, -2, z, 3.2, deckTop + h + 2, 3.2, rot, tint);
        }
        [x, z] = at(b.span * f, 0);
        sink.add(BOX, x, deckTop + h - 3, z, 3.2, 3, b.width + 6.2, rot, tint);
        sink.add(BOX, x, deckTop + h * 0.55, z, 2.4, 2.4, b.width + 6.2, rot, tint);
      }
    }
  }
}
