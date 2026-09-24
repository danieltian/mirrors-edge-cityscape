import * as THREE from 'three';
import * as F from '../office/furniture.js';
import * as M from './props.js';
import { FH } from './plan.js';
import { Region } from './region.js';

// The outside of the mall: its outer walls, the entrance on the plaza side,
// the plaza itself and the buildings either side of it. Every part comes in
// several kinds so no two malls arrive the same way:
//   entrance: glazed lattice box, cantilevered canopy, glass barrel vault,
//             giant portal frame, glass drum, space-frame canopy on tree
//             columns, or a colonnaded loggia between wing walls
//   facade:   stone with string courses, accent bands, fins, panel grid, or
//             ribbon glazing on the upper floors
//   plaza:    framed square, raised terrace with grand steps, sunken court,
//             reflecting pool, grid of trees, drop-off loop, or lawns
//   sides:    colonnaded block, office tower, car park, or open street

const CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const PLANE = new THREE.PlaneGeometry(1, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function pickExterior(rng) {
  const side = () => rng.weighted([['colonnade', 2], ['tower', 1.5], ['garage', 1], ['open', 1.5]]);
  const layout = rng.weighted([['framed', 1.4], ['terrace', 1.2], ['sunken', 1], ['pool', 1.2], ['bosque', 1], ['dropoff', 1], ['lawn', 1]]);
  return {
    entrance: rng.weighted([['lattice', 1], ['canopy', 1.3], ['vault', 1.1], ['portal', 1.1], ['drum', 1], ['spaceframe', 1.2], ['loggia', 1]]),
    facade: rng.weighted([['stone', 1.5], ['bands', 1.2], ['fins', 1.2], ['panels', 1.2], ['glazed', 1]]),
    stone: rng.pick(['#efcdb6', '#eeece6', '#dedfe0', '#e6bda3', '#f3e3cf', '#d3d9df', '#c9c4bd']),
    frame: rng.weighted([['darkMetal', 2], ['white', 1.5], ['accentGloss', 1]]),
    layout,
    sides: [side(), side()],
    paving: rng.weighted([['plain', 1], ['grid', 1.2], ['bands', 1], ['axis', 1]]),
    lamps: rng.weighted([['mast', 1.5], ['bollard', 1], ['none', 0.6]]),
    ads: rng.int(0, 2),
    poles: rng.chance(0.55),
    street: layout === 'terrace' ? -rng.range(1.3, 2.3) : -0.3,
    // Plaza proportions (margins beyond the building, depth).
    plaza: { west: rng.range(4, 18), east: rng.range(4, 18), depth: rng.range(30, 48) },
  };
}

export function buildExterior({ b, rng, plan, style, addFocus, snap }) {
  const X = style.exterior;
  const { B, entrance: E, HA, levels, plaza } = plan;
  const Z = B.z1; // outer face of the plaza wall is at Z + 0.2
  const cx = (E.x0 + E.x1) / 2;
  const ew = E.x1 - E.x0;
  const S = X.street;
  const wallH = HA + 1.2;
  const frameKey = X.frame;

  // ------------------------------------------------------------ helpers
  // Dark glazing screen over the facade around the doors (doors stay open).
  const screen = (x0, x1, y1) => {
    const z = Z + 0.34;
    const back = (a0, a1, y0, y2) => a1 - a0 > 0.05 && b.box('shopDark', a0, y0, z, a1, y2, z + 0.04, false);
    back(x0, x1, 3.45, y1 - 0.02);
    back(x0, E.x0 - 0.1, 0, 3.45);
    back(E.x1 + 0.1, x1, 0, 3.45);
    const glass = (a0, a1, y0, y2) => a1 - a0 > 0.05 && b.box('glass', a0, y0, z + 0.06, a1, y2, z + 0.08, false);
    glass(x0, x1, 3.45, y1 - 0.02);
    glass(x0, E.x0 - 0.1, 0, 3.45);
    glass(E.x1 + 0.1, x1, 0, 3.45);
    const n = Math.max(2, Math.round((x1 - x0) / 1.6));
    for (let i = 0; i <= n; i++) {
      const a = x0 + ((x1 - x0) * i) / n;
      const inDoor = a > E.x0 - 0.2 && a < E.x1 + 0.2;
      b.box(frameKey, a - 0.04, inDoor ? 3.45 : 0, z + 0.04, a + 0.04, y1 - 0.02, z + 0.16, false);
    }
    for (let y = FH; y < y1 - 0.5; y += FH) b.box(frameKey, x0, y - 0.05, z + 0.04, x1, y + 0.05, z + 0.16, false);
    b.box(frameKey, x0, 3.4, z + 0.04, x1, 3.52, z + 0.17, false);
    b.box('white', x0 - 0.15, y1 - 0.25, Z + 0.33, x1 + 0.15, y1, Z + 0.62, false);
    for (const a of [x0, x1]) b.box('white', a - 0.15, 0, Z + 0.33, a + 0.15, y1 - 0.25, Z + 0.6, false);
    if (E.x0 - x0 > 0.2) b.collider(x0, 0, Z, E.x0, y1, Z + 0.62, { glass: true });
    if (x1 - E.x1 > 0.2) b.collider(E.x1, 0, Z, x1, y1, Z + 0.62, { glass: true });
  };
  const mallSign = (x, y, z, w, rot = 0) => {
    const f = b.frame(x, y, z, rot);
    f.geo('mallSign', PLANE, 0, 0, 0, 0, w, w / 8, 1);
  };
  const mallMark = (x, y, z, s) => {
    const f = b.frame(x, y, z, 0);
    f.geo('mallMark', PLANE, 0, 0, 0, 0, s, s, 1);
  };
  // Grid of recessed downlights under a soffit at height y.
  const soffitLights = (x0, x1, z0, z1, y) => {
    for (let x = x0 + 1.2; x < x1 - 0.8; x += 2.4) for (let z = z0 + 1.2; z < z1 - 0.8; z += 2.4) b.box('emissiveSoft', x - 0.22, y - 0.012, z - 0.22, x + 0.22, y, z + 0.22, false);
  };

  // ------------------------------------------------------------ doors
  {
    const n = Math.max(4, Math.round(ew / 1.8));
    const dw = ew / n;
    for (let i = 0; i < n; i++) {
      const a = E.x0 + i * dw;
      b.box(frameKey, a - 0.04, 0, Z - 0.06, a + 0.04, 3.4, Z + 0.06, false);
      const open = Math.abs(i + 0.5 - n / 2) < 1.1;
      if (!open) {
        b.box('glass', a, 0, Z - 0.015, a + dw, 3.3, Z + 0.015, false);
        b.collider(a, 0, Z - 0.05, a + dw, 3.4, Z + 0.05, { glass: true });
        b.box('metal', a + dw / 2 - 0.02, 0.9, Z - 0.08, a + dw / 2 + 0.02, 1.6, Z + 0.08, false);
      }
    }
    b.box(frameKey, E.x0, 3.3, Z - 0.08, E.x1, 3.45, Z + 0.08, false);
  }

  // ------------------------------------------------------------ entrance
  const entrances = {
    // Glazed box with a lattice of diagonal struts, the name above.
    lattice() {
      const VB = { x0: E.x0 - 1.2, x1: E.x1 + 1.2, z0: Z + 0.2, z1: Z + 4.8, h: Math.min(HA, 2 * FH + 1.6) };
      const { x0, x1, z0, z1, h } = VB;
      b.box('white', x0 - 0.3, h, z0, x1 + 0.3, h + 0.5, z1 + 0.3);
      b.box('white', x0 - 0.3, h - 2.0, z1, x1 + 0.3, h, z1 + 0.3);
      mallSign((x0 + x1) / 2, h - 1.0, z1 + 0.305, Math.min(1.4, ((x1 - x0) * 0.9) / 8) * 8);
      const gh = h - 2.0;
      b.box('glass', x0, 0, z1 - 0.02, x1, gh, z1 + 0.02, false);
      b.collider(x0, 0, z1 - 0.05, (x0 + x1) / 2 - 1.6, gh, z1 + 0.05, { glass: true });
      b.collider((x0 + x1) / 2 + 1.6, 0, z1 - 0.05, x1, gh, z1 + 0.05, { glass: true });
      const s = 2.4;
      const node = (x, y) => V(x, y, z1 - 0.12);
      for (let k = -Math.ceil(gh / s); k <= Math.ceil((x1 - x0) / s) + 1; k++) {
        for (const sg of [1, -1]) {
          const pts = [];
          for (const y of [0, gh]) {
            const x = x0 + k * s + sg * y;
            if (x >= x0 - 1e-6 && x <= x1 + 1e-6) pts.push(node(x, y));
          }
          for (const x of [x0, x1]) {
            const y = (x - x0 - k * s) * sg;
            if (y > 0 && y < gh) pts.push(node(x, y));
          }
          if (pts.length >= 2) b.between('frame', CYL6, pts[0], pts[1], 0.07);
        }
      }
      for (const x of [x0, x1]) b.box('white', x - 0.15, 0, z1 - 0.2, x + 0.15, gh, z1 - 0.01);
      b.box('white', x0 + 0.15, gh - 0.3, z1 - 0.25, x1 - 0.15, gh, z1 - 0.03);
      b.box('white', x0 + 0.15, 3.4, z1 - 0.2, x1 - 0.15, 3.6, z1 - 0.03);
      for (const x of [x0, x1]) {
        b.box('glass', x - 0.02, 0, z0, x + 0.02, gh, z1 - 0.2, false);
        b.collider(x - 0.05, 0, z0, x + 0.05, gh, z1, { glass: true });
        for (let z = z0 + (z1 - z0) / 2; z < z1 - 0.3; z += (z1 - z0) / 2) b.box(frameKey, x - 0.05, 0, z - 0.05, x + 0.05, gh, z + 0.05, false);
      }
      b.box('wallAccent', E.x0 - 1.1, 3.6, Z + 0.34, E.x1 + 1.1, h, Z + 0.39, false);
      mallMark((x0 + x1) / 2, 3.8 + (gh - 3.8) / 2, Z + 0.4, Math.min(gh - 4.2, 6));
      return { VB, span: [x0 - 0.4, x1 + 0.4], top: h + 0.5, focus: [(x0 + x1) / 2, h * 0.5, z1] };
    },

    // Thin white canopy cantilevered over the plaza in front of a glazed
    // screen, on slim posts or hung from tie rods; the name stands on top.
    canopy() {
      const H = Math.min(HA, 2 * FH);
      const gw = ew + rng.range(4, 10);
      const x0 = cx - gw / 2;
      const x1 = cx + gw / 2;
      screen(x0, x1, H);
      const D = rng.range(6, 10);
      const Wc = gw + rng.range(0, 8);
      const hc = rng.range(4.4, 5.8);
      const c0 = cx - Wc / 2;
      const c1 = cx + Wc / 2;
      b.box('white', c0, hc, Z + 0.62, c1, hc + 0.45, Z + D);
      b.box(rng.chance(0.5) ? 'accentGloss' : 'white', c0 - 0.02, hc + 0.1, Z + D, c1 + 0.02, hc + 0.35, Z + D + 0.05, false);
      soffitLights(c0, c1, Z + 0.62, Z + D, hc);
      if (rng.chance(0.55)) {
        for (const x of [c0 + 0.8, c1 - 0.8]) M.column(b, x, Z + D - 0.8, 0, hc, 0.16, true, 'plain');
      } else {
        const n = Math.max(2, Math.round(Wc / 6));
        for (let i = 0; i <= n; i++) {
          const x = c0 + 0.5 + ((Wc - 1) * i) / n;
          b.between('metal', CYL6, V(x, hc + 0.45, Z + D - 0.4), V(x, Math.min(H - 0.5, hc + 5), Z + 0.62), 0.03);
        }
      }
      const sw = Math.min(Wc * 0.7, 14);
      mallSign(cx, hc + 0.45 + sw / 16, Z + D - 0.3, sw);
      if (H - hc > 4) mallMark(cx, (hc + 0.45 + sw / 8 + H) / 2 + 0.6, Z + 0.3, Math.min(H - hc - 3, 5));
      const VB = { x0: E.x0 - 1.2, x1: E.x1 + 1.2, z0: Z + 0.2, z1: Z + 1.4, h: hc };
      return { VB, span: [Math.min(x0, c0) - 0.4, Math.max(x1, c1) + 0.4], top: H, focus: [cx, hc, Z + D] };
    },

    // Glass barrel vault on glazed walls pushed out from the facade.
    vault() {
      const R = (ew + rng.range(2.4, 6)) / 2;
      const D = rng.range(5, 8);
      const hs = rng.range(3.6, 4.6);
      const x0 = cx - R;
      const x1 = cx + R;
      const z0 = Z + 0.2;
      const z1 = z0 + D;
      const ribKey = rng.chance(0.5) ? 'white' : 'accentGloss';
      for (const x of [x0, x1]) {
        b.box('glass', x - 0.02, 0.2, z0, x + 0.02, hs, z1, false);
        b.collider(x - 0.05, 0, z0, x + 0.05, hs, z1, { glass: true });
        b.box('white', x - 0.12, 0, z0, x + 0.12, 0.2, z1);
        b.box(ribKey, x - 0.1, hs - 0.25, z0, x + 0.1, hs, z1, false);
      }
      const skin = new THREE.CylinderGeometry(R, R, D, 28, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(cx, hs, z0 + D / 2);
      b.push('glassDouble', skin);
      const nr = Math.max(3, Math.round(D / 1.6));
      for (let i = 0; i <= nr; i++) {
        const z = z0 + 0.1 + ((D - 0.2) * i) / nr;
        b.push(ribKey, new THREE.TorusGeometry(R, 0.07, 6, 24, Math.PI).translate(cx, hs, z));
        b.box(ribKey, x0 - 0.08, 0.2, z - 0.07, x0 + 0.08, hs, z + 0.07, false);
        b.box(ribKey, x1 - 0.08, 0.2, z - 0.07, x1 + 0.08, hs, z + 0.07, false);
      }
      b.push('glassDouble', new THREE.CircleGeometry(R, 20, 0, Math.PI).translate(cx, hs, z1));
      // Front: glass either side of the open doors, a beam with the name.
      const dg = 1.8;
      for (const [a0, a1] of [[x0, cx - dg], [cx + dg, x1]]) {
        b.box('glass', a0, 0.2, z1 - 0.02, a1, hs - 0.8, z1 + 0.02, false);
        b.collider(a0, 0, z1 - 0.05, a1, hs, z1 + 0.05, { glass: true });
      }
      b.box(frameKey, cx - dg - 0.06, 0, z1 - 0.06, cx - dg + 0.06, hs - 0.8, z1 + 0.06, false);
      b.box(frameKey, cx + dg - 0.06, 0, z1 - 0.06, cx + dg + 0.06, hs - 0.8, z1 + 0.06, false);
      b.box('white', x0 - 0.1, hs - 0.8, z1 - 0.1, x1 + 0.1, hs, z1 + 0.1, false);
      mallSign(cx, hs - 0.4, z1 + 0.105, Math.min(0.62 * 8, 2 * R - 0.6));
      const top = hs + R;
      if (top + 3 < wallH - 1) mallMark(cx, Math.min(wallH - 1.8, top + 3.5), Z + 0.34, Math.min(5, wallH - top - 3));
      const VB = { x0, x1, z0, z1, h: top };
      return { VB, span: [x0 - 0.4, x1 + 0.4], top, focus: [cx, hs, z1] };
    },

    // A giant accent frame standing proud of the facade, glazing inside.
    portal() {
      const m = rng.range(1.2, 3.2);
      const pw = rng.range(1.2, 2.2);
      const pd = rng.range(2.4, 4.2);
      const hp = Math.min(wallH + rng.range(-3, 3), HA + 3);
      const lh = rng.range(1.6, 2.6);
      const xi0 = E.x0 - m;
      const xi1 = E.x1 + m;
      const key = rng.pick(['accentGloss', 'white', 'wallAccent', 'blackGloss']);
      b.box(key, xi0 - pw, 0, Z + 0.2, xi0, hp, Z + pd);
      b.box(key, xi1, 0, Z + 0.2, xi1 + pw, hp, Z + pd);
      b.box(key, xi0, hp - lh, Z + 0.2, xi1, hp, Z + pd);
      soffitLights(xi0, xi1, Z + 0.62, Z + pd, hp - lh);
      screen(xi0, xi1, hp - lh);
      mallSign(cx, hp - lh / 2, Z + pd + 0.01, Math.min(lh * 0.55 * 8, xi1 - xi0));
      const VB = { x0: xi0, x1: xi1, z0: Z + 0.2, z1: Z + pd, h: hp };
      return { VB, span: [xi0 - pw - 0.4, xi1 + pw + 0.4], top: hp, focus: [cx, hp * 0.5, Z + pd] };
    },

    // Half drum of glass against the facade with a flat roof disc.
    drum() {
      const R = ew / 2 + rng.range(1.2, 2.6);
      const hd = rng.range(FH + 1, Math.min(HA - 0.5, 2 * FH + 1));
      const z0 = Z + 0.2;
      const gap = 1.7 / R; // door opening (radians either side of the front)
      const seg = (t0, t1, y0, y1) => {
        const g = new THREE.CylinderGeometry(R, R, y1 - y0, Math.max(3, Math.round((t1 - t0) * 12)), 1, true, t0, t1 - t0).translate(cx, (y0 + y1) / 2, z0);
        b.push('glassDouble', g);
      };
      seg(-Math.PI / 2, -gap, 0.15, hd);
      seg(gap, Math.PI / 2, 0.15, hd);
      seg(-gap, gap, 3.4, hd);
      const pt = (t, y) => V(cx + R * Math.sin(t), y, z0 + R * Math.cos(t));
      const nm = Math.max(6, Math.round((Math.PI * R) / 1.5));
      for (let i = 0; i <= nm; i++) {
        const t = -Math.PI / 2 + (Math.PI * i) / nm;
        const door = Math.abs(t) < gap - 0.01;
        b.between(frameKey, CYL6, pt(t, door ? 3.4 : 0), pt(t, hd), 0.05);
      }
      for (const t of [-gap, gap]) b.between(frameKey, CYL6, pt(t, 0), pt(t, 3.4), 0.07);
      const ring = (y, r = 0.06) => b.push(frameKey, new THREE.TorusGeometry(R, r, 6, 32, Math.PI).rotateX(Math.PI / 2).translate(cx, y, z0));
      ring(3.4);
      for (let y = FH; y < hd - 0.5; y += FH) ring(y);
      b.push('white', new THREE.CylinderGeometry(R + 0.7, R + 0.7, 0.55, 40, 1, false, -Math.PI / 2, Math.PI).translate(cx, hd + 0.27, z0));
      b.push('white', new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.15, 40, 1, false, -Math.PI / 2, Math.PI).translate(cx, 0.075, z0));
      for (const [t0, t1] of [[-Math.PI / 2, -gap], [gap, Math.PI / 2]]) {
        const n = Math.max(2, Math.round(((t1 - t0) * R) / 0.6));
        for (let i = 0; i < n; i++) {
          const p = pt(t0 + ((t1 - t0) * i) / n, 0);
          const q = pt(t0 + ((t1 - t0) * (i + 1)) / n, 0);
          b.chain(p.x, 0, p.z, q.x, 0, q.z, 0.06, hd, { glass: true });
        }
      }
      const sw = Math.min(2 * R, 12);
      mallSign(cx, hd + 0.55 + sw / 16, z0 + R + 0.3, sw);
      const VB = { x0: cx - R, x1: cx + R, z0, z1: z0 + R, h: hd };
      return { VB, span: [cx - R - 1.1, cx + R + 1.1], top: hd + 0.6 + sw / 8, focus: [cx, hd * 0.6, z0 + R] };
    },

    // Deep space-frame canopy carried on branching "tree" columns.
    spaceframe() {
      const Wc = ew + rng.range(8, 18);
      const D = rng.range(8, 13);
      const hc = rng.range(FH + 0.5, Math.max(FH + 1, Math.min(2 * FH, HA - 1)));
      const depth = rng.range(1.3, 1.9);
      const c0 = cx - Wc / 2;
      const c1 = cx + Wc / 2;
      const z0 = Z + 0.7;
      const z1 = z0 + D;
      M.spaceFrame(b, c0, c1, z0, z1, hc, 2.4, depth);
      screen(c0 + 1.2, c1 - 1.2, Math.min(hc - 0.3, HA));
      const trunkKey = rng.pick(['white', 'accentGloss', 'frameDark']);
      const cols = rng.chance(0.5) ? [[c0 + Wc * 0.2, z1 - D * 0.3], [c1 - Wc * 0.2, z1 - D * 0.3]] : [[c0 + 2.4, z1 - 2.4], [c1 - 2.4, z1 - 2.4], [cx, z1 - 2.4]];
      for (const [x, z] of cols) {
        const tH = hc * rng.range(0.5, 0.62);
        b.push(trunkKey, CYL.clone().scale(0.28, tH, 0.28).translate(x, tH / 2, z));
        b.collider(x - 0.3, 0, z - 0.3, x + 0.3, tH, z + 0.3);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.between(trunkKey, CYL6, V(x, tH, z), V(x + dx * 2.2, hc, z + dz * 2.2), 0.1);
      }
      mallSign(cx, hc + depth + 0.2 + Math.min(Wc * 0.6, 14) / 16, z1 - 0.2, Math.min(Wc * 0.6, 14));
      const VB = { x0: E.x0 - 1.2, x1: E.x1 + 1.2, z0: Z + 0.2, z1: Z + 1.4, h: hc };
      return { VB, span: [c0 - 0.4, c1 + 0.4], top: hc + depth + 2, focus: [cx, hc * 0.7, z1] };
    },

    // Porch between two solid wing walls, a colonnade across the front.
    loggia() {
      const m = rng.range(2, 5);
      const Dp = rng.range(4.5, 7);
      const hl = rng.range(FH + 1.2, Math.min(2 * FH, HA - 0.6));
      const w0 = E.x0 - m;
      const w1 = E.x1 + m;
      const key = rng.pick(['stone', 'wallAccent', 'white', 'mosaic']);
      b.box(key, w0 - 0.8, 0, Z + 0.2, w0, hl + 0.8, Z + Dp);
      b.box(key, w1, 0, Z + 0.2, w1 + 0.8, hl + 0.8, Z + Dp);
      b.box('white', w0, hl, Z + 0.2, w1, hl + 0.8, Z + Dp + 0.3);
      soffitLights(w0, w1, Z + 0.62, Z + Dp + 0.3, hl);
      screen(w0, w1, hl);
      const n = Math.max(2, Math.round((w1 - w0) / 3.2));
      for (let i = 1; i < n; i++) {
        const x = w0 + ((w1 - w0) * i) / n;
        if (Math.abs(x - cx) < 1.4) continue; // keep the middle bay open
        M.column(b, x, Z + Dp - 0.2, 0, hl, 0.22, true, rng.pick(['plain', 'band']));
      }
      mallSign(cx, hl + 0.4, Z + Dp + 0.31, Math.min(0.6 * 8, w1 - w0));
      if (wallH - hl > 5) mallMark(cx, hl + 0.8 + (wallH - hl - 0.8) / 2, Z + 0.34, Math.min(wallH - hl - 2.5, 5));
      const VB = { x0: w0, x1: w1, z0: Z + 0.2, z1: Z + Dp, h: hl };
      return { VB, span: [w0 - 1.2, w1 + 1.2], top: hl + 0.8, focus: [cx, hl * 0.6, Z + Dp] };
    },
  };
  const ent = entrances[X.entrance]();
  const VB = ent.VB;
  addFocus(...ent.focus, 2, 'entrance');

  // ------------------------------------------------------------ outer walls
  const facadeWall = (axis, c, a0, a1, outward, skip = null) => {
    const o = (p, q) => (outward > 0 ? [p, q] : [-q, -p]);
    const opens = axis === 'x' && c === Z ? [[E.x0, E.x1, 3.4]] : [];
    let cur = a0;
    const pieces = [];
    for (const [o0, o1, oh] of opens) {
      if (o0 > cur) pieces.push([cur, o0, 0]);
      pieces.push([o0, o1, oh]);
      cur = o1;
    }
    if (cur < a1) pieces.push([cur, a1, 0]);
    const foot = Math.min(-0.3, S); // walls run down past the paving to the street
    for (const [p0, p1, oh] of pieces) {
      b.wallBox('wall', axis, c, p0, p1, oh || foot, wallH, -0.15, 0.15, true);
      b.wallBox('stone', axis, c, p0, p1, oh || foot, wallH, ...o(0.15, 0.2));
    }
    // Runs along the wall, interrupted by the entrance where it stands proud.
    const runs = (y0, y1) => {
      if (!skip || y1 < 0 || y0 > skip.top) return [[a0, a1]];
      const r = [];
      if (skip.x0 > a0) r.push([a0, Math.min(a1, skip.x0)]);
      if (skip.x1 < a1) r.push([Math.max(a0, skip.x1), a1]);
      return r;
    };
    const band = (key, y0, y1, p, q) => {
      for (const [r0, r1] of runs(y0, y1)) if (r1 - r0 > 0.1) b.wallBox(key, axis, c, r0, r1, y0, y1, ...o(p, q));
    };
    const top = () => band('stoneBand', wallH - 0.3, wallH, 0.2, 0.34);
    if (X.facade === 'stone') {
      for (let L = 1; L <= levels; L++) band('stoneBand', L * FH - 0.35, L * FH + 0.15, 0.2, 0.32);
      top();
    } else if (X.facade === 'bands') {
      for (let L = 1; L <= levels; L++) {
        band('accentGloss', L * FH - 1.2, L * FH, 0.2, 0.3);
        band('stoneBand', L * FH, L * FH + 0.2, 0.2, 0.32);
      }
      top();
    } else if (X.facade === 'fins') {
      const s = 2.4;
      for (let a = a0 + s / 2; a < a1 - 0.2; a += s) {
        for (const [r0, r1] of runs(0.8, wallH)) if (a > r0 + 0.2 && a < r1 - 0.2) b.wallBox('white', axis, c, a - 0.12, a + 0.12, 0.8, wallH - 0.3, ...o(0.2, 0.85));
      }
      top();
    } else if (X.facade === 'panels') {
      const pw = 2.4;
      const ph = FH / 2;
      for (let y = 0.6; y < wallH - 0.5; y += ph) {
        for (const [r0, r1] of runs(y, y + ph)) {
          for (let a = r0; a < r1 - 0.3; a += pw) b.wallBox(rng.chance(0.08) ? 'accentGloss' : 'white', axis, c, a + 0.02, Math.min(r1, a + pw) - 0.02, y + 0.02, Math.min(wallH - 0.3, y + ph) - 0.02, ...o(0.2, 0.27));
        }
      }
      top();
    } else {
      // Ribbon glazing on the upper floors.
      for (let L = 1; L < levels; L++) {
        const y0 = L * FH + 1.0;
        const y1 = (L + 1) * FH - 0.6;
        if (y1 > wallH - 0.4) continue;
        band('shopDark', y0, y1, 0.2, 0.24);
        band('glass', y0, y1, 0.26, 0.28);
        for (const [r0, r1] of runs(y0, y1)) for (let a = r0 + 0.9; a < r1 - 0.2; a += 1.8) b.wallBox('darkMetal', axis, c, a - 0.04, a + 0.04, y0, y1, ...o(0.2, 0.36));
      }
      for (let L = 1; L <= levels; L++) band('stoneBand', L * FH - 0.35, L * FH + 0.15, 0.2, 0.32);
      top();
    }
  };
  const front = { x0: ent.span[0], x1: ent.span[1], top: ent.top };
  facadeWall('x', B.z0, B.x0, B.x1, -1);
  facadeWall('x', Z, B.x0, B.x1, 1, front);
  facadeWall('z', B.x0, B.z0, B.z1, -1);
  facadeWall('z', B.x1, B.z0, B.z1, 1);

  // Giant ads either side of the entrance, where there's room.
  {
    const room = [[B.x0 + 2, front.x0 - 1], [front.x1 + 1, B.x1 - 2]];
    for (let k = 0; k < 2; k++) {
      if (k >= X.ads) break;
      const [r0, r1] = room[k];
      const w = Math.min(10, r1 - r0);
      if (w < 5) continue;
      const x = (r0 + r1) / 2 + rng.range(-0.3, 0.3) * (r1 - r0 - w);
      M.billboard(b, x, FH + 0.5, Z + (X.facade === 'fins' ? 0.86 : 0.4), 0, w, w * 0.38, `plazaAd${k}`, 'white');
    }
  }

  // ------------------------------------------------------------ plaza
  const P = plaza;
  const terrace = X.layout === 'terrace';
  const stepRun = terrace ? Math.round(-S / 0.16) * 0.42 : 0;
  const walk = { x0: P.x0, x1: P.x1, z0: VB.z1, z1: P.z1 - stepRun };
  const holes = []; // sunken areas cut out of the paving
  if (X.layout === 'sunken') {
    const w = snap(rng.range(12, 20), 1.2);
    const d = snap(rng.range(9, 13), 1.2);
    const side = rng.pick([-1, 1]);
    const hx = cx + side * rng.range(0, Math.max(0, (P.x1 - P.x0) / 2 - w / 2 - 8));
    const hz = VB.z1 + rng.range(8, Math.max(9, walk.z1 - VB.z1 - d - 6)) + d / 2;
    holes.push({ x0: hx - w / 2, x1: hx + w / 2, z0: hz - d / 2, z1: hz + d / 2 });
  }
  // Paving (split round any hole), on a plinth down to street level.
  {
    const base = Math.min(-0.3, S - 0.2);
    const pave = (x0, z0, x1, z1) => x1 - x0 > 0.05 && z1 - z0 > 0.05 && b.box('paving', x0, base, z0, x1, 0, z1);
    const h = holes[0];
    const pz1 = P.z1 - stepRun;
    if (!h) pave(P.x0, P.z0, P.x1, pz1);
    else {
      pave(P.x0, P.z0, P.x1, h.z0);
      pave(P.x0, h.z1, P.x1, pz1);
      pave(P.x0, h.z0, h.x0, h.z1);
      pave(h.x1, h.z0, P.x1, h.z1);
    }
    b.box('ground', P.x0 - 1300, S - 0.2, P.z0 - 1300, P.x1 + 1300, S, P.z1 + 1300, false);
    if (S < -0.35) {
      // The mall stands on a podium above the street.
      b.box('stone', B.x0 - 0.4, S - 0.2, B.z0 - 0.4, B.x1 + 0.4, -0.05, B.z1, false);
    }
  }
  // Paving pattern (a hair above the paving).
  {
    const y0 = -0.01;
    const y1 = 0.01;
    const key = rng.pick(['inlayDark', 'stoneBand', 'concrete']);
    const inl = (x0, z0, x1, z1) => {
      z1 = Math.min(z1, walk.z1 - 0.5);
      if (z1 - z0 < 0.1) return;
      for (const h of holes) if (x0 < h.x1 && x1 > h.x0 && z0 < h.z1 && z1 > h.z0) return;
      b.box(key, x0, y0, z0, x1, y1, z1, false);
    };
    if (X.paving === 'grid') {
      const s = rng.pick([4.8, 6, 7.2]);
      for (let x = cx + s / 2 - Math.ceil((cx - P.x0) / s) * s; x < P.x1 - 0.5; x += s) if (x > P.x0 + 0.5) inl(x - 0.15, VB.z1, x + 0.15, walk.z1);
      for (let z = VB.z1 + s; z < walk.z1 - 0.5; z += s) inl(P.x0 + 0.5, z - 0.15, P.x1 - 0.5, z + 0.15);
    } else if (X.paving === 'bands') {
      for (let z = VB.z1 + 3; z < walk.z1 - 1; z += rng.range(3, 5)) inl(P.x0 + 0.5, z - 0.4, P.x1 - 0.5, z + 0.4);
    } else if (X.paving === 'axis') {
      const w = Math.min(ew, 8);
      inl(cx - w / 2, VB.z1, cx + w / 2, walk.z1);
    }
  }
  // Grand steps down to the street.
  if (terrace) {
    const n = Math.round(-S / 0.16);
    const rise = -S / n;
    const x0 = P.x0;
    const x1 = P.x1;
    for (let i = 0; i < n - 1; i++) {
      const z = P.z1 - stepRun + i * 0.42;
      b.box('stoneBand', x0, S - 0.2, z, x1, -(i + 1) * rise, z + 0.42 + 0.01, false);
    }
    b.collider(x0, -0.3, P.z1 - stepRun, x1, 1.0, P.z1 + 0.2); // keep walkers on the terrace
    // Pavement and road at the foot of the steps.
    b.box('concrete', P.x0 - 400, S - 0.1, P.z1 - 0.42, P.x1 + 400, S + 0.12, P.z1 + 3.5, false);
    b.box('asphalt', P.x0 - 400, S - 0.1, P.z1 + 3.5, P.x1 + 400, S + 0.02, P.z1 + 17, false);
    // Planters punctuating the steps.
    for (let x = x0 + 4; x < x1 - 4; x += rng.range(12, 18)) {
      if (Math.abs(x - cx) < 6) continue;
      M.planterBox(b, x, -rise * 2, P.z1 - stepRun / 2, 2.4, stepRun * 0.7, 0.7 + rise * 2, 'concrete');
      M.fronds(b, rng, x, 0.7, P.z1 - stepRun / 2, 1.1);
    }
  } else {
    // Kerb and the road in front.
    b.box('concrete', P.x0, 0, P.z1 - 0.3, P.x1, 0.15, P.z1, false);
    b.box('asphalt', P.x0 - 400, -0.29, P.z1, P.x1 + 400, -0.28, P.z1 + 14, false);
  }

  // ------------------------------------------------------------ side buildings
  const sideBlocks = [];
  X.sides.forEach((kind, k) => {
    const sgn = k === 0 ? -1 : 1;
    if (kind === 'open') return; // trees along the edge, below
    const w = kind === 'tower' ? rng.range(16, 26) : 16;
    const x0 = sgn < 0 ? P.x0 - w : P.x1;
    const x1 = sgn < 0 ? P.x0 : P.x1 + w;
    const z0 = P.z0 - 8;
    const z1 = P.z1 - 2;
    const face = sgn < 0 ? x1 : x0; // facing the plaza
    if (kind === 'colonnade') {
      const h = rng.range(14, 22);
      const inner = sgn < 0 ? x1 - 4 : x0 + 4;
      const [m0, m1] = sgn < 0 ? [x0, inner] : [inner, x1];
      b.box('stone', m0, S, z0, m1, 4.4, z1, false);
      b.box('facade', x0, 4.4, z0, x1, h, z1, false);
      const [s0, s1] = sgn < 0 ? [inner, x1 + 0.15] : [x0 - 0.15, inner];
      b.box('concrete', s0, 4.2, z0 - 0.15, s1, 4.8, z1 + 0.15, false);
      for (let z = z0 + 3; z < z1 - 2; z += 6) F.column(b, (face + inner) / 2, z, 0, 4.2, 0.35, 'mosaicBlue');
      for (let z = z0 + 2; z < z1 - 3; z += 4) {
        const sx = inner - sgn * 0.06;
        b.box('shopDark', sx - 0.02, 0.2, z, sx + 0.02, 3.6, z + 3.2, false);
        if (rng.chance(0.6)) b.box('blueScreen', sx - sgn * 0.03 - 0.01, 1.2, z + 1.0, sx - sgn * 0.03 + 0.01, 2.6, z + 2.1, false);
      }
      b.collider(m0, 0, z0, m1, 4.2, z1);
      b.collider(x0, 4.2, z0, x1, h, z1);
      const rot = sgn < 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let j = 0; j < 2; j++) M.billboard(b, face - sgn * 0.02, 5.4, z0 + (z1 - z0) * (0.3 + 0.4 * j), rot, 7, 2.6, `plazaAd${j % 2}`, 'white');
    } else if (kind === 'tower') {
      // Office tower: a glazed lobby under a slab, the tower above.
      const h = rng.range(45, 110);
      b.box('facade', x0, 6.2, z0, x1, h, z1, false);
      b.box('white', x0 - 0.3, 6, z0 - 0.3, x1 + 0.3, 6.2, z1 + 0.3);
      const lx = face + sgn * 2; // glass line of the recessed lobby
      const far = sgn < 0 ? x0 : x1;
      b.box('shopDark', Math.min(far, lx - sgn * 0.1), 0, z0 + 0.5, Math.max(far, lx - sgn * 0.1), 5.4, z1 - 0.5, false);
      b.box('glass', lx - 0.02, 0, z0 + 0.5, lx + 0.02, 5.4, z1 - 0.5, false);
      for (let z = z0 + 0.5; z <= z1 - 0.5; z += 2) b.box('darkMetal', lx - 0.05, 0, z - 0.04, lx + 0.05, 5.4, z + 0.04, false);
      b.box('white', Math.min(x0, x1), 5.4, z0, Math.max(x0, x1), 6, z1, false);
      if (S < -0.35) b.box('stone', x0, S, z0, x1, 0, z1, false);
      for (let z = z0 + 2.5; z < z1 - 2; z += 5) M.column(b, face + sgn * 0.7, z, 0, 5.4, 0.3, true, 'plain');
      b.collider(Math.min(far, lx), 0, z0, Math.max(far, lx), h, z1);
    } else {
      // Car park: open decks behind low parapets.
      const decks = rng.int(3, 5);
      const dh = 3.1;
      b.box('shopDark', x0 + 0.6, 0, z0 + 0.6, x1 - 0.6, decks * dh, z1 - 0.6, false);
      for (let i = 0; i <= decks; i++) {
        const y = i * dh;
        b.box('concrete', x0, i === 0 ? S : y - 0.3, z0, x1, y + (i === 0 ? 0 : 1.0), z1, i === 0);
      }
      for (let z = z0 + 0.4; z < z1; z += 7.5) for (const x of [x0 + 0.4, x1 - 0.4]) b.box('concrete', x - 0.3, 0, z - 0.3, x + 0.3, decks * dh, z + 0.3, false);
      const sy = rng.range(1.5, decks * dh - 1.5);
      b.box('accentGloss', face - sgn * 0.02 - 0.03, sy, (z0 + z1) / 2 - 1.2, face - sgn * 0.02 + 0.03, sy + 2.4, (z0 + z1) / 2 + 1.2, false);
      b.collider(x0, 0, z0, x1, decks * dh + 1, z1);
    }
    sideBlocks.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0, z1 });
  });

  // ------------------------------------------------------------ plaza layout
  const inHole = (x, z, m = 1) => holes.some((h) => x > h.x0 - m && x < h.x1 + m && z > h.z0 - m && z < h.z1 + m);
  const L = new Region(
    (x, z) => x > P.x0 + 1 && x < P.x1 - 1 && z > VB.z1 + 2 && z < walk.z1 - 1.5 && !inHole(x, z) && !sideBlocks.some((s) => x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 && z < s.z1),
    { x0: P.x0, x1: P.x1, z0: VB.z1, z1: walk.z1 },
  );
  // Keep an approach to the entrance clear.
  L.reserve(cx - 3, VB.z1, cx + 3, walk.z1);
  for (const h of holes) L.reserve(h.x0 - 1, h.z0 - 1, h.x1 + 1, h.z1 + 1);
  // Open sides: the plaza runs out to a street behind a row of trees.
  X.sides.forEach((kind, k) => {
    if (kind !== 'open') return;
    const x = k === 0 ? P.x0 + 1.6 : P.x1 - 1.6;
    for (let z = VB.z1 + 3; z < walk.z1 - 2; z += rng.range(6, 8)) {
      if (!L.take(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 0.2)) continue;
      M.planterBox(b, x, 0, z, 1.6, 1.6, 0.5, 'darkMetal');
      M.whiteTree(b, rng, x, 0.5, z, rng.range(4.5, 6));
    }
  });

  const treePlanter = (w) => {
    const s = L.spot(rng, w + 1.6, w + 1.6, 40, 1);
    if (!s) return null;
    M.planterBox(b, s.x, 0, s.z, w, w, 0.6, rng.pick(['concrete', 'darkMetal', 'mosaicBlue']));
    M.whiteTree(b, rng, s.x, 0.6, s.z, rng.range(5.5, 8));
    for (let k = 0; k < 3; k++) M.fronds(b, rng, s.x + rng.range(-w / 3, w / 3), 0.6, s.z + rng.range(-w / 3, w / 3), rng.range(0.9, 1.4));
    for (const [dz, rot] of [[w / 2 + 0.45, 0], [-w / 2 - 0.45, Math.PI]]) M.slatBench(b, s.x, 0, s.z + dz, rot, w * 0.7, 'wood');
    addFocus(s.x, 2.5, s.z, 1, 'plaza');
    return s;
  };
  const cafe = () => {
    const s = L.spot(rng, 10, 7, 30, 1);
    if (!s) return;
    for (const [dx, dz] of [[-3.2, -1.8], [0, -1.8], [3.2, -1.8], [-3.2, 1.8], [0, 1.8], [3.2, 1.8]]) {
      if (rng.chance(0.2)) continue;
      F.cafeTable(b, s.x + dx, 0, s.z + dz, 'whiteGloss');
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        F.simpleChair(b, s.x + dx + Math.sin(a) * 0.72, 0, s.z + dz + Math.cos(a) * 0.72, a + Math.PI, 'whiteGloss');
      }
      M.umbrella(b, s.x + dx, 0, s.z + dz, 1.4, rng.chance(0.5) ? 'canvas' : 'canvasWhite');
    }
    addFocus(s.x, 1.5, s.z, 1, 'plaza');
  };
  const monolith = () => {
    const s = L.spot(rng, 2.4, 2.4, 30, 1);
    if (!s) return;
    const f = b.frame(s.x, 0, s.z, rng.range(0, Math.PI));
    f.box('concrete', -1.2, 0, -0.6, 1.2, 0.4, 0.6, true);
    f.geo('stone', new THREE.BoxGeometry(1.4, 4, 0.5), 0, 2.2, 0, 0, 1, 1, 1, 0.12, 0.08);
    b.collider(s.x - 0.8, 0, s.z - 0.8, s.x + 0.8, 4.2, s.z + 0.8);
    addFocus(s.x, 2, s.z, 0.6, 'plaza');
  };
  const sculpture = () => {
    const s = L.spot(rng, 3, 3, 30, 1);
    if (!s) return;
    b.box('blackGloss', s.x - 1, 0, s.z - 1, s.x + 1, 0.5, s.z + 1);
    M.ribbonSculpture(b, rng, s.x, 0.5, s.z, rng.pick(['accentGloss', 'white', 'metal']));
    addFocus(s.x, 2.2, s.z, 1, 'plaza');
  };
  const busShelter = (x, z, rot) => {
    const f = b.frame(x, 0, z, rot);
    f.box('darkMetal', -2.2, 2.4, -0.9, 2.2, 2.55, 0.9);
    for (const sx of [-2.1, 2.1]) f.box('darkMetal', sx - 0.05, 0, -0.85, sx + 0.05, 2.4, -0.75);
    f.box('glass', -2.1, 0.2, -0.82, 2.1, 2.3, -0.78);
    f.box('darkMetal', 1.4, 0.2, -0.75, 2.05, 2.1, -0.55);
    f.geo('ad0', PLANE, 1.725, 1.15, -0.54, 0, 0.55, 1.6, 1);
    f.box('wood', -1.6, 0.42, -0.72, 0.8, 0.48, -0.4);
    f.collide(-2.2, 0, -0.9, 2.2, 2.55, -0.5);
  };

  const layouts = {
    framed() {
      for (let i = 0; i < rng.int(2, 3); i++) treePlanter(rng.range(4.8, 7.2));
      for (let i = 0; i < rng.int(2, 4); i++) {
        const s = L.spot(rng, 3.2, 3.2, 40, 0.8);
        if (!s) continue;
        M.planterBox(b, s.x, 0, s.z, 2, 2, 0.75, 'mosaicBlue');
        M.fronds(b, rng, s.x, 0.75, s.z, rng.range(0.7, 1.1));
        M.slatBench(b, s.x + 1.8, 0, s.z, -Math.PI / 2, 1.8, 'wood');
        M.bin(b, s.x - 1.5, 0, s.z + 1.2, 0);
      }
      monolith();
      if (style.plaza.fountain) {
        const s = L.spot(rng, 8, 8, 30, 1);
        if (s) {
          M.fountain(b, rng, s.x, 0, s.z, rng.range(2.6, 3.6));
          addFocus(s.x, 1.2, s.z, 1, 'plaza');
        }
      }
      if (style.plaza.cafe) cafe();
    },
    terrace() {
      // Long planters along the terrace edge, trees and a sculpture.
      for (let x = P.x0 + 5; x < P.x1 - 5; x += rng.range(9, 13)) {
        if (Math.abs(x - cx) < 5) continue;
        const z = walk.z1 - 1.4;
        if (!L.take(x - 2.6, z - 0.7, x + 2.6, z + 0.7, 0.2)) continue;
        M.planterBox(b, x, 0, z, 5, 1.2, 0.55, 'concrete');
        M.fronds(b, rng, x - 1.2, 0.55, z, 1.0);
        M.fronds(b, rng, x + 1.2, 0.55, z, 1.2);
      }
      for (let i = 0; i < rng.int(2, 3); i++) treePlanter(rng.range(4, 5.5));
      sculpture();
      if (style.plaza.cafe) cafe();
    },
    sunken() {
      const h = holes[0];
      const n = 4;
      const rise = 0.42;
      const tread = 0.9;
      const floorY = -n * rise;
      b.box('paving', h.x0, floorY - 0.3, h.z0, h.x1, floorY, h.z1);
      for (let k = 1; k <= n; k++) {
        const i0 = (k - 1) * tread;
        const i1 = k * tread;
        const top = -(k - 1) * rise - rise * 0.02;
        const ring = [
          [h.x0 + i0, h.z0 + i0, h.x1 - i0, h.z0 + i1],
          [h.x0 + i0, h.z1 - i1, h.x1 - i0, h.z1 - i0],
          [h.x0 + i0, h.z0 + i1, h.x0 + i1, h.z1 - i1],
          [h.x1 - i1, h.z0 + i1, h.x1 - i0, h.z1 - i1],
        ];
        for (const [x0, z0, x1, z1] of ring) b.box(k === 1 ? 'stoneBand' : 'concrete', x0, floorY - 0.3, z0, x1, top, z1, false);
      }
      // Glass balustrade round the rim, except on the stepped side.
      M.railing(b, [h.x0, h.z0], [h.x1, h.z0], 0, 1, 'glass');
      M.railing(b, [h.x1, h.z1], [h.x0, h.z1], 0, 1, 'glass');
      M.railing(b, [h.x0, h.z1], [h.x0, h.z0], 0, 1, 'glass');
      M.railing(b, [h.x1, h.z0], [h.x1, h.z1], 0, 1, 'glass');
      b.collider(h.x0, -2, h.z0, h.x1, 1.1, h.z1);
      const mx = (h.x0 + h.x1) / 2;
      const mz = (h.z0 + h.z1) / 2;
      if (rng.chance(0.5)) M.fountain(b, rng, mx, floorY, mz, Math.min(h.x1 - h.x0, h.z1 - h.z0) / 2 - n * tread - 0.6);
      else {
        M.planterBox(b, mx, floorY, mz, 2.4, 2.4, 0.5, 'darkMetal');
        M.whiteTree(b, rng, mx, floorY + 0.5, mz, rng.range(6, 8));
      }
      addFocus(mx, floorY + 1, mz, 1.3, 'plaza');
      for (let i = 0; i < rng.int(1, 2); i++) treePlanter(rng.range(4, 5.5));
      if (style.plaza.cafe) cafe();
    },
    pool() {
      // A long reflecting pool on the approach, split round a path.
      const len = Math.max(8, Math.min(28, walk.z1 - VB.z1 - 10));
      const w = rng.range(3, 6);
      const z0 = VB.z1 + rng.range(4, 7);
      for (const sg of rng.chance(0.5) ? [-1, 1] : [rng.pick([-1, 1])]) {
        const x0 = sg < 0 ? cx - 3.8 - w : cx + 3.8;
        const x1 = x0 + w;
        if (!L.take(x0 - 0.4, z0 - 0.4, x1 + 0.4, z0 + len + 0.4, 0)) continue;
        b.box('stoneBand', x0 - 0.35, 0, z0 - 0.35, x1 + 0.35, 0.45, z0);
        b.box('stoneBand', x0 - 0.35, 0, z0 + len, x1 + 0.35, 0.45, z0 + len + 0.35);
        b.box('stoneBand', x0 - 0.35, 0, z0, x0, 0.45, z0 + len);
        b.box('stoneBand', x1, 0, z0, x1 + 0.35, 0.45, z0 + len);
        b.box('darkMetal', x0, 0, z0, x1, 0.3, z0 + len, false);
        b.box('water', x0, 0.3, z0, x1, 0.33, z0 + len, false);
        b.collider(x0, 0, z0, x1, 0.45, z0 + len);
        for (let z = z0 + 1.5; z < z0 + len - 1; z += 1.8) b.push('jet', CYL6.clone().scale(0.03, 1.2, 0.03).translate((x0 + x1) / 2, 0.9, z));
        // Trees along the outer side.
        const tx = sg < 0 ? x0 - 2.2 : x1 + 2.2;
        for (let z = z0 + 2; z < z0 + len - 1; z += 6) {
          if (!L.take(tx - 1, z - 1, tx + 1, z + 1, 0)) continue;
          M.planterBox(b, tx, 0, z, 1.6, 1.6, 0.5, 'darkMetal');
          M.whiteTree(b, rng, tx, 0.5, z, rng.range(5, 6.5));
        }
        addFocus((x0 + x1) / 2, 0.8, z0 + len / 2, 1.2, 'plaza');
      }
      sculpture();
      if (style.plaza.cafe) cafe();
    },
    bosque() {
      // A grid of trees in flush grates, benches between.
      const s = rng.range(5, 6.5);
      for (let x = P.x0 + 4; x < P.x1 - 3; x += s) {
        for (let z = VB.z1 + 5; z < walk.z1 - 3; z += s) {
          if (Math.abs(x - cx) < 4.5 || !L.take(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 0.2)) continue;
          b.box('darkMetal', x - 0.8, -0.01, z - 0.8, x + 0.8, 0.022, z + 0.8, false);
          M.whiteTree(b, rng, x, 0, z, rng.range(5, 7));
          b.collider(x - 0.25, 0, z - 0.25, x + 0.25, 3, z + 0.25);
          if (rng.chance(0.25)) M.slatBench(b, x + s / 2, 0, z, Math.PI / 2, 2, 'wood');
        }
      }
      addFocus(cx + (P.x1 - cx) / 2, 2.5, (VB.z1 + walk.z1) / 2, 1.2, 'plaza');
      if (style.plaza.cafe || rng.chance(0.5)) cafe();
    },
    dropoff() {
      // A drive loop off the street round a planted island.
      const rw = 6;
      const iz0 = VB.z1 + 6 + rw;
      const iz1 = walk.z1 - 0.3;
      const ix0 = cx - rng.range(5, 8);
      const ix1 = cx + rng.range(5, 8);
      const road = (x0, z0, x1, z1) => b.box('asphalt', x0, -0.01, z0, x1, 0.022, z1, false);
      road(ix0 - rw, iz0 - rw, ix1 + rw, iz0); // across the front of the entrance
      road(ix0 - rw, iz0, ix0, iz1);
      road(ix1, iz0, ix1 + rw, iz1);
      for (let z = iz0 + 1; z < iz1 - 1; z += 3) {
        b.box('white', ix0 - rw / 2 - 0.07, 0.01, z, ix0 - rw / 2 + 0.07, 0.03, z + 1.5, false);
        b.box('white', ix1 + rw / 2 - 0.07, 0.01, z, ix1 + rw / 2 + 0.07, 0.03, z + 1.5, false);
      }
      M.planterBox(b, (ix0 + ix1) / 2, 0, (iz0 + iz1) / 2, ix1 - ix0 - 0.6, iz1 - iz0 - 0.6, 0.45, 'concrete');
      b.box('lawn', ix0 + 0.4, 0.45, iz0 + 0.4, ix1 - 0.4, 0.48, iz1 - 0.4, false);
      M.whiteTree(b, rng, (ix0 + ix1) / 2, 0.45, (iz0 + iz1) / 2, rng.range(6, 8));
      for (let k = 0; k < 4; k++) M.fronds(b, rng, rng.range(ix0 + 1, ix1 - 1), 0.45, rng.range(iz0 + 1, iz1 - 1), 1.1);
      // Bollards between the road and the entrance.
      for (let x = ix0 - rw; x <= ix1 + rw; x += 1.6) b.push('darkMetal', CYL.clone().scale(0.1, 0.9, 0.1).translate(x, 0.45, iz0 - rw - 0.5));
      L.reserve(ix0 - rw - 0.6, iz0 - rw - 0.8, ix1 + rw + 0.6, iz1);
      busShelter(ix1 + rw + 2.2, (iz0 + iz1) / 2, -Math.PI / 2);
      addFocus((ix0 + ix1) / 2, 2, (iz0 + iz1) / 2, 1.2, 'plaza');
      for (let i = 0; i < rng.int(1, 2); i++) treePlanter(rng.range(4, 5.5));
    },
    lawn() {
      // Lawns either side of the approach, with trees and a sculpture.
      const pw = Math.max(0, Math.min(18, cx - P.x0 - 7));
      const pe = Math.max(0, Math.min(18, P.x1 - cx - 7));
      const z0 = VB.z1 + 4;
      const z1 = walk.z1 - 3;
      for (const [x0, x1] of [[cx - 5 - pw, cx - 5], [cx + 5, cx + 5 + pe]]) {
        if (x1 - x0 < 4 || z1 - z0 < 6) continue;
        const split = z1 - z0 > 16;
        const parts = split ? [[z0, (z0 + z1) / 2 - 1.2], [(z0 + z1) / 2 + 1.2, z1]] : [[z0, z1]];
        for (const [a, c] of parts) {
          b.box('stoneBand', x0, 0, a, x1, 0.12, c);
          b.box('lawn', x0 + 0.2, 0.12, a + 0.2, x1 - 0.2, 0.14, c - 0.2, false);
          L.reserve(x0, a, x1, c);
          const n = Math.max(1, Math.round(((x1 - x0) * (c - a)) / 60));
          for (let k = 0; k < n; k++) M.whiteTree(b, rng, rng.range(x0 + 1.5, x1 - 1.5), 0.12, rng.range(a + 1.5, c - 1.5), rng.range(4.5, 7));
        }
        addFocus((x0 + x1) / 2, 2, (z0 + z1) / 2, 1, 'plaza');
      }
      sculpture();
      if (style.plaza.cafe) cafe();
    },
  };
  layouts[X.layout]();

  // Fill the rest of the square in proportion to its size: planters with
  // benches, poster lightboxes along the approach, bike racks and bins.
  {
    const area = (walk.x1 - walk.x0) * (walk.z1 - walk.z0);
    const n = Math.round(area / 320);
    for (let i = 0; i < n; i++) {
      const kind = rng.weighted([['planter', 3], ['poster', 2], ['bikes', 1], ['tree', 1.2], ['kiosk', 0.4]]);
      if (kind === 'planter') {
        const s = L.spot(rng, 3.2, 3.2, 20, 0.8);
        if (!s) continue;
        M.planterBox(b, s.x, 0, s.z, 2, 2, 0.75, rng.pick(['mosaicBlue', 'concrete', 'darkMetal']));
        M.fronds(b, rng, s.x, 0.75, s.z, rng.range(0.7, 1.1));
        M.slatBench(b, s.x + 1.8, 0, s.z, -Math.PI / 2, 1.8, 'wood');
        if (rng.chance(0.5)) M.bin(b, s.x - 1.5, 0, s.z + 1.2, 0);
      } else if (kind === 'poster') {
        const s = L.spot(rng, 1.4, 1.2, 20, 0.6);
        if (!s) continue;
        M.lightbox(b, s.x, 0, s.z, s.x < cx ? Math.PI / 2 : -Math.PI / 2, `poster${rng.int(0, 3)}`);
      } else if (kind === 'bikes') {
        const s = L.spot(rng, 5, 1.6, 20, 0.6);
        if (!s) continue;
        for (let k = 0; k < 5; k++) b.push('metal', new THREE.TorusGeometry(0.38, 0.025, 6, 16, Math.PI).translate(s.x - 2 + k, 0.02, s.z));
        b.collider(s.x - 2.4, 0, s.z - 0.5, s.x + 2.4, 0.9, s.z + 0.5);
      } else if (kind === 'tree') treePlanter(rng.range(3.6, 5));
      else {
        const s = L.spot(rng, 4, 4, 20, 1);
        if (s) M.kiosk(b, s.x, 0, s.z);
      }
    }
  }

  // Lamps along the approach.
  if (X.lamps !== 'none') {
    for (let z = VB.z1 + 4; z < walk.z1 - 1; z += X.lamps === 'mast' ? 9 : 4) {
      for (const x of [cx - 3.4, cx + 3.4]) {
        if (!L.free(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0)) continue;
        if (X.lamps === 'mast') {
          b.push('darkMetal', CYL.clone().scale(0.09, 7, 0.09).translate(x, 3.5, z));
          b.box('darkMetal', x - 0.5, 6.9, z - 0.12, x + 0.5, 7.05, z + 0.12, false);
          b.box('emissiveSoft', x - 0.45, 6.88, z - 0.08, x + 0.45, 6.9, z + 0.08, false);
          b.collider(x - 0.1, 0, z - 0.1, x + 0.1, 7, z + 0.1);
        } else {
          b.push('darkMetal', CYL.clone().scale(0.11, 0.9, 0.11).translate(x, 0.45, z));
          b.push('emissiveSoft', CYL.clone().scale(0.1, 0.12, 0.1).translate(x, 0.8, z));
        }
      }
    }
  }
  if (X.poles) for (let x = B.x0 + 4; x < B.x1 - 3; x += rng.range(6, 8)) if (x < front.x0 - 2 || x > front.x1 + 2) M.bannerPole(b, x, 0, Z + 2.6, 7.5, 'plazaBanner', 0);

  const site = {
    x0: Math.min(P.x0, ...sideBlocks.map((s) => s.x0)) - 2,
    x1: Math.max(P.x1, ...sideBlocks.map((s) => s.x1)) + 2,
    z0: B.z0 - 4,
    z1: P.z1 + 4,
  };
  return { VB, walk, holes, sideBlocks, site, street: S };
}
