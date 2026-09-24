import * as F from './furniture.js';
import { FH, CEIL } from './plan.js';

// Furnishing for every kind of space: lobby, corridors, lounges, private
// offices, open-plan areas, meeting rooms, break rooms, print rooms, store
// rooms and the lift / washroom core, plus ceiling fixtures (downlights with
// their wall-wash scallops, panels, diffusers, detectors) and wall pieces.

export const EDGE_IN = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };
export const edgeCoord = (r, e) => (e === 'N' ? r.z0 : e === 'S' ? r.z1 : e === 'W' ? r.x0 : r.x1);
const faceRot = (dx, dz) => Math.atan2(dx, dz);
const T = 0.2;
const tile = (v) => (Math.floor(v / 0.6) + 0.5) * 0.6; // centre of a 0.6 m ceiling tile

export function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Free-space bookkeeping on a room's floor (axis-aligned rectangles).
export class Placer {
  constructor(r, margin = 0.35) {
    this.r = r;
    this.m = margin;
    this.used = [];
  }
  reserve(x0, z0, x1, z1) {
    this.used.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }
  free(x0, z0, x1, z1, pad = 0.35) {
    const r = this.r;
    if (x0 < r.x0 + this.m || x1 > r.x1 - this.m || z0 < r.z0 + this.m || z1 > r.z1 - this.m) return false;
    for (const u of this.used) if (x0 < u[2] + pad && x1 > u[0] - pad && z0 < u[3] + pad && z1 > u[1] - pad) return false;
    return true;
  }
  take(x0, z0, x1, z1, pad) {
    if (!this.free(x0, z0, x1, z1, pad)) return false;
    this.reserve(x0, z0, x1, z1);
    return true;
  }
  // Random spot for a w x d footprint (axis-aligned).
  spot(rng, w, d, tries = 40, inset = 0, pad) {
    const r = this.r;
    for (let i = 0; i < tries; i++) {
      const x = rng.range(r.x0 + w / 2 + this.m + inset, r.x1 - w / 2 - this.m - inset);
      const z = rng.range(r.z0 + d / 2 + this.m + inset, r.z1 - d / 2 - this.m - inset);
      if (this.take(x - w / 2, z - d / 2, x + w / 2, z + d / 2, pad)) return { x, z };
    }
    return null;
  }
}

// Footprint of a w (local x) by d (local z) piece rotated by a multiple of 90 degrees.
function foot(cx, cz, w, d, rot) {
  const side = Math.abs(Math.sin(rot)) > 0.7;
  const hw = (side ? d : w) / 2;
  const hd = (side ? w : d) / 2;
  return [cx - hw, cz - hd, cx + hw, cz + hd];
}

export function furnish(ctx) {
  const d = new Decor(ctx);
  for (const r of ctx.rooms) d.room(r);
  d.mezzanine();
  return { focus: d.focus };
}

class Decor {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.focus = []; // interesting points for the camera: { room, x, y, z }
    this.screenN = 0;
    this.artN = 0;
    this.logoUsed = false;
  }

  P(r) {
    return this.placers.get(r);
  }

  seatKey() {
    return this.rng.weighted([
      ['upholstery', 6],
      ['upholsteryWhite', 2.5],
      ['leather', 1],
    ]);
  }

  screenKey() {
    return `screen${this.screenN++ % 3}`;
  }

  artKey() {
    return `art${this.artN++ % 4}`;
  }

  addFocus(r, x, y, z, weight = 1) {
    this.focus.push({ room: r, x, y, z, weight });
  }

  // ------------------------------------------------------------ walls

  // Free stretches of solid wall on a room's own level (longest first).
  wallSpots(r, minLen = 1.6, level = r.level) {
    const out = [];
    r.wallUsed = r.wallUsed || { N: [], S: [], W: [], E: [] };
    for (const e of ['N', 'S', 'W', 'E']) {
      const [ix, iz] = EDGE_IN[e];
      for (const sp of r.spans[e]) {
        if (sp.kind !== 'solid' || sp.level !== level) continue;
        const block = [...sp.ops.map((o) => [o.a0 - 0.45, o.a1 + 0.45]), ...r.wallUsed[e]].sort((p, q) => p[0] - q[0]);
        let cur = sp.a0 + 0.55;
        const end = sp.a1 - 0.55;
        const frees = [];
        for (const [b0, b1] of block) {
          if (b0 > cur) frees.push([cur, Math.min(b0, end)]);
          cur = Math.max(cur, b1);
        }
        if (end > cur) frees.push([cur, end]);
        const c = edgeCoord(r, e) + (ix + iz) * (T / 2 + 0.016);
        for (const [a0, a1] of frees) if (a1 - a0 >= minLen) out.push({ r, e, a0, a1, len: a1 - a0, c, ix, iz, rot: faceRot(ix, iz) });
      }
    }
    return out.sort((p, q) => q.len - p.len);
  }

  useWall(s, a0, a1) {
    s.r.wallUsed[s.e].push([a0, a1]);
  }

  onWall(s, a) {
    return s.e === 'N' || s.e === 'S' ? { x: a, z: s.c } : { x: s.c, z: a };
  }

  // Wall-washing downlights with the light pooling on the wall below them.
  wash(r, s, a0, a1, n = 2) {
    const ceil = r.y + CEIL;
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * k) / (n - 1);
      const p = this.onWall(s, a);
      F.downlight(this.b, p.x + s.ix * 0.45, ceil, p.z + s.iz * 0.45);
      F.scallop(this.b, p.x, ceil - 0.02, p.z, s.rot, 1.4, Math.min(2.8, CEIL - 0.1));
      (r.lightsAvoid = r.lightsAvoid || []).push([p.x + s.ix * 0.45, p.z + s.iz * 0.45]);
    }
  }

  // Hang a piece of art, a TV, a monogram or a whiteboard on a wall spot.
  hang(r, s, kind, { wash = true } = {}) {
    const { b, rng } = this;
    const y = r.y;
    const a = (s.a0 + s.a1) / 2 + rng.range(-0.15, 0.15) * Math.max(0, s.len - 3);
    const p = this.onWall(s, a);
    let w;
    if (kind === 'tv') {
      w = Math.min(1.9, s.len - 0.5);
      F.tv(b, p.x, y + 1.15, p.z, s.rot, w, this.screenKey());
      this.addFocus(r, p.x + s.ix * 0.1, y + 1.6, p.z + s.iz * 0.1, 1.2);
    } else if (kind === 'art') {
      w = Math.min(s.len - 0.4, rng.range(1.6, 3.2));
      const h = w * rng.range(0.42, 0.62);
      F.art(b, p.x, y + 1.25 + Math.max(0, 0.9 - h) * 0.5, p.z, s.rot, w, h, this.artKey(), rng.pick(['white', 'white', 'darkMetal']));
      this.addFocus(r, p.x, y + 1.6, p.z, 1);
    } else if (kind === 'mono') {
      w = Math.min(s.len - 0.4, rng.range(2.2, 3.2));
      F.monogramSign(b, p.x, y + 1.25, p.z, s.rot, w);
      this.addFocus(r, p.x, y + 1.9, p.z, 1);
    } else if (kind === 'board') {
      w = Math.min(s.len - 0.4, 2.0);
      F.whiteboard(b, p.x, y + 0.95, p.z, s.rot, w);
    } else if (kind === 'shelf') {
      w = Math.min(s.len - 0.3, rng.range(1.6, 2.8));
      const q = { x: p.x + s.ix * 0.2, z: p.z + s.iz * 0.2 };
      const P = this.P(r);
      if (P.take(...foot(q.x, q.z, w, 0.4, s.rot), 0.05)) F.bookshelf(b, rng, q.x, y, q.z, s.rot, w, rng.range(1.8, 2.2));
    }
    this.useWall(s, a - w / 2 - 0.2, a + w / 2 + 0.2);
    if (wash && kind !== 'board' && kind !== 'shelf' && s.len > 1.6) this.wash(r, s, a - Math.min(w / 2, 1.2), a + Math.min(w / 2, 1.2), w > 1.4 ? 2 : 1);
    return { a, p, w };
  }

  // -------------------------------------------------------- ceilings

  ceiling(r, style) {
    const { b, rng } = this;
    const y = r.y + CEIL;
    const avoid = r.lightsAvoid || [];
    const clear = (x, z, d = 0.9) => avoid.every(([ax, az]) => Math.hypot(ax - x, az - z) > d);
    const pts = [];
    if (style === 'downlights') {
      const s = rng.pick([1.8, 2.4]);
      const nx = Math.max(1, Math.floor((r.w - 1.0) / s) + 1);
      const nz = Math.max(1, Math.floor((r.d - 1.0) / s) + 1);
      const ox = r.x0 + (r.w - (nx - 1) * s) / 2;
      const oz = r.z0 + (r.d - (nz - 1) * s) / 2;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const x = tile(ox + i * s);
          const z = tile(oz + j * s);
          if (!clear(x, z)) continue;
          F.downlight(b, x, y, z);
          pts.push([x, z]);
        }
      }
    } else if (style === 'panels') {
      const alongX = r.w >= r.d;
      const L = alongX ? r.w : r.d;
      const S = alongX ? r.d : r.w;
      const nl = Math.max(1, Math.floor((L - 1.2) / 3.0));
      const ns = Math.max(1, Math.floor((S - 0.6) / 2.4));
      for (let i = 0; i < nl; i++) {
        for (let j = 0; j < ns; j++) {
          const a = (alongX ? r.x0 : r.z0) + (L - (nl - 1) * 3.0) / 2 + i * 3.0;
          const c = (alongX ? r.z0 : r.x0) + (S - (ns - 1) * 2.4) / 2 + j * 2.4;
          const ta = Math.round(a / 0.6) * 0.6;
          const tc = Math.round(c / 0.6) * 0.6;
          const [x0, z0, x1, z1] = alongX ? [ta - 0.6, tc - 0.3, ta + 0.6, tc + 0.3] : [tc - 0.3, ta - 0.6, tc + 0.3, ta + 0.6];
          if (!clear((x0 + x1) / 2, (z0 + z1) / 2, 1.1)) continue;
          F.lightPanel(b, x0, z0, x1, z1, y);
          pts.push([(x0 + x1) / 2, (z0 + z1) / 2]);
        }
      }
    }
    // Air diffusers and a smoke detector between the lights.
    const n = Math.max(1, Math.round((r.w * r.d) / 30));
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 8; t++) {
        const x = tile(rng.range(r.x0 + 0.9, r.x1 - 0.9));
        const z = tile(rng.range(r.z0 + 0.9, r.z1 - 0.9));
        if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.0) || !clear(x, z, 1.0)) continue;
        F.diffuser(b, x, y, z, 0.6);
        pts.push([x, z]);
        break;
      }
    }
    for (let t = 0; t < 8; t++) {
      const x = tile(rng.range(r.x0 + 1, r.x1 - 1));
      const z = tile(rng.range(r.z0 + 1, r.z1 - 1));
      if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.8)) continue;
      F.smokeDetector(b, x, y, z);
      break;
    }
  }

  // ---------------------------------------------------------- helpers

  plants(r, n) {
    const P = this.P(r);
    for (let i = 0; i < n; i++) {
      const w = this.rng.range(0.55, 1.1);
      const d = this.rng.range(0.45, 0.7);
      // Prefer corners and walls: sample near the room edge.
      const s = P.spot(this.rng, w, d, 30, 0, 0.3);
      if (s) F.planter(this.b, this.rng, s.x, r.y, s.z, { w, d, h: this.rng.range(0.4, 0.8), key: this.rng.pick(['black', 'white', 'concrete', 'accent', 'darkMetal']), plant: this.rng.weighted([['bamboo', 3], ['blades', 2], ['ball', 1]]) });
    }
  }

  rug(r, x0, z0, x1, z1) {
    this.b.box(this.rng.chance(0.7) ? 'carpet' : 'carpetGray', x0, r.y, z0, x1, r.y + 0.012, z1, false);
  }

  // Sofa group: a sofa (or two facing) with a coffee table, armchairs opposite.
  seating(r, { rugChance = 0.5 } = {}) {
    const { b, rng } = this;
    const P = this.P(r);
    const alongX = rng.chance(0.5);
    const style = rng.weighted([
      ['tub', 2],
      ['pod', 1.5],
      ['box', 1.5],
    ]);
    const key = this.seatKey();
    const sw = rng.range(1.9, 2.5);
    const w = alongX ? sw + 0.4 : 4.2;
    const d = alongX ? 4.2 : sw + 0.4;
    const s = P.spot(rng, w, d, 30, 0.4);
    if (!s) return null;
    const pair = rng.chance(0.5);
    const y = r.y;
    const table = rng.pick(['white', 'glass', 'round', 'waterfall']);
    const rot0 = alongX ? 0 : Math.PI / 2;
    const off = (k) => (alongX ? [s.x, s.z + k] : [s.x + k, s.z]);
    F.sofa(b, ...off(-1.45).flatMap((v, i) => (i === 0 ? [v, y] : [v])), rot0, { w: sw, key, style });
    if (pair) F.sofa(b, ...off(1.45).flatMap((v, i) => (i === 0 ? [v, y] : [v])), rot0 + Math.PI, { w: sw, key, style });
    else {
      for (const k of [-0.6, 0.6]) {
        const [cx, cz] = off(1.45);
        const chair = alongX ? [cx + k, cz] : [cx, cz + k];
        if (rng.chance(0.6)) F.loungeChair(b, chair[0], y, chair[1], rot0 + Math.PI, rng.chance(0.5) ? key : 'upholsteryWhite');
        else F.sofa(b, chair[0], y, chair[1], rot0 + Math.PI, { w: 0.95, key, style });
      }
    }
    F.coffeeTable(b, s.x, y, s.z, rot0, { w: sw * 0.55, d: 0.7, style: table });
    if (rng.chance(0.35)) F.trash(b, s.x + w / 2 - 0.1, y, s.z + d / 2 - 0.1);
    if (rng.chance(rugChance)) this.rug(r, s.x - w / 2 - 0.5, s.z - d / 2 - 0.5, s.x + w / 2 + 0.5, s.z + d / 2 + 0.5);
    this.addFocus(r, s.x, y + 0.8, s.z, 0.8);
    return s;
  }

  // ---------------------------------------------------------- rooms

  room(r) {
    if (r.type === 'atrium') return this.lobby(r);
    const fn = this[r.type];
    if (fn) fn.call(this, r);
  }

  lobby(r) {
    const { b, rng, plan } = this;
    const P = this.P(r);
    const HA = plan.HA;
    const A = r;
    // Reception desk facing into the lobby, with a pylon sign beside it.
    const spots = this.wallSpots(r, 5, 0);
    if (spots.length && rng.chance(0.7)) {
      const s = rng.pick(spots.slice(0, 3));
      const a = (s.a0 + s.a1) / 2;
      const p = this.onWall(s, a);
      const w = rng.range(3.4, 4.8);
      const dx = p.x + s.ix * 2.6;
      const dz = p.z + s.iz * 2.6;
      if (P.take(...foot(dx, dz, w + 0.6, 2.8, s.rot), 0.2)) {
        F.receptionDesk(b, rng, dx, 0, dz, s.rot, w);
        this.addFocus(r, dx, 1.2, dz, 1.5);
        this.hang(r, s, 'mono', { wash: true });
        const side = rng.sign();
        const along = s.e === 'N' || s.e === 'S' ? [1, 0] : [0, 1];
        const px = dx + along[0] * side * (w / 2 + 1.4) + s.ix * 0.8;
        const pz = dz + along[1] * side * (w / 2 + 1.4) + s.iz * 0.8;
        if (P.take(px - 0.7, pz - 0.7, px + 0.7, pz + 0.7, 0.2)) F.pylon(b, px, 0, pz, s.rot, rng.range(3.2, 3.8));
      }
    } else {
      // Under the back mezzanine, facing the facade.
      const m = plan.mezz[0];
      const toVoid = m.open === 'N' ? -1 : 1;
      const w = rng.range(3.4, 4.6);
      const x = rng.range(A.x0 + w / 2 + 2, A.x1 - w / 2 - 2);
      const z = (m.open === 'N' ? m.z1 : m.z0) + toVoid * 2.2;
      const rot = toVoid > 0 ? 0 : Math.PI;
      if (P.take(...foot(x, z, w + 0.6, 2.8, rot), 0.2)) {
        F.receptionDesk(b, rng, x, 0, z, rot, w);
        this.addFocus(r, x, 1.2, z, 1.5);
        const px = x + (w / 2 + 1.3) * rng.sign();
        const pz = z + toVoid * 1.2;
        if (P.take(px - 0.7, pz - 0.7, px + 0.7, pz + 0.7, 0.2)) F.pylon(b, px, 0, pz, rot, rng.range(3.2, 3.8));
      }
    }
    // A lobby carpet, lounge islands with ring pendants over them.
    if (rng.chance(0.4)) {
      const inset = rng.range(3, 4.5);
      b.box('carpet', A.x0 + inset, 0, A.z0 + inset, A.x1 - inset, 0.012, A.z1 - inset, false);
    }
    const clusters = [];
    for (let i = 0; i < rng.int(3, 5); i++) {
      const s = this.seating(r, { rugChance: 0.6 });
      if (s) clusters.push(s);
    }
    for (const s of clusters) if (rng.chance(0.75)) F.pendantRing(b, s.x, Math.min(HA - 1.6, rng.range(4.8, 6.4)), s.z, rng.range(1.0, 1.8), HA - 0.05);
    // Display cases in a row.
    if (rng.chance(0.75)) {
      const n = rng.int(2, 5);
      const alongX = rng.chance(0.5);
      const key = rng.chance(0.7) ? 'accent' : 'white';
      for (let t = 0; t < 12; t++) {
        const x = rng.range(A.x0 + 3, A.x1 - 3);
        const z = rng.range(A.z0 + 3, A.z1 - 3);
        const len = (n - 1) * 2.6;
        const [x0, z0, x1, z1] = alongX ? [x - len / 2 - 0.6, z - 0.6, x + len / 2 + 0.6, z + 0.6] : [x - 0.6, z - len / 2 - 0.6, x + 0.6, z + len / 2 + 0.6];
        if (!P.take(x0, z0, x1, z1, 0.8)) continue;
        for (let i = 0; i < n; i++) {
          const o = -len / 2 + i * 2.6;
          F.displayCase(b, rng, alongX ? x + o : x, 0, alongX ? z : z + o, alongX ? 0 : Math.PI / 2, { key });
        }
        this.addFocus(r, x, 1.2, z, 1);
        break;
      }
    }
    if (rng.chance(0.6)) {
      const s = P.spot(rng, 1.6, 1.6, 30, 1);
      if (s) {
        F.sculpture(b, rng, s.x, 0, s.z, rng.chance(0.7) ? 'accent' : 'white');
        this.addFocus(r, s.x, 1.5, s.z, 1);
      }
    }
    // Beam seating facing the windows.
    for (const e of ['N', 'S', 'W', 'E']) {
      if (!r.spans[e].some((sp) => sp.kind === 'window') || !rng.chance(0.5)) continue;
      const [ix, iz] = EDGE_IN[e];
      const c = edgeCoord(r, e) + (ix + iz) * 1.6;
      const alongX = e === 'N' || e === 'S';
      const a0 = alongX ? A.x0 : A.z0;
      const a1 = alongX ? A.x1 : A.z1;
      for (let k = 0; k < 2; k++) {
        const a = a0 + (a1 - a0) * rng.range(0.2, 0.8);
        const n = rng.int(3, 5);
        const x = alongX ? a : c;
        const z = alongX ? c : a;
        const rot = faceRot(-ix, -iz);
        if (P.take(...foot(x, z, n * 0.64 + 0.2, 0.8, rot), 0.4)) F.beamSeating(b, x, 0, z, rot, n, this.seatKey());
      }
    }
    // A line of planters (bamboo screens), then scattered ones.
    if (rng.chance(0.6)) {
      const n = rng.int(3, 6);
      const alongX = rng.chance(0.5);
      const plant = rng.weighted([['bamboo', 3], ['blades', 1.5], ['ball', 1]]);
      const key = rng.pick(['black', 'white', 'accent', 'concrete']);
      for (let t = 0; t < 10; t++) {
        const x = rng.range(A.x0 + 2.5, A.x1 - 2.5);
        const z = rng.range(A.z0 + 2.5, A.z1 - 2.5);
        const len = (n - 1) * 1.5;
        const [x0, z0, x1, z1] = alongX ? [x - len / 2 - 0.5, z - 0.4, x + len / 2 + 0.5, z + 0.4] : [x - 0.4, z - len / 2 - 0.5, x + 0.4, z + len / 2 + 0.5];
        if (!P.take(x0, z0, x1, z1, 0.6)) continue;
        for (let i = 0; i < n; i++) {
          const o = -len / 2 + i * 1.5;
          F.planter(b, rng, alongX ? x + o : x, 0, alongX ? z : z + o, { w: 0.8, d: 0.6, h: 0.6, key, plant });
        }
        break;
      }
    }
    this.plants(r, rng.int(3, 6));
    // Overhead: serpentine soffits, floating clouds or banners.
    const over = rng.weighted([
      ['ribbons', 1.2],
      ['clouds', 1],
      ['banners', 0.8],
      [null, 0.8],
    ]);
    if (over === 'ribbons') {
      const alongX = r.w >= r.d;
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        const c = alongX ? A.z0 + r.d * t : A.x0 + r.w * t;
        const [l0, l1] = alongX ? [A.x0 + 0.6, A.x1 - 0.6] : [A.z0 + 0.6, A.z1 - 0.6];
        const hang = rng.range(0.4, 0.9);
        F.waveRibbon(b, rng, l0, l1, c, rng.range(1.2, 2.0), HA - 0.05 - hang, rng.range(0.35, 0.6), rng.range(0.6, 1.4), hang, i % 2 && rng.chance(0.5) ? 'white' : 'accent', !alongX);
      }
    } else if (over === 'clouds') {
      const n = rng.int(2, 4);
      const y = HA - rng.range(1.0, 1.8);
      for (let i = 0; i < n; i++) {
        const w = rng.range(4, 8);
        const d = rng.range(1.8, 3.2);
        const x = rng.range(A.x0 + w / 2 + 1, A.x1 - w / 2 - 1);
        const z = rng.range(A.z0 + d / 2 + 1, A.z1 - d / 2 - 1);
        b.box(rng.chance(0.7) ? 'ceil:accent' : 'ceil:accent2', x - w / 2, y, z - d / 2, x + w / 2, y + 0.14, z + d / 2, false);
        for (let k = 0; k < Math.floor(w / 1.4); k++) F.downlight(b, x - w / 2 + 0.7 + k * 1.4, y, z);
        for (const sx of [-1, 1]) b.box('ceil:metal', x + sx * (w / 2 - 0.3) - 0.01, y + 0.14, z - 0.01, x + sx * (w / 2 - 0.3) + 0.01, HA, z + 0.01, false);
      }
    } else if (over === 'banners' && plan.floors >= 2) {
      const cx = rng.range(A.x0 + r.w * 0.3, A.x1 - r.w * 0.3);
      const cz = rng.range(A.z0 + r.d * 0.3, A.z1 - r.d * 0.3);
      for (let i = 0; i < rng.int(5, 9); i++) {
        F.banner(b, cx + rng.range(-3, 3), HA - 0.05, cz + rng.range(-2, 2), rng.range(0.9, 1.8), rng.range(3, HA - 4.8), rng.chance(0.6) ? 'accent' : 'accent2', rng.chance(0.5) ? 0 : Math.PI / 2);
      }
    }
    // A big painting and the company sign on the tall walls.
    const high = this.wallSpots(r, 5, 1);
    if (high.length) {
      const s = high[0];
      const a = (s.a0 + s.a1) / 2;
      const p = this.onWall(s, a);
      const w = Math.min(s.len - 1, rng.range(6, 10));
      F.art(b, p.x, FH + 0.9, p.z, s.rot, w, w * 0.42, this.artKey());
      this.useWall(s, a - w / 2, a + w / 2);
      this.addFocus(r, p.x, FH + 1.9, p.z, 1.3);
    }
    const high2 = this.wallSpots(r, 6, 1).concat(this.wallSpots(r, 6, 2));
    if (high2.length) {
      const s = high2[0];
      const p = this.onWall(s, (s.a0 + s.a1) / 2);
      const lv = s.r.spans[s.e].find((sp) => sp.kind === 'solid' && sp.a0 <= s.a0 && sp.a1 >= s.a1)?.level ?? 1;
      F.logoSign(b, p.x, lv * FH + FH - 1.6, p.z, s.rot, 0.75);
    }
    // Plain walls at ground level: art or TV.
    for (const s of this.wallSpots(r, 2.6, 0).slice(0, 2)) this.hang(r, s, rng.pick(['art', 'tv']));
  }

  corridor(r) {
    const { b, rng } = this;
    const P = this.P(r);
    const alongX = r.w >= r.d;
    const width = alongX ? r.d : r.w;
    const L0 = alongX ? r.x0 : r.z0;
    const L1 = alongX ? r.x1 : r.z1;
    const mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    const runner = rng.weighted([
      ['floorDark', 1.2],
      ['carpet', 1],
      [null, 1.2],
    ]);
    if (runner && width > 2.6) {
      const hw = width / 2 - rng.range(0.5, 0.8);
      if (alongX) b.box(runner, L0 + 0.3, 0, mid - hw, L1 - 0.3, runner === 'carpet' ? 0.012 : 0.004, mid + hw, false);
      else b.box(runner, mid - hw, 0, L0 + 0.3, mid + hw, runner === 'carpet' ? 0.012 : 0.004, L1 - 0.3, false);
    }
    if (rng.chance(0.55)) {
      const framed = rng.chance(0.5);
      for (let a = L0 + 1.8; a < L1 - 1.6; a += 3.6) {
        const ta = Math.round(a / 0.6) * 0.6;
        if (alongX) F.lightPanel(b, ta, tile(mid) - 0.3, ta + 1.2, tile(mid) + 0.3, CEIL, framed);
        else F.lightPanel(b, tile(mid) - 0.3, ta, tile(mid) + 0.3, ta + 1.2, CEIL, framed);
      }
      this.ceiling(r, 'none');
    } else this.ceiling(r, 'downlights');
    // Wall pieces with light washing over them.
    for (const s of this.wallSpots(r, 2.4).slice(0, rng.int(2, 4))) this.hang(r, s, rng.weighted([['art', 3], ['tv', 1.5], ['mono', 0.6]]));
    // Benches against the walls.
    for (const s of this.wallSpots(r, 2.6).slice(0, 2)) {
      if (width < 2.9 || !rng.chance(0.6)) continue;
      const a = (s.a0 + s.a1) / 2;
      const p = this.onWall(s, a);
      const x = p.x + s.ix * 0.4;
      const z = p.z + s.iz * 0.4;
      if (rng.chance(0.5)) {
        const n = rng.int(3, 4);
        if (P.take(...foot(x + s.ix * 0.05, z + s.iz * 0.05, n * 0.64, 0.7, s.rot), 0.1)) F.beamSeating(b, x + s.ix * 0.05, 0, z + s.iz * 0.05, s.rot, n, this.seatKey());
      } else if (P.take(...foot(x, z, 1.8, 0.55, s.rot), 0.1)) F.bench(b, x, 0, z, s.rot, 1.8, rng.chance(0.5) ? 'upholstery' : 'white');
    }
    // Display cases down wide corridors.
    if (width >= 3.5 && rng.chance(0.45)) {
      const key = rng.chance(0.7) ? 'accent' : 'white';
      for (let a = L0 + 4; a < L1 - 4; a += rng.range(5, 8)) {
        const x = alongX ? a : mid;
        const z = alongX ? mid : a;
        if (P.take(x - 0.7, z - 0.7, x + 0.7, z + 0.7, 0.3)) {
          F.displayCase(b, rng, x, 0, z, alongX ? 0 : Math.PI / 2, { key, w: 0.8, d: 0.6 });
          this.addFocus(r, x, 1.2, z, 0.7);
        }
      }
    }
    // Exit signs hanging at each end, bins and a plant or two.
    for (const a of [L0 + 0.8, L1 - 0.8]) {
      const x = alongX ? a : mid;
      const z = alongX ? mid : a;
      const rot = alongX ? Math.PI / 2 : 0;
      F.exitSign(b, x, CEIL - 0.34, z, rot);
      F.exitSign(b, x, CEIL - 0.34, z, rot + Math.PI);
      b.box('metal', x - 0.005, CEIL - 0.14, z - 0.005, x + 0.005, CEIL, z + 0.005, false);
    }
    if (rng.chance(0.5)) {
      const s = P.spot(rng, 0.45, 0.45, 20, 0);
      if (s) F.trash(b, s.x, 0, s.z);
    }
    this.plants(r, rng.int(0, 2));
  }

  lounge(r) {
    const { b, rng } = this;
    const P = this.P(r);
    const y = r.y;
    const spots = this.wallSpots(r, 2.6);
    let done = false;
    if (spots.length) {
      const s = spots[0];
      const { p } = this.hang(r, s, rng.chance(0.7) ? 'tv' : 'art');
      const depth = s.e === 'N' || s.e === 'S' ? r.d : r.w;
      const dist = Math.min(3.6, depth - 1.1);
      if (dist > 2.2) {
        const sx = p.x + s.ix * dist;
        const sz = p.z + s.iz * dist;
        const back = faceRot(-s.ix, -s.iz);
        const sw = rng.range(2.1, 2.7);
        const key = this.seatKey();
        const style = rng.pick(['box', 'tub', 'pod']);
        if (P.take(...foot(sx, sz, sw, 0.95, back), 0.1)) {
          F.sofa(b, sx, y, sz, back, { w: sw, key, style });
          const tx = sx - s.ix * 1.1;
          const tz = sz - s.iz * 1.1;
          if (P.take(...foot(tx, tz, 1.2, 0.7, back), 0.1)) F.coffeeTable(b, tx, y, tz, back, { w: 1.2, d: 0.6, style: rng.pick(['waterfall', 'white', 'glass']) });
          const along = s.e === 'N' || s.e === 'S' ? [1, 0] : [0, 1];
          for (const sg of [-1, 1]) {
            const cx = tx + along[0] * sg * 1.35;
            const cz = tz + along[1] * sg * 1.35;
            const rot = faceRot(-along[0] * sg, -along[1] * sg);
            if (!P.take(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4, 0.05)) continue;
            if (rng.chance(0.6)) F.loungeChair(b, cx, y, cz, rot, rng.chance(0.5) ? 'upholsteryWhite' : key);
            else F.cubes(b, rng, cx, y, cz, ['upholstery', 'white', 'accent2']);
          }
          if (rng.chance(0.5) && r.floor !== 'carpet') this.rug(r, Math.min(sx, tx) - 1.8, Math.min(sz, tz) - 1.8, Math.max(sx, tx) + 1.8, Math.max(sz, tz) + 1.8);
          this.addFocus(r, sx, y + 0.8, sz, 0.8);
          done = true;
        }
      }
    }
    if (!done) this.seating(r, { rugChance: 0.4 });
    for (const s of this.wallSpots(r, 1.6).slice(0, 2)) {
      if (rng.chance(0.5)) this.hang(r, s, rng.pick(['art', 'mono', 'shelf']));
      else {
        const p = this.onWall(s, (s.a0 + s.a1) / 2);
        const x = p.x + s.ix * 0.4;
        const z = p.z + s.iz * 0.4;
        if (P.take(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 0.1)) F.cubes(b, rng, x, y, z, ['white', 'upholstery', 'accent2', 'white']);
      }
    }
    this.plants(r, rng.int(1, 3));
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const discs = rng.int(0, 3);
    for (let i = 0; i < discs; i++) {
      const x = cx + rng.range(-r.w / 4, r.w / 4);
      const z = cz + rng.range(-r.d / 4, r.d / 4);
      F.pendantDisc(b, x, y + CEIL - rng.range(0.55, 0.8), z, rng.range(0.25, 0.42), y + CEIL, rng.chance(0.5) ? 'accent' : 'white');
      (r.lightsAvoid = r.lightsAvoid || []).push([x, z]);
    }
    this.ceiling(r, 'downlights');
  }

  office(r) {
    const { b, rng } = this;
    const P = this.P(r);
    const y = r.y;
    const spots = this.wallSpots(r, 2.4);
    let deskAt = null;
    if (spots.length) {
      const s = spots[0];
      const a = (s.a0 + s.a1) / 2 + rng.range(-0.4, 0.4);
      const p = this.onWall(s, a);
      const depth = s.e === 'N' || s.e === 'S' ? r.d : r.w;
      if (depth > 3.6) {
        // Credenza against the wall, chair, then the desk facing into the room.
        if (rng.chance(0.6) && P.take(...foot(p.x + s.ix * 0.25, p.z + s.iz * 0.25, 1.8, 0.5, s.rot), 0.02)) F.credenza(b, p.x + s.ix * 0.25, y, p.z + s.iz * 0.25, s.rot, 1.8, rng.pick(['white', 'wood']));
        const dx = p.x + s.ix * 1.75;
        const dz = p.z + s.iz * 1.75;
        if (P.take(...foot(dx, dz, 2.0, 1.9, s.rot), 0.1)) {
          F.execDesk(b, rng, dx, y, dz, s.rot);
          deskAt = { x: dx, z: dz };
          this.addFocus(r, dx, y + 0.9, dz, 1);
          // Visitor chairs.
          const along = s.e === 'N' || s.e === 'S' ? [1, 0] : [0, 1];
          for (const sg of [-1, 1]) {
            const cx = dx + s.ix * 1.2 + along[0] * sg * 0.55;
            const cz = dz + s.iz * 1.2 + along[1] * sg * 0.55;
            if (P.take(cx - 0.38, cz - 0.38, cx + 0.38, cz + 0.38, 0.02)) F.loungeChair(b, cx, y, cz, faceRot(-s.ix, -s.iz) + sg * 0.25, rng.chance(0.6) ? 'upholsteryWhite' : 'leather');
          }
          if (rng.chance(0.55)) F.pendantSquare(b, dx, y + CEIL - 0.8, dz, 1.1, y + CEIL, rng.chance(0.5) ? 'accent' : 'white');
          (r.lightsAvoid = r.lightsAvoid || []).push([dx, dz]);
        }
        this.useWall(s, a - 1.2, a + 1.2);
      }
    }
    if (!deskAt) {
      // No solid wall to back onto: a free-standing desk facing the room.
      const alongX = r.w >= r.d;
      const rot = alongX ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : rng.chance(0.5) ? 0 : Math.PI;
      const s = P.spot(rng, 2.6, 2.6, 30, 0.3, 0.2);
      if (s) {
        F.execDesk(b, rng, s.x, y, s.z, rot);
        const fx = Math.sin(rot);
        const fz = Math.cos(rot);
        for (const sg of [-1, 1]) F.loungeChair(b, s.x + fx * 1.2 + fz * sg * 0.55, y, s.z + fz * 1.2 - fx * sg * 0.55, rot + Math.PI + sg * 0.25, rng.chance(0.6) ? 'upholsteryWhite' : 'leather');
        this.addFocus(r, s.x, y + 0.9, s.z, 1);
        if (rng.chance(0.55)) {
          F.pendantSquare(b, s.x, y + CEIL - 0.8, s.z, 1.1, y + CEIL, rng.chance(0.5) ? 'accent' : 'white');
          (r.lightsAvoid = r.lightsAvoid || []).push([s.x, s.z]);
        }
      }
      const s2 = P.spot(rng, 2.4, 1.0, 20, 0.2, 0.3);
      if (s2) F.sofa(b, s2.x, y, s2.z, alongX ? 0 : Math.PI / 2, { w: 2.0, key: rng.pick(['upholsteryWhite', 'upholstery']), style: 'box' });
    }
    // A sofa corner in larger offices.
    if (r.w * r.d > 26) {
      const sp = this.wallSpots(r, 2.6)[0];
      if (sp) {
        const a = (sp.a0 + sp.a1) / 2;
        const p = this.onWall(sp, a);
        const sx = p.x + sp.ix * 0.55;
        const sz = p.z + sp.iz * 0.55;
        if (P.take(...foot(sx, sz, 2.2, 0.95, sp.rot), 0.1)) {
          F.sofa(b, sx, y, sz, sp.rot, { w: 2.1, key: rng.pick(['upholsteryWhite', 'upholstery', 'leather']), style: rng.pick(['box', 'pod']) });
          const tx = sx + sp.ix * 1.05;
          const tz = sz + sp.iz * 1.05;
          if (P.take(...foot(tx, tz, 1.1, 0.6, sp.rot), 0.05)) F.coffeeTable(b, tx, y, tz, sp.rot, { w: 1.1, d: 0.5, style: 'waterfall' });
          this.useWall(sp, a - 1.3, a + 1.3);
        }
      }
    }
    for (const s of this.wallSpots(r, 2.2).slice(0, 2)) this.hang(r, s, rng.weighted([['mono', this.logoUsed ? 0.8 : 2], ['art', 2], ['shelf', 1]]));
    this.logoUsed = true;
    this.plants(r, rng.int(1, 2));
    this.ceiling(r, 'downlights');
  }

  open(r) {
    const { b, rng } = this;
    const P = this.P(r);
    const y = r.y;
    // Rows of back-to-back desk pairs with dividers, aisles between; pairs
    // are placed one by one so door clearances just leave gaps.
    const alongX = r.w >= r.d;
    const L = alongX ? r.w : r.d;
    const S = alongX ? r.d : r.w;
    const dw = 1.6;
    const nDesk = Math.max(1, Math.floor((L - 1.6) / dw));
    const rows = [];
    for (let s = 1.9; s + 1.6 < S; s += 4.0) rows.push(s);
    const deskKey = rng.pick(['whiteGloss', 'deskTop']);
    const divider = rng.pick(['accent', 'upholstery', 'frosted', 'white']);
    for (const s of rows) {
      const base = (alongX ? r.z0 : r.x0) + s + (S - rows[rows.length - 1] - 1.9) / 2;
      const start = (alongX ? r.x0 : r.z0) + (L - nDesk * dw) / 2 + dw / 2;
      let run = null;
      const flush = () => {
        if (!run) return;
        const [a0, a1] = run;
        if (alongX) b.box(divider, a0 + 0.05, y + 0.75, base - 0.02, a1 - 0.05, y + 1.2, base + 0.02, false);
        else b.box(divider, base - 0.02, y + 0.75, a0 + 0.05, base + 0.02, y + 1.2, a1 - 0.05, false);
        this.addFocus(r, alongX ? (a0 + a1) / 2 : base, y + 1.0, alongX ? base : (a0 + a1) / 2, 0.8);
        run = null;
      };
      for (let i = 0; i < nDesk; i++) {
        const a = start + i * dw;
        const [x0, z0, x1, z1] = alongX ? [a - dw / 2, base - 1.55, a + dw / 2, base + 1.55] : [base - 1.55, a - dw / 2, base + 1.55, a + dw / 2];
        if (!P.free(x0, z0, x1, z1, 0.02)) {
          flush();
          continue;
        }
        P.reserve(x0, z0, x1, z1);
        for (const side of [-1, 1]) {
          if (rng.chance(0.05)) continue;
          const off = side * 0.4;
          const x = alongX ? a : base + off;
          const z = alongX ? base + off : a;
          const rot = alongX ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
          F.desk(b, rng, x, y, z, rot, { w: dw - 0.04, top: deskKey });
        }
        run = run ? [run[0], a + dw / 2] : [a - dw / 2, a + dw / 2];
      }
      flush();
    }
    // Storage along a wall, printers, plants, a breakout sofa.
    for (const s of this.wallSpots(r, 2.0).slice(0, 3)) {
      const kind = rng.weighted([
        ['cabinets', 2],
        ['board', 1],
        ['art', 1.5],
        ['printer', 1],
      ]);
      if (kind === 'board' || kind === 'art') this.hang(r, s, kind);
      else {
        const a = (s.a0 + s.a1) / 2;
        const p = this.onWall(s, a);
        if (kind === 'printer') {
          const x = p.x + s.ix * 0.5;
          const z = p.z + s.iz * 0.5;
          if (P.take(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 0.1)) F.printer(b, x, y, z, s.rot);
        } else {
          const n = Math.min(4, Math.floor((s.len - 0.4) / 0.82));
          const along = s.e === 'N' || s.e === 'S' ? [1, 0] : [0, 1];
          for (let i = 0; i < n; i++) {
            const o = (i - (n - 1) / 2) * 0.82;
            const x = p.x + s.ix * 0.27 + along[0] * o;
            const z = p.z + s.iz * 0.27 + along[1] * o;
            if (P.take(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0.0)) F.fileCabinet(b, x, y, z, s.rot, 0.8, rng.chance(0.8) ? 'white' : 'accent');
          }
        }
        this.useWall(s, a - 1.8, a + 1.8);
      }
    }
    this.plants(r, rng.int(1, 3));
    if (rng.chance(0.4)) this.seating(r, { rugChance: 0.3 });
    this.ceiling(r, 'panels');
  }

  meeting(r) {
    const { b, rng } = this;
    const P = this.P(r);
    const y = r.y;
    const alongX = r.w >= r.d;
    const L = Math.max(r.w, r.d);
    const S = Math.min(r.w, r.d);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const len = Math.max(1.8, Math.min(L - 3.0, rng.range(3.4, 6)));
    const rot = alongX ? 0 : Math.PI / 2;
    if (S >= 3.4 && P.take(...foot(cx, cz, len + 1.6, 2.6, rot), 0.05)) {
      F.confTable(b, rng, cx, y, cz, rot, len, { top: rng.weighted([['wood', 3], ['whiteGloss', 1], ['deskTop', 1]]), chairKey: rng.weighted([['leather', 3], ['upholstery', 1]]) });
      this.addFocus(r, cx, y + 0.9, cz, 1.2);
      const sq = rng.chance(0.55);
      if (sq) {
        F.pendantSquare(b, cx, y + CEIL - 0.75, cz, 1.2, y + CEIL, rng.chance(0.5) ? 'accent' : 'white', rot);
        (r.lightsAvoid = r.lightsAvoid || []).push([cx, cz]);
      } else {
        const hl = len / 2 - 0.3;
        if (alongX) F.lightPanel(b, cx - hl, cz - 0.3, cx + hl, cz + 0.3, y + CEIL, true);
        else F.lightPanel(b, cx - 0.3, cz - hl, cx + 0.3, cz + hl, y + CEIL, true);
        (r.lightsAvoid = r.lightsAvoid || []).push([cx, cz], [cx + (alongX ? hl : 0), cz + (alongX ? 0 : hl)], [cx - (alongX ? hl : 0), cz - (alongX ? 0 : hl)]);
      }
    } else {
      F.cafeTable(b, cx, y, cz);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        F.simpleChair(b, cx + Math.sin(a) * 0.75, y, cz + Math.cos(a) * 0.75, a + Math.PI, 'upholstery');
      }
      P.reserve(cx - 1.1, cz - 1.1, cx + 1.1, cz + 1.1);
    }
    // TV on an end wall, a monogram or whiteboard on a side wall.
    const spots = this.wallSpots(r, 2.0);
    const ends = spots.filter((s) => (alongX ? s.e === 'W' || s.e === 'E' : s.e === 'N' || s.e === 'S'));
    const sides = spots.filter((s) => !ends.includes(s));
    if (ends.length) {
      const s = ends[0];
      this.hang(r, s, 'tv');
      if (rng.chance(0.35)) {
        const p = this.onWall(s, (s.a0 + s.a1) / 2);
        const x = p.x + s.ix * 0.25;
        const z = p.z + s.iz * 0.25;
        if (P.take(...foot(x, z, 1.6, 0.46, s.rot), 0.02)) F.credenza(b, x, y, z, s.rot, 1.6, rng.pick(['white', 'wood', 'black']));
      }
    }
    if (sides.length) this.hang(r, sides[0], rng.weighted([['mono', 2], ['art', 1.5], ['board', 1]]));
    if (ends.length > 1) this.hang(r, ends[1], rng.pick(['board', 'art']));
    this.plants(r, rng.int(0, 1));
    this.ceiling(r, 'downlights');
  }

  break(r) {
    const { b, rng } = this;
    const P = this.P(r);
    const y = r.y;
    const spots = this.wallSpots(r, 3.0);
    const front = rng.weighted([['white', 2], ['accent', 1.5], ['wood', 1]]);
    if (spots.length) {
      const s = spots[0];
      const len = Math.min(s.len - 0.2, rng.range(3.2, 5.4));
      const a = (s.a0 + s.a1) / 2;
      const p = this.onWall(s, a);
      const x = p.x + s.ix * 0.31;
      const z = p.z + s.iz * 0.31;
      if (P.take(...foot(x, z, len, 0.66, s.rot), 0.02)) {
        F.kitchen(b, rng, x, y, z, s.rot, len, front);
        this.useWall(s, a - len / 2, a + len / 2);
        this.addFocus(r, x, y + 1.2, z, 0.8);
        // Island / bar with stools.
        const depth = s.e === 'N' || s.e === 'S' ? r.d : r.w;
        if (depth > 5 && rng.chance(0.55)) {
          const ix = x + s.ix * 1.9;
          const iz = z + s.iz * 1.9;
          const il = Math.min(len - 0.6, 2.8);
          if (P.take(...foot(ix, iz, il, 1.5, s.rot), 0.1)) {
            const f = b.frame(ix, y, iz, s.rot);
            f.box(front, -il / 2, 0, -0.35, il / 2, 0.98, 0.35, true);
            f.box(rng.pick(['black', 'whiteGloss', 'wood']), -il / 2 - 0.05, 0.98, -0.4, il / 2 + 0.05, 1.03, 0.55);
            const n = Math.floor(il / 0.6);
            for (let i = 0; i < n; i++) {
              const q = f.point(-il / 2 + 0.3 + i * 0.6, 0, 0.8);
              F.barStool(b, q.x, y, q.z, this.seatKey());
            }
          }
        }
      }
    }
    // Café tables.
    const tables = rng.int(2, 4);
    for (let i = 0; i < tables; i++) {
      const s = P.spot(rng, 2.0, 2.0, 25, 0, 0.2);
      if (!s) continue;
      F.cafeTable(b, s.x, y, s.z, rng.chance(0.6) ? 'whiteGloss' : 'wood');
      const n = rng.int(2, 4);
      const a0 = rng.range(0, Math.PI);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * Math.PI * 2;
        F.simpleChair(b, s.x + Math.sin(a) * 0.72, y, s.z + Math.cos(a) * 0.72, a + Math.PI, rng.pick(['whiteGloss', 'upholstery', 'accent']));
      }
      if (rng.chance(0.6)) {
        F.pendantDisc(b, s.x, y + CEIL - 1.0, s.z, 0.3, y + CEIL, rng.chance(0.5) ? 'accent' : 'white');
        (r.lightsAvoid = r.lightsAvoid || []).push([s.x, s.z]);
      }
    }
    for (const s of this.wallSpots(r, 1.8).slice(0, 2)) this.hang(r, s, rng.pick(['tv', 'art', 'board']));
    this.plants(r, rng.int(1, 2));
    this.ceiling(r, 'downlights');
  }

  print(r) {
    const { b, rng } = this;
    const P = this.P(r);
    const spots = this.wallSpots(r, 1.4);
    let printers = 0;
    for (const s of spots.slice(0, 3)) {
      const a = (s.a0 + s.a1) / 2;
      const p = this.onWall(s, a);
      if (printers < 2 && rng.chance(0.6)) {
        const x = p.x + s.ix * 0.5;
        const z = p.z + s.iz * 0.5;
        if (P.take(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 0.05)) {
          F.printer(b, x, r.y, z, s.rot);
          printers++;
        }
      } else this.hang(r, s, 'shelf', { wash: false });
    }
    this.ceiling(r, 'panels');
  }

  closed(r) {
    const { b, rng } = this;
    for (const s of this.wallSpots(r, 1.4).slice(0, 2)) this.hang(r, s, 'shelf', { wash: false });
    if (rng.chance(0.5)) {
      const s = this.P(r).spot(rng, 0.8, 0.6, 10);
      if (s) b.box('darkMetal', s.x - 0.4, r.y, s.z - 0.3, s.x + 0.4, r.y + 1.9, s.z + 0.3);
    }
  }

  // Lift shafts behind the lift doors, washroom stalls behind the others.
  core(r) {
    const { b } = this;
    const e = r.elevSide;
    if (!e) return;
    const [ix, iz] = EDGE_IN[e];
    const c = edgeCoord(r, e);
    const alongX = e === 'N' || e === 'S';
    const shaft = 2.6;
    const lo = Math.min(c + (ix + iz) * (T / 2), c + (ix + iz) * (T / 2 + shaft));
    const hi = Math.max(c + (ix + iz) * (T / 2), c + (ix + iz) * (T / 2 + shaft));
    if (alongX) b.box('concrete', r.x0 + 0.1, 0, lo, r.x1 - 0.1, FH, hi);
    else b.box('concrete', lo, 0, r.z0 + 0.1, hi, FH, r.z1 - 0.1);
    // Stall partitions along the far wall.
    const far = alongX ? (iz > 0 ? r.z1 : r.z0) : ix > 0 ? r.x1 : r.x0;
    const dir = -(ix + iz);
    const len = alongX ? r.w : r.d;
    const n = Math.floor((len - 1.2) / 1.0);
    for (let i = 0; i <= n; i++) {
      const a = (alongX ? r.x0 : r.z0) + 0.6 + i * 1.0;
      const p0 = far - dir * (T / 2);
      const p1 = far - dir * (T / 2 + 1.5);
      if (alongX) b.box('white', a - 0.02, 0.15, Math.min(p0, p1), a + 0.02, 2.0, Math.max(p0, p1), false);
      else b.box('white', Math.min(p0, p1), 0.15, a - 0.02, Math.max(p0, p1), 2.0, a + 0.02, false);
    }
  }

  // ------------------------------------------------------------ mezzanine

  mezzanine() {
    const { b, rng } = this;
    for (const m of this.plan.mezz) {
      const P = new Placer(m, 0.3);
      // Keep a walkway clear along the railing edge and at the stair head.
      const out = m.open;
      if (out === 'N') P.reserve(m.x0, m.z0, m.x1, m.z0 + 1.6);
      if (out === 'S') P.reserve(m.x0, m.z1 - 1.6, m.x1, m.z1);
      if (out === 'W') P.reserve(m.x0, m.z0, m.x0 + 1.6, m.z1);
      if (out === 'E') P.reserve(m.x1 - 1.6, m.z0, m.x1, m.z1);
      const st = this.stair;
      P.reserve(st.x - 1.4, st.z0 - 2, st.x + 1.4, st.z1 + 2);
      for (let i = 0; i < rng.int(1, 3); i++) {
        const s = P.spot(rng, 0.9, 0.6, 20);
        if (s) F.planter(b, rng, s.x, FH, s.z, { w: 0.9, d: 0.6, h: 0.5, key: rng.pick(['black', 'white', 'accent']), plant: rng.weighted([['bamboo', 3], ['blades', 2], ['ball', 1]]) });
      }
      if (rng.chance(0.6)) {
        const alongX = out === 'N' || out === 'S';
        const rot = out === 'N' ? Math.PI : out === 'S' ? 0 : out === 'W' ? -Math.PI / 2 : Math.PI / 2;
        const s = P.spot(rng, alongX ? 2.2 : 0.8, alongX ? 0.8 : 2.2, 20);
        if (s) F.bench(b, s.x, FH, s.z, rot, 2.0, rng.chance(0.5) ? 'upholstery' : 'white');
      }
    }
  }
}
