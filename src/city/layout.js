import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createNoise2D, fbm } from '../util/noise.js';

// Districts are Voronoi cells around a handful of seeds. Each district has its
// own rotated street grid (often aligned with the river), block proportions
// and character. Blocks are cut into lots; each lot later gets one building.

const SHORE_MARGIN = 12;
const DISTRICT_MARGIN = 8;

export function createDistricts(rng, terrain) {
  const { half } = WORLD;
  const seeds = [];
  const target = rng.int(5, 7);
  for (let a = 0; a < 600 && seeds.length < target; a++) {
    const x = rng.range(-half * 0.8, half * 0.8);
    const z = rng.range(-half * 0.8, half * 0.8);
    if (terrain.sample(x, z) < 80) continue;
    if (seeds.some((s) => Math.hypot(s.x - x, s.z - z) < 1150)) continue;
    seeds.push({ x, z });
  }
  for (const islet of terrain.islets) seeds.push({ x: islet.x, z: islet.z, islet: true });

  const baseAngle = rng.range(0, Math.PI / 2);
  for (const s of seeds) {
    let best = null;
    let bd = Infinity;
    for (const p of terrain.river) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    let angle;
    if (best && bd < 1000 && rng.chance(0.6)) angle = Math.atan2(-best.tz, best.tx);
    else angle = baseAngle + rng.pick([0, 0, rng.range(-0.3, 0.3), Math.PI / 4]);
    setAngle(s, angle);
    s.blockU = rng.range(62, 100);
    s.blockV = rng.range(64, 120);
    s.street = rng.range(12, 16);
    s.avenue = rng.range(22, 30);
    s.avenueEvery = rng.int(3, 5);
    s.kind = s.islet ? 'mixed' : rng.weighted([
      ['mixed', 7],
      ['residential', 2],
      ['industrial', 1],
    ]);
  }
  return seeds;
}

function setAngle(s, angle) {
  s.angle = angle;
  s.U = new THREE.Vector2(Math.cos(angle), -Math.sin(angle));
  s.V = new THREE.Vector2(Math.sin(angle), Math.cos(angle));
}

export function nearestDistrict(districts, x, z) {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < districts.length; i++) {
    const d = (districts[i].x - x) ** 2 + (districts[i].z - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

export function pickDowntowns(rng, terrain) {
  const { half } = WORLD;
  const out = [];
  const count = rng.int(2, 3);
  for (let a = 0; a < 2000 && out.length < count; a++) {
    const x = rng.range(-half * 0.7, half * 0.7);
    const z = rng.range(-half * 0.7, half * 0.7);
    const f = terrain.sample(x, z);
    // Downtowns like to sit near water, but not on a sliver of land.
    if (f < 140 || f > (a < 1000 ? 650 : 1500)) continue;
    if (out.some((d) => Math.hypot(d.x - x, d.z - z) < 1300)) continue;
    const first = out.length === 0;
    out.push({
      x,
      z,
      sigma: first ? rng.range(620, 820) : rng.range(420, 600),
      amp: first ? 1 : rng.range(0.6, 0.85),
    });
  }
  return out;
}

export function makeDensity(rng, downtowns) {
  const noise = createNoise2D(rng);
  return (x, z) => {
    let d = 0;
    for (const c of downtowns) {
      const r2 = (x - c.x) ** 2 + (z - c.z) ** 2;
      d = Math.max(d, c.amp * Math.exp(-r2 / (2 * c.sigma * c.sigma)));
    }
    d += 0.2 + 0.14 * fbm(noise, x * 0.0016, z * 0.0016, 3);
    return Math.min(1, Math.max(0, d));
  };
}

// Street centre-lines along one axis of a district grid.
function makeLines(rng, from, to, block, street, avenue, every) {
  const out = [];
  let k = rng.int(0, every - 1);
  let w = k % every === 0 ? avenue : street;
  let p = from;
  while (p < to) {
    out.push({ pos: p, w, avenue: k % every === 0 });
    k++;
    const nw = k % every === 0 ? avenue : street;
    p += w / 2 + block * rng.range(0.85, 1.15) + nw / 2;
    w = nw;
  }
  return out;
}

export function inCorridor(corridors, x, z) {
  for (const c of corridors) {
    const dx = x - c.x;
    const dz = z - c.z;
    if (Math.abs(dx * c.ux + dz * c.uz) < c.hl && Math.abs(dx * -c.uz + dz * c.ux) < c.hw) return true;
  }
  return false;
}

export function generateLots(rng, terrain, districts, density, corridors) {
  const { half } = WORLD;
  const lots = [];
  const plinths = [];
  const avenues = [];

  for (let di = 0; di < districts.length; di++) {
    const D = districts[di];
    const R = D.islet ? 520 : half * 1.45;
    const uLines = makeLines(rng, -R, R, D.blockU, D.street, D.avenue, D.avenueEvery);
    const vLines = makeLines(rng, -R, R, D.blockV, D.street, D.avenue, D.avenueEvery);
    const toWorld = (u, v) => [D.x + D.U.x * u + D.V.x * v, D.z + D.U.y * u + D.V.y * v];

    const pointOK = (u, v) => {
      const [x, z] = toWorld(u, v);
      if (terrain.sample(x, z) < SHORE_MARGIN) return false;
      const dOwn = Math.hypot(x - D.x, z - D.z);
      for (let k = 0; k < districts.length; k++) {
        if (k === di) continue;
        if (Math.hypot(x - districts[k].x, z - districts[k].z) - dOwn < 2 * DISTRICT_MARGIN) return false;
      }
      return !inCorridor(corridors, x, z);
    };
    const rectOK = (u0, u1, v0, v1) => {
      const um = (u0 + u1) / 2;
      const vm = (v0 + v1) / 2;
      return (
        pointOK(u0, v0) && pointOK(u1, v0) && pointOK(u0, v1) && pointOK(u1, v1) &&
        pointOK(um, vm) && pointOK(um, v0) && pointOK(um, v1) && pointOK(u0, vm) && pointOK(u1, vm)
      );
    };

    // Record avenues (for camera shots down long straight streets).
    for (const [axis, list] of [
      ['u', uLines],
      ['v', vLines],
    ]) {
      for (const l of list) {
        if (!l.avenue) continue;
        avenues.push({ district: di, axis, pos: l.pos, width: l.w, R });
      }
    }

    for (let iu = 0; iu < uLines.length - 1; iu++) {
      const u0 = uLines[iu].pos + uLines[iu].w / 2;
      const u1 = uLines[iu + 1].pos - uLines[iu + 1].w / 2;
      for (let iv = 0; iv < vLines.length - 1; iv++) {
        const v0 = vLines[iv].pos + vLines[iv].w / 2;
        const v1 = vLines[iv + 1].pos - vLines[iv + 1].w / 2;
        const uc = (u0 + u1) / 2;
        const vc = (v0 + v1) / 2;
        const [cx, cz] = toWorld(uc, vc);
        if (terrain.sample(cx, cz) < -120) continue;
        if (nearestDistrict(districts, cx, cz) !== di) {
          // Still allow blocks whose centre is just across the border if all
          // their lots pass the corner checks; cheap early-out otherwise.
          const dOwn = Math.hypot(cx - D.x, cz - D.z);
          const other = districts[nearestDistrict(districts, cx, cz)];
          if (dOwn - Math.hypot(cx - other.x, cz - other.z) > 120) continue;
        }
        const bw = u1 - u0;
        const bd = v1 - v0;
        const dens = density(cx, cz);
        const blockLots = [];
        const r = rng.next();
        if (r < 0.025) {
          blockLots.push({ u0, u1, v0, v1, kind: 'plaza' });
        } else if (r < 0.025 + 0.06 + 0.2 * dens * dens && bw < 115 && bd < 125) {
          blockLots.push({ u0, u1, v0, v1, kind: 'building' });
        } else {
          const rows = [];
          if (bd > 58) {
            const split = v0 + bd * rng.range(0.4, 0.6);
            rows.push([v0, split], [split, v1]);
          } else rows.push([v0, v1]);
          const minW = D.kind === 'residential' ? 14 : 20 + dens * 10;
          const maxW = D.kind === 'residential' ? 30 : 36 + dens * 22;
          for (const [ra, rb] of rows) {
            let u = u0;
            while (u1 - u > maxW) {
              let w = rng.range(minW, maxW);
              if (u1 - (u + w) < minW) w = u1 - u;
              blockLots.push({ u0: u, u1: u + w, v0: ra, v1: rb, kind: 'building' });
              u += w;
            }
            if (u1 - u > 1) blockLots.push({ u0: u, u1, v0: ra, v1: rb, kind: 'building' });
          }
        }

        let valid = 0;
        const accepted = [];
        for (const L of blockLots) {
          if (!rectOK(L.u0, L.u1, L.v0, L.v1)) continue;
          valid++;
          const lu = (L.u0 + L.u1) / 2;
          const lv = (L.v0 + L.v1) / 2;
          const [x, z] = toWorld(lu, lv);
          accepted.push({
            x,
            z,
            w: L.u1 - L.u0,
            d: L.v1 - L.v0,
            angle: D.angle,
            district: di,
            districtKind: D.kind,
            dens: density(x, z),
            kind: L.kind,
          });
        }
        if (!valid) continue;
        if (valid === blockLots.length) {
          plinths.push({ x: cx, z: cz, w: bw, d: bd, angle: D.angle });
        } else {
          for (const L of accepted) plinths.push({ x: L.x, z: L.z, w: L.w, d: L.d, angle: L.angle });
        }
        lots.push(...accepted);
      }
    }
  }
  return { lots, plinths, avenues };
}
