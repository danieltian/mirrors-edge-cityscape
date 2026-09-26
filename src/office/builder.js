import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collects office geometry per material key, merges each bucket into meshes
// and records axis-aligned colliders for camera collision, navigation and
// view scoring. Keys look like "material" or "group:material"; the group
// "ceil" marks things hidden in the isometric cut-away. Buckets are also
// split into square chunks of floor area so off-screen parts get culled.

const UP = new THREE.Vector3(0, 1, 0);
const CHUNK = 14;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

function normalise(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'aFace') out.deleteAttribute(name);
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.clearGroups();
  return out;
}

export class Builder {
  constructor() {
    this.parts = new Map();
    this.colliders = [];
    this.extra = [];
  }

  push(key, g) {
    const n = normalise(g);
    const pos = n.attributes.position;
    let x = 0;
    let z = 0;
    const step = Math.max(1, Math.floor(pos.count / 8));
    let k = 0;
    for (let i = 0; i < pos.count; i += step, k++) {
      x += pos.getX(i);
      z += pos.getZ(i);
    }
    const bucket = `${key}|${Math.floor(x / k / CHUNK)},${Math.floor(z / k / CHUNK)}`;
    if (!this.parts.has(bucket)) this.parts.set(bucket, []);
    this.parts.get(bucket).push(n);
  }

  collider(x0, y0, z0, x1, y1, z1, extra) {
    const c = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1) };
    if (extra) Object.assign(c, extra);
    this.colliders.push(c);
    return c;
  }

  // World-space box from min/max corners.
  box(key, x0, y0, z0, x1, y1, z1, collide = true) {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    if (w <= 1e-4 || h <= 1e-4 || d <= 1e-4) return;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.push(key, g);
    if (collide) this.collider(x0, y0, z0, x1, y1, z1);
  }

  // A box whose faces carry uv in metres from their corner and aFace = the
  // face's width and height, for materials that lay things out per face
  // (e.g. whole windows centred on each wall). Keys used with it must only
  // ever get faceBoxes (every part of a bucket needs the same attributes).
  faceBox(key, x0, y0, z0, x1, y1, z1, collide = true) {
    const W = x1 - x0;
    const H = y1 - y0;
    const D = z1 - z0;
    if (W <= 1e-4 || H <= 1e-4 || D <= 1e-4) return;
    const g = new THREE.BoxGeometry(W, H, D).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const face = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) - x0;
      const y = pos.getY(i) - y0;
      const z = pos.getZ(i) - z0;
      let fw;
      let fh;
      if (Math.abs(nor.getY(i)) > 0.5) {
        uv.setXY(i, x, z);
        [fw, fh] = [W, D];
      } else if (Math.abs(nor.getX(i)) > 0.5) {
        uv.setXY(i, z, y);
        [fw, fh] = [D, H];
      } else {
        uv.setXY(i, x, y);
        [fw, fh] = [W, H];
      }
      face[i * 2] = fw;
      face[i * 2 + 1] = fh;
    }
    g.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 2));
    this.push(key, g);
    if (collide) this.collider(x0, y0, z0, x1, y1, z1);
  }

  // Box along an axis-aligned wall line: `a` runs along the wall, `c` is
  // the wall's coordinate on the other horizontal axis.
  wallBox(key, axis, c, a0, a1, y0, y1, o0, o1, collide = false) {
    if (axis === 'x') this.box(key, a0, y0, c + o0, a1, y1, c + o1, collide);
    else this.box(key, c + o0, y0, a0, c + o1, y1, a1, collide);
  }

  matrix(key, geo, m) {
    const g = geo.clone();
    g.applyMatrix4(m);
    this.push(key, g);
  }

  // Unit geometry (height 1 along +y, centred) stretched between two points.
  between(key, geo, p, q, r) {
    _v.subVectors(q, p);
    const len = _v.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(UP, _v.divideScalar(len));
    _m.compose(_p.addVectors(p, q).multiplyScalar(0.5), _q, _s.set(r, len, r));
    this.matrix(key, geo, _m);
  }

  // Colliders along a sloped or diagonal segment, as a chain of small boxes.
  chain(x0, y0, z0, x1, y1, z1, half, h, extra) {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const ax = x0 + (x1 - x0) * t0;
      const bx = x0 + (x1 - x0) * t1;
      const az = z0 + (z1 - z0) * t0;
      const bz = z0 + (z1 - z0) * t1;
      const ay = y0 + (y1 - y0) * t0;
      const by = y0 + (y1 - y0) * t1;
      this.collider(Math.min(ax, bx) - half, Math.min(ay, by), Math.min(az, bz) - half, Math.max(ax, bx) + half, Math.max(ay, by) + h, Math.max(az, bz) + half, extra);
    }
  }

  frame(x, y, z, rotY = 0) {
    return new Frame(this, x, y, z, rotY);
  }

  add(obj) {
    this.extra.push(obj);
  }

  // uvScale: { materialName: metres per repeat, or [u, v] } for world-mapped UVs.
  build(materials, uvScale = {}) {
    const group = new THREE.Group();
    group.name = 'office';
    this.meshes = [];
    for (const [bucket, list] of this.parts) {
      const key = bucket.split('|')[0];
      const [grp, matName] = key.includes(':') ? key.split(':') : ['main', key];
      const mat = materials[matName];
      if (!mat) throw new Error(`office: missing material "${matName}"`);
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      const scale = uvScale[matName];
      if (scale) worldUVs(geo, scale);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = key;
      mesh.userData.group = grp;
      mesh.castShadow = mat.userData.castShadow !== false;
      mesh.receiveShadow = mat.userData.receiveShadow !== false;
      if (mat.transparent) mesh.renderOrder = mat.userData.renderOrder ?? 2;
      group.add(mesh);
      this.meshes.push(mesh);
    }
    for (const o of this.extra) group.add(o);
    this.parts.clear();
    return group;
  }
}

// Planar UVs from world position, picking the plane from the face normal.
function worldUVs(geo, scale) {
  const [su, sv] = Array.isArray(scale) ? scale : [scale, scale];
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x / su, z / sv);
    else if (nx >= nz) uv.setXY(i, z / su, y / sv);
    else uv.setXY(i, x / su, y / sv);
  }
  uv.needsUpdate = true;
}

// A local frame (position + Y rotation) for building furniture in local
// coordinates; colliders become the world AABB of the rotated local box.
export class Frame {
  constructor(builder, x, y, z, rotY) {
    this.b = builder;
    this.m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, rotY), new THREE.Vector3(1, 1, 1));
  }

  box(key, x0, y0, z0, x1, y1, z1, collide = false) {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    if (w <= 1e-4 || h <= 1e-4 || d <= 1e-4) return;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.applyMatrix4(this.m);
    this.b.push(key, g);
    if (collide) this.collide(x0, y0, z0, x1, y1, z1);
  }

  geo(key, geometry, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0) {
    _q.setFromEuler(_e.set(rotX, rotY, rotZ, 'YXZ'));
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    const g = geometry.clone();
    g.applyMatrix4(_m);
    g.applyMatrix4(this.m);
    this.b.push(key, g);
  }

  collide(x0, y0, z0, x1, y1, z1, extra) {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const x of [x0, x1]) {
      for (const z of [z0, z1]) {
        _v.set(x, 0, z).applyMatrix4(this.m);
        minX = Math.min(minX, _v.x);
        maxX = Math.max(maxX, _v.x);
        minZ = Math.min(minZ, _v.z);
        maxZ = Math.max(maxZ, _v.z);
      }
    }
    const oy = this.m.elements[13];
    return this.b.collider(minX, y0 + oy, minZ, maxX, y1 + oy, maxZ, extra);
  }

  // World position of a local point.
  point(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.m);
  }
}
