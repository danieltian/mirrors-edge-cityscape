import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Mall pieces: gallery fascias and railings along arbitrary segments,
// banded columns, escalators, the space-frame skylight, hanging banners and
// glass-tube chandeliers, white trees and fronds, a ribbon sculpture,
// lightboxes, billboards, shopfronts and small street furniture.

const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const UBOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const LEAF = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const BALL = new THREE.IcosahedronGeometry(1, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rbCache = new Map();
function rbox(w, h, d, r) {
  const k = [w, h, d, r].map((v) => v.toFixed(2)).join();
  if (!rbCache.has(k)) rbCache.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)));
  return rbCache.get(k);
}

// Frame along a horizontal segment: local x runs p -> q, local z is the
// left normal (-dz, dx).
export function segFrame(b, p, q, y) {
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  const len = Math.hypot(dx, dz);
  return { f: b.frame(p[0], y, p[1], Math.atan2(-dz, dx)), len, ux: dx / len, uz: dz / len, nx: -dz / len, nz: dx / len };
}

// Fascia along a slab edge; `side` = +1 when the void lies on the segment's
// left. Styles: accent with a black stripe (the classic), accent with two
// thin lines, white with an accent band, black with an accent band, or a
// slim accent edge.
export const FASCIA = {
  stripe: { depth: 1.35, face: 'accentGloss', bands: [['blackGloss', -0.9, -0.62]] },
  double: { depth: 1.35, face: 'accentGloss', bands: [['blackGloss', -1.0, -0.92], ['blackGloss', -0.6, -0.52]] },
  white: { depth: 1.2, face: 'whiteGloss', bands: [['accentGloss', -0.85, -0.45], ['blackGloss', -0.42, -0.36]] },
  black: { depth: 1.25, face: 'blackGloss', bands: [['accentGloss', -0.78, -0.58]] },
  slim: { depth: 0.62, face: 'accentGloss', bands: [['blackGloss', -0.5, -0.44]] },
};
export function fascia(b, p, q, y, side, style = 'stripe') {
  const st = FASCIA[style] || FASCIA.stripe;
  const { f, len } = segFrame(b, p, q, y);
  const s = side;
  const o = (a, c) => [Math.min(a * s, c * s), Math.max(a * s, c * s)];
  const [a0, a1] = o(-0.02, 0.24);
  f.box(st.face, -0.12, -st.depth, a0, len + 0.12, 0.05, a1);
  for (const [key, y0, y1] of st.bands) {
    const [b0, b1] = o(0.24, 0.26);
    f.box(key, -0.12, y0, b0, len + 0.12, y1, b1);
  }
  const [c0, c1] = o(-0.4, 0.24);
  f.box('white', -0.12, -st.depth - 0.07, c0, len + 0.12, -st.depth, c1);
}

// Railing on a slab edge: black posts and rounded handrail, glass infill.
export function railing(b, p, q, y, side, style = 'glass') {
  const { f, len, nx, nz } = segFrame(b, p, q, y);
  if (len < 0.3) return;
  const inset = -side * 0.12;
  const n = Math.max(1, Math.ceil(len / 1.4));
  for (let i = 0; i <= n; i++) {
    const a = (len * i) / n;
    f.box('black', a - 0.025, 0, inset - 0.025, a + 0.025, 1.05, inset + 0.025);
  }
  const hx0 = p[0] + nx * inset;
  const hz0 = p[1] + nz * inset;
  const hx1 = q[0] + nx * inset;
  const hz1 = q[1] + nz * inset;
  b.between('blackGloss', CYL, V(hx0, y + 1.08, hz0), V(hx1, y + 1.08, hz1), 0.035);
  if (style === 'glass') f.box('glass', 0, 0.06, inset - 0.008, len, 0.98, inset + 0.008);
  else if (style === 'solid') f.box('parapet', -0.03, 0, inset - 0.05, len + 0.03, 1.02, inset + 0.05);
  else for (const h of [0.35, 0.65]) b.between('black', CYL6, V(hx0, y + h, hz0), V(hx1, y + h, hz1), 0.012);
  const axisAligned = Math.abs(p[0] - q[0]) < 1e-3 || Math.abs(p[1] - q[1]) < 1e-3;
  if (axisAligned) b.collider(Math.min(hx0, hx1) - 0.05, y, Math.min(hz0, hz1) - 0.05, Math.max(hx0, hx1) + 0.05, y + 1.1, Math.max(hz0, hz1) + 0.05);
  else b.chain(hx0, y, hz0, hx1, y, hz1, 0.08, 1.1);
}

// Columns: white with an accent band (the classic), mosaic-tiled, plain
// white, or accent with a white band; black base and capital.
export function column(b, x, z, y0, y1, r, round, scheme = 'band') {
  const f = b.frame(x, y0, z, 0);
  const h = y1 - y0;
  const seg = (key, a, c, grow = 0) => {
    if (c <= a) return;
    if (round) f.geo(key, CYL, 0, (a + c) / 2, 0, 0, r + grow, c - a, r + grow);
    else f.geo(key, rbox(2 * (r + grow), c - a, 2 * (r + grow), 0.04), 0, (a + c) / 2, 0);
  };
  const body = { band: 'white', tiled: 'mosaic', plain: 'white', accent: 'accentGloss' }[scheme] || 'white';
  const band = { band: 'accentGloss', accent: 'white', tiled: 'mosaic', plain: 'white' }[scheme] || 'accentGloss';
  seg('black', 0, 0.22, 0.03);
  seg(body, 0.22, 1.5);
  seg(band, 1.5, 2.6, scheme === 'band' || scheme === 'accent' ? 0.006 : 0);
  seg(body, 2.6, h - 0.7);
  seg('blackGloss', h - 0.7, h, 0.06);
  b.collider(x - r, y0, z - r, x + r, y1, z + r);
}

// Escalator unit along x from x0 (bottom) in direction dir, centred on z.
// Returns the path a rider's eye would follow.
export function escalator(b, x0, y0, z, dir, rise, run, land, keys = {}) {
  const f = b.frame(x0, y0, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2); // local +z = travel
  const w = 1.3;
  const L = run + 2 * land;
  // Truss body: side profile extruded across the width.
  const sh = new THREE.Shape();
  // Landings stand a little proud of the floor so they never share its plane.
  const lip = 0.012;
  sh.moveTo(0, lip);
  sh.lineTo(land, lip);
  sh.lineTo(land + run, rise + lip);
  sh.lineTo(L, rise + lip);
  sh.lineTo(L, rise - 1.1);
  sh.lineTo(land + run + 0.5, rise - 1.1);
  sh.lineTo(land + 0.5, -1.1);
  sh.lineTo(0, -1.1);
  const body = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 1 });
  // Profile is in (z, y); the extrusion runs across local x.
  f.geo(keys.body || 'accentGloss', body, w / 2, 0, 0, -Math.PI / 2);
  body.dispose();
  // Steps and landing plates.
  const n = Math.round(run / 0.4);
  const sd = run / n;
  const sr = rise / n;
  // Continuous dark steps (tread + riser) in a channel with dark skirts.
  for (let i = 0; i < n; i++) {
    f.box('steps', -0.5, i * sr - 0.05, land + i * sd, 0.5, (i + 1) * sr + 0.02, land + (i + 1) * sd + 0.01);
    f.box('stepEdge', -0.5, (i + 1) * sr + 0.02, land + i * sd, 0.5, (i + 1) * sr + 0.03, land + i * sd + 0.04);
  }
  for (const s of [-1, 1]) f.geo('blackGloss', UBOX, s * 0.53, rise / 2 + 0.1, land + run / 2, 0, 0.06, 0.22, Math.hypot(run, rise), -Math.atan2(rise, run));
  f.box('metal', -0.55, 0, 0.01, 0.55, 0.03, land);
  f.box('metal', -0.55, rise, land + run, 0.55, rise + 0.03, L - 0.01);
  // Balustrades with handrails, sloped between the landings.
  const ang = Math.atan2(rise, run);
  const slope = Math.hypot(run, rise);
  const sideKey = keys.side || 'accentGloss';
  const sideW = sideKey === 'glass' ? 0.015 : 0.06;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.06);
    f.box(sideKey, x - sideW, 0, 0.3, x + sideW, 0.95, land);
    f.box(sideKey, x - sideW, rise, land + run, x + sideW, rise + 0.95, L - 0.3);
    f.geo(sideKey, UBOX, x, rise / 2 + 0.475, land + run / 2, 0, sideW * 2, 0.95, slope + 0.02, -ang);
    if (sideKey === 'glass') f.geo(keys.body || 'accentGloss', UBOX, x, rise / 2 + 0.05, land + run / 2, 0, 0.14, 0.14, slope + 0.02, -ang);
    f.geo('blackGloss', UBOX, x, rise / 2 + 1.0, land + run / 2, 0, 0.1, 0.08, slope, -ang);
    f.box('blackGloss', x - 0.05, 0.96, 0.25, x + 0.05, 1.04, land);
    f.box('blackGloss', x - 0.05, rise + 0.96, land + run, x + 0.05, rise + 1.04, L - 0.25);
    // Rounded newel ends.
    f.geo('blackGloss', CYL, x, 0.5, 0.3, 0, 0.05, 1.04, 0.05);
    f.geo('blackGloss', CYL, x, rise + 0.5, L - 0.3, 0, 0.05, 1.04, 0.05);
  }
  // Colliders along the truss.
  const p0 = f.point(0, 0, 0);
  const p1 = f.point(0, 0, land);
  const p2 = f.point(0, 0, land + run);
  const p3 = f.point(0, 0, L);
  b.chain(p0.x, y0 - 1.1, p0.z, p1.x, y0 - 1.1, p1.z, w / 2, 1.1);
  b.chain(p1.x, y0 - 1.1, p1.z, p2.x, y0 + rise - 1.1, p2.z, w / 2, 1.1);
  b.chain(p2.x, y0 + rise - 1.1, p2.z, p3.x, y0 + rise - 1.1, p3.z, w / 2, 1.1);
  const eye = 1.65;
  return [f.point(0, eye, 0.2), f.point(0, eye, land), f.point(0, rise + eye, land + run), f.point(0, rise + eye, L + 1.2)];
}

// Two-layer space frame over a rectangle, glazed on top.
export function spaceFrame(b, x0, x1, z0, z1, y, s = 2.4, depth = 1.6) {
  const nx = Math.max(1, Math.round((x1 - x0) / s));
  const nz = Math.max(1, Math.round((z1 - z0) / s));
  const sx = (x1 - x0) / nx;
  const sz = (z1 - z0) / nz;
  const top = (i, j) => V(x0 + i * sx, y + depth, z0 + j * sz);
  const bot = (i, j) => V(x0 + (i + 0.5) * sx, y, z0 + (j + 0.5) * sz);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    if (i < nx) b.between('ceil:frame', CYL6, top(i, j), top(i + 1, j), 0.05);
    if (j < nz) b.between('ceil:frame', CYL6, top(i, j), top(i, j + 1), 0.05);
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const c = bot(i, j);
      if (i < nx - 1) b.between('ceil:frameDark', CYL6, c, bot(i + 1, j), 0.045);
      if (j < nz - 1) b.between('ceil:frameDark', CYL6, c, bot(i, j + 1), 0.045);
      for (const [a, d] of [[0, 0], [1, 0], [0, 1], [1, 1]]) b.between('ceil:frame', CYL6, c, top(i + a, j + d), 0.04);
      b.box('ceil:frameDark', c.x - 0.08, c.y - 0.08, c.z - 0.08, c.x + 0.08, c.y + 0.08, c.z + 0.08, false);
    }
  }
  b.box('ceil:glass', x0, y + depth + 0.06, z0, x1, y + depth + 0.08, z1, false);
}

// Hanging banner (material is double sided).
export function hangingBanner(b, x, yTop, z, w, len, rot, key) {
  const f = b.frame(x, yTop, z, rot);
  f.geo(`ceil:${key}`, PLANE, 0, -len / 2, 0.006, 0, w, len, 1);
  f.geo(`ceil:${key}`, PLANE, 0, -len / 2, -0.006, Math.PI, w, len, 1);
  f.box('ceil:blackGloss', -w / 2 - 0.05, -0.06, -0.03, w / 2 + 0.05, 0, 0.03);
  f.box('ceil:blackGloss', -w / 2 - 0.05, -len - 0.06, -0.03, w / 2 + 0.05, -len, 0.03);
  for (const s of [-1, 1]) f.geo('ceil:metal', CYL6, s * w * 0.4, 1.5, 0, 0, 0.006, 3, 0.006);
}

// Cluster of long blue glass tubes hanging in the void.
export function tubes(b, rng, x, z, yTop, n, spread, maxLen) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * spread;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const len = rng.range(maxLen * 0.35, maxLen);
    const r = rng.range(0.1, 0.2);
    const drop = rng.range(0, 3);
    const f = b.frame(px, yTop - drop, pz, 0);
    f.geo('ceil:blueGlass', CYL, 0, -len / 2, 0, 0, r, len, r);
    f.geo('ceil:blueGlow', CYL, 0, -len / 2, 0, 0, r * 0.25, len - 0.1, r * 0.25);
    f.geo('ceil:metal', CYL, 0, -0.015, 0, 0, r * 1.02, 0.03, r * 1.02);
    f.geo('ceil:metal', CYL, 0, -len - 0.015, 0, 0, r * 1.02, 0.03, r * 1.02);
    f.geo('ceil:metal', CYL6, 0, drop / 2 + 0.3, 0, 0, 0.005, drop + 0.6, 0.005);
  }
}

// White-painted foliage, Mirror's Edge style.
export function whiteTree(b, rng, x, y, z, h = 5) {
  const f = b.frame(x, y, z, rng.range(0, Math.PI * 2));
  const th = h * rng.range(0.45, 0.55);
  f.geo('trunkWhite', CYL, 0, th / 2, 0, 0, 0.12, th, 0.12);
  const branches = rng.int(3, 5);
  for (let k = 0; k < branches; k++) {
    const a = (k / branches) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const bl = rng.range(0.8, 1.6);
    const by = th * rng.range(0.7, 1.0);
    const tip = V(Math.cos(a) * bl, by + bl * 0.8, Math.sin(a) * bl);
    const base = V(0, by, 0);
    const wt = f.point(tip.x, tip.y, tip.z);
    const wb = f.point(base.x, base.y, base.z);
    b.between('trunkWhite', CYL6, wb, wt, 0.05);
    // Leaf cluster: a few soft masses with loose leaves around them.
    const s = h / 5;
    for (let m = 0; m < rng.int(2, 4); m++) {
      const r = rng.range(0.45, 0.75) * s;
      f.geo('leaf', BALL, tip.x + rng.range(-0.4, 0.4) * s, tip.y + rng.range(-0.1, 0.4) * s, tip.z + rng.range(-0.4, 0.4) * s, rng.range(0, 6), r, r * rng.range(0.7, 0.9), r);
    }
    const leaves = rng.int(40, 60);
    for (let i = 0; i < leaves; i++) {
      const r = rng.range(0.5, 1.15) * s;
      const a2 = rng.range(0, Math.PI * 2);
      const lx = tip.x + Math.cos(a2) * r;
      const ly = tip.y + rng.range(-0.5, 0.6) * s;
      const lz = tip.z + Math.sin(a2) * r;
      f.geo('leafWhite', LEAF, lx, ly, lz, rng.range(0, 6.28), rng.range(0.16, 0.26), rng.range(0.28, 0.42), 1, rng.range(-1.2, 1.2), rng.range(-1.2, 1.2));
    }
  }
  b.collider(x - 0.2, y, z - 0.2, x + 0.2, y + th, z + 0.2);
}

// Feathery white fronds (palm-like), ref: white planters in the galleries.
export function fronds(b, rng, x, y, z, h = 1.6) {
  const f = b.frame(x, y, z, 0);
  const n = rng.int(10, 16);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = h * rng.range(0.7, 1.1);
    const pitch = rng.range(0.15, 0.7);
    let px = 0;
    let py = 0;
    let pz = 0;
    let tilt = pitch;
    const segs = 4;
    for (let k = 0; k < segs; k++) {
      const sl = len / segs;
      const nx = px + Math.cos(a) * Math.sin(tilt) * sl;
      const nz = pz + Math.sin(a) * Math.sin(tilt) * sl;
      const ny = py + Math.cos(tilt) * sl;
      // Leaflets along this segment.
      for (let q = 0; q < 3; q++) {
        const t = (q + 0.5) / 3;
        const lx = px + (nx - px) * t;
        const ly = py + (ny - py) * t;
        const lz = pz + (nz - pz) * t;
        for (const s of [-1, 1]) f.geo('leafWhite', LEAF, lx, ly, lz, a + s * 1.2, 0.06, 0.32 * (1 - k * 0.15), 1, 0.9, s * 0.6);
      }
      b.between('trunkWhite', CYL6, f.point(px, py, pz), f.point(nx, ny, nz), 0.012);
      px = nx;
      py = ny;
      pz = nz;
      tilt += 0.28;
    }
  }
}

export function planterBox(b, x, y, z, w, d, h, key = 'concrete') {
  b.box(key, x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
  b.box('soil', x - w / 2 + 0.06, y + h - 0.04, z - d / 2 + 0.06, x + w / 2 - 0.06, y + h + 0.005, z + d / 2 - 0.06, false);
}

// A ribbon of metal twisting upward, on a dark plinth.
export function ribbonSculpture(b, rng, x, y, z, key = 'accentGloss') {
  b.box('darkMetal', x - 0.5, y, z - 0.5, x + 0.5, y + 0.8, z + 0.5);
  const pts = [];
  const h = rng.range(1.8, 2.6);
  const turns = rng.range(0.6, 1.2);
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push({ p: V(x + Math.cos(a) * 0.35 * (1 - t * 0.4), y + 0.8 + t * h, z + Math.sin(a) * 0.35 * (1 - t * 0.4)), a: a + t * 2.5 });
  }
  const pos = [];
  const w = 0.28;
  for (let i = 0; i < n; i++) {
    const quad = [pts[i], pts[i + 1]].map(({ p, a }) => {
      const d = V(Math.cos(a), 0.35, Math.sin(a)).normalize().multiplyScalar(w / 2);
      return [p.clone().sub(d), p.clone().add(d)];
    });
    const [[a0, a1], [b0, b1]] = quad;
    pos.push(...a0.toArray(), ...a1.toArray(), ...b1.toArray(), ...a0.toArray(), ...b1.toArray(), ...b0.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.push(`${key}Double`, g);
  b.collider(x - 0.6, y, z - 0.6, x + 0.6, y + 0.8 + h, z + 0.6);
}

// Freestanding double-sided lightbox (posters, directory).
export function lightbox(b, x, y, z, rot, key, w = 0.9, h = 1.6) {
  const f = b.frame(x, y, z, rot);
  f.box('blackGloss', -w / 2 - 0.06, 0.15, -0.08, w / 2 + 0.06, 0.15 + h + 0.12, 0.08, true);
  f.geo(key, PLANE, 0, 0.21 + h / 2, 0.088, 0, w, h, 1);
  f.geo(key, PLANE, 0, 0.21 + h / 2, -0.088, Math.PI, w, h, 1);
  f.box('darkMetal', -w / 2, 0, -0.3, w / 2, 0.15, 0.3);
}

// Wall-mounted backlit billboard; (x, z) on the wall surface, facing rot.
export function billboard(b, x, y, z, rot, w, h, key, frame = 'white') {
  const f = b.frame(x, y, z, rot);
  f.box(frame, -w / 2 - 0.12, -0.12, 0, w / 2 + 0.12, h + 0.12, 0.14);
  f.geo(key, PLANE, 0, h / 2, 0.148, 0, w, h, 1);
}

// Sign board with a cell of the brand atlas.
export function signPlane(b, f, key, x, y, z, w, h, cell, cols, rows) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const cx = cell % cols;
  const cy = Math.floor(cell / cols);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, (cx + u) / cols, 1 - (cy + 1 - v) / rows);
  }
  f.geo(key, g, x, y, z);
  g.dispose();
}

export function cctv(b, x, y, z, rot) {
  const f = b.frame(x, y, z, rot);
  f.box('ceil:white', -0.03, -0.18, -0.03, 0.03, 0, 0.03);
  f.geo('ceil:white', rbox(0.12, 0.1, 0.26, 0.03), 0, -0.2, 0.08, 0, 1, 1, 1, 0.3);
  f.geo('ceil:black', CYL, 0, -0.23, 0.22, 0, 0.035, 0.02, 0.035, Math.PI / 2 - 0.3);
}

// Plaza bin: square beige box with a dark slot.
export function bin(b, x, y, z, rot) {
  const f = b.frame(x, y, z, rot);
  f.geo('stone', rbox(0.5, 0.9, 0.5, 0.05), 0, 0.45, 0);
  f.box('black', -0.15, 0.7, 0.251, 0.15, 0.8, 0.26);
  b.collider(x - 0.28, y, z - 0.28, x + 0.28, y + 0.9, z + 0.28);
}

// Pole carrying two long vertical banners (plaza).
export function bannerPole(b, x, y, z, h, key, rot = 0) {
  const f = b.frame(x, y, z, rot);
  f.geo('darkMetal', CYL, 0, h / 2, 0, 0, 0.06, h, 0.06);
  for (const hy of [h - 0.2, h - 3.6]) f.box('darkMetal', 0, hy - 0.03, -0.02, 1.2, hy + 0.03, 0.02);
  f.geo(key, PLANE, 0.62, h - 1.9, 0, 0, 1.0, 3.4, 1);
  b.collider(x - 0.08, y, z - 0.08, x + 0.08, y + h, z + 0.08);
}

// Mall bench: slatted seat on a concrete block.
export function slatBench(b, x, y, z, rot, w, key = 'upholstery') {
  const f = b.frame(x, y, z, rot);
  f.box('concrete', -w / 2 + 0.15, 0, -0.2, w / 2 - 0.15, 0.36, 0.2);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const z0 = -0.26 + (i * 0.52) / n;
    f.geo(key, rbox(w, 0.06, 0.52 / n - 0.02, 0.02), 0, 0.42, z0 + 0.052);
  }
  f.collide(-w / 2, 0, -0.27, w / 2, 0.46, 0.27);
}

// ------------------------------------------------------------- skylights

// Barrel vault across the short dimension: arched ribs, purlins, glazing.
export function barrelVault(b, x0, x1, z0, z1, y, rise, s = 3.0) {
  const n = Math.max(1, Math.round((x1 - x0) / s));
  const segs = 14;
  const zc = (z0 + z1) / 2;
  const hw = (z1 - z0) / 2;
  const at = (t) => [zc - hw * Math.cos(Math.PI * t), y + rise * Math.sin(Math.PI * t)];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    for (let k = 0; k < segs; k++) {
      const [za, ya] = at(k / segs);
      const [zb, yb] = at((k + 1) / segs);
      b.between('ceil:frame', CYL6, V(x, ya, za), V(x, yb, zb), 0.09);
    }
    if (i < n) {
      const xm = x + (x1 - x0) / n / 2;
      for (let k = 0; k < segs; k += 2) {
        const [za, ya] = at(k / segs);
        const [zb, yb] = at((k + 2) / segs);
        b.between('ceil:frameDark', CYL6, V(xm, ya - 0.05, za), V(xm, yb - 0.05, zb), 0.025);
      }
    }
  }
  for (let k = 0; k <= segs; k += 2) {
    const [z, yy] = at(k / segs);
    b.between('ceil:frameDark', CYL6, V(x0, yy, z), V(x1, yy, z), 0.05);
  }
  const pos = [];
  for (let k = 0; k < segs; k++) {
    const [za, ya] = at(k / segs);
    const [zb, yb] = at((k + 1) / segs);
    pos.push(x0, ya + 0.1, za, x1, ya + 0.1, za, x1, yb + 0.1, zb, x0, ya + 0.1, za, x1, yb + 0.1, zb, x0, yb + 0.1, zb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.push('ceil:glassDouble', g);
}

// Pitched glass roof with a ridge along the length.
export function ridgeRoof(b, x0, x1, z0, z1, y, rise, s = 2.4) {
  const n = Math.max(1, Math.round((x1 - x0) / s));
  const zc = (z0 + z1) / 2;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    b.between('ceil:frame', CYL6, V(x, y, z0), V(x, y + rise, zc), 0.08);
    b.between('ceil:frame', CYL6, V(x, y, z1), V(x, y + rise, zc), 0.08);
    b.between('ceil:frameDark', CYL6, V(x, y, z0), V(x, y, z1), 0.03);
    b.between('ceil:frameDark', CYL6, V(x, y, zc), V(x, y + rise, zc), 0.03);
  }
  for (const t of [0, 0.33, 0.66, 1]) {
    for (const zs of [z0, z1]) {
      const z = zs + (zc - zs) * t;
      b.between('ceil:frameDark', CYL6, V(x0, y + rise * t, z), V(x1, y + rise * t, z), t === 1 ? 0.1 : 0.04);
    }
  }
  const pos = [x0, y + 0.08, z0, x1, y + 0.08, z0, x1, y + rise + 0.08, zc, x0, y + 0.08, z0, x1, y + rise + 0.08, zc, x0, y + rise + 0.08, zc, x0, y + 0.08, z1, x1, y + rise + 0.08, zc, x1, y + 0.08, z1, x0, y + 0.08, z1, x0, y + rise + 0.08, zc, x1, y + rise + 0.08, zc];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.push('ceil:glassDouble', g);
}

// Flat glazing on a grid of deep beams (coffers).
export function beamGrid(b, x0, x1, z0, z1, y, s = 3.0, depth = 0.9) {
  const nx = Math.max(1, Math.round((x1 - x0) / s));
  const nz = Math.max(1, Math.round((z1 - z0) / s));
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    b.box('ceil:frame', x - 0.12, y, z0, x + 0.12, y + depth, z1, false);
  }
  for (let j = 0; j <= nz; j++) {
    const z = z0 + ((z1 - z0) * j) / nz;
    b.box('ceil:frame', x0, y, z - 0.12, x1, y + depth, z + 0.12, false);
  }
  b.box('ceil:glass', x0, y + depth, z0, x1, y + depth + 0.02, z1, false);
}

// ----------------------------------------------------------- chandeliers

export function spheres(b, rng, x, z, yTop, n, spread, maxDrop) {
  const G = new THREE.IcosahedronGeometry(1, 2);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * spread;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const drop = rng.range(1.5, maxDrop);
    const r = rng.range(0.18, 0.5);
    const f = b.frame(px, yTop - drop, pz, 0);
    f.geo(rng.chance(0.7) ? 'ceil:globe' : 'ceil:accentGloss', G, 0, 0, 0, 0, r, r, r);
    f.geo('ceil:metal', CYL6, 0, drop / 2 + r * 0.5, 0, 0, 0.005, drop, 0.005);
  }
}

export function ringStack(b, rng, x, z, yTop, n, maxDrop) {
  for (let i = 0; i < n; i++) {
    const R = rng.range(1.4, 3.4) * (1 - i * 0.12);
    const drop = (maxDrop * (i + 1)) / (n + 1) + rng.range(-0.4, 0.4);
    const f = b.frame(x, yTop - drop, z, 0);
    f.geo('ceil:white', new THREE.TorusGeometry(R, 0.1, 8, 56), 0, 0, 0, 0, 1, 1, 0.6, Math.PI / 2);
    f.geo('ceil:emissiveSoft', new THREE.RingGeometry(R - 0.08, R + 0.08, 56, 1), 0, -0.05, 0, 0, 1, 1, 1, Math.PI / 2);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i;
      f.geo('ceil:metal', CYL6, Math.cos(a) * R, drop / 2, Math.sin(a) * R, 0, 0.005, drop, 0.005);
    }
  }
}

export function discMobile(b, rng, x, z, yTop, n, spread, maxDrop, keys) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * spread;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const drop = rng.range(1.5, maxDrop);
    const r = rng.range(0.4, 1.1);
    const f = b.frame(px, yTop - drop, pz, rng.range(0, Math.PI));
    f.geo(`ceil:${rng.pick(keys)}`, CYL, 0, 0, 0, 0, r, 0.04, r, rng.range(1.1, 1.5));
    f.geo('ceil:metal', CYL6, 0, drop / 2, 0, 0, 0.005, drop, 0.005);
  }
}

// --------------------------------------------------------- court pieces

// Round fountain: rim, water, a tiered bowl and jets.
export function fountain(b, rng, x, y, z, R) {
  const f = b.frame(x, y, z, 0);
  const ring = new THREE.LatheGeometry([new THREE.Vector2(R - 0.35, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, 0.55), new THREE.Vector2(R - 0.35, 0.55), new THREE.Vector2(R - 0.35, 0)], 48);
  f.geo(rng.pick(['concrete', 'mosaic', 'white']), ring, 0, 0, 0);
  f.geo('water', CYL, 0, 0.38, 0, 0, R - 0.35, 0.02, R - 0.35);
  f.geo('darkMetal', CYL, 0, 0.18, 0, 0, R - 0.35, 0.36, R - 0.35);
  const tiers = rng.int(1, 3);
  for (let t = 0; t < tiers; t++) {
    const r = R * (0.45 - t * 0.12);
    const yy = 0.9 + t * 0.8;
    f.geo('white', CYL, 0, yy / 2, 0, 0, 0.12, yy, 0.12);
    f.geo('white', new THREE.CylinderGeometry(1, 0.3, 1, 32), 0, yy, 0, 0, r, 0.25, r);
    f.geo('water', CYL, 0, yy + 0.11, 0, 0, r * 0.9, 0.02, r * 0.9);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    f.geo('jet', CYL6, Math.cos(a) * (R - 0.9), 0.9, Math.sin(a) * (R - 0.9), 0, 0.03, 1.0, 0.03, 0, Math.cos(a) * 0.3);
  }
  f.geo('jet', CYL6, 0, 0.9 + tiers * 0.8 + 0.8, 0, 0, 0.05, 1.6, 0.05);
  b.collider(x - R, y, z - R, x + R, y + 0.6, z + R);
}

export function umbrella(b, x, y, z, r, key) {
  const f = b.frame(x, y, z, 0);
  f.geo('metal', CYL6, 0, 1.15, 0, 0, 0.025, 2.3, 0.025);
  f.geo(key, new THREE.ConeGeometry(1, 1, 8, 1, true), 0, 2.35, 0, 0, r, 0.45, r);
}

// Round information desk with screens and an accent band.
export function kiosk(b, x, y, z) {
  const f = b.frame(x, y, z, 0);
  const ring = new THREE.LatheGeometry([new THREE.Vector2(1.1, 0), new THREE.Vector2(1.5, 0), new THREE.Vector2(1.5, 1.05), new THREE.Vector2(1.1, 1.05), new THREE.Vector2(1.1, 0)], 40);
  f.geo('white', ring, 0, 0, 0);
  f.geo('accentGloss', CYL, 0, 0.55, 0, 0, 1.52, 0.18, 1.52);
  f.geo('whiteGloss', new THREE.RingGeometry(1.05, 1.58, 40), 0, 1.07, 0, 0, 1, 1, 1, -Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    f.box('black', Math.cos(a) * 1.3 - 0.25, 1.07, Math.sin(a) * 1.3 - 0.02, Math.cos(a) * 1.3 + 0.25, 1.4, Math.sin(a) * 1.3 + 0.02);
  }
  b.collider(x - 1.55, y, z - 1.55, x + 1.55, y + 1.1, z + 1.55);
}

// Inlaid floor strip along a segment, offset from it by o0..o1 on `side`.
export function inlay(b, p, q, y, o0, o1, key) {
  const { f, len } = segFrame(b, p, q, y);
  f.box(key, -0.05, 0, Math.min(o0, o1), len + 0.05, 0.01, Math.max(o0, o1));
}
