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
