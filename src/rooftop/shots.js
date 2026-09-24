import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { PanMotion, TrackMotion, PathMotion, IsoPanMotion, yawOf } from '../camera/motions.js';

// Viewpoints on the rooftops, always at eye level on a roof (never out in
// mid-air), moving the way the other worlds' cameras do: a slow walk across
// a roof, over a walkway or up a service stair to the next roof, or a slow
// sideways drift a few steps back from a parapet looking out over the city
// and the harbour, past housings and plant, or up a glass tower. Each shot
// prefers a place not shown yet.

const EYE = 1.7; // eye height above the roof
const deg = THREE.MathUtils.degToRad;

export class RooftopPlanner {
  constructor(world, getAspect) {
    this.o = world;
    this.getAspect = getAspect;
    this.rng = new RNG((Math.random() * 2 ** 31) >>> 0);
    this.shots = 0;
    this.maxShots = this.rng.int(8, 11);
    this.visited = new Set();
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  evaluate(pos, target, fovDeg) {
    const f = this._f.subVectors(target, pos).normalize();
    const r = this._r.crossVectors(f, THREE.Object3D.DEFAULT_UP).normalize();
    const u = this._u.crossVectors(r, f);
    const tanV = Math.tan(deg(fovDeg) / 2);
    const tanH = tanV * this.getAspect();
    let n = 0;
    let near = 0;
    let close = 0;
    let far = 0;
    let sumLog = 0;
    for (let iy = 0; iy < 5; iy++) {
      for (let ix = 0; ix < 9; ix++) {
        const d = this._d.copy(f).addScaledVector(r, (-0.9 + (1.8 * ix) / 8) * tanH).addScaledVector(u, (-0.85 + (1.7 * iy) / 4) * tanV).normalize();
        const t = this.o.raycast(pos.x, pos.y, pos.z, d.x, d.y, d.z, 300, true);
        n++;
        if (t < 1.0) near++;
        if (t < 2.5) close++;
        if (t > 60) far++;
        sumLog += Math.log(Math.min(t, 300) + 1);
      }
    }
    const center = this.o.raycast(pos.x, pos.y, pos.z, f.x, f.y, f.z, 300, true);
    return { near: near / n, close: close / n, far: far / n, mean: sumLog / n, center };
  }

  score(ev, prefs = {}) {
    if (ev.near > (prefs.maxNear ?? 0.12)) return -Infinity;
    if (ev.center < (prefs.minCenter ?? 6)) return -Infinity;
    if (ev.close > (prefs.maxClose ?? 0.3)) return -Infinity;
    const farPart = Math.min(ev.far, prefs.farCap ?? 0.5);
    return ev.mean * 0.5 + farPart + this.rng.range(0, 0.5);
  }

  focus(tags) {
    const list = this.o.focus.filter((f) => !tags || tags.includes(f.tag));
    if (!list.length) return null;
    return this.rng.weighted(list.map((f) => [f, f.weight]));
  }

  group() {
    const gs = this.o.roofGroups.filter((g) => this.o.navs[g.id].free.length > 40);
    if (!gs.length) return null;
    return this.rng.weighted(gs.map((g) => [g, Math.sqrt(this.o.navs[g.id].free.length)]));
  }

  // A distant point to look at: downtown, the harbour or the TV mast.
  horizon(from) {
    const o = this.o;
    const pick = this.rng.weighted([['sea', 1.2], ['city', 1.5], ['tv', 0.8], ['any', 1]]);
    let dir;
    if (pick === 'sea') dir = new THREE.Vector3(o.sea.dir.x, 0, o.sea.dir.y);
    else if (pick === 'city') dir = new THREE.Vector3(-o.sea.dir.x, 0, -o.sea.dir.y);
    else if (pick === 'tv') dir = new THREE.Vector3(o.tv.x - from.x, 0, o.tv.z - from.z).normalize();
    else dir = new THREE.Vector3(Math.cos(this.rng.range(0, 6.28)), 0, Math.sin(this.rng.range(0, 6.28)));
    const a = this.rng.range(-0.5, 0.5);
    dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, a);
    return from.clone().addScaledVector(dir, 400).setY(from.y + this.rng.range(-45, 30));
  }

  // Slow sideways drift keeping a point in view, as in the other worlds,
  // but only along clear roof (it stays at eye level); otherwise a gentle
  // rise on the spot.
  track(nav, pos, target, fov, speed) {
    const dir = target.clone().sub(pos).setY(0).normalize();
    let vel = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.rng.sign() * speed);
    const clear = (v) => {
      for (let k = 1; k <= 10; k++) if (!nav.isFree(pos.x + v.x * 2.2 * k, pos.z + v.z * 2.2 * k)) return false;
      return true;
    };
    if (!clear(vel)) {
      vel.negate();
      if (!clear(vel)) vel = new THREE.Vector3(0, 0.03, 0);
    }
    return () => new TrackMotion({ pos, vel, target, fov, duration: 60 });
  }

  // ------------------------------------------------------------ shot kinds

  // Walking across a roof.
  walk() {
    const g = this.group();
    if (!g) return null;
    const nav = this.o.navs[g.id];
    const a = nav.randomFree(this.rng);
    if (!a) return null;
    let b = null;
    for (let t = 0; t < 12 && !b; t++) {
      const c = nav.randomFree(this.rng);
      if (c && Math.hypot(c[0] - a[0], c[1] - a[1]) > 12 && nav.connected(a[0], a[1], c[0], c[1])) b = c;
    }
    if (!b) return null;
    const path = nav.findPath(a[0], a[1], b[0], b[1]);
    if (!path || path.length < 2) return null;
    const pts = path.map(([x, z]) => new THREE.Vector3(x, g.y + EYE, z));
    if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
    const fov = this.rng.range(66, 76);
    const motion = new PathMotion({ points: pts, speed: this.rng.range(1.0, 1.4), fov, lookAhead: 6 });
    const probe = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov };
    motion.update(0, probe);
    return { kind: 'walk', zone: `roof${g.id}`, pos: probe.pos.clone(), target: probe.target.clone(), fov, motion: () => motion, prefs: { minCenter: 4, maxNear: 0.2, maxClose: 0.45 } };
  }

  // Over a walkway or up a service stair onto the next roof.
  cross() {
    const paths = this.o.linkPaths.filter((p) => p.ga && p.gb);
    if (!paths.length) return null;
    const p = this.rng.pick(paths);
    const fwd = this.rng.chance(0.5);
    const pts = (fwd ? p.points : [...p.points].reverse()).map((v) => v.clone().setY(v.y + EYE));
    const fov = this.rng.range(66, 74);
    const motion = new PathMotion({ points: pts, speed: this.rng.range(0.9, 1.2), fov, lookAhead: 5 });
    const probe = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov };
    motion.update(0, probe);
    return { kind: 'cross', zone: `link${this.o.linkPaths.indexOf(p)}`, pos: probe.pos.clone(), target: probe.target.clone(), fov, motion: () => motion, prefs: { minCenter: 2, maxNear: 0.3, maxClose: 0.6 } };
  }

  // Standing a few steps back from a parapet, looking out over the city.
  vista() {
    const g = this.group();
    if (!g) return null;
    const nav = this.o.navs[g.id];
    const r = this.rng.pick(g.rects);
    const e = this.rng.pick(['N', 'S', 'W', 'E']);
    const t = this.rng.range(0.15, 0.85);
    const m = this.rng.range(2, 5);
    const x = e === 'W' ? r.x0 + m : e === 'E' ? r.x1 - m : r.x0 + (r.x1 - r.x0) * t;
    const z = e === 'N' ? r.z0 + m : e === 'S' ? r.z1 - m : r.z0 + (r.z1 - r.z0) * t;
    if (!nav.isFree(x, z)) return null;
    const pos = new THREE.Vector3(x, g.y + EYE, z);
    const out = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[e];
    const target = this.rng.chance(0.6) ? this.horizon(pos) : pos.clone().add(new THREE.Vector3(out[0] * 200, this.rng.range(-24, 8), out[1] * 200));
    const fov = this.rng.range(55, 70);
    return {
      kind: 'vista',
      zone: `vista${g.id}${e}`,
      pos,
      target,
      fov,
      duration: this.rng.range(14, 20),
      prefs: { minCenter: 20, farCap: 0.8 },
      motion: this.track(nav, pos, target, fov, this.rng.range(0.15, 0.3)),
    };
  }

  // Low shot on a roof toward a housing, billboard, garden or plant.
  detail() {
    const f = this.focus(['housing', 'billboard', 'garden', 'plant', 'solar', 'link', 'helipad']);
    if (!f) return null;
    const g = this.o.roofGroups.find((q) => q.rects.some((r) => f.x > r.x0 - 3 && f.x < r.x1 + 3 && f.z > r.z0 - 3 && f.z < r.z1 + 3) && Math.abs(q.y - f.y) < 8);
    if (!g) return null;
    const nav = this.o.navs[g.id];
    for (let i = 0; i < 8; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(6, 16);
      const x = f.x + Math.cos(a) * d;
      const z = f.z + Math.sin(a) * d;
      if (!nav.isFree(x, z)) continue;
      const pos = new THREE.Vector3(x, g.y + EYE, z);
      const target = new THREE.Vector3(f.x, f.y + this.rng.range(0, 2), f.z);
      const fov = this.rng.range(58, 72);
      return { kind: 'detail', zone: `detail${g.id}`, pos, target, fov, duration: this.rng.range(12, 18), prefs: { minCenter: 3, maxClose: 0.4 }, motion: this.track(nav, pos, target, fov, this.rng.range(0.12, 0.25)) };
    }
    return null;
  }

  // At the foot of a glass tower, looking up its face.
  lookup() {
    const f = this.focus(['tower']);
    if (!f) return null;
    const lot = this.o.plan.lots.find((l) => l.tower && Math.abs((l.x0 + l.x1) / 2 - f.x) < 1 && Math.abs((l.z0 + l.z1) / 2 - f.z) < 1);
    if (!lot) return null;
    for (let i = 0; i < 10; i++) {
      const g = this.group();
      if (!g) return null;
      const nav = this.o.navs[g.id];
      const p = nav.randomFree(this.rng);
      if (!p) continue;
      const d = Math.hypot(p[0] - (lot.x0 + lot.x1) / 2, p[1] - (lot.z0 + lot.z1) / 2);
      if (d > 45) continue;
      const pos = new THREE.Vector3(p[0], g.y + EYE, p[1]);
      const target = new THREE.Vector3(Math.max(lot.x0, Math.min(lot.x1, p[0])), 0, Math.max(lot.z0, Math.min(lot.z1, p[1])));
      // Up the face, but no steeper than a person would crane their neck.
      const flat = Math.max(1, Math.hypot(target.x - pos.x, target.z - pos.z));
      target.y = Math.min(lot.h * this.rng.range(0.7, 1.0), pos.y + flat * Math.tan(deg(this.rng.range(35, 50))));
      const fov = this.rng.range(72, 84);
      return { kind: 'lookup', zone: `lookup${lot.id}`, pos, target, fov, duration: this.rng.range(12, 16), prefs: { minCenter: 8, maxClose: 0.5 }, motion: this.track(nav, pos, target, fov, this.rng.range(0.12, 0.2)) };
    }
    return null;
  }

  random(kinds) {
    const w = (k, base) => base * (this.visited.has(k) ? 0.3 : 1);
    const gens = {
      walk: w('walk', 3),
      cross: w('cross', this.o.linkPaths.length ? 1.6 : 0),
      vista: w('vista', 2.4),
      detail: w('detail', 2.2),
      lookup: w('lookup', this.o.plan.lots.some((l) => l.tower) ? 0.8 : 0),
    };
    const kind = kinds ? this.rng.pick(kinds) : this.rng.weighted(Object.entries(gens));
    let best = null;
    let bestScore = -Infinity;
    let valid = 0;
    const tries = kind === 'walk' || kind === 'cross' ? 10 : 25;
    for (let i = 0; i < tries && valid < 4; i++) {
      const s = this[kind]();
      if (!s) continue;
      const sc = this.score(this.evaluate(s.pos, s.target, s.fov), s.prefs) - (this.visited.has(s.zone) ? 1.5 : 0);
      if (sc === -Infinity) continue;
      valid++;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    if (!best) {
      if (kind !== 'vista') return this.random(['vista']);
      return this.hero();
    }
    return this.commit(best);
  }

  commit(s) {
    this.shots++;
    this.visited.add(s.kind);
    this.visited.add(s.zone);
    return { ...s, motion: s.motion() };
  }

  hero() {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const s = this.vista();
      if (!s) continue;
      const ev = this.evaluate(s.pos, s.target, s.fov);
      const sc = this.score(ev, s.prefs) + ev.far;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    if (!best) {
      // Anywhere free on the biggest roof, looking out.
      const g = this.o.roofGroups.reduce((a, q) => (this.o.navs[q.id].free.length > this.o.navs[a.id].free.length ? q : a));
      const p = this.o.navs[g.id].randomFree(this.rng) || [(g.bounds.x0 + g.bounds.x1) / 2, (g.bounds.z0 + g.bounds.z1) / 2];
      const pos = new THREE.Vector3(p[0], g.y + EYE, p[1]);
      const target = this.horizon(pos);
      this.shots++;
      return { kind: 'hero', pos, target, fov: 62, motion: new PanMotion({ pos, yaw: yawOf(target.x - pos.x, target.z - pos.z), pitch: Math.atan2(target.y - pos.y, 400), amp: 0.15, period: 60, fov: 62, clearance: 0 }) };
    }
    return { ...this.commit(best), kind: 'hero' };
  }

  randomIso() {
    const B = this.o.plan.bounds;
    const target = new THREE.Vector3(this.rng.range(B.x0, B.x1) * 0.3, this.o.plan.base, this.rng.range(B.z0, B.z1) * 0.3);
    const az = Math.PI / 4 + this.rng.int(0, 3) * (Math.PI / 2);
    const frame = this.rng.range(80, 150);
    return {
      target,
      az,
      frame,
      motion: new IsoPanMotion({ target, az, frame, heading: this.rng.range(0, Math.PI * 2), speed: frame * 0.01, radius: Math.min(B.x1 - B.x0, B.z1 - B.z0) * 0.3 }),
    };
  }
}
