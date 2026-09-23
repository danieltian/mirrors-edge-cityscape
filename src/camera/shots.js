import * as THREE from 'three';
import { WORLD } from '../config.js';
import { nearestDistrict } from '../city/layout.js';
import { OrbitMotion, PanMotion, DollyMotion, TrackMotion, RiverMotion, IsoPanMotion, dirFromYawPitch, yawOf } from './motions.js';

// Finds visually interesting viewpoints. Each shot type proposes candidates;
// every candidate is scored by marching a grid of rays through the heightfield
// (rejecting walls in the face, rewarding depth, water, sky and landmarks).

const deg = THREE.MathUtils.degToRad;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weighted = (entries) => {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = Math.random() * total;
  for (const e of entries) if ((r -= e[1]) <= 0) return e[0];
  return entries[entries.length - 1][0];
};

export const ISO_EL = Math.atan(1 / Math.SQRT2);

export class ShotPlanner {
  constructor(city, getAspect, getSunDir) {
    this.getSunDir = getSunDir || (() => new THREE.Vector3(0, 1, 0));
    this.city = city;
    this.hf = city.heightfield;
    this.terrain = city.terrain;
    this.getAspect = getAspect;
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._hit = {};

    // River stretches where both banks are land (so we cruise through the city).
    const river = city.terrain.river;
    const ok = river.map((p) => {
      const nx = p.tz;
      const nz = -p.tx;
      const off = p.hw + 80;
      return this.terrain.sample(p.x + nx * off, p.z + nz * off) > 0 && this.terrain.sample(p.x - nx * off, p.z - nz * off) > 0;
    });
    this.riverRuns = [];
    let start = -1;
    for (let i = 0; i <= ok.length; i++) {
      if (i < ok.length && ok[i]) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i - start > 60) this.riverRuns.push([start, i - 1]);
        start = -1;
      }
    }
  }

  // ------------------------------------------------------------ evaluation

  evaluate(pos, target, fovDeg) {
    const hf = this.hf;
    const f = this._f.subVectors(target, pos).normalize();
    const r = this._r.crossVectors(f, THREE.Object3D.DEFAULT_UP).normalize();
    const u = this._u.crossVectors(r, f);
    const tanV = Math.tan(deg(fovDeg) / 2);
    const tanH = tanV * this.getAspect();
    const d = this._d;
    const hit = this._hit;
    let n = 0, near = 0, sky = 0, water = 0, city = 0, sumLog = 0, sumLog2 = 0, solid = 0;
    const NX = 9;
    const NY = 5;
    const rowWater = new Array(NY).fill(0); // row 0 = bottom of the frame
    let lowHeight = 0; // mean building height hit by the lower two rows
    let lowCount = 0;
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        const sx = -0.92 + (1.84 * ix) / (NX - 1);
        const sy = -0.88 + (1.76 * iy) / (NY - 1);
        d.copy(f).addScaledVector(r, sx * tanH).addScaledVector(u, sy * tanV).normalize();
        const t = hf.raycast(pos.x, pos.y, pos.z, d.x, d.y, d.z, 7000, hit);
        n++;
        if (t < 60) near++;
        if (t === Infinity) sky++;
        else {
          if (hit.water) {
            water++;
            rowWater[iy] += 1 / NX;
          } else {
            city++;
            if (iy < 2) {
              lowHeight += hf.maxAround(hit.x, hit.z, 10);
              lowCount++;
            }
          }
          const l = Math.log(t + 1);
          sumLog += l;
          sumLog2 += l * l;
          solid++;
        }
      }
    }
    const center = hf.raycast(pos.x, pos.y, pos.z, f.x, f.y, f.z, 7000, hit);
    const mean = solid ? sumLog / solid : 8;
    const spread = solid ? Math.sqrt(Math.max(0, sumLog2 / solid - mean * mean)) : 0;

    // Is a landmark in frame and unobstructed?
    let landmark = 0;
    for (const lm of this.city.landmarks) {
      const lp = new THREE.Vector3(lm.x, lm.top * 0.65, lm.z);
      const to = lp.clone().sub(pos);
      const dist = to.length();
      to.divideScalar(dist);
      const fx = to.dot(f);
      if (fx <= 0.2) continue;
      const px = to.dot(r) / fx / tanH;
      const py = to.dot(u) / fx / tanV;
      if (Math.abs(px) > 0.85 || Math.abs(py) > 0.85) continue;
      const t = hf.raycast(pos.x, pos.y, pos.z, to.x, to.y, to.z, dist, hit);
      if (t >= dist - lm.radius - 20) landmark = Math.max(landmark, 1 - Math.abs(px) * 0.5);
    }
    // Front/side light reads as the title screen; looking into the sun doesn't.
    const sun = this.getSunDir();
    const fl = Math.hypot(f.x, f.z) || 1;
    const sl = Math.hypot(sun.x, sun.z) || 1;
    const backlit = (f.x * sun.x + f.z * sun.z) / (fl * sl);
    return { near: near / n, sky: sky / n, water: water / n, city: city / n, rowWater, lowHeight: lowCount ? lowHeight / lowCount : 0, mean, spread, center, landmark, backlit };
  }

  score(ev, prefs = {}) {
    if (ev.near > (prefs.maxNear ?? 0.1)) return -Infinity;
    if (ev.center < (prefs.minCenter ?? 180)) return -Infinity;
    // There has to be city in the frame, not just sea and sky.
    if (ev.city < (prefs.minCity ?? 0.3)) return -Infinity;
    let s = ev.mean + ev.city * 2;
    s += ev.water * (prefs.water ?? 1.6);
    s -= Math.abs(ev.sky - (prefs.sky ?? 0.2)) * 3;
    s += ev.spread * 0.8;
    s += ev.landmark * (prefs.landmark ?? 1.2);
    if (ev.water > 0.7) s -= 3; // mostly water is dull
    // Side light (sun roughly perpendicular, slightly ahead) gives white tops
    // and blue walls; straight front light flattens, straight back light darkens.
    s -= Math.max(0, Math.abs(ev.backlit - 0.25) - 0.35) * (prefs.backlit ?? 5);
    return s;
  }

  clearance(pos, r = 12) {
    return pos.y - this.hf.maxAround(pos.x, pos.z, r);
  }

  // A point worth looking at.
  interestingPoint() {
    const c = this.city;
    const kind = weighted([
      ['downtown', 4],
      ['landmark', c.landmarks.length ? 2 : 0],
      ['river', 2],
      ['land', 2],
    ]);
    if (kind === 'downtown' && c.downtowns.length) {
      const d = pick(c.downtowns);
      return new THREE.Vector3(d.x + rand(-250, 250), 40, d.z + rand(-250, 250));
    }
    if (kind === 'landmark') {
      const l = pick(c.landmarks);
      return new THREE.Vector3(l.x, l.top * 0.35, l.z);
    }
    if (kind === 'river') {
      const p = pick(c.terrain.river.slice(80, -80));
      return new THREE.Vector3(p.x, 0, p.z);
    }
    for (let i = 0; i < 50; i++) {
      const x = rand(-WORLD.half * 0.7, WORLD.half * 0.7);
      const z = rand(-WORLD.half * 0.7, WORLD.half * 0.7);
      if (this.terrain.sample(x, z) > 50) return new THREE.Vector3(x, 20, z);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  // ------------------------------------------------------------ shot types

  aerial() {
    const target = this.interestingPoint();
    const yaw = rand(0, Math.PI * 2);
    const pitch = deg(rand(20, 38));
    const dist = rand(900, 2600);
    const f = dirFromYawPitch(yaw, -pitch);
    const pos = target.clone().addScaledVector(f, -dist);
    if (this.clearance(pos, 80) < 60) return null;
    const fov = rand(42, 55);
    const radius = Math.hypot(pos.x - target.x, pos.z - target.z);
    return {
      kind: 'aerial',
      pos,
      target,
      fov,
      prefs: { sky: 0.08, maxNear: 0.02 },
      motion: () =>
        new OrbitMotion({
          center: target,
          radius,
          height: pos.y,
          angle: yaw + Math.PI,
          speed: (Math.random() < 0.5 ? -1 : 1) * rand(9, 16) / radius,
          arc: rand(0.5, 0.9),
          fov,
        }),
    };
  }

  rooftop() {
    const lots = this.city.tallLots;
    if (!lots.length) return null;
    const lot = lots[Math.floor(Math.random() ** 2 * Math.min(lots.length, 400))];
    const c = Math.cos(lot.angle);
    const s = Math.sin(lot.angle);
    const U = [c, -s];
    const V = [s, c];
    const k = Math.floor(Math.random() * 4);
    const n = k === 0 ? U : k === 1 ? [-U[0], -U[1]] : k === 2 ? V : [-V[0], -V[1]];
    const t = [-n[1], n[0]];
    const e = (k < 2 ? lot.w : lot.d) / 2;
    const other = (k < 2 ? lot.d : lot.w) / 2;
    const onRoof = Math.random() < 0.5;
    const out = onRoof ? e - rand(2, 5) : e + rand(3, 9);
    const along = rand(-0.5, 0.5) * other;
    const pos = new THREE.Vector3(lot.x + n[0] * out + t[0] * along, lot.top + (onRoof ? rand(1.8, 4) : rand(4, 18)), lot.z + n[1] * out + t[1] * along);
    if (!onRoof && this.clearance(pos, 6) < 3) return null;
    if (onRoof && this.clearance(pos, 3) < 1.2) return null;
    let yaw = yawOf(n[0], n[1]) + rand(-0.9, 0.9);
    // Sometimes frame a landmark instead.
    if (this.city.landmarks.length && Math.random() < 0.35) {
      const lm = pick(this.city.landmarks);
      const dx = lm.x - pos.x;
      const dz = lm.z - pos.z;
      if (Math.hypot(dx, dz) > 250) yaw = yawOf(dx, dz) + rand(-0.25, 0.25);
    }
    const pitch = deg(onRoof ? rand(-4, 4) : rand(-14, 2));
    const fov = rand(55, 68);
    const target = pos.clone().addScaledVector(dirFromYawPitch(yaw, pitch), 250);
    return {
      kind: 'rooftop',
      pos,
      target,
      fov,
      prefs: { sky: 0.3, maxNear: onRoof ? 0.3 : 0.12, minCenter: 250 },
      motion: () => new PanMotion({ pos, yaw, pitch, amp: rand(0.12, 0.24), period: rand(55, 90), fov, phase: Math.random() }),
    };
  }

  river() {
    if (!this.riverRuns.length) return null;
    const run = pick(this.riverRuns);
    const river = this.city.terrain.river;
    const s = rand(run[0] + 20, run[1] - 20);
    const i = Math.floor(s);
    const p = river[i];
    const dir = run[1] - s > s - run[0] ? 1 : -1;
    const altitude = rand(16, 70);
    const lateral = rand(-0.35, 0.35) * p.hw;
    const fov = rand(50, 60);
    const motion = new RiverMotion({ river, s, dir, altitude, lateral, speed: rand(9, 16), fov, range: run });
    const probe = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov };
    motion.update(0.0001, probe);
    return {
      kind: 'river',
      pos: probe.pos.clone(),
      target: probe.target.clone(),
      fov,
      prefs: { water: 1.5, sky: 0.25, minCenter: 250, minCity: 0.3 },
      motion: () => motion,
    };
  }

  avenue() {
    const city = this.city;
    if (!city.avenues.length || !city.lots.length) return null;
    // Start from a real lot and snap to the nearest avenue of its district.
    const lot = pick(city.lots);
    const D = city.districts[lot.district];
    const lu = (lot.x - D.x) * D.U.x + (lot.z - D.z) * D.U.y;
    const lv = (lot.x - D.x) * D.V.x + (lot.z - D.z) * D.V.y;
    let av = null;
    let bd = 450;
    for (const a of city.avenues) {
      if (a.district !== lot.district) continue;
      const dd = Math.abs((a.axis === 'u' ? lu : lv) - a.pos);
      if (dd < bd) {
        bd = dd;
        av = a;
      }
    }
    if (!av) return null;
    const u = av.axis === 'u' ? av.pos : lu;
    const v = av.axis === 'u' ? lv : av.pos;
    const x = D.x + D.U.x * u + D.V.x * v;
    const z = D.z + D.U.y * u + D.V.y * v;
    if (this.terrain.sample(x, z) < 30) return null;
    if (nearestDistrict(city.districts, x, z) !== av.district) return null;
    const along = av.axis === 'u' ? D.V : D.U;
    const sgn = Math.random() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 6; k++) {
      if (this.terrain.sample(x + along.x * sgn * k * 100, z + along.y * sgn * k * 100) < 0) return null;
    }
    const yaw = yawOf(along.x * sgn, along.y * sgn);
    const altitude = rand(22, 85);
    const pos = new THREE.Vector3(x, altitude, z);
    if (this.clearance(pos, 6) < 8) return null;
    const pitch = deg(rand(-7, 1));
    const fov = rand(55, 65);
    const target = pos.clone().addScaledVector(dirFromYawPitch(yaw, pitch), 250);
    // Reward proper canyons: buildings on both sides taller than the camera.
    const px = -along.y;
    const pz = along.x;
    const side = av.width / 2 + 14;
    const walls =
      (this.hf.maxAround(x + px * side, z + pz * side, 8) > altitude + 10 ? 0.5 : 0) +
      (this.hf.maxAround(x - px * side, z - pz * side, 8) > altitude + 10 ? 0.5 : 0);
    return {
      kind: 'avenue',
      pos,
      target,
      fov,
      bonus: walls * 1.5,
      prefs: { sky: 0.25, minCenter: 450, maxNear: 0.45, minCity: 0.45 },
      motion: () => new DollyMotion({ pos, yaw, pitch, speed: rand(6, 12), fov, hf: this.hf }),
    };
  }

  landmark() {
    const lms = this.city.landmarks;
    if (!lms.length) return null;
    const lm = pick(lms);
    const bearing = rand(0, Math.PI * 2);
    const dist = rand(380, 1100);
    const pos = new THREE.Vector3(lm.x + Math.sin(bearing) * dist, lm.top * rand(0.3, 0.85), lm.z + Math.cos(bearing) * dist);
    if (this.clearance(pos, 25) < 20) return null;
    const target = new THREE.Vector3(lm.x, lm.top * rand(0.45, 0.7), lm.z);
    const fov = rand(45, 60);
    // Can the orbit keep going for a while without hitting anything?
    const speed = (Math.random() < 0.5 ? -1 : 1) * rand(8, 14) / dist;
    let clear = true;
    for (let k = 1; k <= 12; k++) {
      const a = bearing + Math.PI + speed * k * 6;
      const x = lm.x - Math.sin(a) * dist;
      const z = lm.z - Math.cos(a) * dist;
      if (this.hf.maxAround(x, z, 25) + 15 > pos.y) clear = false;
    }
    const motion = clear
      ? () => new OrbitMotion({ center: new THREE.Vector3(lm.x, 0, lm.z), radius: dist, height: pos.y, angle: bearing, speed, targetY: target.y, fov, arc: rand(0.6, 1.1) })
      : () => new TrackMotion({ pos, vel: new THREE.Vector3(Math.cos(bearing), 0, -Math.sin(bearing)).multiplyScalar(rand(4, 7) * (Math.random() < 0.5 ? -1 : 1)), target, fov });
    return { kind: 'landmark', pos, target, fov, prefs: { sky: 0.35, landmark: 3, minCenter: dist - lm.radius - 30 }, motion };
  }

  harbour() {
    for (let i = 0; i < 40; i++) {
      const x = rand(-WORLD.half, WORLD.half);
      const z = rand(-WORLD.half, WORLD.half);
      const f = this.terrain.sample(x, z);
      if (f > -40 || f < -450) continue;
      const pos = new THREE.Vector3(x, rand(6, 28), z);
      const dt = this.city.downtowns.length ? pick(this.city.downtowns) : { x: 0, z: 0 };
      const target = new THREE.Vector3(dt.x + rand(-200, 200), rand(40, 140), dt.z + rand(-200, 200));
      if (target.distanceTo(pos) < 500) continue;
      const fov = rand(45, 55);
      const lookYaw = yawOf(target.x - x, target.z - z);
      const vel = new THREE.Vector3(Math.cos(lookYaw), 0, -Math.sin(lookYaw)).multiplyScalar(rand(4, 7) * (Math.random() < 0.5 ? -1 : 1));
      return {
        kind: 'harbour',
        pos,
        target,
        fov,
        prefs: { water: 1.0, sky: 0.35, minCenter: 400, minCity: 0.2 },
        motion: () => new TrackMotion({ pos, vel, target, fov }),
      };
    }
    return null;
  }

  // ------------------------------------------------------------ public

  random(kinds) {
    const gens = {
      aerial: 3,
      rooftop: 3,
      river: this.riverRuns.length ? 2 : 0,
      avenue: 2,
      landmark: this.city.landmarks.length ? 2 : 0,
      harbour: 1.5,
    };
    let best = null;
    let bestScore = -Infinity;
    const kind = kinds ? pick(kinds) : weighted(Object.entries(gens));
    let valid = 0;
    for (let attempt = 0; attempt < 60 && valid < 6; attempt++) {
      const shot = this[kind]();
      if (!shot) continue;
      const ev = this.evaluate(shot.pos, shot.target, shot.fov);
      const sc = this.score(ev, shot.prefs) + (shot.bonus || 0) + Math.random() * 0.6;
      if (sc === -Infinity) continue;
      valid++;
      if (sc > bestScore) {
        bestScore = sc;
        best = shot;
      }
    }
    if (!best && kind !== 'aerial') return this.random(['aerial']);
    if (!best) return this.hero();
    return { ...best, motion: best.motion() };
  }

  // The title-screen composition: high over the city, water in the middle,
  // downtown and the needle across it.
  hero() {
    const c = this.city;
    const A = c.downtowns[0] || { x: 0, z: 0 };
    const needle = c.landmarks.find((l) => l.type === 'needle');
    const target = new THREE.Vector3(needle ? (A.x + needle.x) / 2 : A.x, 60, needle ? (A.z + needle.z) / 2 : A.z);
    let best = null;
    let bestScore = -Infinity;
    const fov = 55;
    for (let k = 0; k < 48; k++) {
      const yaw = (k / 48) * Math.PI * 2;
      for (const dist of [1050, 1350, 1700]) {
        const pitch = deg(29);
        const pos = target.clone().addScaledVector(dirFromYawPitch(yaw, -pitch), -dist);
        if (this.clearance(pos, 80) < 80) continue;
        // Stand over dense city, not out at sea.
        if (this.terrain.sample(pos.x, pos.z) < 120) continue;
        const ev = this.evaluate(pos, target, fov);
        let s = this.score(ev, { sky: 0.06, water: 5, maxNear: 0.02, landmark: 2, backlit: 6, minCity: 0.45 });
        // Title-screen layout: city across the bottom of the frame, a band of
        // water in the middle distance, skyline beyond.
        s -= Math.abs(ev.water - 0.2) * 4;
        s -= (ev.rowWater[0] + ev.rowWater[1]) * 4;
        s += Math.min(ev.rowWater[2] + ev.rowWater[3], 0.9) * 3;
        // Tall, dense foreground like the reference.
        s += Math.min(ev.lowHeight, 140) / 35;
        if (s > bestScore) {
          bestScore = s;
          best = { pos, yaw, dist };
        }
      }
    }
    if (!best) {
      const pos = target.clone().add(new THREE.Vector3(0, 1100, 2000));
      best = { pos, yaw: Math.PI, dist: 2300 };
    }
    const radius = Math.hypot(best.pos.x - target.x, best.pos.z - target.z);
    return {
      kind: 'hero',
      pos: best.pos,
      target,
      fov,
      motion: new OrbitMotion({ center: target, radius, height: best.pos.y, angle: best.yaw + Math.PI, speed: 11 / radius, fov, arc: 0.75 }),
    };
  }

  randomIso() {
    const target = this.interestingPoint();
    target.y = 0;
    const az = Math.PI / 4 + Math.floor(Math.random() * 4) * (Math.PI / 2);
    const frame = rand(380, 1300);
    return {
      target,
      az,
      frame,
      motion: new IsoPanMotion({ target, az, frame, heading: rand(0, Math.PI * 2), speed: frame * 0.012, radius: WORLD.half * 0.55 }),
    };
  }
}
