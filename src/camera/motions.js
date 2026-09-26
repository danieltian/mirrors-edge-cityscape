import * as THREE from 'three';

// Drift motions. Each writes { pos, target, fov } (perspective) or
// { target, az, frame } (isometric) every frame. Angles use yaw = atan2(x, z).

export const yawOf = (x, z) => Math.atan2(x, z);

export function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  const c = Math.cos(pitch);
  return out.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c);
}

const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

// Slow circle around a point, like the title screen. With `arc` set it sweeps
// back and forth across that many radians instead of going all the way round
// (keeps the sun roughly where it was when the shot was chosen).
export class OrbitMotion {
  constructor({ center, radius, height, angle, speed, targetY = center.y, fov = 50, clearance = 10, arc = 0 }) {
    Object.assign(this, { center: center.clone(), radius, height, angle, speed, targetY, fov, clearance, arc });
    this.angle0 = angle;
    this.t = 0;
  }
  update(dt, out) {
    this.t += dt;
    if (this.arc > 0) this.angle = this.angle0 + this.arc * Math.sin((this.speed * this.t) / this.arc);
    else this.angle += this.speed * dt;
    out.pos.set(this.center.x + Math.sin(this.angle) * this.radius, this.height, this.center.z + Math.cos(this.angle) * this.radius);
    out.target.set(this.center.x, this.targetY, this.center.z);
    out.fov = this.fov;
  }
}

// Fixed position, gently looking left and right.
export class PanMotion {
  constructor({ pos, yaw, pitch, amp = 0.18, period = 70, fov = 60, clearance = 1.5, phase = 0 }) {
    Object.assign(this, { pos: pos.clone(), yaw, pitch, amp, period, fov, clearance });
    this.t = phase * period;
    this._d = new THREE.Vector3();
  }
  update(dt, out) {
    this.t += dt;
    const w = (Math.PI * 2 * this.t) / this.period;
    const yaw = this.yaw + this.amp * Math.sin(w);
    const pitch = this.pitch + 0.015 * Math.sin(w * 0.7 + 1.3);
    out.pos.copy(this.pos);
    out.pos.y += Math.sin(w * 0.5) * 0.6;
    out.target.copy(out.pos).addScaledVector(dirFromYawPitch(yaw, pitch, this._d), 250);
    out.fov = this.fov;
  }
}

// Glide forward (e.g. down an avenue). Eases to a stop and turns into a pan
// if something gets in the way.
export class DollyMotion {
  constructor({ pos, yaw, pitch, speed, fov = 60, hf, clearance = 8, stopDist = 200, probe = 260 }) {
    Object.assign(this, { pos: pos.clone(), yaw, pitch, speed, fov, hf, clearance, stopDist, probe });
    this.v = speed;
    this.check = 0;
    this.stopping = false;
    this.pan = null;
    this._d = new THREE.Vector3();
  }
  update(dt, out) {
    if (this.pan) return this.pan.update(dt, out);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.check -= dt;
    if (!this.stopping && this.check <= 0) {
      this.check = 0.3;
      const d = this.hf.raycast(this.pos.x, this.pos.y, this.pos.z, fx, 0, fz, this.probe);
      if (d < this.stopDist) this.stopping = true;
    }
    if (this.stopping) {
      this.v = Math.max(0, this.v - this.speed * 0.25 * dt);
      if (this.v === 0) {
        this.pan = new PanMotion({ pos: this.pos, yaw: this.yaw, pitch: this.pitch, amp: 0.22, period: 80, fov: this.fov });
        return this.pan.update(dt, out);
      }
    }
    this.pos.x += fx * this.v * dt;
    this.pos.z += fz * this.v * dt;
    out.pos.copy(this.pos);
    out.target.copy(this.pos).addScaledVector(dirFromYawPitch(this.yaw, this.pitch, this._d), 250);
    out.fov = this.fov;
  }
}

// Moves along a straight line while keeping a fixed point in view (parallax).
export class TrackMotion {
  constructor({ pos, vel, target, fov = 50, clearance = 6, duration = 70 }) {
    Object.assign(this, { pos: pos.clone(), vel: vel.clone(), target: target.clone(), fov, clearance, duration });
    this.t = 0;
  }
  update(dt, out) {
    this.t += dt;
    // Ping-pong so it never wanders off.
    const phase = Math.sin((Math.PI * this.t) / this.duration);
    out.pos.copy(this.pos).addScaledVector(this.vel, (phase * this.duration) / Math.PI);
    out.target.copy(this.target);
    out.fov = this.fov;
  }
}

// Cruise along the river centre-line.
export class RiverMotion {
  constructor({ river, s, dir, altitude, lateral, speed, fov = 55, range, clearance = 8 }) {
    Object.assign(this, { river, s, dir, altitude, lateral, speed, fov, range, clearance });
    let len = 0;
    for (let i = 1; i < river.length; i++) len += Math.hypot(river[i].x - river[i - 1].x, river[i].z - river[i - 1].z);
    this.spacing = len / (river.length - 1);
    this.done = false;
    this.smoothTarget = null;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }
  at(s, out) {
    const r = this.river;
    const i = Math.max(0, Math.min(r.length - 2, Math.floor(s)));
    const f = Math.max(0, Math.min(1, s - i));
    const a = r[i];
    const b = r[i + 1];
    const nx = a.tz + (b.tz - a.tz) * f;
    const nz = -(a.tx + (b.tx - a.tx) * f);
    return out.set(a.x + (b.x - a.x) * f + nx * this.lateral, 0, a.z + (b.z - a.z) * f + nz * this.lateral);
  }
  update(dt, out) {
    this.s += (this.dir * this.speed * dt) / this.spacing;
    const [lo, hi] = this.range;
    if (this.s < lo + 8 || this.s > hi - 8) this.done = true;
    this.at(this.s, out.pos);
    out.pos.y = this.altitude;
    const look = this.at(this.s + (this.dir * 320) / this.spacing, this._a);
    look.y = this.altitude * 0.35;
    if (!this.smoothTarget) this.smoothTarget = look.clone();
    else this.smoothTarget.lerp(look, smooth(1.2, dt));
    out.target.copy(this.smoothTarget);
    out.fov = this.fov;
  }
}

// Walk along a smoothed path (e.g. through office doorways), easing in and
// out and looking a little way ahead (and `dip` metres down).
export class PathMotion {
  constructor({ points, speed = 1.1, fov = 65, lookAhead = 2.4, clearance = 0, dip = 0.15 }) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    this.len = this.curve.getLength();
    Object.assign(this, { speed, fov, lookAhead, clearance, dip });
    this.s = 0;
    this.done = false;
    this.look = null;
    this._a = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }
  update(dt, out) {
    const ease = Math.min(1, (this.s + 0.4) / 2.5, (this.len - this.s + 0.4) / 2.5);
    this.s = Math.min(this.len, this.s + this.speed * Math.max(0.12, ease) * dt);
    if (this.s >= this.len - 0.05) this.done = true;
    this.curve.getPointAt(this.s / this.len, out.pos);
    const ahead = this._a;
    if (this.s + this.lookAhead <= this.len) this.curve.getPointAt((this.s + this.lookAhead) / this.len, ahead);
    else ahead.copy(out.pos).addScaledVector(this.curve.getTangentAt(1, this._t), this.lookAhead);
    ahead.y -= this.dip;
    if (!this.look || dt === 0) this.look = ahead.clone();
    else this.look.lerp(ahead, 1 - Math.exp(-dt * 2.2));
    out.target.copy(this.look);
    out.fov = this.fov;
  }
}

// Isometric drift: the view slides across the city, steering back toward the
// centre whenever it nears the edge.
export class IsoPanMotion {
  constructor({ target, az, frame, heading, speed, radius }) {
    Object.assign(this, { target: target.clone(), az, frame, heading, speed, radius });
    this.t = 0;
  }
  update(dt, out) {
    this.t += dt;
    const r = Math.hypot(this.target.x, this.target.z);
    if (r > this.radius) {
      const toC = Math.atan2(-this.target.x, -this.target.z);
      let d = toC - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * smooth(0.25, dt);
    } else {
      this.heading += Math.sin(this.t * 0.05) * 0.02 * dt;
    }
    this.target.x += Math.sin(this.heading) * this.speed * dt;
    this.target.z += Math.cos(this.heading) * this.speed * dt;
    out.target.copy(this.target);
    out.az = this.az;
    out.frame = this.frame;
  }
}
