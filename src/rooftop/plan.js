// Layout of a block of city rooftops in the Mirror's Edge style: a grid of
// buildings of slightly different heights, some sharing party walls, some
// split by alleys or a street, with the odd glass tower rising out of the
// block. Neighbouring roofs are linked by service stairs, steel walkways
// over the alleys and ziplines, so there is always somewhere to run.

export const snap = (v, s = 0.3) => Math.round(v / s) * s;

export function makeRoofPlan(rng) {
  const nx = rng.int(3, 4);
  const nz = rng.int(3, 4);
  const gap = () => rng.weighted([[0, 3], [rng.range(3.2, 6.5), 2.2], [rng.range(14, 19), 0.8]]);
  const strip = (n) => {
    const out = [];
    const gaps = [];
    let a = 0;
    for (let i = 0; i < n; i++) {
      const w = snap(rng.range(20, 34), 0.6);
      out.push([a, a + w]);
      a += w;
      if (i < n - 1) {
        const g = snap(gap(), 0.3);
        gaps.push(g);
        a += g;
      }
    }
    const shift = a / 2;
    return { spans: out.map(([p, q]) => [p - shift, q - shift]), gaps };
  };
  const X = strip(nx);
  const Z = strip(nz);

  // Heights: a common base, each block a little higher or lower, a few
  // towers. The lot nearest the middle is never a tower.
  const base = snap(rng.range(38, 62), 0.3);
  const lots = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [x0, x1] = X.spans[i];
      const [z0, z1] = Z.spans[j];
      const centre = Math.hypot((x0 + x1) / 2, (z0 + z1) / 2);
      const tower = centre > 20 && rng.chance(0.14);
      const h = tower ? snap(rng.range(95, 190), 0.3) : snap(base + rng.weighted([[0, 3], [rng.range(-7, -2), 2], [rng.range(2, 11), 2.5]]), 0.3);
      lots.push({ i, j, x0, x1, z0, z1, h, tower, id: lots.length });
    }
  }
  // Keep at least two thirds of the block walkable.
  while (lots.filter((l) => l.tower).length > Math.floor(lots.length / 3)) {
    const t = lots.find((l) => l.tower);
    t.tower = false;
    t.h = base;
  }
  const at = (i, j) => lots[j * nx + i];

  // Roofs a step apart across a party wall become one continuous roof level.
  for (const l of lots) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const q = l.i + di < nx && l.j + dj < nz ? at(l.i + di, l.j + dj) : null;
      if (!q || l.tower || q.tower) continue;
      const g = di ? X.gaps[l.i] : Z.gaps[l.j];
      if (g === 0 && Math.abs(q.h - l.h) < 0.9) q.h = l.h;
    }
  }

  // Links between neighbouring roofs.
  const links = [];
  for (const l of lots) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      if (l.i + di >= nx || l.j + dj >= nz) continue;
      const q = at(l.i + di, l.j + dj);
      if (l.tower || q.tower) continue;
      const g = di ? X.gaps[l.i] : Z.gaps[l.j];
      const dy = q.h - l.h;
      const axis = di ? 'x' : 'z'; // direction of travel from l to q
      // Shared stretch of the facing edges.
      const s0 = di ? Math.max(l.z0, q.z0) : Math.max(l.x0, q.x0);
      const s1 = di ? Math.min(l.z1, q.z1) : Math.min(l.x1, q.x1);
      const edge = di ? l.x1 : l.z1; // l's side of the gap
      let kind = null;
      if (g === 0) kind = Math.abs(dy) < 0.1 ? 'open' : Math.abs(dy) <= 7.5 ? 'stairs' : 'ladder';
      else if (g < 8) kind = Math.abs(dy) <= 3.5 ? 'walkway' : rng.chance(0.6) ? 'zipline' : 'stairs';
      else kind = rng.chance(0.35) ? 'zipline' : null;
      if (!kind) continue;
      const pos = s0 + (s1 - s0) * rng.range(0.25, 0.75);
      links.push({ a: l, b: q, kind, axis, gap: g, edge, s: pos, span: [s0, s1], dy });
    }
  }

  const x0 = X.spans[0][0];
  const x1 = X.spans[nx - 1][1];
  const z0 = Z.spans[0][0];
  const z1 = Z.spans[nz - 1][1];
  return { nx, nz, X, Z, lots, links, base, bounds: { x0, x1, z0, z1 }, maxH: Math.max(...lots.map((l) => l.h)) };
}
