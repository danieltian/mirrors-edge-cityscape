import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD } from '../config.js';
import { ShotPlanner, ISO_EL } from './shots.js';
import { OrbitMotion, PanMotion, IsoPanMotion, yawOf } from './motions.js';

// Owns both cameras and decides where they are each frame:
//   mode:       'drift' (automatic motion) | 'explore' (user controls)
//   projection: 'persp' | 'iso'
// plus transitions (white fade between shots, dolly-zoom morph between
// perspective and isometric).

const ISO_DIST = 9000;
const ISO_POLAR = Math.PI / 2 - ISO_EL;
const REF_TAN = Math.tan(THREE.MathUtils.degToRad(25)); // fog reference: 50° fov
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const dirAzEl = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

export class Director {
  constructor({ dom, overlay, onChange }) {
    this.dom = dom;
    this.overlay = overlay;
    this.onChange = onChange || (() => {});
    this.aspect = dom.clientWidth / Math.max(1, dom.clientHeight);

    this.persp = new THREE.PerspectiveCamera(50, this.aspect, 1, 30000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, ISO_DIST * 2);
    this.camera = this.persp;

    this.mode = 'drift';
    this.projection = 'persp';
    this.rig = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
    this.iso = { target: new THREE.Vector3(), az: Math.PI / 4, frame: 800 };
    this.motion = null;
    this.isoMotion = null;
    this.lift = 0;
    this.clearance = 10;
    this.transition = null;
    this.fogEye = new THREE.Vector3();
    this.tour = { on: false, t: 0, interval: 30 };
    this.autoResume = 0; // seconds of idle before drift resumes (0 = never)
    this.idle = 0;
    this.keys = new Set();
    this.driftSpeed = 1;
    this.isoRotate = null;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();

    this.onKeyDown = (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        this.keys.add(k);
        this.idle = 0;
        if (this.mode === 'drift' && !['shift', 'q', 'e'].includes(k)) this.setMode('explore');
        if (this.projection === 'iso' && (k === 'q' || k === 'e')) this.rotateIso(k === 'q' ? -1 : 1);
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    this.onBlur = () => this.keys.clear();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    dom.addEventListener('pointerdown', () => (this.idle = 0));
    dom.addEventListener('wheel', () => (this.idle = 0), { passive: true });
  }

  // Called whenever a (new) city is ready.
  setCity(city, post, getSunDir) {
    this.city = city;
    this.hf = city.heightfield;
    this.post = post;
    this.planner = new ShotPlanner(city, () => this.aspect, getSunDir);
    if (this.projection === 'iso') {
      const s = this.planner.randomIso();
      this.applyIsoShot(s);
    } else {
      this.applyShot(this.planner.hero());
    }
    this.createControls();
    this.onChange();
  }

  // ------------------------------------------------------------ public API

  setMode(mode) {
    if (mode === this.mode || this.transition?.type === 'morph') return;
    this.mode = mode;
    this.idle = 0;
    if (mode === 'drift') {
      if (this.projection === 'persp') this.motion = this.motionFromCurrent();
      else this.isoMotion = this.isoMotionFromCurrent();
      this.lift = 0;
      this.prevPos = null;
    } else {
      // Hand the current view to the controls.
      const target = this.projection === 'persp' ? this.rig.target : this.iso.target;
      this.controls.target.copy(target);
      this.controls.update();
    }
    this.onChange();
  }

  toggleMode() {
    this.setMode(this.mode === 'drift' ? 'explore' : 'drift');
  }

  randomLocation() {
    if (!this.planner || this.transition?.type === 'morph') return;
    if (this.projection === 'iso') {
      const s = this.planner.randomIso();
      this.fade(() => this.applyIsoShot(s));
    } else {
      const shot = this.planner.random();
      this.fade(() => this.applyShot(shot));
    }
    this.tour.t = 0;
  }

  toggleProjection() {
    if (this.transition) return;
    if (this.projection === 'persp') this.morphToIso();
    else this.morphToPersp();
  }

  setTour(on) {
    this.tour.on = on;
    this.tour.t = 0;
    this.onChange();
  }

  resize(w, h) {
    this.aspect = w / Math.max(1, h);
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    this.updateOrthoFrustum(this.iso.frame);
  }

  // ------------------------------------------------------------ shots

  applyShot(shot) {
    this.motion = shot.motion;
    this.clearance = shot.motion.clearance ?? 8;
    this.lift = 0;
    this.prevPos = null;
    this.motion.update(0, this.rig);
    if (this.mode === 'explore') {
      this.placePersp(this.rig.pos, this.rig.target, this.rig.fov);
      this.controls.target.copy(this.rig.target);
      this.controls.update();
    }
    this.shotKind = shot.kind;
  }

  applyIsoShot(s) {
    this.iso.target.copy(s.target);
    this.iso.az = s.az;
    this.iso.frame = s.frame;
    this.isoMotion = s.motion;
    this.ortho.zoom = 1;
    this.placeIso();
    if (this.mode === 'explore' && this.controls) {
      this.controls.target.copy(this.iso.target);
      this.controls.update();
    }
  }

  motionFromCurrent() {
    const cam = this.persp;
    const pos = cam.position.clone();
    const target = this.controls ? this.controls.target.clone() : this.rig.target.clone();
    const dH = Math.hypot(pos.x - target.x, pos.z - target.z);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const ground = this.hf.maxAround(pos.x, pos.z, 20);
    if (pos.y - ground > 120 && dH > 200 && target.y < 200) {
      this.clearance = 10;
      return new OrbitMotion({
        center: target,
        radius: dH,
        height: pos.y,
        angle: yawOf(pos.x - target.x, pos.z - target.z),
        speed: clamp(11 / dH, 0.003, 0.03),
        targetY: target.y,
        fov: cam.fov,
        arc: 0.8,
      });
    }
    this.clearance = 1.5;
    return new PanMotion({
      pos,
      yaw: yawOf(dir.x, dir.z),
      pitch: Math.asin(clamp(dir.y, -1, 1)),
      amp: 0.16,
      period: 75,
      fov: cam.fov,
    });
  }

  isoMotionFromCurrent() {
    if (this.ortho.zoom !== 1) {
      this.iso.frame /= this.ortho.zoom;
      this.ortho.zoom = 1;
    }
    if (this.controls) this.iso.target.copy(this.controls.target);
    const off = this._v.subVectors(this.ortho.position, this.iso.target);
    this.iso.az = Math.atan2(off.x, off.z);
    return new IsoPanMotion({
      target: this.iso.target,
      az: this.iso.az,
      frame: this.iso.frame,
      heading: Math.random() * Math.PI * 2,
      speed: this.iso.frame * 0.012,
      radius: WORLD.half * 0.55,
    });
  }

  rotateIso(sign) {
    if (this.isoRotate || this.transition) return;
    const target = this.mode === 'explore' ? this.controls.target.clone() : this.iso.target.clone();
    if (this.mode === 'explore') {
      const off = this._v.subVectors(this.ortho.position, target);
      this.iso.az = Math.atan2(off.x, off.z);
    }
    this.isoRotate = { from: this.iso.az, to: this.iso.az + (sign * Math.PI) / 2, t: 0, target };
  }

  // ------------------------------------------------------------ controls

  createControls() {
    this.controls?.dispose();
    const c = new OrbitControls(this.camera, this.dom);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.zoomToCursor = true;
    c.screenSpacePanning = false;
    if (this.projection === 'iso') {
      c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
      c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
      c.minPolarAngle = ISO_POLAR;
      c.maxPolarAngle = ISO_POLAR;
      c.minZoom = 0.12;
      c.maxZoom = 10;
      c.target.copy(this.iso.target);
    } else {
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      c.minDistance = 3;
      c.maxDistance = 9000;
      c.maxPolarAngle = Math.PI * 0.6;
      c.target.copy(this.rig.target);
    }
    c.addEventListener('start', () => {
      this.idle = 0;
      if (this.mode === 'drift' && !this.transition) this.setMode('explore');
    });
    this.controls = c;
  }

  // ------------------------------------------------------------ transitions

  setOverlay(a) {
    this.overlay.style.opacity = a.toFixed(3);
  }

  fade(apply) {
    const inDur = 0.32;
    const outDur = 0.85;
    let t = 0;
    let applied = false;
    this.transition = {
      type: 'fade',
      update: (dt) => {
        t += dt;
        if (!applied) {
          this.setOverlay(ease(Math.min(1, t / inDur)));
          if (t >= inDur) {
            applied = true;
            apply();
            t = 0;
          }
          return false;
        }
        this.setOverlay(1 - ease(Math.min(1, t / outDur)));
        return t >= outDur;
      },
    };
  }

  morphToIso() {
    const cam = this.persp;
    cam.updateMatrixWorld();
    const P0 = cam.position.clone();
    const f = cam.getWorldDirection(new THREE.Vector3());
    let d = this.hf.raycast(P0.x, P0.y, P0.z, f.x, f.y, f.z, 6000);
    if (!isFinite(d)) d = 1500;
    d = Math.max(d, 60);
    const T0 = P0.clone().addScaledVector(f, d);
    const lim = WORLD.half * 0.85;
    const T1 = new THREE.Vector3(clamp(T0.x, -lim, lim), 0, clamp(T0.z, -lim, lim));
    const tan0 = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const tan1 = Math.tan(THREE.MathUtils.degToRad(0.35));
    const h0 = 2 * d * tan0;
    const H1 = clamp(h0, 300, 2600);
    const off = P0.clone().sub(T0);
    const az0 = Math.atan2(off.x, off.z);
    const el0 = Math.asin(clamp(off.y / off.length(), -0.99, 0.99));
    const az1 = Math.PI / 4 + Math.round((az0 - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2);
    const dur = 1.9;
    let t = 0;
    const T = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.transition = {
      type: 'morph',
      update: (dt) => {
        t = Math.min(dur, t + dt);
        const u = ease(t / dur);
        const az = lerpAngle(az0, az1, u);
        const el = THREE.MathUtils.lerp(el0, ISO_EL, u);
        T.lerpVectors(T0, T1, u);
        const tanH = Math.exp(THREE.MathUtils.lerp(Math.log(tan0), Math.log(tan1), u));
        const h = Math.exp(THREE.MathUtils.lerp(Math.log(h0), Math.log(H1), u));
        const dist = h / (2 * tanH);
        dirAzEl(az, el, dir);
        cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanH));
        cam.near = Math.max(1, dist - 8000);
        cam.far = dist + 12000;
        cam.position.copy(T).addScaledVector(dir, dist);
        cam.up.set(0, 1, 0);
        cam.lookAt(T);
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
        const refTan = THREE.MathUtils.lerp(tan0, REF_TAN, u);
        this.fogEye.copy(T).addScaledVector(dir, h / (2 * refTan));
        this.aoRadius = clamp(h * 0.012, 3, 25);
        if (t >= dur) {
          this.projection = 'iso';
          this.iso.target.copy(T1);
          this.iso.az = az1;
          this.iso.frame = H1;
          this.ortho.zoom = 1;
          this.setActiveCamera(this.ortho);
          this.placeIso();
          if (this.mode === 'drift') this.isoMotion = this.isoMotionFromCurrent();
          else {
            this.controls.target.copy(T1);
            this.controls.update();
          }
          this.persp.fov = 50;
          this.onChange();
          return true;
        }
        return false;
      },
    };
    this.onChange();
  }

  morphToPersp() {
    const zoom = this.ortho.zoom;
    const target = this.mode === 'explore' ? this.controls.target.clone() : this.iso.target.clone();
    const off = this._v.subVectors(this.ortho.position, target);
    const az = Math.atan2(off.x, off.z);
    const H0 = this.iso.frame / zoom;
    const tan0 = Math.tan(THREE.MathUtils.degToRad(0.35));
    const tan1 = REF_TAN;
    const el1 = THREE.MathUtils.degToRad(30);
    let H1 = H0;
    const end = new THREE.Vector3();
    for (let i = 0; i < 24; i++) {
      const dist1 = H1 / (2 * tan1);
      end.copy(target).addScaledVector(dirAzEl(az, el1), dist1);
      if (end.y - this.hf.maxAround(end.x, end.z, 40) > 40) break;
      H1 *= 1.15;
    }
    const cam = this.persp;
    this.setActiveCamera(cam);
    const dur = 1.9;
    let t = 0;
    const dir = new THREE.Vector3();
    const step = (dt) => {
      t = Math.min(dur, t + dt);
      const u = ease(t / dur);
      const el = THREE.MathUtils.lerp(ISO_EL, el1, u);
      const tanH = Math.exp(THREE.MathUtils.lerp(Math.log(tan0), Math.log(tan1), u));
      const h = Math.exp(THREE.MathUtils.lerp(Math.log(H0), Math.log(H1), u));
      const dist = h / (2 * tanH);
      dirAzEl(az, el, dir);
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanH));
      cam.near = Math.max(1, dist - 8000);
      cam.far = Math.max(30000, dist + 12000);
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.fogEye.copy(target).addScaledVector(dir, h / (2 * REF_TAN));
      this.aoRadius = clamp(h * 0.012, 3, 25);
      if (t >= dur) {
        this.projection = 'persp';
        this.rig.pos.copy(cam.position);
        this.rig.target.copy(target);
        this.rig.fov = cam.fov;
        if (this.mode === 'drift') {
          const radius = Math.hypot(cam.position.x - target.x, cam.position.z - target.z);
          this.motion = new OrbitMotion({ center: target, radius, height: cam.position.y, angle: az, speed: clamp(11 / radius, 0.003, 0.03), fov: cam.fov, arc: 0.8 });
          this.clearance = 10;
          this.lift = 0;
          this.prevPos = null;
        } else {
          this.controls.target.copy(target);
          this.controls.update();
        }
        this.onChange();
        return true;
      }
      return false;
    };
    step(0);
    this.transition = { type: 'morph', update: step };
    this.onChange();
  }

  setActiveCamera(cam) {
    this.camera = cam;
    this.post?.setCamera(cam);
    this.createControls();
  }

  // ------------------------------------------------------------ placement

  placePersp(pos, target, fov) {
    const cam = this.persp;
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    if (cam.fov !== fov) {
      cam.fov = fov;
    }
    this.updatePerspClip();
  }

  updatePerspClip() {
    const cam = this.persp;
    const p = cam.position;
    const clear = p.y - this.hf.maxAround(p.x, p.z, 30);
    cam.near = clamp(clear * 0.2, 0.5, 30);
    cam.far = 30000;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.fogEye.copy(p);
    this.aoRadius = clamp(Math.max(clear, 5) * 0.03 + 2.5, 2.5, 22);
  }

  updateOrthoFrustum(frame) {
    const o = this.ortho;
    o.top = frame / 2;
    o.bottom = -frame / 2;
    o.left = (-frame * this.aspect) / 2;
    o.right = (frame * this.aspect) / 2;
    o.near = 10;
    o.far = ISO_DIST * 2;
    o.updateProjectionMatrix();
  }

  placeIso() {
    const o = this.ortho;
    this.updateOrthoFrustum(this.iso.frame);
    const dir = dirAzEl(this.iso.az, ISO_EL, this._w);
    o.position.copy(this.iso.target).addScaledVector(dir, ISO_DIST);
    o.up.set(0, 1, 0);
    o.lookAt(this.iso.target);
    o.updateMatrixWorld();
    this.updateIsoDerived(this.iso.target);
  }

  updateIsoDerived(target) {
    const frame = this.iso.frame / this.ortho.zoom;
    const dir = this._w.subVectors(this.ortho.position, target).normalize();
    this.fogEye.copy(target).addScaledVector(dir, frame / (2 * REF_TAN));
    this.aoRadius = clamp(frame * 0.012, 3, 25);
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    if (!this.city) return;
    dt = Math.min(dt, 0.1);
    let morphing = false;
    if (this.transition) {
      morphing = this.transition.type === 'morph';
      if (this.transition.update(dt)) {
        this.transition = null;
        this.onChange();
      }
    }
    if (!morphing) {
      if (this.projection === 'persp') this.updatePersp(dt);
      else this.updateIso(dt);
    }

    if (this.mode === 'explore') {
      this.idle += dt;
      if (this.autoResume > 0 && this.idle > this.autoResume && !this.transition) this.setMode('drift');
    }
    if (this.tour.on && this.mode === 'drift' && !this.transition) {
      this.tour.t += dt;
      if (this.tour.t > this.tour.interval) this.randomLocation();
    }
  }

  updatePersp(dt) {
    if (this.mode === 'drift') {
      this.motion.update(dt * this.driftSpeed, this.rig);
      if (this.motion.done && !this.transition) this.randomLocation();
      this.applyLift(dt, this.rig.pos);
      this.placePersp(this.rig.pos, this.rig.target, this.rig.fov);
      return;
    }
    // Explore: WASD flight on top of orbit controls.
    const cam = this.persp;
    const move = this._v.set(0, 0, 0);
    const k = this.keys;
    const f = cam.getWorldDirection(this._w);
    const right = new THREE.Vector3().crossVectors(f, cam.up).normalize();
    if (k.has('w') || k.has('arrowup')) move.add(f);
    if (k.has('s') || k.has('arrowdown')) move.sub(f);
    if (k.has('d') || k.has('arrowright')) move.add(right);
    if (k.has('a') || k.has('arrowleft')) move.sub(right);
    if (k.has('e')) move.y += 1;
    if (k.has('q')) move.y -= 1;
    if (move.lengthSq() > 0) {
      const alt = cam.position.y - this.hf.maxAround(cam.position.x, cam.position.z, 20);
      const speed = clamp(Math.max(alt, 0) * 0.45, 15, 380) * (k.has('shift') ? 3 : 1);
      move.normalize().multiplyScalar(speed * dt);
      cam.position.add(move);
      this.controls.target.add(move);
    }
    this.controls.update();
    // Never go through roofs or water.
    const floor = Math.max(this.hf.maxAround(cam.position.x, cam.position.z, 3) + 2, WORLD.waterY + 2);
    if (cam.position.y < floor) cam.position.y = floor;
    if (this.controls.target.y < WORLD.waterY) this.controls.target.y = WORLD.waterY;
    this.rig.pos.copy(cam.position);
    this.rig.target.copy(this.controls.target);
    this.rig.fov = cam.fov;
    this.updatePerspClip();
  }

  // Smoothly raise the camera over anything in its path.
  applyLift(dt, pos) {
    const need = (p) => Math.max(this.hf.maxAround(p.x, p.z, 16) + this.clearance - p.y, WORLD.waterY + 3 - p.y, 0);
    let now = need(pos);
    let ahead = now;
    if (this.prevPos && dt > 0) {
      const vel = this._w.subVectors(pos, this.prevPos).divideScalar(dt);
      vel.y = 0;
      if (vel.length() > 80) vel.setLength(80); // ignore jumps (cuts, mode switches)
      const a = this._v.copy(pos).addScaledVector(vel, 2.5);
      ahead = need(a);
    }
    this.prevPos = (this.prevPos || new THREE.Vector3()).copy(pos);
    const goal = Math.max(now, ahead);
    if (goal > this.lift) this.lift += (goal - this.lift) * (1 - Math.exp(-dt * 4));
    else this.lift += (goal - this.lift) * (1 - Math.exp(-dt * 0.4));
    this.lift = Math.max(this.lift, now);
    pos.y += this.lift;
  }

  updateIso(dt) {
    const o = this.ortho;
    let rotAz = null;
    if (this.isoRotate) {
      const r = this.isoRotate;
      r.t = Math.min(1, r.t + dt / 0.7);
      rotAz = THREE.MathUtils.lerp(r.from, r.to, ease(r.t));
      this.iso.az = rotAz;
      if (this.mode === 'explore') {
        const target = this.controls.target;
        o.position.copy(target).addScaledVector(dirAzEl(rotAz, ISO_EL, this._w), ISO_DIST);
        o.lookAt(target);
      }
      if (r.t >= 1) this.isoRotate = null;
    }
    if (this.mode === 'drift') {
      this.isoMotion.update(dt * this.driftSpeed, this.iso);
      if (rotAz !== null) this.iso.az = this.isoMotion.az = rotAz;
      this.placeIso();
      return;
    }
    const k = this.keys;
    const f = o.getWorldDirection(this._w);
    f.y = 0;
    f.normalize();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const move = this._v.set(0, 0, 0);
    if (k.has('w') || k.has('arrowup')) move.add(f);
    if (k.has('s') || k.has('arrowdown')) move.sub(f);
    if (k.has('d') || k.has('arrowright')) move.add(right);
    if (k.has('a') || k.has('arrowleft')) move.sub(right);
    if (move.lengthSq() > 0) {
      const speed = ((this.iso.frame / o.zoom) * 0.6) * (k.has('shift') ? 3 : 1);
      move.normalize().multiplyScalar(speed * dt);
      o.position.add(move);
      this.controls.target.add(move);
    }
    this.controls.update();
    this.iso.target.copy(this.controls.target);
    o.updateMatrixWorld();
    this.updateIsoDerived(this.controls.target);
  }
}
