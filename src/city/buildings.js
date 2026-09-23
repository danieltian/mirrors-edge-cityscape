import * as THREE from 'three';
import { BOX, CYL, OCT, WEDGE, PYR } from './prims.js';

// Turns lots into stacks of primitives. Footprints are expressed in lot-local
// coordinates: { u, v, w, d } = centre + size along the lot's U / V axes.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lin = (hex) => new THREE.Color(hex).toArray();

export const ACCENTS = {
  red: lin('#e0322b'),
  orange: '#ef7a1f',
  yellow: '#f3c02b',
  teal: '#23a592',
};
for (const k of Object.keys(ACCENTS)) if (typeof ACCENTS[k] === 'string') ACCENTS[k] = lin(ACCENTS[k]);

export const PLINTH_H = 0.3;

class Ctx {
  constructor(sink, rng, lot) {
    this.sink = sink;
    this.rng = rng;
    this.lot = lot;
    this.x = lot.x;
    this.z = lot.z;
    this.a = lot.angle;
    this.c = Math.cos(lot.angle);
    this.s = Math.sin(lot.angle);
    const v = rng.range(0.86, 0.96);
    const cool = rng.range(-0.012, 0.018);
    this.tint = [v * (1 - cool), v, v * (1 + cool)];
    this.top = 0;
  }

  prim(type, u, y, v, sx, sy, sz, opts = {}) {
    const wx = this.x + u * this.c + v * this.s;
    const wz = this.z - u * this.s + v * this.c;
    this.sink.add(type, wx, y, wz, sx, sy, sz, this.a + (opts.rot || 0), opts.color || this.tint, opts.accent || null);
    if (y + sy > this.top) this.top = y + sy;
  }

  box(fp, y, h, opts) {
    if (h <= 0.01 || fp.w <= 0.05 || fp.d <= 0.05) return;
    this.prim(BOX, fp.u, y, fp.v, fp.w, h, fp.d, opts);
  }

  accent(p) {
    if (!this.rng.chance(p)) return null;
    return ACCENTS[this.rng.weighted([
      ['red', 45],
      ['orange', 33],
      ['yellow', 16],
      ['teal', 6],
    ])];
  }
}

function shrink(rng, fp, fu, fv, align = 'rand') {
  const w = fp.w * fu;
  const d = fp.d * fv;
  let u = fp.u;
  let v = fp.v;
  const mode = align === 'rand' ? rng.pick(['c', 'c', 'c', 'u', 'v', 'uv']) : align;
  if (mode.includes('u')) u += rng.sign() * (fp.w - w) / 2;
  if (mode.includes('v')) v += rng.sign() * (fp.d - d) / 2;
  return { u, v, w, d };
}

// ------------------------------------------------------------ roof clutter

function roofProps(ctx, fp, y, cls, opts = {}) {
  const { rng } = ctx;
  if (fp.w < 4 || fp.d < 4) return;
  const area = fp.w * fp.d;
  const margin = 1.3;
  const place = (sw, sd) => ({
    u: fp.u + rng.range(-1, 1) * Math.max(0, (fp.w - sw) / 2 - margin),
    v: fp.v + rng.range(-1, 1) * Math.max(0, (fp.d - sd) / 2 - margin),
  });

  const parapetChance = opts.parapet ?? (cls === 'low' ? 0.55 : cls === 'mid' ? 0.35 : 0.15);
  if (rng.chance(parapetChance) && fp.w > 8 && fp.d > 8) {
    const t = 0.45;
    const ph = rng.range(0.9, 1.5);
    ctx.prim(BOX, fp.u, y, fp.v - fp.d / 2 + t / 2, fp.w, ph, t);
    ctx.prim(BOX, fp.u, y, fp.v + fp.d / 2 - t / 2, fp.w, ph, t);
    ctx.prim(BOX, fp.u - fp.w / 2 + t / 2, y, fp.v, t, ph, fp.d - 2 * t);
    ctx.prim(BOX, fp.u + fp.w / 2 - t / 2, y, fp.v, t, ph, fp.d - 2 * t);
  }

  if (rng.chance(opts.penthouse ?? 0.82) && fp.w > 7 && fp.d > 7) {
    const pw = clamp(fp.w * rng.range(0.22, 0.52), 3.5, 26);
    const pd = clamp(fp.d * rng.range(0.22, 0.52), 3.5, 26);
    const ph = rng.range(3, 6.5);
    const p = place(pw, pd);
    ctx.prim(BOX, p.u, y, p.v, pw, ph, pd, { accent: ctx.accent(0.02) });
    if (rng.chance(0.35)) {
      const sw = pw * rng.range(0.35, 0.7);
      const sd = pd * rng.range(0.35, 0.7);
      ctx.prim(BOX, p.u + rng.range(-1, 1) * (pw - sw) / 2, y + ph, p.v + rng.range(-1, 1) * (pd - sd) / 2, sw, rng.range(1.5, 3.5), sd);
    }
  }

  const nAC = Math.min(7, Math.floor((area / 240) * rng.range(0, 1.3)));
  for (let i = 0; i < nAC; i++) {
    const sw = rng.range(1.4, 3.6);
    const sd = sw * rng.range(0.6, 1.6);
    const p = place(sw, sd);
    ctx.prim(BOX, p.u, y, p.v, sw, rng.range(1, 2.3), sd, { accent: ctx.accent(0.035) });
  }

  if (rng.chance(0.2)) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const r = rng.range(0.9, 2.2);
      const p = place(r, r);
      ctx.prim(CYL, p.u, y, p.v, r, rng.range(1.5, 3.2), r);
    }
  }

  if (cls !== 'tall' && rng.chance(0.1) && fp.w > 12 && fp.d > 12) {
    const r = rng.range(3.6, 6);
    const p = place(r, r);
    const legs = rng.range(1.8, 3);
    ctx.prim(BOX, p.u, y, p.v, r * 0.7, legs, r * 0.7);
    ctx.prim(CYL, p.u, y + legs, p.v, r, rng.range(4, 6), r, { accent: ctx.accent(0.05) });
  }
}

function antenna(ctx, fp, y, count = 1) {
  const { rng } = ctx;
  for (let i = 0; i < count; i++) {
    const t = rng.range(0.5, 1.0);
    ctx.prim(BOX, fp.u + rng.range(-0.3, 0.3) * fp.w, y, fp.v + rng.range(-0.3, 0.3) * fp.d, t, rng.range(10, 32), t);
  }
}

function crown(ctx, fp, y, cls) {
  const { rng } = ctx;
  const r = rng.next();
  if (cls === 'tall' && r < 0.22) {
    // Stepped (ziggurat) crown.
    let cur = fp;
    let yy = y;
    const steps = rng.int(2, 4);
    for (let k = 0; k < steps; k++) {
      cur = shrink(rng, cur, rng.range(0.7, 0.86), rng.range(0.7, 0.86), 'c');
      const h = rng.range(3, 7);
      ctx.box(cur, yy, h);
      yy += h;
    }
    roofProps(ctx, cur, yy, cls, { parapet: 0, penthouse: 0.4 });
    if (rng.chance(0.4)) antenna(ctx, cur, yy);
  } else if (cls === 'tall' && r < 0.3) {
    const h = Math.min(fp.w, fp.d) * rng.range(0.35, 0.9);
    ctx.prim(PYR, fp.u, y, fp.v, fp.w * 0.92, h, fp.d * 0.92);
    if (rng.chance(0.5)) antenna(ctx, { u: fp.u, v: fp.v, w: 0, d: 0 }, y + h * 0.8);
  } else if ((cls === 'tall' && r < 0.45) || (cls === 'mid' && r < 0.05)) {
    roofProps(ctx, fp, y, cls);
    antenna(ctx, fp, y, cls === 'tall' ? rng.int(1, 2) : 1);
  } else if (cls === 'tall' && r < 0.58) {
    // Helipad
    const D = Math.min(fp.w, fp.d) * 0.78;
    ctx.prim(CYL, fp.u, y, fp.v, D, 0.8, D);
  } else {
    roofProps(ctx, fp, y, cls);
  }
}

// -------------------------------------------------------------- archetypes

function simpleBlock(ctx, fp, y0, H, cls) {
  ctx.box(fp, y0, H - y0);
  crown(ctx, fp, H, cls);
}

function setback(ctx, fp, y0, H, cls) {
  const { rng } = ctx;
  const tiers = cls === 'tall' ? rng.int(2, 4) : 2;
  const fr = [];
  let rem = 1;
  for (let t = 0; t < tiers - 1; t++) {
    const f = rem * rng.range(0.45, 0.72);
    fr.push(f);
    rem -= f;
  }
  fr.push(rem);
  let y = y0;
  let cur = fp;
  for (let t = 0; t < tiers; t++) {
    const h = (H - y0) * fr[t];
    ctx.box(cur, y, h);
    y += h;
    if (t < tiers - 1) {
      // Small roof clutter on each terrace.
      const next = shrink(rng, cur, rng.range(0.62, 0.86), rng.range(0.62, 0.86));
      if (rng.chance(0.5)) {
        const s = rng.range(1.5, 3);
        ctx.prim(BOX, cur.u + (cur.w / 2 - 2.5) * rng.sign(), y, cur.v + (cur.d / 2 - 2.5) * rng.sign(), s, rng.range(1, 2), s);
      }
      cur = next;
    }
  }
  crown(ctx, cur, H, cls);
}

function banded(ctx, fp, y0, H, cls) {
  const { rng } = ctx;
  const inset = rng.range(0.6, 1.3);
  ctx.box({ u: fp.u, v: fp.v, w: fp.w - 2 * inset, d: fp.d - 2 * inset }, y0, H - y0);
  const seg = rng.range(7, 15);
  const band = rng.range(1.0, 2.2);
  const n = Math.max(1, Math.round((H - y0 + band) / (seg + band)));
  const segH = (H - y0 + band) / n - band;
  for (let k = 0; k < n; k++) ctx.box(fp, y0 + k * (segH + band), segH);
  crown(ctx, fp, H, cls);
}

function octTower(ctx, fp, y0, H, cls) {
  const { rng } = ctx;
  const split = rng.chance(0.5) ? rng.range(0.6, 0.85) : 1;
  const h1 = (H - y0) * split;
  ctx.prim(OCT, fp.u, y0, fp.v, fp.w, h1, fp.d);
  let top = fp;
  if (split < 1) {
    top = shrink(rng, fp, rng.range(0.6, 0.8), rng.range(0.6, 0.8), 'c');
    ctx.prim(OCT, top.u, y0 + h1, top.v, top.w, H - y0 - h1, top.d);
  }
  if (rng.chance(0.5)) {
    const s = shrink(rng, top, 0.45, 0.45, 'c');
    ctx.prim(OCT, s.u, H, s.v, s.w, rng.range(3, 7), s.d);
    if (rng.chance(0.5)) antenna(ctx, s, H + 4);
  } else roofProps(ctx, shrink(rng, top, 0.7, 0.7, 'c'), H, cls, { parapet: 0 });
}

function cylTower(ctx, fp, y0, H, cls) {
  const { rng } = ctx;
  const D = Math.min(fp.w, fp.d);
  ctx.prim(CYL, fp.u, y0, fp.v, D, H - y0, D);
  if (rng.chance(0.6)) {
    // Rings
    const rings = rng.int(1, 3);
    for (let k = 1; k <= rings; k++) ctx.prim(CYL, fp.u, y0 + ((H - y0) * k) / (rings + 1), fp.v, D * 1.06, 1.2, D * 1.06);
  }
  const d2 = D * rng.range(0.4, 0.7);
  ctx.prim(CYL, fp.u, H, fp.v, d2, rng.range(3, 9), d2);
  if (rng.chance(0.4)) antenna(ctx, { u: fp.u, v: fp.v, w: 0, d: 0 }, H + 5);
}

function slabWedge(ctx, fp, y0, H, cls) {
  const { rng } = ctx;
  const k = rng.int(0, 3);
  const long = Math.max(fp.w, fp.d);
  const wedgeH = clamp(long * rng.range(0.4, 1.1), 6, H * 0.35);
  ctx.box(fp, y0, H - wedgeH - y0);
  const odd = k % 2 === 1;
  ctx.prim(WEDGE, fp.u, H - wedgeH, fp.v, odd ? fp.d : fp.w, wedgeH, odd ? fp.w : fp.d, { rot: (k * Math.PI) / 2 });
}

function twin(ctx, fp, y0, H, cls) {
  const { rng } = ctx;
  const hp = clamp(rng.range(10, 22), 0, H * 0.3);
  ctx.box(fp, y0, hp - y0);
  roofProps(ctx, fp, hp, 'low', { penthouse: 0, parapet: 0.6 });
  const alongU = fp.w >= fp.d;
  const gap = rng.range(6, 14);
  const tw = alongU ? (fp.w - gap) / 2 : fp.w * rng.range(0.6, 0.85);
  const td = alongU ? fp.d * rng.range(0.6, 0.85) : (fp.d - gap) / 2;
  const style = rng.pick([simpleBlock, banded, setback]);
  const H2 = H * rng.range(0.8, 1);
  for (const sgn of [-1, 1]) {
    const t = {
      u: fp.u + (alongU ? sgn * (gap / 2 + tw / 2) : 0),
      v: fp.v + (alongU ? 0 : sgn * (gap / 2 + td / 2)),
      w: tw,
      d: td,
    };
    style(ctx, t, hp, sgn < 0 ? H : H2, cls);
  }
}

function podiumTower(ctx, fp, y0, H, cls) {
  const { rng } = ctx;
  const hp = clamp(rng.range(8, 24), 6, H * 0.4);
  ctx.box(fp, y0, hp - y0);
  roofProps(ctx, fp, hp, 'low', { penthouse: 0.2, parapet: 0.7 });
  const t = shrink(rng, fp, rng.range(0.45, 0.72), rng.range(0.45, 0.72));
  const style = rng.weighted([
    [simpleBlock, 3],
    [setback, 3],
    [banded, 2],
    [octTower, 1],
  ]);
  style(ctx, t, hp, H, cls);
}

function courtyard(ctx, fp, y0, H) {
  const { rng } = ctx;
  const depth = clamp(rng.range(9, 14), 6, Math.min(fp.w, fp.d) / 3);
  const shape = rng.pick(['O', 'O', 'U', 'L']);
  const wings = [];
  wings.push({ u: fp.u, v: fp.v - fp.d / 2 + depth / 2, w: fp.w, d: depth });
  if (shape !== 'L') wings.push({ u: fp.u, v: fp.v + fp.d / 2 - depth / 2, w: fp.w, d: depth });
  const sideD = shape === 'L' ? fp.d - depth : fp.d - 2 * depth;
  const sideV = shape === 'L' ? fp.v + depth / 2 : fp.v;
  wings.push({ u: fp.u - fp.w / 2 + depth / 2, v: sideV, w: depth, d: sideD });
  if (shape === 'O') wings.push({ u: fp.u + fp.w / 2 - depth / 2, v: sideV, w: depth, d: sideD });
  for (const wing of wings) {
    const h = H * rng.range(0.85, 1.1);
    ctx.box(wing, y0, h - y0);
    roofProps(ctx, wing, h, 'low', { parapet: 0.5, penthouse: 0.3 });
  }
}

function industrial(ctx, fp, y0, H) {
  const { rng } = ctx;
  const h = clamp(H, 7, 16);
  ctx.box(fp, y0, h - y0);
  if (rng.chance(0.6)) {
    // Sawtooth roof: wedges along U.
    const teeth = Math.max(2, Math.round(fp.w / rng.range(7, 11)));
    const tw = fp.w / teeth;
    const th = rng.range(2.2, 3.6);
    for (let k = 0; k < teeth; k++) {
      ctx.prim(WEDGE, fp.u - fp.w / 2 + tw * (k + 0.5), h, fp.v, fp.d, th, tw, { rot: Math.PI / 2 });
    }
  } else roofProps(ctx, fp, h, 'low', { parapet: 0.2 });
  if (rng.chance(0.18)) {
    const r = rng.range(2.5, 5);
    ctx.prim(CYL, fp.u + rng.range(-0.35, 0.35) * fp.w, h, fp.v + rng.range(-0.35, 0.35) * fp.d, r, rng.range(18, 45), r, { accent: ctx.accent(0.25) });
  }
  if (rng.chance(0.25)) {
    // Silos / tanks beside the shed.
    const r = rng.range(6, 12);
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) ctx.prim(CYL, fp.u - fp.w / 2 + r / 2 + i * (r + 1.5), h, fp.v, r, rng.range(4, 12), r);
  }
}

function construction(ctx, fp, y0, H) {
  const { rng } = ctx;
  const built = Math.max(18, H * rng.range(0.3, 0.65));
  const core = shrink(rng, fp, 0.3, 0.3, 'c');
  ctx.box(core, y0, built - y0 + 4);
  for (let y = y0; y < built; y += 4.2) ctx.box(fp, y, 0.5);
  const col = 0.9;
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      ctx.prim(BOX, fp.u + su * (fp.w / 2 - col), y0, fp.v + sv * (fp.d / 2 - col), col, built - y0, col);
    }
  }
  // Tower crane.
  const color = rng.pick([ACCENTS.red, ACCENTS.orange, ACCENTS.yellow, ACCENTS.orange]);
  const opts = { accent: color };
  const mu = fp.u + rng.sign() * Math.max(0, fp.w / 2 - 3);
  const mv = fp.v + rng.range(-0.3, 0.3) * fp.d;
  const mastH = built + rng.range(22, 40);
  ctx.prim(BOX, mu, 0, mv, 2.2, mastH, 2.2, opts);
  const phi = rng.range(0, Math.PI * 2);
  const du = Math.cos(phi);
  const dv = -Math.sin(phi);
  const jib = rng.range(45, 70);
  const cj = 16;
  ctx.prim(BOX, mu + du * (jib / 2 - 3), mastH, mv + dv * (jib / 2 - 3), jib, 1.8, 1.6, { ...opts, rot: phi });
  ctx.prim(BOX, mu - du * (cj / 2 + 1), mastH, mv - dv * (cj / 2 + 1), cj, 1.6, 1.8, { ...opts, rot: phi });
  ctx.prim(BOX, mu - du * (cj - 1.5), mastH - 2.2, mv - dv * (cj - 1.5), 4, 3.2, 3.4, { rot: phi });
  ctx.prim(BOX, mu + du * 2.4, mastH - 3.2, mv + dv * 2.4, 2.6, 2.6, 2.6, { ...opts, rot: phi });
  ctx.prim(PYR, mu, mastH + 1.8, mv, 2.2, 8, 2.2, opts);
  const hookAt = rng.range(0.4, 0.9) * jib;
  const cable = mastH - built - rng.range(4, 14);
  if (cable > 2) ctx.prim(BOX, mu + du * hookAt, mastH - cable, mv + dv * hookAt, 0.25, cable, 0.25);
}

function plaza(ctx, fp, y0) {
  const { rng } = ctx;
  const n = rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    const s = shrink(rng, fp, rng.range(0.1, 0.25), rng.range(0.1, 0.25), 'uv');
    ctx.box(s, y0, rng.range(0.6, 1.2));
  }
  if (rng.chance(0.4)) {
    const s = shrink(rng, fp, 0.28, 0.28, 'c');
    ctx.box(s, y0, rng.range(4, 8));
    roofProps(ctx, s, ctx.top, 'low', { penthouse: 0.2 });
  }
}

// ------------------------------------------------------------------ heights

export function lotHeight(rng, lot) {
  const d = lot.dens;
  const minSide = Math.min(lot.w, lot.d);
  let h = 18 + 62 * d + rng.range(0, 42) * (0.5 + d);
  const r = rng.next();
  if (minSide >= 20 && r < 0.06 + 0.34 * d * d) h = rng.range(90, 170) + 150 * d * rng.next();
  if (minSide >= 26 && r < 0.006 + 0.07 * d * d * d) h = rng.range(220, 360);
  if (rng.chance(0.1 * (1 - d))) h = rng.range(8, 20);
  if (lot.districtKind === 'residential') h = Math.min(h, rng.range(20, 70));
  if (lot.districtKind === 'industrial') h = Math.min(h, rng.range(10, 40));
  if (lot.maxH) h = Math.min(h, lot.maxH);
  return Math.max(6, Math.round(h / 3.5) * 3.5);
}

// ------------------------------------------------------------------ entry

export function buildLot(sink, rng, lot) {
  const ctx = new Ctx(sink, rng, lot);
  const y0 = PLINTH_H;
  const ins = () => rng.range(0.5, 3);
  const i1 = ins();
  const i2 = ins();
  const i3 = ins();
  const i4 = ins();
  const fp = { u: (i1 - i2) / 2, v: (i3 - i4) / 2, w: lot.w - i1 - i2, d: lot.d - i3 - i4 };
  if (fp.w < 5 || fp.d < 5) return;

  if (lot.kind === 'plaza') {
    plaza(ctx, fp, y0);
    lot.top = ctx.top;
    return;
  }
  if (lot.kind === 'construction') {
    construction(ctx, fp, y0, lotHeight(rng, lot));
    lot.top = ctx.top;
    return;
  }
  if (lot.kind === 'supertall') {
    supertall(ctx, lot, y0);
    lot.top = ctx.top;
    return;
  }

  const H = lot.forcedH || lotHeight(rng, lot);
  const cls = H < 24 ? 'low' : H < 88 ? 'mid' : 'tall';
  const big = Math.min(fp.w, fp.d) >= 32;

  if (cls === 'low') {
    if (lot.districtKind === 'industrial' && rng.chance(0.65)) industrial(ctx, fp, y0, H);
    else if (big && rng.chance(0.4)) courtyard(ctx, fp, y0, H);
    else simpleBlock(ctx, fp, y0, H, cls);
  } else if (cls === 'mid') {
    const style = rng.weighted([
      [simpleBlock, 34],
      [setback, 24],
      [banded, 14],
      [podiumTower, big ? 12 : 3],
      [octTower, 6],
      [cylTower, 2],
      [slabWedge, 4],
      [courtyard, big ? 6 : 0],
    ]);
    if (style === courtyard) courtyard(ctx, fp, y0, H);
    else style(ctx, fp, y0, H, cls);
  } else {
    // Tall towers rarely fill their lot.
    const f = Math.min(1, 42 / Math.min(fp.w, fp.d));
    const tfp = f < 1 ? shrink(rng, fp, Math.max(f, 0.55), Math.max(f, 0.55), 'c') : fp;
    const style = rng.weighted([
      [podiumTower, big ? 30 : 8],
      [setback, 26],
      [banded, 17],
      [octTower, 10],
      [cylTower, 4],
      [slabWedge, 7],
      [twin, Math.max(fp.w, fp.d) > 50 ? 8 : 0],
    ]);
    if (style === podiumTower || style === twin) style(ctx, fp, y0, H, cls);
    else {
      if (tfp !== fp) {
        ctx.box(fp, y0, rng.range(6, 14));
        roofProps(ctx, fp, ctx.top, 'low', { penthouse: 0, parapet: 0.5 });
      }
      style(ctx, tfp, y0, H, cls);
    }
  }

  // Rare accent panel running up one facade.
  if (cls !== 'low' && rng.chance(0.02)) {
    const side = rng.sign();
    const pw = clamp(fp.w * rng.range(0.15, 0.3), 2.5, 8);
    ctx.prim(BOX, fp.u + rng.range(-0.3, 0.3) * fp.w, y0, fp.v + side * (fp.d / 2 + 0.2), pw, H * rng.range(0.5, 0.95), 0.5, {
      accent: ctx.accent(1),
    });
  }
  lot.top = ctx.top;
}

// The signature supertall: a slender slab with a sheared, slanted top.
function supertall(ctx, lot, y0) {
  const { rng } = ctx;
  const w = Math.min(lot.w - 4, rng.range(38, 48));
  const d = Math.min(lot.d - 4, rng.range(30, 38));
  const H = lot.forcedH || rng.range(420, 470);
  const fp = { u: 0, v: 0, w, d };
  ctx.box({ u: 0, v: 0, w: lot.w - 2, d: lot.d - 2 }, y0, 10);
  const wedgeH = rng.range(45, 70);
  const body = H - wedgeH;
  // Recessed notches that read as thin dark lines at distance.
  const segs = [0.22, 0.47, 0.71];
  let y = y0;
  for (const f of segs) {
    const yn = body * f;
    ctx.box(fp, y, yn - y);
    ctx.box({ u: 0, v: 0, w: w - 2.4, d: d - 2.4 }, yn, 3);
    y = yn + 3;
  }
  ctx.box(fp, y, body - y);
  ctx.prim(WEDGE, 0, body, 0, w, wedgeH, d, { rot: rng.chance(0.5) ? 0 : Math.PI });
}
