import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { FH } from './plan.js';
import { PanMotion, TrackMotion, DollyMotion, PathMotion, IsoPanMotion, dirFromYawPitch, yawOf } from '../camera/motions.js';

// Viewpoints on an office floor. The planner tours the floor: each shot
// goes somewhere it hasn't been yet (walks between rooms, corner views of a
// room, glimpses through glass partitions, corridor dollies, views from the
// mezzanine and a crane up the atrium). Candidates are scored by ray casts
// against the colliders.

const EYE = 1.65;
const deg = THREE.MathUtils.degToRad;

const INTEREST = { atrium: 3, lounge: 2.2, open: 2.2, meeting: 2, office: 1.8, break: 1.8, corridor: 1.0, print: 0.3 };

export class OfficePlanner {
  constructor(office, getAspect) {
    this.o = office;
    this.getAspect = getAspect;
    this.rng = new RNG((Math.random() * 2 ** 31) >>> 0);
    this.shots = 0;
    this.maxShots = this.rng.int(8, 11);
    this.visited = new Set();
    this.here = office.atrium;
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.focusBy = new Map();
    for (const f of office.decor.focus) {
      if (!this.focusBy.has(f.room)) this.focusBy.set(f.room, []);
      this.focusBy.get(f.room).push(f);
    }
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
        const t = this.o.raycast(pos.x, pos.y, pos.z, d.x, d.y, d.z, 120, true);
        n++;
        if (t < 1.0) near++;
        if (t < 2.0) close++;
        if (t > 30) far++;
        sumLog += Math.log(Math.min(t, 120) + 1);
      }
    }
    const center = this.o.raycast(pos.x, pos.y, pos.z, f.x, f.y, f.z, 120, true);
    return { near: near / n, close: close / n, far: far / n, mean: sumLog / n, center };
  }

  score(ev, prefs = {}) {
    if (ev.near > (prefs.maxNear ?? 0.2)) return -Infinity;
    if (ev.center < (prefs.minCenter ?? 4)) return -Infinity;
    if (ev.close > (prefs.maxClose ?? 0.4)) return -Infinity;
    return ev.mean + Math.min(ev.far, 0.3) * 1.2 + this.rng.range(0, 0.4);
  }

  // A room to show next: interesting kinds first, strongly preferring unseen ones.
  pickRoom(filter) {
    const rooms = this.o.rooms.filter((r) => r.level === 0 && r.access && INTEREST[r.type] && (!filter || filter(r)));
    if (!rooms.length) return null;
    return this.rng.weighted(rooms.map((r) => [r, INTEREST[r.type] * (this.visited.has(r) ? 0.06 : 1) * Math.min(2, Math.sqrt((r.w * r.d) / 25))]));
  }

  focusIn(room) {
    const list = this.focusBy.get(room);
    if (!list?.length) return null;
    return this.rng.weighted(list.map((f) => [f, f.weight]));
  }

  // ------------------------------------------------------------ shot kinds

  // Walk from around the current spot to an unseen room.
  walk() {
    const upstairs = this.rng.chance(0.15) && this.o.navMezz.free.length > 50;
    const nav = upstairs ? this.o.navMezz : this.o.navGround;
    const y = (upstairs ? FH : 0) + EYE;
    const target = upstairs ? null : this.pickRoom((r) => r !== this.here);
    const b = target ? nav.randomIn(this.rng, target, 0.8) : nav.randomFree(this.rng);
    let a = null;
    if (!upstairs && this.here && this.here.level === 0) a = nav.randomIn(this.rng, this.here, 0.8);
    if (!a || !b || !nav.connected(a[0], a[1], b[0], b[1]) || Math.hypot(a[0] - b[0], a[1] - b[1]) < 8) a = nav.randomFree(this.rng);
    if (!a || !b) return null;
    let path = nav.findPath(a[0], a[1], b[0], b[1]);
    if (!path || path.length < 2) return null;
    // Keep the last ~28 m so a walk doesn't drag on.
    let len = 0;
    for (let k = path.length - 1; k > 0; k--) {
      const s = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
      if (len + s > 28) {
        const t = (28 - len) / s;
        const cut = [path[k][0] + (path[k - 1][0] - path[k][0]) * t, path[k][1] + (path[k - 1][1] - path[k][1]) * t];
        path = [cut, ...path.slice(k)];
        len = 28;
        break;
      }
      len += s;
    }
    if (len < (upstairs ? 7 : 10)) return null;
    const pts = path.map(([x, z]) => new THREE.Vector3(x, y, z));
    if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
    const fov = this.rng.range(62, 72);
    const motion = new PathMotion({ points: pts, speed: this.rng.range(0.95, 1.2), fov });
    const probe = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov };
    motion.update(0, probe);
    return { kind: 'walk', room: target, pos: probe.pos.clone(), target: probe.target.clone(), fov, motion: () => motion, prefs: { minCenter: 2.2, maxNear: 0.35, maxClose: 0.7 } };
  }

  // Corner of a room looking across it (at a focal point when there is one).
  vista(room = this.pickRoom((r) => r.type !== 'corridor')) {
    if (!room) return null;
    const tall = room.type === 'atrium';
    const inset = this.rng.range(0.8, 1.4);
    const sx = this.rng.sign();
    const sz = this.rng.sign();
    const x = sx < 0 ? room.x0 + inset : room.x1 - inset;
    const z = sz < 0 ? room.z0 + inset : room.z1 - inset;
    if (!this.o.navGround.isFree(x, z)) return null;
    const pos = new THREE.Vector3(x, tall ? this.rng.range(1.6, 3.2) : this.rng.range(1.45, 1.9), z);
    const f = this.focusIn(room);
    let target;
    if (f && this.rng.chance(0.75)) target = new THREE.Vector3(f.x, f.y - this.rng.range(0, 0.3), f.z);
    else target = new THREE.Vector3(sx < 0 ? room.x1 - this.rng.range(1, 3) : room.x0 + this.rng.range(1, 3), tall ? this.rng.range(1.5, 3) : this.rng.range(1.0, 1.5), sz < 0 ? room.z1 - this.rng.range(1, 3) : room.z0 + this.rng.range(1, 3));
    if (target.distanceTo(pos) < 3) return null;
    const fov = tall ? this.rng.range(70, 80) : this.rng.range(68, 78);
    const dir = target.clone().sub(pos).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.rng.sign() * this.rng.range(0.1, 0.2));
    const end = pos.clone().addScaledVector(side, 20);
    const vel = this.o.navGround.isFree(end.x, end.z) ? side : new THREE.Vector3(0, 0.03, 0);
    return {
      kind: 'vista',
      room,
      pos,
      target,
      fov,
      duration: this.rng.range(16, 24),
      prefs: { minCenter: 2.5, maxNear: 0.12, maxClose: 0.28 },
      motion: () => new TrackMotion({ pos, vel, target, fov, duration: 60 }),
    };
  }

  // Standing in a corridor, looking into a glass-walled room.
  peek() {
    const rooms = this.o.rooms.filter((r) => r.level === 0 && r.access && ['meeting', 'office', 'lounge', 'open', 'break'].includes(r.type) && !this.visited.has(r));
    const cands = [];
    for (const r of rooms) {
      for (const e of ['N', 'S', 'W', 'E']) for (const sp of r.spans[e]) if (sp.kind === 'glass' && sp.a1 - sp.a0 > 3) cands.push({ r, e, sp });
    }
    if (!cands.length) return null;
    const { r, e, sp } = this.rng.pick(cands);
    const horiz = e === 'N' || e === 'S';
    const c = e === 'N' ? r.z0 : e === 'S' ? r.z1 : e === 'W' ? r.x0 : r.x1;
    const out = e === 'N' || e === 'W' ? -1 : 1; // away from the room
    const a = this.rng.range(sp.a0 + 1, sp.a1 - 1);
    const back = this.rng.range(1.4, 2.4);
    const x = horiz ? a : c + out * back;
    const z = horiz ? c + out * back : a;
    if (!this.o.navGround.isFree(x, z)) return null;
    const pos = new THREE.Vector3(x, this.rng.range(1.5, 1.75), z);
    const f = this.focusIn(r);
    const target = f ? new THREE.Vector3(f.x, f.y - 0.2, f.z) : new THREE.Vector3((r.x0 + r.x1) / 2, 1.1, (r.z0 + r.z1) / 2);
    const fov = this.rng.range(64, 74);
    const vel = horiz ? new THREE.Vector3(this.rng.sign() * 0.15, 0, 0) : new THREE.Vector3(0, 0, this.rng.sign() * 0.15);
    const end = pos.clone().addScaledVector(vel, 20);
    if (!this.o.navGround.isFree(end.x, end.z)) vel.set(0, 0.02, 0);
    return { kind: 'peek', room: r, pos, target, fov, duration: this.rng.range(14, 20), prefs: { minCenter: 2.0, maxNear: 0.25, maxClose: 0.45 }, motion: () => new TrackMotion({ pos, vel, target, fov, duration: 60 }) };
  }

  mezzanine() {
    const nav = this.o.navMezz;
    const A = this.o.atrium;
    for (let i = 0; i < 10; i++) {
      const m = this.rng.pick(this.o.mezz);
      const alongX = m.open === 'N' || m.open === 'S';
      const edge = m.open === 'N' ? m.z0 : m.open === 'S' ? m.z1 : m.open === 'W' ? m.x0 : m.x1;
      const inward = m.open === 'N' || m.open === 'W' ? 1 : -1;
      const off = this.rng.range(0.9, 1.4);
      const a = alongX ? this.rng.range(m.x0 + 2, m.x1 - 2) : this.rng.range(m.z0 + 2, m.z1 - 2);
      const x = alongX ? a : edge + inward * off;
      const z = alongX ? edge + inward * off : a;
      if (!nav.isFree(x, z)) continue;
      const pos = new THREE.Vector3(x, FH + EYE, z);
      const f = this.focusIn(A);
      const target = f && this.rng.chance(0.6) ? new THREE.Vector3(f.x, f.y, f.z) : new THREE.Vector3(this.rng.range(A.x0 + 3, A.x1 - 3), this.rng.range(0.5, 2.5), this.rng.range(A.z0 + 3, A.z1 - 3));
      const fov = this.rng.range(66, 76);
      const vel = alongX ? new THREE.Vector3(this.rng.sign() * 0.2, 0, 0) : new THREE.Vector3(0, 0, this.rng.sign() * 0.2);
      const end = pos.clone().addScaledVector(vel, 20);
      if (!nav.isFree(end.x, end.z)) vel.set(0, 0, 0);
      return { kind: 'mezzanine', room: A, pos, target, fov, duration: this.rng.range(18, 24), motion: () => new TrackMotion({ pos, vel, target, fov, duration: 60 }) };
    }
    return null;
  }

  crane() {
    const A = this.o.atrium;
    const inMezz = (x, z) => this.o.mezz.some((m) => x > m.x0 - 1 && x < m.x1 + 1 && z > m.z0 - 1 && z < m.z1 + 1);
    for (let i = 0; i < 12; i++) {
      const x = this.rng.range(A.x0 + 3, A.x1 - 3);
      const z = this.rng.range(A.z0 + 3, A.z1 - 3);
      if (inMezz(x, z) || !this.o.navGround.isFree(x, z)) continue;
      const pos = new THREE.Vector3(x, 1.6, z);
      const rise = Math.min(this.o.HA - 3, 6);
      const m = this.o.mezz[0];
      const target = new THREE.Vector3((m.x0 + m.x1) / 2 + this.rng.range(-4, 4), this.rng.range(3, 5), (m.z0 + m.z1) / 2);
      const fov = this.rng.range(68, 78);
      const duration = 70;
      const vel = new THREE.Vector3(0, (rise * Math.PI) / duration, 0);
      return { kind: 'crane', room: A, pos, target, fov, duration: this.rng.range(20, 26), prefs: { minCenter: 4 }, motion: () => new TrackMotion({ pos, vel, target, fov, duration }) };
    }
    return null;
  }

  corridor() {
    const cs = this.o.rooms.filter((r) => r.type === 'corridor' && Math.max(r.w, r.d) > 10);
    if (!cs.length) return null;
    const r = this.rng.weighted(cs.map((c) => [c, this.visited.has(c) ? 0.1 : 1]));
    const alongX = r.w > r.d;
    const fwd = this.rng.sign();
    const mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    const start = fwd > 0 ? (alongX ? r.x0 : r.z0) + 1.0 : (alongX ? r.x1 : r.z1) - 1.0;
    for (const off of [0, -0.6, 0.6, -1.1, 1.1]) {
      const x = alongX ? start : mid + off;
      const z = alongX ? mid + off : start;
      if (!this.o.navGround.isFree(x, z)) continue;
      const pos = new THREE.Vector3(x, EYE, z);
      const yaw = alongX ? yawOf(fwd, 0) : yawOf(0, fwd);
      const pitch = deg(this.rng.range(-4, 1));
      const fov = this.rng.range(62, 72);
      const target = pos.clone().addScaledVector(dirFromYawPitch(yaw, pitch), 20);
      const hf = { raycast: (...q) => this.o.raycast(...q) };
      return {
        kind: 'corridor',
        room: r,
        pos,
        target,
        fov,
        duration: this.rng.range(18, 26),
        motion: () => new DollyMotion({ pos, yaw, pitch, speed: this.rng.range(0.6, 0.9), fov, hf, clearance: 0, stopDist: 3.5, probe: 6 }),
      };
    }
    return null;
  }

  random(kinds) {
    const gens = {
      walk: 4,
      vista: 3.5,
      peek: 1.5,
      mezzanine: this.o.navMezz.free.length ? 1.2 : 0,
      crane: this.visited.has(this.o.atrium) ? 0.4 : 1,
      corridor: 1.3,
    };
    const kind = kinds ? this.rng.pick(kinds) : this.rng.weighted(Object.entries(gens));
    let best = null;
    let bestScore = -Infinity;
    let valid = 0;
    const tries = kind === 'walk' ? 8 : 30;
    for (let i = 0; i < tries && valid < (kind === 'walk' ? 2 : 5); i++) {
      const s = this[kind]();
      if (!s) continue;
      const sc = this.score(this.evaluate(s.pos, s.target, s.fov), s.prefs);
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
    if (s.room) {
      this.visited.add(s.room);
      this.here = s.room;
    }
    return { ...s, motion: s.motion() };
  }

  // Wide lobby view across the atrium.
  hero() {
    const A = this.o.atrium;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 30; i++) {
      const s = this.vista(A);
      if (!s) continue;
      const ev = this.evaluate(s.pos, s.target, s.fov);
      const sc = this.score(ev) + ev.far * 2;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    if (!best) {
      const pos = new THREE.Vector3(A.x0 + 1.5, 2, A.z1 - 1.5);
      const target = new THREE.Vector3(A.x1 - 3, 2, A.z0 + 3);
      this.shots++;
      return { kind: 'hero', pos, target, fov: 74, motion: new PanMotion({ pos, yaw: yawOf(target.x - pos.x, target.z - pos.z), pitch: 0, amp: 0.15, period: 60, fov: 74, clearance: 0 }) };
    }
    return { ...this.commit(best), kind: 'hero' };
  }

  randomIso() {
    const fp = this.o.footprint;
    const target = new THREE.Vector3(this.rng.range(fp.x0, fp.x1) * 0.3, 0, this.rng.range(fp.z0, fp.z1) * 0.3);
    const az = Math.PI / 4 + this.rng.int(0, 3) * (Math.PI / 2);
    const frame = this.rng.range(40, 78);
    return {
      target,
      az,
      frame,
      motion: new IsoPanMotion({ target, az, frame, heading: this.rng.range(0, Math.PI * 2), speed: frame * 0.01, radius: Math.min(fp.x1 - fp.x0, fp.z1 - fp.z0) * 0.25 }),
    };
  }
}
