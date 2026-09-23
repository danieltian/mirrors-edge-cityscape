import * as THREE from 'three';
import { WORLD } from '../config.js';
import { RNG } from '../util/rng.js';
import { Terrain } from './terrain.js';
import { HeightField } from './heightfield.js';
import { createDistricts, nearestDistrict, pickDowntowns, makeDensity, generateLots, inCorridor } from './layout.js';
import { PrimSink, buildInstances, BOX } from './prims.js';
import { buildLot, PLINTH_H, ACCENTS } from './buildings.js';
import { planBridges, buildBridges } from './bridges.js';
import { assignLandmarks, buildNeedle, buildHills } from './landmarks.js';

// Builds the whole city for a seed. Returns the scene group plus the metadata
// the camera system needs to find good viewpoints.
export function generateCity(seed, materials) {
  const t0 = performance.now();
  const rng = new RNG(seed);

  const terrain = new Terrain(rng.fork('terrain'));
  const districts = createDistricts(rng.fork('districts'), terrain);
  terrain.addPorts(rng.fork('ports'), (x, z) => districts[nearestDistrict(districts, x, z)]);
  const { bridges, corridors } = planBridges(rng.fork('bridges'), terrain);

  const hf = new HeightField(terrain);
  const downtowns = pickDowntowns(rng.fork('downtowns'), terrain);
  const density = makeDensity(rng.fork('density'), downtowns);
  const { lots, plinths, avenues } = generateLots(rng.fork('lots'), terrain, districts, density, corridors);
  const landmarks = assignLandmarks(rng.fork('landmarks'), lots, downtowns);

  // Construction sites with tower cranes (one of the accent sources).
  const crng = rng.fork('construction');
  const candidates = lots.filter((l) => l.kind === 'building' && !l.forcedH && l.dens > 0.25 && Math.min(l.w, l.d) >= 22);
  for (let i = 0; i < 12 && candidates.length; i++) {
    const l = candidates.splice(crng.int(0, candidates.length - 1), 1)[0];
    l.kind = 'construction';
  }

  const sink = new PrimSink(hf);
  const plinthTint = [0.93, 0.94, 0.95];
  for (const p of plinths) sink.add(BOX, p.x, 0, p.z, p.w, PLINTH_H, p.d, p.angle, plinthTint, null, false);

  const brng = rng.fork('buildings');
  for (const lot of lots) {
    buildLot(sink, brng, lot);
    // Mark open plazas as occupied so the infill pass leaves them alone.
    if (lot.kind === 'plaza') hf.raster(lot.x, lot.z, lot.w / 2, lot.d / 2, lot.angle, 0.35);
  }

  // Infill: leftover land (narrow tips, district seams) gets small buildings
  // so there are no bare patches.
  const irng = rng.fork('infill');
  const infill = [];
  const H = WORLD.half;
  for (let z = -H; z < H; z += 32) {
    for (let x = -H; x < H; x += 32) {
      const jx = x + irng.range(-6, 6);
      const jz = z + irng.range(-6, 6);
      if (hf.heightAt(jx, jz) > 0.2 || terrain.sample(jx, jz) < 22) continue;
      if (hf.maxAround(jx, jz, 20) > 0.2) continue;
      if (inCorridor(corridors, jx, jz)) continue;
      const di = nearestDistrict(districts, jx, jz);
      const D = districts[di];
      const w = irng.range(16, 28);
      const d = irng.range(16, 28);
      let ok = true;
      for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = jx + D.U.x * su * (w / 2) + D.V.x * sv * (d / 2);
        const cz = jz + D.U.y * su * (w / 2) + D.V.y * sv * (d / 2);
        if (terrain.sample(cx, cz) < 10 || hf.maxAround(cx, cz, 4) > 0.2) ok = false;
      }
      if (!ok) continue;
      const lot = { x: jx, z: jz, w, d, angle: D.angle, district: di, districtKind: D.kind, dens: density(jx, jz) * 0.7, kind: 'building', maxH: 70 };
      sink.add(BOX, jx, 0, jz, w + 4, PLINTH_H, d + 4, D.angle, plinthTint, null, false);
      buildLot(sink, irng, lot);
      hf.raster(jx, jz, w / 2, d / 2, D.angle, Math.max(0.35, lot.top || 0));
      infill.push(lot);
    }
  }
  lots.push(...infill);

  // Warehouses and container stacks on the piers.
  const prng = rng.fork('piers');
  const containerColors = [ACCENTS.red, ACCENTS.orange, ACCENTS.teal, ACCENTS.yellow, ACCENTS.red];
  for (const p of terrain.piers || []) {
    const rot = Math.atan2(-p.nz, p.nx);
    if (prng.chance(0.5)) {
      sink.add(BOX, p.x, 0, p.z, p.len * prng.range(0.55, 0.8), prng.range(6, 10), p.width - 5, rot, plinthTint);
    } else if (prng.chance(0.7)) {
      const rows = Math.max(1, Math.floor((p.width - 4) / 3));
      const cols = Math.max(1, Math.floor((p.len * 0.7) / 13));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (prng.chance(0.25)) continue;
          const s = -p.len * 0.35 + 6.5 + c * 13;
          const t = -((rows - 1) * 3) / 2 + r * 3;
          const x = p.x + p.nx * s - p.nz * t;
          const z = p.z + p.nz * s + p.nx * t;
          const stack = prng.int(1, 3);
          for (let k = 0; k < stack; k++) {
            sink.add(BOX, x, k * 2.6, z, 12.2, 2.55, 2.45, rot, [0.9, 0.9, 0.9], prng.pick(containerColors));
          }
        }
      }
    }
  }

  buildBridges(sink, rng.fork('bridge-geo'), bridges, [0.92, 0.93, 0.94]);

  const group = new THREE.Group();
  group.name = 'city';

  const ground = new THREE.Mesh(terrain.buildMesh(), materials.ground);
  ground.receiveShadow = true;
  ground.castShadow = true;
  ground.name = 'ground';
  group.add(ground);

  for (const lm of landmarks) {
    if (lm.type === 'needle') group.add(buildNeedle(lm, materials.building, hf));
  }

  hf.finalize();

  const instances = buildInstances(sink, materials.building, WORLD.chunk, WORLD.half);
  group.add(instances.group);

  const hills = buildHills(rng.fork('hills'), materials.ground);
  group.add(hills);

  // Tallest lots are candidate rooftop viewpoints.
  const tallLots = lots.filter((l) => l.top > 45).sort((a, b) => b.top - a.top);

  const stats = {
    lots: lots.length,
    infill: infill.length,
    prims: sink.count,
    bridges: bridges.length,
    ms: Math.round(performance.now() - t0),
  };

  return {
    seed,
    group,
    terrain,
    heightfield: hf,
    districts,
    downtowns,
    landmarks,
    bridges,
    avenues,
    lots,
    tallLots,
    stats,
    setAccents: instances.setAccents,
    dispose() {
      instances.dispose();
      ground.geometry.dispose();
      hills.geometry.dispose();
      group.traverse((o) => {
        if (o.isMesh && !o.isInstancedMesh && o.geometry) o.geometry.dispose();
      });
    },
  };
}
