import * as THREE from 'three';

// Every solid in the city is one of a handful of unit primitives (base at
// y = 0, 1 x 1 x 1) placed with a position, Y rotation and non-uniform scale.
// They are collected here and turned into chunked InstancedMeshes.

export const BOX = 0;
export const CYL = 1;
export const OCT = 2;
export const WEDGE = 3;
export const PYR = 4;
const TYPES = 5;
const STRIDE = 13; // x y z sx sy sz rot r g b ar ag ab (ar < 0 = no accent)

export class PrimSink {
  constructor(heightfield) {
    this.hf = heightfield;
    this.lists = Array.from({ length: TYPES }, () => []);
  }

  add(type, x, y, z, sx, sy, sz, rot, color, accent = null, raster = true) {
    const L = this.lists[type];
    L.push(x, y, z, sx, sy, sz, rot, color[0], color[1], color[2]);
    if (accent) L.push(accent[0], accent[1], accent[2]);
    else L.push(-1, 0, 0);
    if (raster && this.hf && y + sy > 0.6) this.hf.raster(x, z, sx / 2, sz / 2, rot, y + sy);
  }

  get count() {
    return this.lists.reduce((a, l) => a + l.length / STRIDE, 0);
  }
}

function flat(geo) {
  const g = geo.toNonIndexed();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

export function unitGeometries() {
  // Box without its bottom face (never visible).
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const idx = box.index.array;
  const keep = [];
  for (let i = 0; i < idx.length; i++) if (i < 18 || i >= 24) keep.push(idx[i]);
  box.setIndex(keep);
  box.clearGroups();
  box.deleteAttribute('uv');

  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 22, 1, false);
  cyl.translate(0, 0.5, 0);
  cyl.deleteAttribute('uv');

  const oct = new THREE.CylinderGeometry(0.5 / Math.cos(Math.PI / 8), 0.5 / Math.cos(Math.PI / 8), 1, 8, 1, false);
  oct.rotateY(Math.PI / 8);
  oct.translate(0, 0.5, 0);

  // Wedge: full height along the -z edge sloping down to 0 at +z.
  const w = new THREE.BufferGeometry();
  const P = {
    a: [-0.5, 0, -0.5],
    b: [0.5, 0, -0.5],
    c: [0.5, 0, 0.5],
    d: [-0.5, 0, 0.5],
    e: [-0.5, 1, -0.5],
    f: [0.5, 1, -0.5],
  };
  const tris = [
    // back (-z)
    'a', 'e', 'f', 'a', 'f', 'b',
    // slope
    'e', 'd', 'c', 'e', 'c', 'f',
    // left (-x)
    'a', 'd', 'e',
    // right (+x)
    'b', 'f', 'c',
  ];
  w.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((k) => P[k]), 3));
  w.computeVertexNormals();

  const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, false);
  pyr.rotateY(Math.PI / 4);
  pyr.translate(0, 0.5, 0);

  return [box, cyl, flat(oct), w, flat(pyr)];
}

export function buildInstances(sink, material, chunkSize, half) {
  const geos = unitGeometries();
  const group = new THREE.Group();
  group.name = 'city-instances';
  const accentMeshes = [];
  const cn = Math.ceil((2 * half) / chunkSize);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let type = 0; type < TYPES; type++) {
    const L = sink.lists[type];
    const count = L.length / STRIDE;
    const buckets = new Map();
    for (let k = 0; k < count; k++) {
      const x = L[k * STRIDE];
      const z = L[k * STRIDE + 2];
      const ci = Math.min(cn - 1, Math.max(0, Math.floor((x + half) / chunkSize)));
      const cj = Math.min(cn - 1, Math.max(0, Math.floor((z + half) / chunkSize)));
      const key = cj * cn + ci;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(k);
    }
    for (const list of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geos[type], material, list.length);
      const base = new Float32Array(list.length * 3);
      let accent = null;
      for (let n = 0; n < list.length; n++) {
        const o = list[n] * STRIDE;
        p.set(L[o], L[o + 1], L[o + 2]);
        s.set(L[o + 3], L[o + 4], L[o + 5]);
        q.setFromAxisAngle(up, L[o + 6]);
        m.compose(p, q, s);
        mesh.setMatrixAt(n, m);
        base[n * 3] = L[o + 7];
        base[n * 3 + 1] = L[o + 8];
        base[n * 3 + 2] = L[o + 9];
        if (L[o + 10] >= 0) {
          if (!accent) accent = new Float32Array(base.length).fill(-1);
          accent[n * 3] = L[o + 10];
          accent[n * 3 + 1] = L[o + 11];
          accent[n * 3 + 2] = L[o + 12];
        }
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(base.slice(), 3);
      if (accent) {
        // Merge: accent colour where set, base colour elsewhere.
        for (let i = 0; i < accent.length; i += 3) {
          if (accent[i] < 0) {
            accent[i] = base[i];
            accent[i + 1] = base[i + 1];
            accent[i + 2] = base[i + 2];
          }
        }
        mesh.userData.base = base;
        mesh.userData.accent = accent;
        accentMeshes.push(mesh);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      group.add(mesh);
    }
  }

  return {
    group,
    setAccents(on) {
      for (const mesh of accentMeshes) {
        mesh.instanceColor.array.set(on ? mesh.userData.accent : mesh.userData.base);
        mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      group.traverse((o) => o.isInstancedMesh && o.dispose());
    },
  };
}
