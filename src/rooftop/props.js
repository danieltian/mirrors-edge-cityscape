import * as THREE from 'three';

// Rooftop furniture, built into the shared Builder: stair and lift housings
// with ribbed cladding and a coloured band, condenser units with fans, small
// AC boxes, ducts and pipe runs, vents and exhaust stacks, water tanks,
// cooling towers, solar arrays, skylights, antenna masts and dishes, steel
// service stairs, walkways, ladders, billboards, a helipad, planted terraces
// and tower cranes. Frames only turn in quarter turns so world-space UVs
// stay aligned.

const CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const UBOX = new THREE.BoxGeometry(1, 1, 1);
const DISC_FRONT = new THREE.CircleGeometry(1, 24);
const PLANE = new THREE.PlaneGeometry(1, 1);
const BALL = new THREE.IcosahedronGeometry(1, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = Math.PI / 2;
const _m = new THREE.Matrix4();

// A fan: a dark well, the blades spinning in it and a wire grille over
// them. The builder only gets the well and the grille; the blades are one
// instanced mesh turned every frame (see effects.js), listed in b.fans.
// (x, y, z) and rotY are in the frame; up = facing +y, else local +z.
function fan(b, f, x, y, z, rotY, r, up, speed) {
  const base = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(up ? -Q : 0, rotY, 0, 'YXZ')), V(1, 1, 1)).premultiply(f.m);
  b.matrix('fanWell', DISC_FRONT, _m.copy(base).multiply(new THREE.Matrix4().makeScale(r, r, 1)));
  b.matrix('fanGrille', DISC_FRONT, _m.copy(base).multiply(new THREE.Matrix4().compose(V(0, 0, r * 0.09), new THREE.Quaternion(), V(r, r, 1))));
  b.fans?.push({ base: base.multiply(new THREE.Matrix4().makeTranslation(0, 0, r * 0.04)), r: r * 0.94, speed });
}

// Somewhere steam comes out: a point, the radius of the opening and how big
// the plume is (1 = a small vent, 3 = a cooling tower). Listed in b.steam.
function steam(b, x, y, z, r, size) {
  b.steam?.push({ x, y, z, r, size });
}

// ------------------------------------------------------------ housings

// Stair / lift housing. Local +z is the door side. Returns world points in
// front of the door and the roof height of the housing.
export function housing(b, rng, x, y, z, rot, w, d, h, band) {
  const f = b.frame(x, y, z, rot);
  f.box('ribbed', -w / 2, 0, -d / 2, w / 2, h, d / 2, true);
  const bh = rng.range(0.9, 1.5);
  if (band) f.box(band, -w / 2 - 0.03, 0, -d / 2 - 0.03, w / 2 + 0.03, bh, d / 2 + 0.03);
  f.box('white', -w / 2 - 0.12, h, -d / 2 - 0.12, w / 2 + 0.12, h + 0.28, d / 2 + 0.12);
  f.box('white', -w / 2 - 0.02, 0, -d / 2 - 0.02, w / 2 + 0.02, 0.12, d / 2 + 0.02);
  // Door with a frame, a small canopy and a lamp.
  const dx = rng.range(-w / 2 + 1, w / 2 - 1);
  f.box('darkMetal', dx - 0.55, 0.1, d / 2, dx + 0.55, 2.3, d / 2 + 0.05);
  f.box(rng.chance(0.12) ? 'runner' : 'metal', dx - 0.45, 0.1, d / 2 + 0.05, dx + 0.45, 2.2, d / 2 + 0.08);
  f.box('darkMetal', dx + 0.3, 1.0, d / 2 + 0.08, dx + 0.36, 1.08, d / 2 + 0.13);
  f.box('white', dx - 0.8, 2.45, d / 2, dx + 0.8, 2.55, d / 2 + 0.7);
  f.box('emissiveWarm', dx - 0.12, 2.32, d / 2 + 0.05, dx + 0.12, 2.42, d / 2 + 0.14);
  // Louvre panel and a small wall unit on the sides.
  if (w > 3) f.box('louver', -w / 2 + 0.4, 1.4, d / 2, -w / 2 + 1.4, 2.4, d / 2 + 0.04);
  if (rng.chance(0.6)) {
    const s = rng.sign();
    f.box('white', s * (w / 2) + (s > 0 ? 0 : -0.55), 1.2, -0.4, s * (w / 2) + (s > 0 ? 0.55 : 0), 1.8, 0.4);
    fan(b, f, s * (w / 2 + 0.57), 1.5, 0, s * Q, 0.25, false, 7);
  }
  // Things on its roof.
  for (let k = 0; k < rng.int(1, 3); k++) vent(b, rng, f.point(rng.range(-w / 2 + 0.6, w / 2 - 0.6), 0, rng.range(-d / 2 + 0.6, d / 2 - 0.6)), y + h + 0.28);
  if (rng.chance(0.35) && w > 3.5) {
    const g = f.point(rng.range(-w / 4, w / 4), 0, rng.range(-d / 4, d / 4));
    b.box('white', g.x - 0.9, y + h + 0.28, g.z - 0.6, g.x + 0.9, y + h + 1.4, g.z + 0.6);
  }
  return { door: f.point(dx, 0, d / 2 + 1.4), top: y + h + 0.28 };
}

// ------------------------------------------------------------ plant

// Condenser unit: louvred sides, fans on top, on rails.
export function condenser(b, rng, x, y, z, rot, w, d, h) {
  const f = b.frame(x, y, z, rot);
  f.box('darkMetal', -w / 2, 0, -d / 2 + 0.1, w / 2, 0.15, -d / 2 + 0.25);
  f.box('darkMetal', -w / 2, 0, d / 2 - 0.25, w / 2, 0.15, d / 2 - 0.1);
  f.box('white', -w / 2, 0.15, -d / 2, w / 2, h, d / 2, true);
  f.box('louver', -w / 2 + 0.1, 0.3, d / 2, w / 2 - 0.1, h - 0.15, d / 2 + 0.03);
  f.box('louver', -w / 2 + 0.1, 0.3, -d / 2 - 0.03, w / 2 - 0.1, h - 0.15, -d / 2);
  const n = Math.max(1, Math.round(w / d));
  const r = Math.min(d, w / n) * 0.42;
  for (let k = 0; k < n; k++) {
    const fx = -w / 2 + (w * (k + 0.5)) / n;
    fan(b, f, fx, h + 0.1, 0, 0, r, true, 5 + (k % 2) * 1.5);
    f.geo('white', new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), fx, h + 0.1, 0, 0, r + 0.04, 0.24, r + 0.04);
  }
}

// Small box AC unit with a round fan grille on the front.
export function acUnit(b, x, y, z, rot, s = 1) {
  const f = b.frame(x, y, z, rot);
  f.box('darkMetal', -0.45 * s, 0, -0.3 * s, 0.45 * s, 0.1, 0.3 * s);
  f.box('white', -0.5 * s, 0.1, -0.32 * s, 0.5 * s, 0.1 + 0.72 * s, 0.32 * s, true);
  fan(b, f, -0.12 * s, 0.1 + 0.36 * s, 0.335 * s, 0, 0.27 * s, false, 8);
  f.box('louver', 0.22 * s, 0.2, 0.32 * s, 0.44 * s, 0.1 + 0.62 * s, 0.335 * s);
}

// Rectangular duct along an axis-aligned polyline [[x, z], ...] with its
// centre at height yc, on little stands down to the roof at floorY.
export function duct(b, pts, floorY, yc, s, key = 'white') {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const x0 = Math.min(ax, bx) - s / 2;
    const x1 = Math.max(ax, bx) + s / 2;
    const z0 = Math.min(az, bz) - s / 2;
    const z1 = Math.max(az, bz) + s / 2;
    b.box(key, x0, yc - s / 2, z0, x1, yc + s / 2, z1, true);
    // Seams every metre and a half.
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(len / 1.5);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      if (alongX) b.box('metal', px - 0.03, yc - s / 2 - 0.02, pz - s / 2 - 0.02, px + 0.03, yc + s / 2 + 0.02, pz + s / 2 + 0.02, false);
      else b.box('metal', px - s / 2 - 0.02, yc - s / 2 - 0.02, pz - 0.03, px + s / 2 + 0.02, yc + s / 2 + 0.02, pz + 0.03, false);
      if (k % 2 === 1 && yc - s / 2 > floorY + 0.05) b.box('darkMetal', px - 0.05, floorY, pz - 0.05, px + 0.05, yc - s / 2, pz + 0.05, false);
    }
  }
}

// A bundle of pipes along an axis-aligned polyline at height y (bottom of
// the pipes), on sleepers; n pipes of radius r side by side. With red set,
// the first pipe is painted in runner-vision red.
export function pipes(b, pts, y, n, r, key = 'steel', red = false) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * (r * 2.6);
      const p = alongX ? V(ax - r, y + r, az + off) : V(ax + off, y + r, az - r);
      const q = alongX ? V(bx + r, y + r, bz + off) : V(bx + off, y + r, bz + r);
      b.between(k === 0 && red ? 'runner' : key, CYL8, p, q, r);
    }
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0.6; t < len; t += 2.4) {
      const px = ax + ((bx - ax) * t) / len;
      const pz = az + ((bz - az) * t) / len;
      const hw = (n * r * 2.6) / 2 + 0.05;
      if (alongX) b.box('darkMetal', px - 0.06, y - 0.2, pz - hw, px + 0.06, y, pz + hw, false);
      else b.box('darkMetal', px - hw, y - 0.2, pz - 0.06, px + hw, y, pz + 0.06, false);
    }
    const hw = (n * r * 2.6) / 2;
    b.collider(Math.min(ax, bx) - hw, y - 0.2, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, y + 2 * r, Math.max(az, bz) + hw);
  }
}

// Vents: mushroom caps, exhaust stacks, goosenecks and louvred boxes.
export function vent(b, rng, p, y) {
  const kind = rng.weighted([['mushroom', 3], ['stack', 1.5], ['goose', 1.2], ['box', 1]]);
  const f = b.frame(p.x, y, p.z, 0);
  if (kind === 'mushroom') {
    const r = rng.range(0.15, 0.35);
    f.geo('steel', CYL, 0, 0.3, 0, 0, r * 0.6, 0.6, r * 0.6);
    f.geo('steel', CYL, 0, 0.66, 0, 0, r, 0.12, r);
    if (rng.chance(0.2)) steam(b, p.x, y + 0.6, p.z, r, 0.9);
  } else if (kind === 'stack') {
    const h = rng.range(2.2, 5);
    const r = rng.range(0.12, 0.22);
    const puff = rng.chance(0.65);
    for (const s of rng.chance(0.5) ? [-1, 1] : [0]) {
      f.geo('white', CYL, s * r * 1.8, h / 2, 0, 0, r, h, r);
      f.geo('darkMetal', CYL, s * r * 1.8, h + 0.05, 0, 0, r * 1.2, 0.1, r * 1.2);
      if (puff) steam(b, p.x + s * r * 1.8, y + h + 0.1, p.z, r, 1.5);
    }
    f.box('darkMetal', -r * 3, 0, -r, r * 3, 0.3, r);
  } else if (kind === 'goose') {
    const r = rng.range(0.12, 0.2);
    f.geo('steel', CYL, 0, 0.45, 0, 0, r, 0.9, r);
    f.geo('steel', new THREE.TorusGeometry(0.25, r, 8, 12, Math.PI), 0.25, 0.9, 0, 0, 1, 1, 1);
    f.geo('steel', CYL, 0.5, 0.75, 0, 0, r, 0.3, r);
    if (rng.chance(0.3)) steam(b, p.x + 0.5, y + 0.55, p.z, r, 1);
  } else {
    const w = rng.range(0.5, 0.9);
    f.box('white', -w / 2, 0, -w / 2, w / 2, w * 0.8, w / 2);
    f.box('louver', -w / 2 + 0.05, 0.08, w / 2, w / 2 - 0.05, w * 0.7, w / 2 + 0.02);
  }
  b.collider(p.x - 0.4, y, p.z - 0.4, p.x + 0.4, y + 1.2, p.z + 0.4);
}

// Boiler flue: a tall steel chimney on a plinth, braced back to the roof,
// letting off a good plume of steam.
export function flue(b, rng, x, y, z) {
  const h = rng.range(4, 7.5);
  const r = rng.range(0.28, 0.42);
  const f = b.frame(x, y, z, 0);
  f.box('white', -0.8, 0, -0.8, 0.8, 0.5, 0.8, true);
  f.geo('steel', CYL, 0, 0.5 + h / 2, 0, 0, r, h, r);
  for (const t of [0.35, 0.7]) f.geo('darkMetal', CYL, 0, 0.5 + h * t, 0, 0, r * 1.12, 0.12, r * 1.12);
  f.geo('darkMetal', CYL, 0, 0.5 + h + 0.08, 0, 0, r * 1.2, 0.16, r * 1.2);
  for (const a of [0.3, 2.4, 4.5]) b.between('darkMetal', CYL8, f.point(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2), f.point(0, 0.5 + h * 0.7, 0), 0.015);
  b.collider(x - 0.8, y, z - 0.8, x + 0.8, y + 0.5 + h, z + 0.8);
  steam(b, x, y + 0.5 + h + 0.15, z, r, rng.range(1.9, 2.6));
}

// Water tank on steel legs with a conical lid and a ladder.
export function waterTank(b, x, y, z, r, h, key = 'white') {
  const f = b.frame(x, y, z, 0);
  const legs = 1.8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box('darkMetal', sx * r * 0.62 - 0.08, 0, sz * r * 0.62 - 0.08, sx * r * 0.62 + 0.08, legs, sz * r * 0.62 + 0.08);
  f.box('darkMetal', -r * 0.75, legs - 0.2, -r * 0.75, r * 0.75, legs, r * 0.75);
  f.geo(key, CYL, 0, legs + h / 2, 0, 0, r, h, r);
  f.geo('white', new THREE.CylinderGeometry(0.1, 1, 1, 16), 0, legs + h + 0.3, 0, 0, r * 1.04, 0.6, r * 1.04);
  for (let k = 0; k < 2; k++) f.box('darkMetal', -0.25 + k * 0.5 - 0.02, 0, r + 0.08, -0.25 + k * 0.5 + 0.02, legs + h, r + 0.12);
  for (let yy = 0.3; yy < legs + h; yy += 0.3) f.box('darkMetal', -0.25, yy, r + 0.09, 0.25, yy + 0.03, r + 0.11);
  b.collider(x - r, y, z - r, x + r, y + legs + h + 0.6, z + r + 0.2);
}

// Cooling tower: a louvred box with a big fan well on top.
export function coolingTower(b, x, y, z, w, d, h) {
  b.box('white', x - w / 2, y, z - d / 2, x + w / 2, y + 0.4, z + d / 2);
  b.box('louver', x - w / 2, y + 0.4, z - d / 2, x + w / 2, y + h, z + d / 2, true);
  b.box('white', x - w / 2 - 0.05, y + h, z - d / 2 - 0.05, x + w / 2 + 0.05, y + h + 0.3, z + d / 2 + 0.05);
  const r = Math.min(w, d) * 0.4;
  const f = b.frame(x, y + h + 0.3, z, 0);
  f.geo('white', new THREE.CylinderGeometry(1, 1.1, 1, 28, 1, true), 0, 0.5, 0, 0, r, 1, r);
  fan(b, f, 0, 0.6, 0, 0, r * 0.98, true, 2.6);
  steam(b, x, y + h + 1.2, z, r * 0.8, 3);
}

// Rows of tilted solar panels over a rectangle.
export function solarArray(b, x0, z0, x1, z1, y) {
  const rows = Math.max(1, Math.floor((z1 - z0) / 2.4));
  const cols = Math.max(1, Math.floor((x1 - x0) / 1.1));
  for (let j = 0; j < rows; j++) {
    const z = z0 + 1.1 + j * 2.4;
    for (let i = 0; i < cols; i++) {
      const x = x0 + 0.55 + i * 1.1;
      const f = b.frame(x, y, z, 0);
      f.geo('solar', UBOX, 0, 0.75, 0, 0, 1.0, 0.04, 1.7, -0.38);
    }
    b.box('darkMetal', x0 + 0.05, y, z - 0.75, x0 + cols * 1.1 - 0.05, y + 0.45, z - 0.7, false);
    b.box('darkMetal', x0 + 0.05, y, z + 0.7, x0 + cols * 1.1 - 0.05, y + 1.05, z + 0.75, false);
    b.collider(x0, y, z - 0.9, x0 + cols * 1.1, y + 1.2, z + 0.9);
  }
}

// Skylights: glass pyramid, a glazed ridge, or a flat grille on a curb.
export function skylight(b, x, y, z, w, d, kind) {
  b.box('white', x - w / 2, y, z - d / 2, x + w / 2, y + 0.4, z + d / 2);
  if (kind === 'grille') {
    b.box('grate', x - w / 2 + 0.1, y + 0.4, z - d / 2 + 0.1, x + w / 2 - 0.1, y + 0.45, z + d / 2 - 0.1, false);
    return;
  }
  const h = Math.min(w, d) * 0.42;
  const f = b.frame(x, y + 0.4, z, 0);
  if (kind === 'pyramid') {
    const s = Math.min(w, d) - 0.2;
    f.geo('glassRoof', new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4), 0, h / 2, 0, 0, s, h, s);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.between('metal', CYL8, V(x + (sx * s) / 2, y + 0.4, z + (sz * s) / 2), V(x, y + 0.4 + h, z), 0.04);
  } else {
    // Ridge along the longer side.
    const alongX = w >= d;
    const L = (alongX ? w : d) - 0.2;
    const S = (alongX ? d : w) - 0.2;
    // A square tube turned to a diamond: its top half is the glazed ridge,
    // the bottom half disappears into the roof.
    const prism = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateZ(Q);
    f.geo('glassRoof', prism, 0, 0, 0, alongX ? 0 : Q, L, h * Math.SQRT2, S * Math.SQRT1_2);
    const n = Math.max(2, Math.round(L / 1.2));
    for (let k = 0; k <= n; k++) {
      const a = -L / 2 + (L * k) / n;
      const p0 = alongX ? V(x + a, y + 0.4, z - S / 2) : V(x - S / 2, y + 0.4, z + a);
      const p1 = alongX ? V(x + a, y + 0.4 + h, z) : V(x, y + 0.4 + h, z + a);
      const p2 = alongX ? V(x + a, y + 0.4, z + S / 2) : V(x + S / 2, y + 0.4, z + a);
      b.between('metal', CYL8, p0, p1, 0.03);
      b.between('metal', CYL8, p1, p2, 0.03);
    }
  }
  b.collider(x - w / 2, y, z - d / 2, x + w / 2, y + 0.4 + h, z + d / 2);
}

// Antenna mast with sector panels, sometimes a dish beside it.
export function mast(b, rng, x, y, z, h) {
  const f = b.frame(x, y, z, 0);
  f.box('darkMetal', -0.4, 0, -0.4, 0.4, 0.3, 0.4);
  f.geo('steel', CYL8, 0, h / 2, 0, 0, 0.09, h, 0.09);
  const top = h - rng.range(0.8, 2);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    f.geo('white', UBOX, Math.sin(a) * 0.35, top, Math.cos(a) * 0.35, a, 0.3, 1.4, 0.1);
    f.geo('steel', UBOX, Math.sin(a) * 0.18, top, Math.cos(a) * 0.18, a, 0.04, 0.04, 0.35);
  }
  if (rng.chance(0.5)) {
    const dish = new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3);
    f.geo('white', dish, 1.4, 1.4, 0, 0, 1, 1, 1, rng.range(0.9, 1.3), rng.range(0, Math.PI * 2));
    f.geo('steel', CYL8, 1.4, 0.7, 0, 0, 0.05, 1.4, 0.05);
  }
  b.collider(x - 0.45, y, z - 0.45, x + 0.45, y + h, z + 0.45);
}

// ------------------------------------------------------------ access

// Steel stair from (x, y, z) climbing `rise` along local +z. Painted key.
export function stair(b, x, y, z, rot, rise, key, width = 1.2) {
  const n = Math.max(2, Math.round(rise / 0.19));
  const h = rise / n;
  const tread = 0.27;
  const run = n * tread;
  const f = b.frame(x, y, z, rot);
  for (let i = 0; i < n; i++) f.box('grate', -width / 2, (i + 1) * h - 0.04, i * tread, width / 2, (i + 1) * h, (i + 1) * tread + 0.02);
  const L = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  for (const s of [-1, 1]) {
    f.geo(key, UBOX, s * (width / 2 + 0.04), rise / 2 - 0.1, run / 2, 0, 0.06, 0.3, L, -ang);
    f.geo(key, UBOX, s * (width / 2 + 0.04), rise / 2 + 0.95, run / 2, 0, 0.05, 0.05, L, -ang);
    for (let i = 1; i < n; i += 4) f.box(key, s * (width / 2 + 0.04) - 0.025, (i + 1) * h, i * tread, s * (width / 2 + 0.04) + 0.025, (i + 1) * h + 1.0, i * tread + 0.05);
  }
  const p0 = f.point(0, 0, 0);
  const p1 = f.point(0, 0, run);
  for (const s of [-1, 1]) {
    const a = f.point(s * (width / 2 + 0.05), 0, 0);
    const c = f.point(s * (width / 2 + 0.05), 0, run);
    b.chain(a.x, y, a.z, c.x, y + rise, c.z, 0.06, 1.1);
  }
  return { run, bottom: V(p0.x, y, p0.z), top: V(p1.x, y + rise, p1.z) };
}

// Grated steel walkway between two points (axis-aligned), with railings.
export function walkway(b, ax, az, bx, bz, ya, yb, key, width = 1.4) {
  const p = V(ax, ya, az);
  const q = V(bx, yb, bz);
  const len = p.distanceTo(q);
  const f = b.frame(ax, ya, az, Math.atan2(bx - ax, bz - az));
  const ang = Math.atan2(yb - ya, Math.hypot(bx - ax, bz - az));
  f.geo('grate', UBOX, 0, Math.sin(ang) * len * 0.5 - 0.01, Math.cos(ang) * len * 0.5, 0, width, 0.06, len, -ang);
  for (const s of [-1, 1]) {
    f.geo(key, UBOX, s * (width / 2 + 0.04), Math.sin(ang) * len * 0.5 - 0.15, Math.cos(ang) * len * 0.5, 0, 0.08, 0.25, len, -ang);
    f.geo(key, UBOX, s * (width / 2 + 0.04), Math.sin(ang) * len * 0.5 + 1.0, Math.cos(ang) * len * 0.5, 0, 0.05, 0.05, len, -ang);
    for (let t = 0; t <= len; t += 1.5) f.box(key, s * (width / 2 + 0.04) - 0.025, Math.sin(ang) * t, Math.cos(ang) * t - 0.025, s * (width / 2 + 0.04) + 0.025, Math.sin(ang) * t + 1.0, Math.cos(ang) * t + 0.025);
  }
  for (const s of [-1, 1]) {
    const a = f.point(s * (width / 2 + 0.05), 0, 0);
    const c = f.point(s * (width / 2 + 0.05), 0, Math.cos(ang) * len);
    b.chain(a.x, ya, a.z, c.x, yb, c.z, 0.06, 1.1);
  }
}

export function ladder(b, x, y0, z, y1, rot, key) {
  const f = b.frame(x, y0, z, rot);
  const h = y1 - y0;
  for (const s of [-1, 1]) f.box(key, s * 0.24 - 0.025, 0, 0, s * 0.24 + 0.025, h + 1.0, 0.05);
  for (let yy = 0.3; yy < h; yy += 0.3) f.box(key, -0.24, yy, 0.005, 0.24, yy + 0.03, 0.045);
  // Safety hoops.
  for (let yy = 2.4; yy < h + 0.8; yy += 0.9) f.geo(key, new THREE.TorusGeometry(0.4, 0.02, 4, 12, Math.PI), 0, yy, 0.05, 0, 1, 1, 1, Q);
}

// Zipline: cable between two anchor points with posts.
export function zipline(b, p, q, key) {
  for (const a of [p, q]) {
    b.box(key, a.x - 0.1, a.y - 3, a.z - 0.1, a.x + 0.1, a.y + 0.2, a.z + 0.1);
    b.box('darkMetal', a.x - 0.3, a.y - 3, a.z - 0.3, a.x + 0.3, a.y - 2.9, a.z + 0.3, false);
  }
  const mid = p.clone().lerp(q, 0.5);
  mid.y -= p.distanceTo(q) * 0.03;
  b.between('darkMetal', CYL8, p, mid, 0.018);
  b.between('darkMetal', CYL8, mid, q, 0.018);
}

// ------------------------------------------------------------ signs

// Billboard on a steel frame, facing local +z, bottom of the panel at y + legs.
export function billboard(b, x, y, z, rot, w, h, key, legs = 1.6) {
  const f = b.frame(x, y, z, rot);
  f.box('white', -w / 2 - 0.15, legs - 0.15, -0.1, w / 2 + 0.15, legs + h + 0.15, 0.12, true);
  f.geo(key, PLANE, 0, legs + h / 2, 0.125, 0, w, h, 1);
  const n = Math.max(2, Math.round(w / 3));
  for (let k = 0; k <= n; k++) {
    const u = -w / 2 + (w * k) / n;
    f.box('darkMetal', u - 0.08, 0, -0.7, u + 0.08, legs + h, -0.54);
    b.between('darkMetal', CYL8, f.point(u, 0, -2.2), f.point(u, legs + h * 0.6, -0.6), 0.05);
    f.box('darkMetal', u - 0.03, legs + h + 0.15, 0.1, u + 0.03, legs + h + 0.2, 0.9);
    f.box('emissiveSoft', u - 0.2, legs + h + 0.08, 0.8, u + 0.2, legs + h + 0.18, 0.95);
  }
  f.box('darkMetal', -w / 2, legs - 0.5, -0.66, w / 2, legs - 0.35, -0.54);
}

export function helipad(b, x, y, z, r) {
  const f = b.frame(x, y, z, 0);
  f.box('white', -r, 0, -r, r, 0.25, r, true);
  f.geo('helipad', PLANE, 0, 0.26, 0, 0, 2 * r - 0.3, 2 * r - 0.3, 1, -Q);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    f.box('emissiveSoft', Math.cos(a) * (r - 0.3) - 0.06, 0.25, Math.sin(a) * (r - 0.3) - 0.06, Math.cos(a) * (r - 0.3) + 0.06, 0.32, Math.sin(a) * (r - 0.3) + 0.06);
  }
}

// ------------------------------------------------------------ gardens

// Catalyst-style tree: a dark twisting trunk and a pink blossom crown.
export function blossomTree(b, rng, x, y, z, h) {
  let p = V(x, y, z);
  const trunkTop = V(x + rng.range(-0.6, 0.6), y + h * 0.55, z + rng.range(-0.6, 0.6));
  b.between('trunk', CYL8, p, trunkTop, 0.12);
  // Branches fork twice; blossom gathers in many small puffs along them.
  const crown = [];
  for (let k = 0; k < rng.int(3, 5); k++) {
    const a = rng.range(0, Math.PI * 2);
    const q = V(trunkTop.x + Math.cos(a) * h * 0.3, trunkTop.y + rng.range(0.22, 0.36) * h, trunkTop.z + Math.sin(a) * h * 0.3);
    b.between('trunk', CYL8, trunkTop, q, 0.07);
    crown.push(q);
    for (let j = 0; j < 2; j++) {
      const a2 = a + rng.range(-0.9, 0.9);
      const q2 = V(q.x + Math.cos(a2) * h * 0.18, q.y + rng.range(0.06, 0.16) * h, q.z + Math.sin(a2) * h * 0.18);
      b.between('trunk', CYL8, q, q2, 0.035);
      crown.push(q2);
    }
  }
  for (const q of crown) {
    for (let k = 0; k < 4; k++) {
      const r = rng.range(0.5, 0.9) * h * 0.075;
      p = V(q.x + rng.range(-0.6, 0.6), q.y + rng.range(-0.25, 0.35), q.z + rng.range(-0.6, 0.6));
      const g = BALL.clone().scale(r * 1.4, r, r * 1.4).translate(p.x, p.y, p.z);
      b.push(rng.chance(0.65) ? 'blossom' : 'blossom2', g);
    }
  }
  b.collider(x - 0.3, y, z - 0.3, x + 0.3, y + h, z + 0.3);
}

// ------------------------------------------------------------ cranes

// Tower crane: lattice-look mast, jib and counter-jib, cab and hook.
export function crane(b, rng, x, y, z, h, key) {
  const m = 1.8;
  b.box(key, x - m / 2, y, z - m / 2, x + m / 2, y + h, z + m / 2, false);
  for (let yy = y + 2; yy < y + h; yy += 3) b.box('darkMetal', x - m / 2 - 0.02, yy, z - m / 2 - 0.02, x + m / 2 + 0.02, yy + 0.15, z + m / 2 + 0.02, false);
  const rot = rng.range(0, Math.PI * 2);
  const jib = rng.range(40, 60);
  const cj = jib * 0.3;
  const f = b.frame(x, y + h, z, rot);
  f.box(key, -0.8, 0, -1.4, 0.8, 1.6, jib);
  f.box(key, -0.8, 0, -cj, 0.8, 1.6, -1.4);
  f.box('concrete', -1.4, -1.8, -cj + 0.2, 1.4, 0.2, -cj + 3);
  f.box('white', -1.2, -2.6, -1.4, 1.2, -0.05, 1.2);
  f.box('glassDark', -1.21, -2.2, 0.6, 1.21, -0.6, 1.21);
  f.box(key, -0.5, 1.6, -0.5, 0.5, 6, 0.5);
  b.between('darkMetal', CYL8, f.point(0, 6, 0), f.point(0, 1.6, jib), 0.04);
  b.between('darkMetal', CYL8, f.point(0, 6, 0), f.point(0, 1.6, -cj), 0.04);
  const hookZ = jib * rng.range(0.4, 0.9);
  const hy = rng.range(8, h * 0.6);
  b.between('darkMetal', CYL8, f.point(0, 0, hookZ), f.point(0, -hy, hookZ), 0.02);
  f.box('runner', -0.3, -hy - 0.8, hookZ - 0.3, 0.3, -hy, hookZ + 0.3);
}

// ------------------------------------------------------------ structure

// Straight (axis-aligned) railing on a deck edge at height y: posts, top and
// knee rails, a toe board.
export function railing(b, ax, az, bx, bz, y, key) {
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
  if (len < 0.2) return;
  const n = Math.max(1, Math.round(len / 1.3));
  for (let k = 0; k <= n; k++) {
    const px = ax + ((bx - ax) * k) / n;
    const pz = az + ((bz - az) * k) / n;
    b.box(key, px - 0.025, y, pz - 0.025, px + 0.025, y + 1.05, pz + 0.025, false);
  }
  const [x0, x1, z0, z1] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz)];
  const t = (w) => (alongX ? [x0, x1, az - w, az + w] : [ax - w, ax + w, z0, z1]);
  for (const [ya, yb, w] of [[y + 1.0, y + 1.06, 0.03], [y + 0.5, y + 0.54, 0.02], [y + 0.02, y + 0.12, 0.012]]) {
    const [a0, a1, c0, c1] = t(w);
    b.box(key, a0, ya, c0, a1, yb, c1, false);
  }
  const [a0, a1, c0, c1] = t(0.05);
  b.collider(a0, y, c0, a1, y + 1.06, c1);
}

// A steel stair from floorY up to a deck edge: (x, z) is the middle of the
// top step on the edge, `out` the direction the stair runs away from the
// deck ('N', 'S', 'W' or 'E'). Returns the foot of the stair.
export function stairTo(b, x, z, out, floorY, topY, key, width = 1.0) {
  const rise = topY - floorY;
  const run = Math.max(2, Math.round(rise / 0.19)) * 0.27;
  const [ox, oz] = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[out];
  const rot = { N: 0, S: Math.PI, W: Q, E: -Q }[out];
  const sx = x + ox * run;
  const sz = z + oz * run;
  stair(b, sx, floorY, sz, rot, rise, key, width);
  return V(sx + ox * 0.8, floorY, sz + oz * 0.8);
}

// Steel equipment platform: grating deck on legs and a beam frame, railings
// round the open sides, a stair down from one side. Returns the deck height.
export function platform(b, x0, z0, x1, z1, y, h, key, stairSide = null, rails = ['N', 'S', 'W', 'E']) {
  const top = y + h;
  const nx = Math.max(1, Math.ceil((x1 - x0) / 3));
  const nz = Math.max(1, Math.ceil((z1 - z0) / 3));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz) continue;
      const px = x0 + 0.12 + ((x1 - x0 - 0.24) * i) / nx;
      const pz = z0 + 0.12 + ((z1 - z0 - 0.24) * j) / nz;
      b.box('darkMetal', px - 0.06, y, pz - 0.06, px + 0.06, top - 0.26, pz + 0.06, false);
      b.box('darkMetal', px - 0.14, y, pz - 0.14, px + 0.14, y + 0.03, pz + 0.14, false);
    }
  }
  b.box('darkMetal', x0, top - 0.26, z0, x1, top - 0.06, z0 + 0.12, false);
  b.box('darkMetal', x0, top - 0.26, z1 - 0.12, x1, top - 0.06, z1, false);
  b.box('darkMetal', x0, top - 0.26, z0 + 0.12, x0 + 0.12, top - 0.06, z1 - 0.12, false);
  b.box('darkMetal', x1 - 0.12, top - 0.26, z0 + 0.12, x1, top - 0.06, z1 - 0.12, false);
  b.box('grate', x0, top - 0.06, z0, x1, top, z1, false);
  b.collider(x0, y, z0, x1, top, z1);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const edges = { N: [x0, z0, x1, z0], S: [x0, z1, x1, z1], W: [x0, z0, x0, z1], E: [x1, z0, x1, z1] };
  for (const e of rails) {
    const [ax, az, bx, bz] = edges[e];
    if (e === stairSide) {
      // Leave a gap for the stair in the middle of this side.
      const alongX = e === 'N' || e === 'S';
      const m = alongX ? cx : cz;
      if (alongX) {
        railing(b, ax, az, m - 0.6, bz, top, key);
        railing(b, m + 0.6, az, bx, bz, top, key);
      } else {
        railing(b, ax, az, bx, m - 0.6, top, key);
        railing(b, ax, m + 0.6, bx, bz, top, key);
      }
    } else railing(b, ax, az, bx, bz, top, key);
  }
  if (stairSide) {
    const p = { N: [cx, z0], S: [cx, z1], W: [x0, cz], E: [x1, cz] }[stairSide];
    stairTo(b, p[0], p[1], stairSide, y, top, key);
  }
  return top;
}

// Chain-link fence along [[x, z], ...] at roof height y: galvanised posts
// about every 2.4 m, top and bottom rails and the see-through mesh. Segments
// listed in `open` are left as gates.
export function fence(b, pts, y, h = 2.0, open = []) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) continue;
    const n = Math.max(1, Math.round(len / 2.4));
    for (let k = i > 0 ? 1 : 0; k <= n; k++) {
      const px = ax + ((bx - ax) * k) / n;
      const pz = az + ((bz - az) * k) / n;
      b.between('steel', CYL8, V(px, y, pz), V(px, y + h + 0.06, pz), 0.035);
    }
    if (open.includes(i)) continue;
    b.between('steel', CYL8, V(ax, y + h, az), V(bx, y + h, bz), 0.02);
    b.between('steel', CYL8, V(ax, y + 0.08, az), V(bx, y + 0.08, bz), 0.015);
    const mh = h - 0.12;
    const g = new THREE.PlaneGeometry(len, mh);
    const uv = g.attributes.uv;
    for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) * len) / 0.6, (uv.getY(v) * mh) / 0.6);
    const m = new THREE.Matrix4().compose(V((ax + bx) / 2, y + 0.08 + mh / 2, (az + bz) / 2), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(-(bz - az), bx - ax)), V(1, 1, 1));
    b.matrix('chainLink', g, m);
    b.collider(Math.min(ax, bx) - 0.05, y, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, y + h, Math.max(az, bz) + 0.05);
  }
}

// Air handling unit: a long cabinet on base rails, a louvred intake under a
// rain hood at one end, access panels, and the supply duct leaving its top.
// Local +x runs along it. Returns the world point where the duct starts.
export function ahu(b, rng, x, y, z, rot, L, W, H) {
  const f = b.frame(x, y, z, rot);
  f.box('darkMetal', -L / 2, 0, -W / 2 + 0.1, L / 2, 0.22, -W / 2 + 0.28);
  f.box('darkMetal', -L / 2, 0, W / 2 - 0.28, L / 2, 0.22, W / 2 - 0.1);
  f.box('cabinet', -L / 2, 0.22, -W / 2, L / 2, H, W / 2, true);
  f.box('metal', -L / 2 - 0.04, H, -W / 2 - 0.04, L / 2 + 0.04, H + 0.07, W / 2 + 0.04);
  f.box('louver', -L / 2 - 0.05, 0.5, -W / 2 + 0.2, -L / 2, H - 0.3, W / 2 - 0.2);
  f.box('cabinet', -L / 2 - 0.6, H - 0.55, -W / 2 + 0.1, -L / 2, H - 0.2, W / 2 - 0.1);
  // Section joints.
  const n = Math.max(1, Math.round(L / 1.8));
  for (let k = 1; k < n; k++) f.box('darkMetal', -L / 2 + (L * k) / n - 0.03, 0.22, -W / 2 - 0.03, -L / 2 + (L * k) / n + 0.03, H, W / 2 + 0.03);
  // Exhaust fan hood on top.
  if (rng.chance(0.6)) {
    const fx = -L / 2 + L * 0.3;
    f.geo('metal', CYL, fx, H + 0.3, 0, 0, W * 0.3, 0.5, W * 0.3);
    f.geo('metal', new THREE.ConeGeometry(1, 1, 16), fx, H + 0.75, 0, 0, W * 0.36, 0.4, W * 0.36);
  }
  return f.point(L / 2 - Math.min(W, L / 3) * 0.6, H + 0.07, 0).setY(y + H + 0.07);
}

// Packaged rooftop unit: a cabinet with two or three fans on top behind
// guards and a condenser coil grille along one side.
export function rtu(b, rng, x, y, z, rot, L, W, H) {
  const f = b.frame(x, y, z, rot);
  f.box('darkMetal', -L / 2 + 0.1, 0, -W / 2 + 0.1, L / 2 - 0.1, 0.15, W / 2 - 0.1);
  f.box('cabinet', -L / 2, 0.15, -W / 2, L / 2, H, W / 2, true);
  f.box('louver', L / 2 - L * 0.45, 0.35, W / 2, L / 2 - 0.15, H - 0.25, W / 2 + 0.03);
  const n = L > 3 ? 3 : 2;
  const r = Math.min(W * 0.36, (L / n) * 0.38);
  for (let k = 0; k < n; k++) {
    const fx = -L / 2 + (L * (k + 0.5)) / n;
    f.geo('white', new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), fx, H + 0.1, 0, 0, r + 0.04, 0.24, r + 0.04);
    fan(b, f, fx, H + 0.1, 0, 0, r, true, 5 + k);
  }
}

// Rectangular duct along an axis-aligned 3D polyline, w wide and h tall
// (w x w when rising), with flanged joints, elbows at the turns and steel
// supports under the horizontal runs. Each corner is filled by the segment
// arriving at it, so no two parts overlap.
export function ductRun(b, pts, floorY, w, h, key = 'galv') {
  // Half-size of a segment's cross-section along axis k (risers are w x w).
  const hsOf = (segAxis, k) => (segAxis === 1 ? w / 2 : k === 1 ? h / 2 : w / 2);
  const axes = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    axes.push(Math.abs(q.x - p.x) > 1e-6 ? 0 : Math.abs(q.y - p.y) > 1e-6 ? 1 : 2);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const axis = axes[i];
    const lo = [p.x, p.y, p.z];
    const hi = [q.x, q.y, q.z];
    const s = Math.sign(hi[axis] - lo[axis]);
    // The segment arriving at a corner fills it; the next starts after it.
    if (i > 0) lo[axis] += s * hsOf(axes[i - 1], axis);
    if (i < pts.length - 2) hi[axis] += s * hsOf(axes[i + 1], axis);
    const hs = [0, 1, 2].map((k) => hsOf(axis, k));
    const box = (a, c, pad, key2, collide) => {
      const mn = [0, 1, 2].map((k) => (k === axis ? Math.min(a[k], c[k]) : a[k] - hs[k] - pad));
      const mx = [0, 1, 2].map((k) => (k === axis ? Math.max(a[k], c[k]) : a[k] + hs[k] + pad));
      b.box(key2, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], collide);
    };
    box(lo, hi, 0, key, true);
    const len = Math.abs(hi[axis] - lo[axis]);
    const nf = Math.floor(len / 1.5);
    for (let k = 1; k <= nf; k++) {
      const c = [...lo];
      c[axis] = lo[axis] + s * ((len * k) / (nf + 1));
      const c2 = [...c];
      c[axis] -= 0.03;
      c2[axis] += 0.03;
      box(c, c2, 0.035, 'metal', false);
    }
    // Supports under horizontal runs.
    const bottom = p.y - h / 2;
    if (axis !== 1 && bottom > floorY + 0.4) {
      const side = axis === 0 ? 2 : 0;
      const ns = Math.max(1, Math.round(len / 2.6));
      for (let k = 0; k < ns; k++) {
        const c = [...lo];
        c[axis] = lo[axis] + s * len * ((k + 0.5) / ns);
        for (const sg of [-1, 1]) {
          const at = [...c];
          at[side] += sg * (w / 2 + 0.09);
          b.box('steel', at[0] - 0.035, floorY, at[2] - 0.035, at[0] + 0.035, bottom - 0.08, at[2] + 0.035);
        }
        const mn = [0, 0, 0];
        const mx = [0, 0, 0];
        mn[axis] = c[axis] - 0.04;
        mx[axis] = c[axis] + 0.04;
        mn[side] = c[side] - w / 2 - 0.14;
        mx[side] = c[side] + w / 2 + 0.14;
        b.box('steel', mn[0], bottom - 0.08, mn[2], mx[0], bottom, mx[2], false);
      }
    }
  }
}

// Pipes side by side along an axis-aligned path [[x, z], ...] with their
// centres at yc, turning together at the corners, on T-shaped stands. At the
// start they drop into a curb on the roof; at the end they can rise (up a
// wall) to endRise. pipes: [{ r, key }].
export function pipeRack(b, pts, floorY, yc, pipes, { startDrop = true, endRise = null } = {}) {
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = clean[clean.length - 1];
    const [bx, bz] = pts[i];
    if (Math.hypot(bx - ax, bz - az) < 0.05) continue;
    if (clean.length >= 2) {
      const [px, pz] = clean[clean.length - 2];
      if ((Math.abs(px - ax) < 1e-6 && Math.abs(ax - bx) < 1e-6) || (Math.abs(pz - az) < 1e-6 && Math.abs(az - bz) < 1e-6)) clean.pop();
    }
    clean.push(pts[i]);
  }
  if (clean.length < 2) return;
  const gap = 0.07;
  const total = pipes.reduce((a, p) => a + 2 * p.r, 0) + gap * (pipes.length - 1);
  const rmax = Math.max(...pipes.map((p) => p.r));
  const dirs = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const dx = clean[i + 1][0] - clean[i][0];
    const dz = clean[i + 1][1] - clean[i][1];
    const l = Math.hypot(dx, dz);
    dirs.push([dx / l, dz / l]);
  }
  const nrm = (d) => [-d[1], d[0]];
  let cursor = -total / 2;
  for (const pp of pipes) {
    const o = cursor + pp.r;
    cursor += 2 * pp.r + gap;
    const geo = pp.r > 0.09 ? CYL : CYL8;
    const path = clean.map((c, i) => {
      const n0 = nrm(dirs[Math.max(0, i - 1)]);
      const n1 = nrm(dirs[Math.min(dirs.length - 1, i)]);
      const nn = i === 0 ? n1 : i === clean.length - 1 ? n0 : [n0[0] + n1[0], n0[1] + n1[1]];
      return V(c[0] + nn[0] * o, yc, c[1] + nn[1] * o);
    });
    for (let i = 0; i < path.length - 1; i++) b.between(pp.key, geo, path[i], path[i + 1], pp.r);
    for (let i = 1; i < path.length - 1; i++) b.matrix(pp.key, BALL, _m.compose(path[i], new THREE.Quaternion(), V(pp.r * 1.05, pp.r * 1.05, pp.r * 1.05)));
    if (startDrop) {
      b.between(pp.key, geo, V(path[0].x, floorY + 0.2, path[0].z), path[0], pp.r);
      b.matrix(pp.key, BALL, _m.compose(path[0], new THREE.Quaternion(), V(pp.r * 1.05, pp.r * 1.05, pp.r * 1.05)));
    }
    if (endRise !== null) {
      const e = path[path.length - 1];
      b.between(pp.key, geo, e, V(e.x, endRise, e.z), pp.r);
      b.matrix(pp.key, BALL, _m.compose(e, new THREE.Quaternion(), V(pp.r * 1.05, pp.r * 1.05, pp.r * 1.05)));
    }
  }
  // Curb where they drop through the roof.
  if (startDrop) {
    const [sx, sz] = clean[0];
    const n0 = nrm(dirs[0]);
    const hw = total / 2 + 0.12;
    const ex = Math.abs(n0[0]) * hw + 0.2;
    const ez = Math.abs(n0[1]) * hw + 0.2;
    b.box('white', sx - ex, floorY, sz - ez, sx + ex, floorY + 0.22, sz + ez);
  }
  // Stands and colliders along each run.
  for (let i = 0; i < clean.length - 1; i++) {
    const [ax, az] = clean[i];
    const [bx, bz] = clean[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.6));
    const n0 = nrm(dirs[i]);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const top = yc - rmax - 0.02;
      b.box('darkMetal', px - 0.04, floorY, pz - 0.04, px + 0.04, top - 0.05, pz + 0.04, false);
      const hw = total / 2 + 0.1;
      const ex = Math.abs(n0[0]) * hw + Math.abs(dirs[i][0]) * 0.04;
      const ez = Math.abs(n0[1]) * hw + Math.abs(dirs[i][1]) * 0.04;
      b.box('darkMetal', px - ex, top - 0.05, pz - ez, px + ex, top, pz + ez, false);
      b.box('darkMetal', px - 0.12, floorY, pz - 0.12, px + 0.12, floorY + 0.03, pz + 0.12, false);
    }
    const hw = total / 2 + 0.1;
    b.collider(Math.min(ax, bx) - hw * Math.abs(n0[0]) - 0.1, floorY, Math.min(az, bz) - hw * Math.abs(n0[1]) - 0.1, Math.max(ax, bx) + hw * Math.abs(n0[0]) + 0.1, yc + rmax, Math.max(az, bz) + hw * Math.abs(n0[1]) + 0.1);
  }
}

// Switchback fire escape on a wall: one flight per storey running along the
// wall, landings at alternate ends, railings, brackets back to the wall and a
// door at the top. Local +z points out of the wall. Returns its length.
export function fireEscape(b, x, y0, z, rot, floors, key, S = 3.4) {
  const n = Math.round(S / 0.19);
  const run = n * 0.27;
  const Lg = 1.3;
  const L = run + 2 * Lg;
  const depth = 1.25;
  const f = b.frame(x, y0, z, rot);
  for (let k = 0; k < floors; k++) {
    const fromA = k % 2 === 0;
    const sx = fromA ? -L / 2 + Lg : L / 2 - Lg;
    const p = f.point(sx, 0, depth / 2 + 0.05);
    stair(b, p.x, y0 + k * S, p.z, rot + (fromA ? Q : -Q), S, key, 1.0);
    const y = (k + 1) * S;
    const [a0, a1] = fromA ? [L / 2 - Lg, L / 2] : [-L / 2, -L / 2 + Lg];
    f.box('grate', a0, y - 0.06, 0.05, a1, y, depth + 0.1, true);
    f.box(key, a0, y - 0.2, depth, a1, y - 0.06, depth + 0.1);
    // Railings round the open sides of the landing.
    const q0 = f.point(a0, 0, depth + 0.1);
    const q1 = f.point(a1, 0, depth + 0.1);
    railing(b, q0.x, q0.z, q1.x, q1.z, y0 + y, key);
    const endX = fromA ? a1 : a0;
    const e0 = f.point(endX, 0, 0.08);
    const e1 = f.point(endX, 0, depth + 0.1);
    railing(b, e0.x, e0.z, e1.x, e1.z, y0 + y, key);
    for (const bx of [a0 + 0.15, a1 - 0.15]) b.between('darkMetal', CYL8, f.point(bx, y - 1.0, 0.02), f.point(bx, y - 0.1, depth - 0.1), 0.03);
    if (k === floors - 1) {
      const dx = fromA ? a0 + 0.3 : a1 - 1.2;
      f.box('darkMetal', dx, y, 0, dx + 0.9, y + 2.15, 0.06);
      f.box('emissiveWarm', dx + 0.35, y + 2.3, 0.02, dx + 0.55, y + 2.4, 0.12);
    }
  }
  return L;
}

// Tube-and-coupler scaffold against a wall (local +z out of the wall), len
// along local x and h tall: standards, ledgers and transoms every 2 m lift,
// diagonal bracing on the face, boards and toe boards on some lifts.
export function scaffold(b, rng, x, y0, z, rot, len, h) {
  const f = b.frame(x, y0, z, rot);
  const zi = 0.3;
  const zo = 1.55;
  const bays = Math.max(1, Math.round(len / 2.1));
  const bw = len / bays;
  const lifts = Math.max(1, Math.floor(h / 2));
  const top = lifts * 2 + 1.1;
  const tube = (a, c) => b.between('steel', CYL8, a, c, 0.024);
  for (let i = 0; i <= bays; i++) {
    const xx = -len / 2 + i * bw;
    for (const zz of [zi, zo]) {
      tube(f.point(xx, 0, zz), f.point(xx, top, zz));
      f.box('darkMetal', xx - 0.08, 0, zz - 0.08, xx + 0.08, 0.02, zz + 0.08);
    }
    for (let l = 1; l <= lifts; l++) tube(f.point(xx, l * 2, zi - 0.12), f.point(xx, l * 2, zo + 0.12));
  }
  for (let l = 1; l <= lifts; l++) {
    for (const zz of [zi, zo]) tube(f.point(-len / 2 - 0.1, l * 2, zz), f.point(len / 2 + 0.1, l * 2, zz));
    tube(f.point(-len / 2, l * 2 + 1.0, zo), f.point(len / 2, l * 2 + 1.0, zo));
    if (l % 2 === 0 || l === lifts) {
      f.box('planks', -len / 2, l * 2 + 0.03, zi - 0.05, len / 2, l * 2 + 0.08, zo + 0.05);
      f.box('planks', -len / 2, l * 2 + 0.08, zo, len / 2, l * 2 + 0.23, zo + 0.04);
    }
  }
  for (let i = 0; i < bays; i++) {
    const xa = -len / 2 + i * bw;
    const up = i % 2 === 0;
    for (let l = 0; l < lifts; l += 2) tube(f.point(up ? xa : xa + bw, l * 2, zo + 0.05), f.point(up ? xa + bw : xa, Math.min(top, l * 2 + 4), zo + 0.05));
  }
  f.collide(-len / 2, 0, zi - 0.1, len / 2, top, zo + 0.15);
}

// Split-system unit on wall brackets with its pipe cover running down the
// wall. Local +z points out of the wall.
export function wallAC(b, x, y, z, rot) {
  const f = b.frame(x, y, z, rot);
  for (const s of [-0.32, 0.32]) {
    f.box('darkMetal', s - 0.025, -0.06, 0.02, s + 0.025, 0, 0.44);
    b.between('darkMetal', CYL8, f.point(s, -0.45, 0.02), f.point(s, -0.03, 0.4), 0.018);
  }
  f.box('white', -0.43, 0, 0.07, 0.43, 0.6, 0.4);
  fan(b, f, -0.1, 0.3, 0.415, 0, 0.21, false, 8);
  f.box('louver', 0.17, 0.08, 0.4, 0.38, 0.52, 0.415);
  f.box('white', 0.28, -1.6, 0.03, 0.36, 0.05, 0.1);
}

// Step-over: a little deck with a steel stair up each side, crossing a pipe
// run that lies along local x.
export function stepOver(b, x, y, z, rot, h, key) {
  const f = b.frame(x, y, z, rot);
  f.box('grate', -0.55, h - 0.05, -0.5, 0.55, h, 0.5);
  for (const s of [-0.55, 0.55]) {
    const a = f.point(s, 0, -0.5);
    const c = f.point(s, 0, 0.5);
    railing(b, a.x, a.z, c.x, c.z, y + h, key);
  }
  const p0 = f.point(0, 0, -0.5);
  const p1 = f.point(0, 0, 0.5);
  const out = (dz) => {
    const d = f.point(0, 0, dz).sub(f.point(0, 0, 0));
    return Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 'E' : 'W') : d.z > 0 ? 'S' : 'N';
  };
  stairTo(b, p0.x, p0.z, out(-1), y, y + h, key, 0.9);
  stairTo(b, p1.x, p1.z, out(1), y, y + h, key, 0.9);
}

// A billboard fixed flat to a wall, on stand-off brackets, lamps above.
// Local +z points out of the wall; the panel faces +z.
export function wallBoard(b, x, y, z, rot, w, h, key) {
  const f = b.frame(x, y, z, rot);
  f.box('white', -w / 2 - 0.12, -0.12, 0.25, w / 2 + 0.12, h + 0.12, 0.4);
  f.geo(key, PLANE, 0, h / 2, 0.405, 0, w, h, 1);
  const n = Math.max(2, Math.round(w / 3));
  for (let k = 0; k <= n; k++) {
    const u = -w / 2 + (w * k) / n;
    f.box('darkMetal', u - 0.05, -0.1, 0, u + 0.05, h + 0.1, 0.25);
    f.box('darkMetal', u - 0.03, h + 0.12, 0.3, u + 0.03, h + 0.17, 1.1);
    f.box('emissiveSoft', u - 0.2, h + 0.06, 1.0, u + 0.2, h + 0.16, 1.15);
  }
}
