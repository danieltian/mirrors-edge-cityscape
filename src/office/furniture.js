import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Office furniture and fixtures, built from simple primitives in a local
// frame (origin on the floor, front facing +z). Wall-mounted pieces take a
// point on the wall surface with +z pointing into the room. All take the
// Builder first.

const CYL = new THREE.CylinderGeometry(1, 1, 1, 20);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE = new THREE.CylinderGeometry(0.3, 1, 1, 16, 1, true);
const UBOX = new THREE.BoxGeometry(1, 1, 1);
const BLOB = new THREE.IcosahedronGeometry(1, 0);
const BALL = new THREE.IcosahedronGeometry(1, 3);
const BLADE = new THREE.CylinderGeometry(0, 1, 1, 4, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const DISC_DOWN = new THREE.CircleGeometry(1, 20).rotateX(Math.PI / 2);
const TORUS = new THREE.TorusGeometry(1, 0.08, 6, 24).rotateX(Math.PI / 2);
const rbCache = new Map();
function rbox(w, h, d, r) {
  const k = [w, h, d, r].map((v) => v.toFixed(2)).join();
  if (!rbCache.has(k)) rbCache.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)));
  return rbCache.get(k);
}

// ------------------------------------------------------------------ seating

export function sofa(b, x, y, z, rot, { w = 2.2, key = 'upholstery', style = 'box' } = {}) {
  const f = b.frame(x, y, z, rot);
  const d = 0.9;
  if (style === 'tub') {
    f.geo(key, rbox(w, 0.46, d, 0.2), 0, 0.27, 0.02);
    f.geo(key, rbox(w, 0.8, 0.3, 0.14), 0, 0.42, -d / 2 + 0.15);
    for (const s of [-1, 1]) f.geo(key, rbox(0.28, 0.62, d - 0.04, 0.13), s * (w / 2 - 0.14), 0.33, 0.02);
    f.geo(key, rbox(w - 0.56, 0.13, d - 0.34, 0.06), 0, 0.54, 0.12);
    f.box('darkMetal', -w / 2 + 0.2, 0, -0.3, w / 2 - 0.2, 0.05, 0.3);
  } else if (style === 'pod') {
    f.geo(key, rbox(w, 0.42, d, 0.14), 0, 0.3, 0);
    f.geo(key, rbox(w, 0.52, 0.26, 0.12), 0, 0.64, -d / 2 + 0.13);
    for (const s of [-1, 1]) f.geo(key, rbox(0.24, 0.34, d, 0.1), s * (w / 2 - 0.12), 0.52, 0);
    for (const s of [-1, 1]) for (const t of [-1, 1]) f.box('darkMetal', s * (w / 2 - 0.2) - 0.03, 0, t * 0.3 - 0.03, s * (w / 2 - 0.2) + 0.03, 0.09, t * 0.3 + 0.03);
  } else {
    f.geo(key, rbox(w, 0.22, d, 0.04), 0, 0.33, 0);
    f.geo(key, rbox(w - 0.28, 0.14, d - 0.22, 0.05), 0, 0.5, 0.08);
    f.geo(key, rbox(w, 0.44, 0.2, 0.05), 0, 0.64, -d / 2 + 0.1);
    for (const s of [-1, 1]) f.geo(key, rbox(0.14, 0.42, d, 0.04), s * (w / 2 - 0.07), 0.43, 0);
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const lx = s * (w / 2 - 0.08);
        const lz = t * (d / 2 - 0.08);
        f.box('metal', lx - 0.018, 0, lz - 0.018, lx + 0.018, 0.22, lz + 0.018);
      }
    }
  }
  f.collide(-w / 2, 0, -d / 2, w / 2, 0.9, d / 2);
}

// Armchair on a bent steel tube frame (as in the orange office).
export function loungeChair(b, x, y, z, rot, key = 'upholsteryWhite') {
  const f = b.frame(x, y, z, rot);
  f.geo(key, rbox(0.62, 0.13, 0.6, 0.05), 0, 0.42, 0.03);
  f.geo(key, rbox(0.62, 0.56, 0.11, 0.05), 0, 0.72, -0.26, 0, 1, 1, 1, -0.22);
  for (const s of [-1, 1]) {
    const x0 = s * 0.345;
    f.box('metal', x0 - 0.012, 0, -0.36, x0 + 0.012, 0.022, 0.36);
    f.box('metal', x0 - 0.012, 0, 0.334, x0 + 0.012, 0.62, 0.358);
    f.box('metal', x0 - 0.012, 0.6, -0.28, x0 + 0.012, 0.622, 0.358);
    f.box('metal', x0 - 0.012, 0.02, -0.36, x0 + 0.012, 0.42, -0.338);
  }
  f.collide(-0.37, 0, -0.37, 0.37, 1.0, 0.37);
}

// Swivel chair; `high` gives the tall-backed executive / meeting version.
export function officeChair(b, x, y, z, rot, key = 'leather', high = false) {
  const f = b.frame(x, y, z, rot);
  f.geo(key, rbox(0.5, 0.09, 0.48, 0.035), 0, 0.47, 0.02);
  const bh = high ? 0.72 : 0.5;
  f.geo(key, rbox(0.48, bh, 0.07, 0.03), 0, 0.53 + bh / 2, -0.25, 0, 1, 1, 1, -0.12);
  for (const s of [-1, 1]) {
    f.box('metal', s * 0.27 - 0.012, 0.47, -0.16, s * 0.27 + 0.012, 0.66, -0.13);
    f.box('darkMetal', s * 0.27 - 0.03, 0.65, -0.2, s * 0.27 + 0.03, 0.68, 0.14);
  }
  f.geo('metal', CYL8, 0, 0.26, 0, 0, 0.025, 0.42, 0.025);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    f.geo('darkMetal', UBOX, Math.sin(a) * 0.16, 0.06, Math.cos(a) * 0.16, a, 0.04, 0.03, 0.33);
    f.geo('black', CYL8, Math.sin(a) * 0.31, 0.025, Math.cos(a) * 0.31, 0, 0.025, 0.05, 0.025);
  }
  f.collide(-0.3, 0, -0.3, 0.3, 0.53 + bh, 0.3);
}

export function simpleChair(b, x, y, z, rot, key = 'whiteGloss') {
  const f = b.frame(x, y, z, rot);
  f.geo(key, rbox(0.44, 0.05, 0.44, 0.02), 0, 0.45, 0);
  f.geo(key, rbox(0.44, 0.3, 0.04, 0.02), 0, 0.74, -0.21, 0, 1, 1, 1, -0.1);
  for (const s of [-1, 1]) for (const t of [-1, 1]) f.box('metal', s * 0.19 - 0.01, 0, t * 0.19 - 0.01, s * 0.19 + 0.01, 0.43, t * 0.19 + 0.01);
  f.collide(-0.24, 0, -0.24, 0.24, 0.9, 0.24);
}

export function barStool(b, x, y, z, key = 'upholstery') {
  const f = b.frame(x, y, z, 0);
  f.geo(key, CYL, 0, 0.76, 0, 0, 0.19, 0.06, 0.19);
  f.geo('metal', CYL8, 0, 0.38, 0, 0, 0.025, 0.74, 0.025);
  f.geo('metal', CYL, 0, 0.01, 0, 0, 0.21, 0.02, 0.21);
  f.geo('metal', TORUS, 0, 0.3, 0, 0, 0.17, 0.17, 0.17);
  b.collider(x - 0.2, y, z - 0.2, x + 0.2, y + 0.8, z + 0.2);
}

// Row of linked seats on a steel beam (waiting areas).
export function beamSeating(b, x, y, z, rot, n, key = 'upholsteryWhite') {
  const f = b.frame(x, y, z, rot);
  const pitch = 0.64;
  const w = n * pitch;
  f.box('darkMetal', -w / 2, 0.3, -0.05, w / 2, 0.36, 0.05);
  for (const s of [-1, 1]) {
    const lx = s * (w / 2 - 0.3);
    f.box('darkMetal', lx - 0.03, 0, -0.03, lx + 0.03, 0.3, 0.03);
    f.box('darkMetal', lx - 0.03, 0, -0.3, lx + 0.03, 0.03, 0.3);
  }
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + pitch * (i + 0.5);
    f.geo(key, rbox(0.54, 0.07, 0.48, 0.03), cx, 0.44, 0.03);
    f.geo(key, rbox(0.54, 0.44, 0.06, 0.03), cx, 0.72, -0.22, 0, 1, 1, 1, -0.12);
    f.box('darkMetal', cx - 0.25, 0.36, -0.03, cx + 0.25, 0.41, 0.03);
  }
  for (let i = 0; i <= n; i++) {
    const ax = -w / 2 + pitch * i;
    f.box('darkMetal', ax - 0.02, 0.41, -0.18, ax + 0.02, 0.62, -0.14);
    f.box('darkMetal', ax - 0.03, 0.6, -0.2, ax + 0.03, 0.63, 0.18);
  }
  f.collide(-w / 2, 0, -0.32, w / 2, 0.95, 0.32);
}

export function bench(b, x, y, z, rot, w, key = 'white') {
  const f = b.frame(x, y, z, rot);
  f.geo(key, rbox(w, 0.08, 0.5, 0.02), 0, 0.42, 0);
  for (const s of [-1, 1]) f.box('metal', s * (w / 2 - 0.1) - 0.02, 0, -0.22, s * (w / 2 - 0.1) + 0.02, 0.38, 0.22);
  f.collide(-w / 2, 0, -0.25, w / 2, 0.5, 0.25);
}

// ------------------------------------------------------------------ tables

export function coffeeTable(b, x, y, z, rot, { w = 1.2, d = 0.6, style = 'white' } = {}) {
  const f = b.frame(x, y, z, rot);
  if (style === 'glass') {
    f.box('glass', -w / 2, 0.4, -d / 2, w / 2, 0.42, d / 2);
    f.box('metal', -w / 2, 0.37, -d / 2, w / 2, 0.4, -d / 2 + 0.03);
    f.box('metal', -w / 2, 0.37, d / 2 - 0.03, w / 2, 0.4, d / 2);
    for (const s of [-1, 1]) f.box('metal', s * w / 2 - 0.015, 0, -d / 2, s * w / 2 + 0.015, 0.4, d / 2);
  } else if (style === 'round') {
    f.geo('whiteGloss', CYL, 0, 0.39, 0, 0, w / 2, 0.03, w / 2);
    f.geo('darkMetal', CYL8, 0, 0.19, 0, 0, 0.05, 0.38, 0.05);
    f.geo('darkMetal', CYL, 0, 0.01, 0, 0, w * 0.25, 0.02, w * 0.25);
  } else if (style === 'waterfall') {
    f.geo('whiteGloss', rbox(w, 0.05, d, 0.02), 0, 0.4, 0);
    for (const s of [-1, 1]) f.geo('whiteGloss', rbox(0.05, 0.4, d, 0.02), s * (w / 2 - 0.025), 0.2, 0);
    if (w > 0.9) f.geo('white', UBOX, w * 0.2, 0.43, 0, 0.3, 0.3, 0.012, 0.22);
  } else {
    f.geo('whiteGloss', rbox(w, 0.38, d, 0.03), 0, 0.19, 0);
  }
  f.collide(-w / 2, 0, -d / 2, w / 2, 0.45, d / 2);
}

export function cafeTable(b, x, y, z, key = 'whiteGloss') {
  const f = b.frame(x, y, z, 0);
  f.geo(key, CYL, 0, 0.73, 0, 0, 0.42, 0.03, 0.42);
  f.geo('metal', CYL8, 0, 0.36, 0, 0, 0.03, 0.72, 0.03);
  f.geo('metal', CYL, 0, 0.01, 0, 0, 0.26, 0.02, 0.26);
  b.collider(x - 0.42, y, z - 0.42, x + 0.42, y + 0.76, z + 0.42);
}

// Architectural model of towers on a white base.
export function cityModel(b, rng, x, y, z, w, d) {
  const f = b.frame(x, y, z, 0);
  f.box('model', -w / 2, 0, -d / 2, w / 2, 0.02, d / 2);
  const n = rng.int(4, 9);
  for (let i = 0; i < n; i++) {
    const bw = rng.range(0.05, 0.14);
    const bd = rng.range(0.05, 0.14);
    const h = rng.range(0.08, 0.5) * (i === 0 ? 1.4 : 1);
    const px = rng.range(-w / 2 + bw, w / 2 - bw);
    const pz = rng.range(-d / 2 + bd, d / 2 - bd);
    f.box('model', px - bw / 2, 0.02, pz - bd / 2, px + bw / 2, 0.02 + h, pz + bd / 2);
    if (i === 0) f.geo('model', CYL8, px, 0.02 + h + 0.08, pz, 0, 0.006, 0.16, 0.006);
  }
}

function desktopProps(f, rng, x, top, z, rot) {
  if (rng.chance(0.6)) for (let k = 0; k < rng.int(1, 3); k++) f.geo('white', UBOX, x + rng.range(-0.3, 0.3), top + 0.002 + k * 0.002, z + rng.range(-0.1, 0.15), rot + rng.range(-0.4, 0.4), 0.21, 0.003, 0.297);
  if (rng.chance(0.5)) f.geo('white', CYL, x + rng.range(0.35, 0.5), top + 0.05, z + rng.range(0, 0.2), 0, 0.04, 0.1, 0.04);
  if (rng.chance(0.3)) f.box('black', x - 0.55, top, z + 0.05, x - 0.37, top + 0.05, z + 0.25);
}

// Screen facing local direction `rot` (0 = +z).
export function monitor(f, x, y, z, rot = 0, w = 0.56) {
  const fx = Math.sin(rot);
  const fz = Math.cos(rot);
  f.geo('black', UBOX, x, y + 0.34, z, rot, w, w * 0.6, 0.025);
  f.geo('monitor', PLANE, x + fx * 0.0135, y + 0.34, z + fz * 0.0135, rot, w - 0.03, w * 0.6 - 0.03, 1);
  f.geo('darkMetal', UBOX, x - fx * 0.03, y + 0.14, z - fz * 0.03, rot, 0.04, 0.26, 0.03);
  f.geo('darkMetal', UBOX, x - fx * 0.03, y + 0.008, z - fz * 0.03, rot, 0.24, 0.015, 0.18);
}

// Workstation facing +z (the user sits at -z).
export function desk(b, rng, x, y, z, rot, { w = 1.6, chair = true, top = 'whiteGloss' } = {}) {
  const f = b.frame(x, y, z, rot);
  f.box(top, -w / 2, 0.72, -0.4, w / 2, 0.75, 0.4);
  for (const s of [-1, 1]) {
    const lx = s * (w / 2 - 0.05);
    f.box('metal', lx - 0.025, 0, -0.35, lx + 0.025, 0.72, -0.3);
    f.box('metal', lx - 0.025, 0, 0.3, lx + 0.025, 0.72, 0.35);
    f.box('metal', lx - 0.025, 0, -0.35, lx + 0.025, 0.04, 0.35);
  }
  f.box('white', -w / 2 + 0.08, 0.35, 0.3, w / 2 - 0.08, 0.7, 0.32);
  const two = rng.chance(0.35);
  if (two) {
    monitor(f, -0.29, 0.75, 0.2, Math.PI);
    monitor(f, 0.29, 0.75, 0.2, Math.PI);
  } else monitor(f, 0, 0.75, 0.2, Math.PI);
  f.box('black', -0.22, 0.75, -0.14, 0.22, 0.765, 0.0);
  f.box('black', 0.3, 0.75, -0.1, 0.36, 0.765, -0.02);
  desktopProps(f, rng, 0, 0.75, -0.1, 0);
  f.collide(-w / 2, 0, -0.4, w / 2, 1.1, 0.4);
  if (chair) {
    const p = f.point(rng.range(-0.15, 0.15), 0, -0.72);
    officeChair(b, p.x, y, p.z, rot + rng.range(-0.5, 0.5), rng.chance(0.7) ? 'leather' : 'upholstery');
  }
}

// Executive desk with a side pedestal, twin screens and a lamp (private offices).
export function execDesk(b, rng, x, y, z, rot) {
  const f = b.frame(x, y, z, rot);
  const w = 1.9;
  f.box('deskTop', -w / 2, 0.72, -0.43, w / 2, 0.76, 0.43);
  f.box('white', -w / 2, 0, -0.4, -w / 2 + 0.05, 0.72, 0.4);
  f.box('white', w / 2 - 0.48, 0, -0.4, w / 2, 0.72, 0.4);
  f.box('skirting', w / 2 - 0.47, 0.36, -0.401, w / 2 - 0.01, 0.366, -0.4);
  f.box('white', -w / 2 + 0.05, 0.3, 0.38, w / 2 - 0.48, 0.72, 0.4);
  monitor(f, -0.3, 0.76, 0.22, Math.PI - 0.12, 0.52);
  monitor(f, 0.26, 0.76, 0.22, Math.PI + 0.12, 0.52);
  f.box('black', -0.24, 0.76, -0.12, 0.2, 0.775, 0.03);
  f.box('black', 0.3, 0.76, -0.08, 0.36, 0.775, 0.0);
  // Desk lamp.
  f.geo('white', CYL, 0.78, 0.77, 0.25, 0, 0.08, 0.02, 0.08);
  f.geo('metal', UBOX, 0.74, 0.98, 0.18, 0.4, 0.015, 0.45, 0.015, 0.35);
  f.geo('white', CONE, 0.68, 1.17, 0.05, 0, 0.09, 0.12, 0.09, 0.5);
  f.geo('emissive', DISC_DOWN, 0.7, 1.11, 0.03, 0, 0.06, 1, 0.06);
  desktopProps(f, rng, -0.1, 0.76, -0.12, 0);
  f.collide(-w / 2, 0, -0.43, w / 2, 1.2, 0.43);
  const p = f.point(0, 0, -0.8);
  officeChair(b, p.x, y, p.z, rot, 'leather', true);
}

export function receptionDesk(b, rng, x, y, z, rot, w) {
  const f = b.frame(x, y, z, rot);
  f.geo('white', rbox(w, 1.05, 0.9, 0.04), 0, 0.525, 0);
  f.box('accent', -w / 2 - 0.005, 0.18, 0.45, w / 2 + 0.005, 0.26, 0.456);
  f.box('accent', -w / 2 - 0.005, 0.32, 0.45, w / 2 + 0.005, 0.36, 0.456);
  f.box('accent', -w / 2 - 0.005, 0, -0.45, w / 2 + 0.005, 0.1, 0.456);
  f.geo('whiteGloss', rbox(w + 0.08, 0.04, 1.02, 0.015), 0, 1.07, 0.04);
  f.box('whiteGloss', -w / 2, 0.72, -0.95, w / 2, 0.76, -0.45);
  const n = Math.max(1, Math.floor(w / 1.6));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (w * (i + 0.5)) / n;
    monitor(f, lx, 0.76, -0.6, Math.PI);
    const p = f.point(lx, 0, -1.35);
    officeChair(b, p.x, y, p.z, rot, 'leather');
  }
  desktopProps(f, rng, 0, 0.76, -0.75, 0);
  f.collide(-w / 2, 0, -0.95, w / 2, 1.1, 0.5);
}

// Long boardroom table: wood top, dark pedestals, high-backed chairs.
export function confTable(b, rng, x, y, z, rot, len, { top = 'wood', chairKey = 'leather' } = {}) {
  const f = b.frame(x, y, z, rot);
  const d = 1.2;
  f.box(top, -len / 2, 0.71, -d / 2, len / 2, 0.76, d / 2);
  f.box('darkMetal', -len / 2 + 0.02, 0.66, -d / 2 + 0.1, len / 2 - 0.02, 0.71, d / 2 - 0.1);
  const peds = len > 3.6 ? [-len / 3, len / 3] : [0];
  for (const px of peds) f.box('darkMetal', px - 0.3, 0, -0.25, px + 0.3, 0.66, 0.25);
  f.collide(-len / 2, 0, -d / 2, len / 2, 0.8, d / 2);
  const n = Math.max(2, Math.floor(len / 0.95));
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (len * (i + 0.5)) / n;
    for (const s of [-1, 1]) {
      if (rng.chance(0.08)) continue;
      const p = f.point(lx + rng.range(-0.08, 0.08), 0, s * (d / 2 + 0.38 + rng.range(0, 0.12)));
      officeChair(b, p.x, y, p.z, rot + (s > 0 ? Math.PI : 0) + rng.range(-0.3, 0.3), chairKey, true);
    }
  }
  if (rng.chance(0.5)) {
    const p = f.point(-len / 2 - 0.5, 0, 0);
    officeChair(b, p.x, y, p.z, rot + Math.PI / 2, chairKey, true);
  }
  const m = f.point(rng.range(-len / 4, len / 4), 0, 0);
  if (rng.chance(0.6)) cityModel(b, rng, m.x, y + 0.76, m.z, 0.5, 0.35);
  for (let k = 0; k < rng.int(1, 3); k++) f.geo('white', UBOX, rng.range(-len / 2 + 0.4, len / 2 - 0.4), 0.762, rng.chance(0.5) ? -0.35 : 0.35, rng.range(-0.3, 0.3), 0.21, 0.003, 0.297);
  if (rng.chance(0.6)) f.box('black', rng.range(-len / 3, len / 3), 0.76, -0.05, rng.range(-len / 3, len / 3) + 0.12, 0.8, 0.05);
}

// ------------------------------------------------------------------ storage

export function credenza(b, x, y, z, rot, w, key = 'white') {
  const f = b.frame(x, y, z, rot);
  f.box(key, -w / 2, 0.08, -0.22, w / 2, 0.72, 0.22, true);
  f.box('whiteGloss', -w / 2 - 0.01, 0.72, -0.23, w / 2 + 0.01, 0.75, 0.23);
  f.box('black', -w / 2 + 0.04, 0, -0.18, w / 2 - 0.04, 0.08, 0.18);
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 1; i < n; i++) f.box('skirting', -w / 2 + (w * i) / n - 0.003, 0.1, 0.22, -w / 2 + (w * i) / n + 0.003, 0.7, 0.224);
}

export function bookshelf(b, rng, x, y, z, rot, w, h = 2.0, key = 'white') {
  const f = b.frame(x, y, z, rot);
  const d = 0.36;
  f.box(key, -w / 2, 0, -d / 2, -w / 2 + 0.03, h, d / 2);
  f.box(key, w / 2 - 0.03, 0, -d / 2, w / 2, h, d / 2);
  f.box(key, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.02);
  const shelves = Math.round(h / 0.38);
  const books = ['white', 'black', 'accent', 'darkMetal', 'wood', 'accent2', 'white'];
  for (let s = 0; s <= shelves; s++) {
    const sy = (s * (h - 0.03)) / shelves;
    f.box(key, -w / 2, sy, -d / 2, w / 2, sy + 0.03, d / 2);
    if (s === shelves) break;
    let cx = -w / 2 + 0.05;
    while (cx < w / 2 - 0.1) {
      if (rng.chance(0.25)) {
        cx += rng.range(0.1, 0.35);
        continue;
      }
      const bw = rng.range(0.02, 0.05);
      const bh = rng.range(0.2, 0.3);
      const k = rng.pick(books);
      const run = rng.int(3, 9);
      for (let i = 0; i < run && cx < w / 2 - 0.08; i++) {
        f.box(k, cx, sy + 0.03, -d / 2 + 0.04, cx + bw, sy + 0.03 + bh * rng.range(0.9, 1), d / 2 - 0.06);
        cx += bw + 0.002;
      }
      cx += rng.range(0.02, 0.1);
    }
  }
  f.collide(-w / 2, 0, -d / 2, w / 2, h, d / 2);
}

export function fileCabinet(b, x, y, z, rot, w = 0.8, key = 'white') {
  const f = b.frame(x, y, z, rot);
  f.box(key, -w / 2, 0, -0.25, w / 2, 1.1, 0.25, true);
  for (const dy of [0.37, 0.73]) f.box('skirting', -w / 2 + 0.02, dy - 0.003, 0.25, w / 2 - 0.02, dy + 0.003, 0.254);
  for (const dy of [0.2, 0.56, 0.92]) f.box('metal', -0.1, dy, 0.25, 0.1, dy + 0.02, 0.27);
}

export function printer(b, x, y, z, rot) {
  const f = b.frame(x, y, z, rot);
  f.geo('whiteGloss', rbox(0.62, 0.95, 0.62, 0.03), 0, 0.475, 0);
  f.box('darkMetal', -0.3, 0.95, -0.28, 0.3, 1.02, 0.28);
  f.box('white', -0.26, 0.55, 0.31, 0.26, 0.58, 0.45);
  f.box('black', 0.08, 0.9, 0.2, 0.26, 0.95, 0.31);
  f.box('emissiveSoft', 0.1, 0.951, 0.22, 0.24, 0.953, 0.29);
  f.collide(-0.31, 0, -0.31, 0.31, 1.02, 0.45);
}

// Kitchenette run against a wall (back at -z): base units, worktop, sink,
// wall cupboards and a steel fridge at one end.
export function kitchen(b, rng, x, y, z, rot, len, front = 'white') {
  const f = b.frame(x, y, z, rot);
  const d = 0.62;
  const fridge = 0.72;
  const x0 = -len / 2;
  const x1 = len / 2 - fridge;
  f.box('black', x0, 0, -d / 2, x1, 0.1, d / 2 - 0.06);
  f.box(front, x0, 0.1, -d / 2, x1, 0.87, d / 2);
  const n = Math.max(1, Math.round((x1 - x0) / 0.6));
  for (let i = 1; i < n; i++) f.box('skirting', x0 + ((x1 - x0) * i) / n - 0.002, 0.11, d / 2, x0 + ((x1 - x0) * i) / n + 0.002, 0.86, d / 2 + 0.004);
  const worktop = rng.pick(['black', 'whiteGloss', 'concrete']);
  f.box(worktop, x0 - 0.01, 0.87, -d / 2, x1, 0.91, d / 2 + 0.02);
  const sx = x0 + (x1 - x0) * 0.35;
  f.box('metal', sx - 0.3, 0.911, -0.2, sx + 0.3, 0.914, 0.2);
  f.geo('metal', CYL8, sx, 1.08, -0.24, 0, 0.015, 0.34, 0.015);
  f.geo('metal', UBOX, sx, 1.24, -0.16, 0, 0.02, 0.02, 0.16);
  f.box('black', x1 - 0.5, 0.91, -0.25, x1 - 0.18, 1.3, 0.08);
  f.box('emissiveSoft', x1 - 0.44, 1.18, 0.081, x1 - 0.24, 1.22, 0.083);
  // Wall cupboards and an under-cabinet light strip.
  f.box(front === 'white' ? 'white' : 'whiteGloss', x0, 1.46, -d / 2, x1, 2.16, -d / 2 + 0.36);
  for (let i = 1; i < n; i++) f.box('skirting', x0 + ((x1 - x0) * i) / n - 0.002, 1.47, -d / 2 + 0.36, x0 + ((x1 - x0) * i) / n + 0.002, 2.15, -d / 2 + 0.364);
  f.box('emissive', x0 + 0.05, 1.445, -d / 2 + 0.24, x1 - 0.05, 1.46, -d / 2 + 0.3);
  f.box('metal', x1 + 0.02, 0, -d / 2, len / 2, 1.95, d / 2);
  f.box('darkMetal', x1 + 0.02, 1.2, d / 2, len / 2, 1.206, d / 2 + 0.004);
  f.box('darkMetal', len / 2 - 0.08, 0.5, d / 2, len / 2 - 0.05, 1.7, d / 2 + 0.05);
  f.collide(x0, 0, -d / 2, len / 2, 1.95, d / 2 + 0.02);
}

// Glass vitrine on a coloured plinth with a model inside.
export function displayCase(b, rng, x, y, z, rot, { w = 0.9, d = 0.7, key = 'accent' } = {}) {
  const f = b.frame(x, y, z, rot);
  const base = 0.82;
  const top = base + 0.62;
  f.box(key, -w / 2, 0, -d / 2, w / 2, base, d / 2);
  f.box('white', -w / 2 - 0.01, base, -d / 2 - 0.01, w / 2 + 0.01, base + 0.02, d / 2 + 0.01);
  f.box('glass', -w / 2, base + 0.02, -d / 2, w / 2, top, d / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) f.box('metal', sx * w / 2 - 0.012, base, sz * d / 2 - 0.012, sx * w / 2 + 0.012, top, sz * d / 2 + 0.012);
    f.box('metal', sx * w / 2 - 0.012, top - 0.02, -d / 2, sx * w / 2 + 0.012, top, d / 2);
  }
  for (const sz of [-1, 1]) f.box('metal', -w / 2, top - 0.02, sz * d / 2 - 0.012, w / 2, top, sz * d / 2 + 0.012);
  const p = f.point(0, 0, 0);
  cityModel(b, rng, p.x, y + base + 0.02, p.z, w - 0.2, d - 0.2);
  f.collide(-w / 2, 0, -d / 2, w / 2, top, d / 2);
}

export function planter(b, rng, x, y, z, { w = 0.8, d = 0.6, h = 0.55, key = 'black', plant = 'bamboo', leaf = 'leaf' } = {}) {
  b.box(key, x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
  b.box('soil', x - w / 2 + 0.03, y + h - 0.02, z - d / 2 + 0.03, x + w / 2 - 0.03, y + h + 0.005, z + d / 2 - 0.03, false);
  const f = b.frame(x, y + h, z, 0);
  if (plant === 'bamboo') {
    const n = rng.int(6, 11);
    let top = 0;
    for (let i = 0; i < n; i++) {
      const px = rng.range(-w / 2 + 0.1, w / 2 - 0.1);
      const pz = rng.range(-d / 2 + 0.1, d / 2 - 0.1);
      const hh = rng.range(1.6, 2.8);
      top = Math.max(top, hh);
      const lean = rng.range(-0.06, 0.06);
      f.geo('stem', CYL8, px, hh / 2, pz, 0, 0.018, hh, 0.018, lean, lean * 0.5);
      const tufts = rng.int(3, 5);
      for (let k = 0; k < tufts; k++) {
        const ly = hh * rng.range(0.5, 1.0);
        const ox = px + lean * ly;
        const blades = rng.int(3, 5);
        const base = rng.range(0, Math.PI * 2);
        for (let q = 0; q < blades; q++) {
          const yaw = base + (q / blades) * Math.PI * 2 + rng.range(-0.3, 0.3);
          const len = rng.range(0.16, 0.26);
          f.geo(leaf, BLOB, ox + Math.sin(yaw) * len * 0.8, ly - len * 0.25, pz + Math.cos(yaw) * len * 0.8, yaw, 0.03, 0.006, len, rng.range(0.25, 0.6));
        }
      }
    }
    b.collider(x - w / 2, y, z - d / 2, x + w / 2, y + h + top, z + d / 2);
  } else if (plant === 'blades') {
    // Upright sword-leaved clump (snake plant).
    const n = rng.int(22, 34);
    let top = 0;
    for (let i = 0; i < n; i++) {
      const hh = rng.range(0.5, 1.15);
      top = Math.max(top, hh);
      const px = rng.range(-w / 2 + 0.08, w / 2 - 0.08);
      const pz = rng.range(-d / 2 + 0.08, d / 2 - 0.08);
      f.geo('leafSoft', BLADE, px, hh / 2, pz, rng.range(0, Math.PI), rng.range(0.018, 0.032), hh, 0.006, rng.range(-0.22, 0.22), rng.range(-0.22, 0.22));
    }
    b.collider(x - w / 2, y, z - d / 2, x + w / 2, y + h + top, z + d / 2);
  } else {
    // Clipped topiary balls on short stems.
    const n = Math.max(1, Math.round(w / 0.45));
    for (let i = 0; i < n; i++) {
      const r = rng.range(0.2, 0.28);
      const px = n === 1 ? 0 : -w / 2 + (w * (i + 0.5)) / n;
      const sh = rng.range(0.15, 0.5);
      f.geo('stem', CYL8, px, sh / 2, 0, 0, 0.02, sh, 0.02);
      f.geo('leafSoft', BALL, px, sh + r * 0.9, 0, rng.range(0, 6), r, r, r);
    }
    b.collider(x - w / 2, y, z - d / 2, x + w / 2, y + h + 1.1, z + d / 2);
  }
}

// Stacked cubes as a side table / sculpture.
export function cubes(b, rng, x, y, z, keys) {
  let yy = y;
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.42, 0.5);
    const f = b.frame(x + rng.range(-0.04, 0.04), yy, z + rng.range(-0.04, 0.04), rng.range(-0.15, 0.15));
    f.geo(rng.pick(keys), rbox(s, s, s, 0.015), 0, s / 2, 0);
    yy += s;
  }
  b.collider(x - 0.3, y, z - 0.3, x + 0.3, yy, z + 0.3);
}

export function trash(b, x, y, z) {
  const f = b.frame(x, y, z, 0);
  f.geo('metal', CYL, 0, 0.36, 0, 0, 0.19, 0.72, 0.19);
  f.geo('darkMetal', CYL, 0, 0.725, 0, 0, 0.2, 0.012, 0.2);
  b.collider(x - 0.2, y, z - 0.2, x + 0.2, y + 0.73, z + 0.2);
}

export function column(b, x, z, y0, y1, r, key = 'white', square = false, trim = false) {
  if (square) {
    b.box(key, x - r, y0, z - r, x + r, y1, z + r);
    if (trim) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('metal', x + sx * r - 0.02, y0, z + sz * r - 0.02, x + sx * r + 0.02, y1, z + sz * r + 0.02, false);
  } else {
    const f = b.frame(x, y0, z, 0);
    f.geo(key, CYL, 0, (y1 - y0) / 2, 0, 0, r, y1 - y0, r);
    b.collider(x - r, y0, z - r, x + r, y1, z + r);
  }
}

export function sculpture(b, rng, x, y, z, key = 'accent') {
  const s = rng.range(0.9, 1.2);
  b.box(key, x - s / 2, y, z - s / 2, x + s / 2, y + 1.1, z + s / 2);
  const f = b.frame(x, y + 1.1, z, rng.range(0, Math.PI));
  const style = rng.int(0, 3);
  if (style === 0) {
    f.geo('whiteGloss', new THREE.TorusKnotGeometry(0.32, 0.07, 96, 10, 2, 3), 0, 0.55, 0);
  } else if (style === 1) {
    let yy = 0;
    for (let k = 0; k < 6; k++) {
      const h = rng.range(0.15, 0.35);
      f.geo('whiteGloss', UBOX, rng.range(-0.08, 0.08), yy + h / 2, 0, k * 0.35, rng.range(0.25, 0.55), h, rng.range(0.2, 0.4));
      yy += h;
    }
  } else if (style === 2) {
    f.geo('whiteGloss', new THREE.SphereGeometry(0.28, 24, 16), 0, 0.5, 0, 0, 1, 1.6, 0.7);
    f.geo('whiteGloss', CYL8, 0, 0.1, 0, 0, 0.08, 0.2, 0.08);
  } else {
    // Folded blades, like the steel piece in the orange office.
    for (let k = 0; k < 4; k++) f.geo('metal', UBOX, (k - 1.5) * 0.06, 0.8, 0, k * 0.25, 0.3 - k * 0.04, 1.6, 0.03, 0, 0.08 * (k - 1.5));
  }
  b.collider(x - s / 2, y, z - s / 2, x + s / 2, y + 2.1, z + s / 2);
}

// ----------------------------------------------------------------- ceiling

export function downlight(b, x, y, z) {
  const f = b.frame(x, y, z, 0);
  f.geo('ceil:metal', CYL, 0, -0.008, 0, 0, 0.1, 0.016, 0.1);
  f.geo('ceil:emissive', DISC_DOWN, 0, -0.017, 0, 0, 0.07, 1, 0.07);
}

export function smokeDetector(b, x, y, z) {
  const f = b.frame(x, y, z, 0);
  f.geo('ceil:white', CYL, 0, -0.02, 0, 0, 0.06, 0.04, 0.06);
  f.geo('ceil:darkMetal', CYL, 0, -0.042, 0, 0, 0.012, 0.006, 0.012);
}

export function diffuser(b, x, y, z, s = 0.6) {
  const f = b.frame(x, y, z, 0);
  f.geo('ceil:diffuser', PLANE, 0, -0.004, 0, 0, s, s, 1, Math.PI / 2);
}

export function pendantRing(b, x, y, z, R, ceilY) {
  const f = b.frame(x, y, z, 0);
  f.geo('ceil:white', new THREE.TorusGeometry(R, Math.max(0.06, R * 0.08), 8, 48), 0, 0.02, 0, 0, 1, 1, 0.6, Math.PI / 2);
  f.geo('ceil:emissiveSoft', new THREE.RingGeometry(R * 0.9, R * 1.1, 48, 1), 0, -0.035, 0, 0, 1, 1, 1, Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const len = ceilY - y;
    f.geo('ceil:metal', CYL8, Math.cos(a) * R, len / 2, Math.sin(a) * R, 0, 0.006, len, 0.006);
  }
  f.geo('ceil:metal', CYL, 0, ceilY - y - 0.02, 0, 0, 0.12, 0.04, 0.12);
}

export function pendantDisc(b, x, y, z, r, ceilY, key = 'white') {
  const f = b.frame(x, y, z, 0);
  f.geo(`ceil:${key}`, CYL, 0, 0.05, 0, 0, r, 0.1, r);
  f.geo('ceil:emissive', DISC_DOWN, 0, -0.002, 0, 0, r * 0.88, 1, r * 0.88);
  const len = ceilY - y - 0.1;
  for (const s of [-1, 1]) f.geo('ceil:metal', CYL8, s * r * 0.5, 0.1 + len / 2, 0, 0, 0.006, len, 0.006);
}

// Square suspended panel with an L of light underneath (meeting rooms).
export function pendantSquare(b, x, y, z, s, ceilY, key = 'accent', rot = 0) {
  const f = b.frame(x, y, z, rot);
  f.box(`ceil:${key}`, -s / 2, 0, -s / 2, s / 2, 0.06, s / 2);
  f.box('ceil:metal', -s / 2 - 0.01, 0, -s / 2 - 0.01, s / 2 + 0.01, 0.012, s / 2 + 0.01);
  f.box('ceil:emissive', -s * 0.32, -0.006, -0.03, s * 0.32, 0, 0.03);
  f.box('ceil:emissive', -s * 0.32, -0.006, -0.03, -s * 0.32 + 0.06, 0, s * 0.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.geo('ceil:metal', CYL8, sx * s * 0.4, 0.06 + (ceilY - y - 0.06) / 2, sz * s * 0.4, 0, 0.005, ceilY - y - 0.06, 0.005);
}

export function lightPanel(b, x0, z0, x1, z1, y, framed = false) {
  b.box('ceil:emissive', x0, y - 0.015, z0, x1, y, z1, false);
  if (framed) {
    const t = 0.1;
    b.box('ceil:black', x0 - t, y - 0.05, z0 - t, x1 + t, y, z0, false);
    b.box('ceil:black', x0 - t, y - 0.05, z1, x1 + t, y, z1 + t, false);
    b.box('ceil:black', x0 - t, y - 0.05, z0, x0, y, z1, false);
    b.box('ceil:black', x1, y - 0.05, z0, x1 + t, y, z1, false);
  } else {
    const t = 0.03;
    b.box('ceil:metal', x0 - t, y - 0.02, z0 - t, x1 + t, y, z0, false);
    b.box('ceil:metal', x0 - t, y - 0.02, z1, x1 + t, y, z1 + t, false);
    b.box('ceil:metal', x0 - t, y - 0.02, z0, x0, y, z1, false);
    b.box('ceil:metal', x1, y - 0.02, z0, x1 + t, y, z1, false);
  }
}

// Serpentine accent soffit hanging from a tall ceiling (as in the big atrium).
export function waveRibbon(b, rng, x0, x1, zc, width, yTop, depth, amp, hang, key = 'accent', alongZ = false) {
  const L = x1 - x0;
  const shape = new THREE.Shape();
  const n = 64;
  const periods = rng.range(0.6, 1.4);
  const ph = rng.range(0, Math.PI * 2);
  const wave = (t) => Math.sin(t * periods * Math.PI * 2 + ph) * amp;
  shape.moveTo(0, wave(0));
  for (let i = 1; i <= n; i++) shape.lineTo((i / n) * L, wave(i / n));
  for (let i = n; i >= 0; i--) shape.lineTo((i / n) * L, wave(i / n) + width);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  const f = alongZ ? b.frame(zc + width / 2, yTop, x0, -Math.PI / 2) : b.frame(x0, yTop, zc - width / 2, 0);
  f.geo(`ceil:${key}`, geo, 0, 0, 0, 0, 1, 1, 1, Math.PI / 2);
  // Hangers.
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    f.geo('ceil:metal', CYL8, t * L, hang / 2, wave(t) + width / 2, 0, 0.006, hang, 0.006);
  }
  geo.dispose();
}

export function banner(b, x, top, z, w, len, key, rot) {
  const f = b.frame(x, top, z, rot);
  f.box(`ceil:${key}`, -w / 2, -len, -0.01, w / 2, 0, 0.01);
  f.box('ceil:metal', -w / 2 - 0.05, -0.04, -0.02, w / 2 + 0.05, 0, 0.02);
}

// ------------------------------------------------------------- wall pieces

export function tv(b, x, y, z, rot, w, screenKey = 'screen0') {
  const h = w * 0.5625;
  const f = b.frame(x, y, z, rot);
  f.box('black', -w / 2 - 0.03, -0.03, 0, w / 2 + 0.03, h + 0.03, 0.05);
  f.geo(screenKey, PLANE, 0, h / 2, 0.052, 0, w, h, 1);
  f.box('black', -w * 0.3, -0.12, 0, w * 0.3, -0.05, 0.08);
}

export function art(b, x, y, z, rot, w, h, key, frameKey = 'white') {
  const f = b.frame(x, y, z, rot);
  f.box(frameKey, -w / 2 - 0.02, -0.02, 0, w / 2 + 0.02, h + 0.02, 0.045);
  f.geo(key, PLANE, 0, h / 2, 0.047, 0, w, h, 1);
}

export function whiteboard(b, x, y, z, rot, w) {
  const f = b.frame(x, y, z, rot);
  const h = w * 0.55;
  f.box('metal', -w / 2 - 0.02, -0.02, 0, w / 2 + 0.02, h + 0.02, 0.02);
  f.box('whiteGloss', -w / 2, 0, 0.001, w / 2, h, 0.022);
  f.box('metal', -w / 2 + 0.1, -0.05, 0, w / 2 - 0.1, -0.02, 0.07);
}

// Wide emblem + name sign, fixed 8:1 (see textures.logo).
export function logoSign(b, x, y, z, rot, h, key = 'logo') {
  const f = b.frame(x, y, z, rot);
  f.geo(key, PLANE, 0, h / 2, 0.03, 0, h * 8, h, 1);
}

// Painted monogram with the name below, 2:1 (see textures.monogram).
export function monogramSign(b, x, y, z, rot, w, key = 'mono') {
  const f = b.frame(x, y, z, rot);
  f.geo(key, PLANE, 0, w / 4, 0.02, 0, w, w / 2, 1);
}

// Pool of light washing down a wall from a nearby downlight.
export function scallop(b, x, yTop, z, rot, w = 1.3, h = 2.5) {
  const f = b.frame(x, 0, z, rot);
  f.geo('scallop', PLANE, 0, yTop - h / 2, 0.024, 0, w, h, 1);
}

export function exitSign(b, x, y, z, rot) {
  const f = b.frame(x, y, z, rot);
  f.box('white', -0.2, 0, 0, 0.2, 0.2, 0.05);
  f.geo('exit', PLANE, 0, 0.1, 0.052, 0, 0.36, 0.18, 1);
}

export function pylon(b, x, y, z, rot, h, key = 'pylon') {
  const f = b.frame(x, y, z, rot);
  const w = h / 4;
  f.box('white', -w / 2, 0, -0.18, w / 2, h, 0.18, true);
  f.geo(key, PLANE, 0, h / 2, 0.182, 0, w, h, 1);
  f.box('accent', -w / 2 - 0.02, 0, -0.2, w / 2 + 0.02, 0.08, 0.2);
}

// Door frame (and leaf) in an opening of a wall running along `axis` at `c`.
// open: leaf swung 90 degrees toward side `into` (+1 / -1 along the wall
// normal); otherwise the leaf closes the opening.
export function door(b, axis, c, a0, a1, y, top, { open = true, into = 1, glass = false, frame = 'metal', leaf = 'doorWhite', T = 0.2 }) {
  const ft = T / 2 + 0.015;
  b.wallBox(frame, axis, c, a0 - 0.05, a0, y, y + top + 0.05, -ft, ft);
  b.wallBox(frame, axis, c, a1, a1 + 0.05, y, y + top + 0.05, -ft, ft);
  b.wallBox(frame, axis, c, a0, a1, y + top, y + top + 0.05, -ft, ft);
  const wl = a1 - a0 - 0.01;
  const lk = glass ? 'glass' : leaf;
  const t = 0.045;
  const col = glass ? { glass: true } : undefined;
  const panel = (x0, z0, x1, z1) => {
    b.box(lk, x0, y + 0.01, z0, x1, y + top - 0.005, z1, false);
    b.collider(x0, y, z0, x1, y + top, z1, col);
  };
  if (!open) {
    if (axis === 'x') panel(a0 + 0.005, c - t / 2, a1 - 0.005, c + t / 2);
    else panel(c - t / 2, a0 + 0.005, c + t / 2, a1 - 0.005);
    const hx = a1 - 0.12;
    if (axis === 'x') for (const s of [-1, 1]) b.box('metal', hx - 0.08, y + 1.02, c + s * (t / 2 + 0.03) - 0.01, hx + 0.02, y + 1.05, c + s * (t / 2 + 0.03) + 0.01, false);
    else for (const s of [-1, 1]) b.box('metal', c + s * (t / 2 + 0.03) - 0.01, y + 1.02, hx - 0.08, c + s * (t / 2 + 0.03) + 0.01, y + 1.05, hx + 0.02, false);
    return;
  }
  const n0 = c + into * (T / 2 + 0.02);
  const n1 = c + into * (T / 2 + 0.02 + wl);
  if (axis === 'x') {
    panel(a0 + 0.005, Math.min(n0, n1), a0 + 0.005 + t, Math.max(n0, n1));
    if (glass) {
      b.box('metal', a0 + 0.004, y, Math.min(n0, n1), a0 + t + 0.006, y + 0.12, Math.max(n0, n1), false);
      b.box('metal', a0 + 0.004, y + top - 0.07, Math.min(n0, n1), a0 + t + 0.006, y + top, Math.max(n0, n1), false);
    }
  } else {
    panel(Math.min(n0, n1), a0 + 0.005, Math.max(n0, n1), a0 + 0.005 + t);
    if (glass) {
      b.box('metal', Math.min(n0, n1), y, a0 + 0.004, Math.max(n0, n1), y + 0.12, a0 + t + 0.006, false);
      b.box('metal', Math.min(n0, n1), y + top - 0.07, a0 + 0.004, Math.max(n0, n1), y + top, a0 + t + 0.006, false);
    }
  }
}

// Lift doors on one face (`side` = +1 / -1 along the normal) of a wall.
export function elevators(b, axis, c, a0, a1, y, side, T = 0.2) {
  const n = Math.max(1, Math.min(4, Math.floor((a1 - a0 - 0.8) / 2.3)));
  const pitch = (a1 - a0) / n;
  const f0 = side * (T / 2);
  const out = (o0, o1) => [Math.min(f0 + side * o0, f0 + side * o1), Math.max(f0 + side * o0, f0 + side * o1)];
  for (let i = 0; i < n; i++) {
    const m = a0 + pitch * (i + 0.5);
    const hw = 0.6;
    b.wallBox('darkMetal', axis, c, m - hw - 0.12, m + hw + 0.12, y, y + 2.45, ...out(0, 0.04));
    b.wallBox('metal', axis, c, m - hw, m - 0.004, y, y + 2.25, ...out(0.04, 0.055));
    b.wallBox('metal', axis, c, m + 0.004, m + hw, y, y + 2.25, ...out(0.04, 0.055));
    b.wallBox('black', axis, c, m - 0.25, m + 0.25, y + 2.52, y + 2.66, ...out(0, 0.03));
    b.wallBox('emissiveWarm', axis, c, m - 0.08, m + 0.08, y + 2.56, y + 2.62, ...out(0.03, 0.034));
    const bx = m + hw + 0.35;
    b.wallBox('metal', axis, c, bx - 0.06, bx + 0.06, y + 1.0, y + 1.25, ...out(0, 0.015));
    b.wallBox('emissiveWarm', axis, c, bx - 0.02, bx + 0.02, y + 1.08, y + 1.12, ...out(0.015, 0.02));
  }
}

// Railing along an axis-aligned segment at floor level y.
export function railing(b, x0, z0, x1, z1, y, style = 'glass') {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.2) return;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const n = Math.max(1, Math.ceil(len / 1.5));
  const H = 1.05;
  const seg = (a, b2, y0, y1, t, key) => {
    if (alongX) b.box(key, Math.min(a, b2), y0, z0 - t, Math.max(a, b2), y1, z0 + t, false);
    else b.box(key, x0 - t, y0, Math.min(a, b2), x0 + t, y1, Math.max(a, b2), false);
  };
  const a0 = alongX ? x0 : z0;
  const a1 = alongX ? x1 : z1;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    seg(a - 0.025, a + 0.025, y, y + H, 0.025, 'metal');
  }
  seg(a0, a1, y + H - 0.05, y + H, 0.035, 'metal');
  if (style === 'glass') seg(a0, a1, y + 0.08, y + H - 0.08, 0.008, 'glass');
  else for (const hy of [0.2, 0.4, 0.6, 0.8]) seg(a0, a1, y + hy, y + hy + 0.02, 0.01, 'metal');
  if (alongX) b.collider(Math.min(x0, x1), y, z0 - 0.05, Math.max(x0, x1), y + H, z0 + 0.05);
  else b.collider(x0 - 0.05, y, Math.min(z0, z1), x0 + 0.05, y + H, Math.max(z0, z1));
}

// Open stair climbing along local +z from (x, y, z). Returns the run length.
export function stairs(b, x, y, z, rot, { width = 1.6, rise = 4.4, tread = 0.29, railSide = 1, key = 'white', stringer = 'darkMetal' } = {}) {
  const n = Math.round(rise / 0.18);
  const h = rise / n;
  const run = n * tread;
  const f = b.frame(x, y, z, rot);
  for (let i = 0; i < n; i++) f.box(key, -width / 2, (i + 1) * h - 0.05, i * tread, width / 2, (i + 1) * h, (i + 1) * tread + 0.02, true);
  const L = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  for (const s of [-1, 1]) f.geo(stringer, UBOX, s * (width / 2 + 0.03), rise / 2 - 0.05, run / 2, 0, 0.05, 0.28, L, -ang);
  const rx = railSide * (width / 2 + 0.03);
  f.geo('metal', UBOX, rx, rise / 2 + 1.0, run / 2, 0, 0.05, 0.05, L, -ang);
  for (let i = 1; i < n; i += 3) f.box('metal', rx - 0.02, (i + 1) * h, i * tread + tread / 2 - 0.02, rx + 0.02, (i + 1) * h + 1.0, i * tread + tread / 2 + 0.02);
  f.geo('glass', UBOX, rx, rise / 2 + 0.5, run / 2, 0, 0.012, 0.9, L, -ang);
  f.collide(rx - 0.05, 0, 0, rx + 0.05, rise + 1.1, run);
  return run;
}
