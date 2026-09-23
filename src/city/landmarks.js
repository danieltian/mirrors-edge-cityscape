import * as THREE from 'three';
import { createNoise2D } from '../util/noise.js';
import { WORLD } from '../config.js';

// Unique set pieces: the needle tower (lathe mesh) and the far-off hills.

export function assignLandmarks(rng, lots, downtowns) {
  const landmarks = [];
  if (!downtowns.length) return landmarks;
  const byDist = (x, z) => lots.filter((l) => l.kind === 'building').sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));

  // Needle tower, a little off the main downtown centre.
  const A = downtowns[0];
  const ang = rng.range(0, Math.PI * 2);
  const off = rng.range(120, 320);
  const nearNeedle = byDist(A.x + Math.cos(ang) * off, A.z + Math.sin(ang) * off);
  const needleLot = nearNeedle.slice(0, 40).find((l) => Math.min(l.w, l.d) >= 22) || nearNeedle[0];
  if (needleLot) {
    needleLot.kind = 'plaza';
    const height = rng.range(420, 470);
    landmarks.push({ type: 'needle', x: needleLot.x, z: needleLot.z, top: height, radius: 26 });
    for (const l of lots) if (l !== needleLot && Math.hypot(l.x - needleLot.x, l.z - needleLot.z) < 95) l.maxH = 170;
  }

  // Supertall slab with a slanted crown at the second centre.
  const B = downtowns[1] || A;
  const nearB = byDist(B.x, B.z).slice(0, 40);
  nearB.sort((a, b) => Math.min(b.w, b.d) - Math.min(a.w, a.d));
  const slabLot = nearB.find((l) => !l.maxH);
  if (slabLot) {
    slabLot.kind = 'supertall';
    slabLot.forcedH = rng.range(420, 480);
    landmarks.push({ type: 'supertall', x: slabLot.x, z: slabLot.z, top: slabLot.forcedH, radius: 30 });
    for (const l of lots) if (l !== slabLot && Math.hypot(l.x - slabLot.x, l.z - slabLot.z) < 70) l.maxH = Math.min(l.maxH || 1e9, 260);
  }

  // A few more tall towers make good camera targets too.
  if (downtowns[2]) {
    const C = downtowns[2];
    const l = byDist(C.x, C.z).find((q) => Math.min(q.w, q.d) >= 26 && !q.maxH);
    if (l) {
      l.forcedH = rng.range(280, 340);
      landmarks.push({ type: 'tower', x: l.x, z: l.z, top: l.forcedH, radius: 25 });
    }
  }
  return landmarks;
}

export function buildNeedle(landmark, material, hf) {
  const s = landmark.top / 450;
  const profile = [
    [17, 0],
    [15, 4],
    [9, 30],
    [6, 90],
    [4.8, 200],
    [4.4, 292],
    [8, 297],
    [21, 303],
    [25, 309],
    [25, 317],
    [21, 323],
    [11, 330],
    [4.5, 334],
    [3.4, 350],
    [5.5, 352],
    [5.5, 356],
    [2.6, 358],
    [2.2, 372],
    [1.2, 376],
    [0.55, 430],
    [0.01, 450],
  ].map(([r, y]) => new THREE.Vector2(r * s, y * s));
  const geo = new THREE.LatheGeometry(profile, 48);
  geo.deleteAttribute('uv');
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(landmark.x, 0.3, landmark.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  hf.raster(landmark.x, landmark.z, 25 * s, 25 * s, 0, 334 * s);
  hf.raster(landmark.x, landmark.z, 2, 2, 0, 450 * s);
  return mesh;
}

// Faceted hills far out across the sea; the fog turns them into pale silhouettes.
export function buildHills(rng, material) {
  const noise = createNoise2D(rng);
  const pos = [];
  const sectors = rng.int(2, 3);
  const base = WORLD.waterY - 2;
  const tri = (a, b, c) => {
    // Keep every face pointing up/outward.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const ny = uz * vx - ux * vz;
    if (ny >= 0) pos.push(...a, ...b, ...c);
    else pos.push(...a, ...c, ...b);
    void uy;
    void vy;
  };
  let a0 = rng.range(0, Math.PI * 2);
  for (let sct = 0; sct < sectors; sct++) {
    a0 += rng.range(1.4, 2.6);
    const span = rng.range(0.5, 1.2);
    const r0 = rng.range(11000, 15500);
    const maxH = rng.range(260, 620);
    const M = 70;
    const rows = [];
    for (let k = 0; k <= M; k++) {
      const t = k / M;
      const a = a0 - span / 2 + span * t;
      const env = Math.sin(Math.PI * t) ** 0.6;
      const n1 = noise(k * 0.18 + sct * 10, 0.5) * 0.5 + 0.5;
      const n2 = noise(k * 0.5 + sct * 10, 3.5) * 0.5 + 0.5;
      const h = maxH * env * (0.45 + 0.55 * n1) * (0.85 + 0.3 * n2);
      const rr = r0 + noise(k * 0.1, 7 + sct) * 900;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      rows.push([
        [ca * (rr - 2200), base, sa * (rr - 2200)],
        [ca * (rr - 900), h * (0.35 + 0.25 * n2), sa * (rr - 900)],
        [ca * rr, h, sa * rr],
        [ca * (rr + 1100), h * (0.4 + 0.2 * n1), sa * (rr + 1100)],
        [ca * (rr + 2600), base, sa * (rr + 2600)],
      ]);
    }
    for (let k = 0; k < M; k++) {
      const A = rows[k];
      const B = rows[k + 1];
      for (let r = 0; r < 4; r++) {
        tri(A[r], B[r], B[r + 1]);
        tri(A[r], B[r + 1], A[r + 1]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'hills';
  return mesh;
}
