import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { FH, inPoly } from './plan.js';
import { PanMotion, TrackMotion, PathMotion, IsoPanMotion, yawOf } from '../camera/motions.js';

// Viewpoints in a mall: riding the escalators, leaning on a gallery railing
// over the void, walking the galleries, low shots in the court looking up
// at the balconies and skylight, views along the void from a bridge, and
// the plaza outside. Each shot prefers a place not shown yet.

const EYE = 1.65;
const deg = THREE.MathUtils.degToRad;

export class MallPlanner {
  constructor(mall, getAspect) {
    this.o = mall;
    this.getAspect = getAspect;
    this.rng = new RNG((Math.random() * 2 ** 31) >>> 0);
    this.shots = 0;
    this.maxShots = this.rng.int(8, 10);
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
        const t = this.o.raycast(pos.x, pos.y, pos.z, d.x, d.y, d.z, 150, true);
        n++;
        if (t < 1.0) near++;
        if (t < 2.0) close++;
        if (t > 30) far++;
        sumLog += Math.log(Math.min(t, 150) + 1);
      }
    }
    const center = this.o.raycast(pos.x, pos.y, pos.z, f.x, f.y, f.z, 150, true);
    return { near: near / n, close: close / n, far: far / n, mean: sumLog / n, center };
  }

  score(ev, prefs = {}) {
    if (ev.near > (prefs.maxNear ?? 0.15)) return -Infinity;
    if (ev.center < (prefs.minCenter ?? 5)) return -Infinity;
    if (ev.close > (prefs.maxClose ?? 0.35)) return -Infinity;
    return ev.mean + Math.min(ev.far, 0.3) + this.rng.range(0, 0.4);
  }

  focus(tags) {
    const list = this.o.focus.filter((f) => !tags || tags.includes(f.tag));
    if (!list.length) return null;
    return this.rng.weighted(list.map((f) => [f, f.weight]));
  }

  inVoid(x, z) {
    const V = this.o.plan.V;
    return x > V.x0 && x < V.x1 && z > V.z0 && z < V.z1;
  }

  // ------------------------------------------------------------ shot kinds

  court() {
    const nav = this.o.navs[0];
    const P = this.o.plan;
    const p = nav.randomIn(this.rng, { x0: P.G.x0, x1: P.G.x1, z0: P.G.z0, z1: P.G.z1 }, 1.5);
    if (!p) return null;
    const pos = new THREE.Vector3(p[0], this.rng.range(1.4, 2.2), p[1]);
    const f = this.focus(['escalator', 'court', 'tubes', 'lift', 'shop', 'billboard']);
    let target;
    if (f && this.rng.chance(0.6)) target = new THREE.Vector3(f.x, f.y + this.rng.range(0, 3), f.z);
    else target = new THREE.Vector3(this.rng.range(P.V.x0, P.V.x1), this.rng.range(5, this.o.HA * 0.8), this.rng.chance(0.5) ? P.G.z0 : P.G.z1);
    if (target.distanceTo(pos) < 6) return null;
    const fov = this.rng.range(70, 80);
    const dir = target.clone().sub(pos).setY(0).normalize();
    const vel = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.rng.sign() * this.rng.range(0.12, 0.22));
    const end = pos.clone().addScaledVector(vel, 20);
    if (!nav.isFree(end.x, end.z)) vel.set(0, 0.03, 0);
    return { kind: 'court', zone: 'court', pos, target, fov, duration: this.rng.range(16, 22), prefs: { minCenter: 6 }, motion: () => new TrackMotion({ pos, vel, target, fov, duration: 60 }) };
  }

  lookup() {
    const V = this.o.plan.V;
    for (let i = 0; i < 12; i++) {
      const x = this.rng.range(V.x0 + 2, V.x1 - 2);
      const z = this.rng.range(V.z0 + 2, V.z1 - 2);
      if (!this.o.navs[0].isFree(x, z)) continue;
      const pos = new THREE.Vector3(x, 1.5, z);
      const target = new THREE.Vector3(x + this.rng.range(-14, 14), this.o.HA * this.rng.range(0.7, 1.0), z + this.rng.range(-3, 3));
      const fov = this.rng.range(76, 86);
      const vel = new THREE.Vector3(0, 0.1, 0);
      return { kind: 'lookup', zone: 'lookup', pos, target, fov, duration: this.rng.range(16, 22), prefs: { minCenter: 8, maxClose: 0.25 }, motion: () => new TrackMotion({ pos, vel, target, fov, duration: 60 }) };
    }
    return null;
  }

  // Leaning over a gallery railing: across the void or down into the court.
  overlook() {
    const L = this.rng.int(1, this.o.levels - 1);
    const poly = this.o.plan.voids[L].pts;
    const nav = this.o.navs[L];
    for (let i = 0; i < 14; i++) {
      const k = this.rng.int(0, poly.length - 1);
      const p = poly[k];
      const q = poly[(k + 1) % poly.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 3) continue;
      const t = this.rng.range(0.2, 0.8);
      const ex = p[0] + (q[0] - p[0]) * t;
      const ez = p[1] + (q[1] - p[1]) * t;
      const nx = -(q[1] - p[1]) / len;
      const nz = (q[0] - p[0]) / len;
      const side = inPoly(poly, ex + nx * 0.3, ez + nz * 0.3) ? 1 : -1;
      const back = this.rng.range(0.8, 1.6);
      const x = ex - nx * side * back;
      const z = ez - nz * side * back;
      if (!nav.isFree(x, z)) continue;
      const pos = new THREE.Vector3(x, L * FH + EYE, z);
      const across = this.rng.range(8, 24);
      const tx = ex + nx * side * across + (q[0] - p[0]) / len * this.rng.range(-10, 10);
      const tz = ez + nz * side * across + (q[1] - p[1]) / len * this.rng.range(-10, 10);
      const f = this.rng.chance(0.4) ? this.focus(['escalator', 'tubes', 'court', 'lift']) : null;
      const target = f ? new THREE.Vector3(f.x, f.y, f.z) : new THREE.Vector3(tx, this.rng.range(0, (this.o.levels - 0.5) * FH), tz);
      const fov = this.rng.range(68, 80);
      const vel = new THREE.Vector3((q[0] - p[0]) / len, 0, (q[1] - p[1]) / len).multiplyScalar(this.rng.sign() * this.rng.range(0.15, 0.25));
      const end = pos.clone().addScaledVector(vel, 20);
      if (!nav.isFree(end.x, end.z)) vel.set(0, 0, 0);
      return { kind: 'overlook', zone: `overlook${L}`, pos, target, fov, duration: this.rng.range(16, 22), prefs: { minCenter: 6 }, motion: () => new TrackMotion({ pos, vel, target, fov, duration: 60 }) };
    }
    return null;
  }

  gallery() {
    const L = this.rng.int(this.o.levels > 2 ? 1 : 0, this.o.levels - 1);
    const nav = this.o.navs[L];
    const a = nav.randomFree(this.rng);
    const b = nav.randomFree(this.rng);
    if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) < 12) return null;
    let path = nav.findPath(a[0], a[1], b[0], b[1]);
    if (!path || path.length < 2) return null;
    let len = 0;
    for (let k = path.length - 1; k > 0; k--) {
      const s = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
      if (len + s > 30) {
        const t = (30 - len) / s;
        path = [[path[k][0] + (path[k - 1][0] - path[k][0]) * t, path[k][1] + (path[k - 1][1] - path[k][1]) * t], ...path.slice(k)];
        len = 30;
        break;
      }
      len += s;
    }
    if (len < 10) return null;
    const pts = path.map(([x, z]) => new THREE.Vector3(x, L * FH + EYE, z));
    if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
    const fov = this.rng.range(64, 74);
    const motion = new PathMotion({ points: pts, speed: this.rng.range(1.0, 1.3), fov });
    const probe = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov };
    motion.update(0, probe);
    return { kind: 'gallery', zone: `gallery${L}`, pos: probe.pos.clone(), target: probe.target.clone(), fov, motion: () => motion, prefs: { minCenter: 3, maxNear: 0.3, maxClose: 0.6 } };
  }

  escalator() {
    const flights = this.o.plan.flights;
    const fl = this.rng.pick(flights);
    const path = this.rng.pick(fl.paths);
    const pts = path.map((p) => p.clone());
    const fov = this.rng.range(66, 76);
    const motion = new PathMotion({ points: pts, speed: 0.6, fov, lookAhead: 3.2 });
    const probe = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov };
    motion.update(0, probe);
    return { kind: 'escalator', zone: `escalator${fl.t}`, pos: probe.pos.clone(), target: probe.target.clone(), fov, motion: () => motion, prefs: { minCenter: 2, maxNear: 0.45, maxClose: 0.8 } };
  }

  bridge() {
    const brs = this.o.plan.bridges;
    if (!brs.length) return null;
    const br = this.rng.pick(brs);
    const V = this.o.plan.V;
    const x = (br.x0 + br.x1) / 2;
    const z = this.rng.range(V.z0 + 1.2, V.z1 - 1.2);
    const pos = new THREE.Vector3(x, br.level * FH + EYE, z);
    const dir = this.rng.sign();
    const target = new THREE.Vector3(x + dir * 20, br.level * FH + this.rng.range(-4, 3), z + this.rng.range(-4, 4));
    const fov = this.rng.range(70, 80);
    const vel = new THREE.Vector3(0, 0, this.rng.sign() * 0.12);
    return { kind: 'bridge', zone: `bridge${br.level}`, pos, target, fov, duration: this.rng.range(15, 20), prefs: { minCenter: 6 }, motion: () => new TrackMotion({ pos, vel, target, fov, duration: 40 }) };
  }

  plaza() {
    const nav = this.o.navs[0];
    const P = this.o.plan;
    const VB = this.o.vestibule;
    const ent = this.o.focus.find((f) => f.tag === 'entrance');
    if (this.rng.chance(0.5)) {
      // Walk across the plaza toward the entrance.
      const a = nav.randomIn(this.rng, { x0: P.plaza.x0 + 4, x1: P.plaza.x1 - 4, z0: VB.z1 + 18, z1: P.plaza.z1 - 2 }, 0.5);
      const b = nav.randomIn(this.rng, { x0: VB.x0 - 4, x1: VB.x1 + 4, z0: VB.z1 + 3, z1: VB.z1 + 8 }, 0.5);
      if (!a || !b) return null;
      const path = nav.findPath(a[0], a[1], b[0], b[1]);
      if (!path || path.length < 2) return null;
      const pts = path.map(([x, z]) => new THREE.Vector3(x, EYE, z));
      if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
      const fov = this.rng.range(64, 72);
      const motion = new PathMotion({ points: pts, speed: this.rng.range(1.0, 1.2), fov, lookAhead: 6 });
      const probe = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov };
      motion.update(0, probe);
      return { kind: 'plaza', zone: 'plaza', pos: probe.pos.clone(), target: probe.target.clone(), fov, motion: () => motion, prefs: { minCenter: 4, maxNear: 0.3, maxClose: 0.5 } };
    }
    // Low angle looking up at the entrance.
    const p = nav.randomIn(this.rng, { x0: VB.x0 - 14, x1: VB.x1 + 14, z0: VB.z1 + 8, z1: VB.z1 + 24 }, 0.5);
    if (!p || !ent) return null;
    const pos = new THREE.Vector3(p[0], this.rng.range(0.9, 1.5), p[1]);
    const target = new THREE.Vector3(ent.x + this.rng.range(-4, 4), ent.y + this.rng.range(-1, 4), ent.z);
    const fov = this.rng.range(66, 76);
    const vel = new THREE.Vector3(this.rng.sign() * 0.2, 0, 0);
    return { kind: 'plaza', zone: 'plaza', pos, target, fov, duration: this.rng.range(15, 20), prefs: { minCenter: 6 }, motion: () => new TrackMotion({ pos, vel, target, fov, duration: 60 }) };
  }

  random(kinds) {
    const w = (k, base) => base * (this.visited.has(k) ? 0.25 : 1);
    const gens = {
      overlook: w('overlook', 3),
      gallery: w('gallery', 2.5),
      escalator: w('escalator', 2),
      court: w('court', 2.2),
      lookup: w('lookup', 0.9),
      bridge: w('bridge', 1),
      plaza: w('plaza', 1.4),
    };
    const kind = kinds ? this.rng.pick(kinds) : this.rng.weighted(Object.entries(gens));
    let best = null;
    let bestScore = -Infinity;
    let valid = 0;
    const tries = kind === 'gallery' || kind === 'plaza' ? 10 : 30;
    for (let i = 0; i < tries && valid < (kind === 'escalator' ? 1 : 4); i++) {
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
      if (kind !== 'court') return this.random(['court']);
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

  // Opening view: over the railing on the top gallery, or up from the court.
  hero() {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 20; i++) {
      const s = this.rng.chance(0.7) ? this.overlook() : this.court();
      if (!s) continue;
      const ev = this.evaluate(s.pos, s.target, s.fov);
      const sc = this.score(ev, s.prefs) + ev.far;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    if (!best) {
      const V = this.o.plan.V;
      const pos = new THREE.Vector3(V.x0 + 2, 2, (V.z0 + V.z1) / 2);
      const target = new THREE.Vector3(V.x1, 8, (V.z0 + V.z1) / 2);
      this.shots++;
      return { kind: 'hero', pos, target, fov: 76, motion: new PanMotion({ pos, yaw: yawOf(target.x - pos.x, target.z - pos.z), pitch: 0.2, amp: 0.15, period: 60, fov: 76, clearance: 0 }) };
    }
    return { ...this.commit(best), kind: 'hero' };
  }

  randomIso() {
    const B = this.o.building;
    const target = new THREE.Vector3(this.rng.range(B.x0, B.x1) * 0.25, 0, this.rng.range(B.z0, B.z1) * 0.25 + 4);
    const az = Math.PI / 4 + this.rng.int(0, 3) * (Math.PI / 2);
    const frame = this.rng.range(50, 90);
    return {
      target,
      az,
      frame,
      motion: new IsoPanMotion({ target, az, frame, heading: this.rng.range(0, Math.PI * 2), speed: frame * 0.01, radius: Math.min(B.x1 - B.x0, B.z1 - B.z0) * 0.25 }),
    };
  }
}
