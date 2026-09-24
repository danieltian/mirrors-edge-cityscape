import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ISO_EL } from './shots.js';
import { IsoPanMotion } from './motions.js';

// Owns both cameras and decides where they are each frame:
//   mode:       'drift' (automatic motion) | 'explore' (user controls)
//   projection: 'persp' | 'iso'
// plus transitions (white fade between shots, dolly-zoom morph between
// perspective and isometric). Everything world-specific (city or office)
// goes through a world adapter: ray casts, collision, clip ranges, shots.

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
    this.onNewWorld = null; // set by the app: asked for a fresh world when an office has been toured
    this.aspect = dom.clientWidth / Math.max(1, dom.clientHeight);

    this.persp = new THREE.PerspectiveCamera(50, this.aspect, 1, 30000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 18000);
    this.camera = this.persp;

    this.world = null;
    this.mode = 'drift';
    this.projection = 'persp';
    this.rig = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
    this.iso = { target: new THREE.Vector3(), az: Math.PI / 4, frame: 800 };
    this.motion = null;
    this.isoMotion = null;
    this.lift = 0;
    this.clearance = 10;
    this.shotTime = 0;
    this.shotDuration = 0;
    this.transition = null;
    this.fogEye = new THREE.Vector3();
    this.cut = { t: 0, interval: 8 }; // drift moves on to a new view this often (seconds)
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

  // Called whenever a (new) world is ready.
  setWorld(world, post) {
    this.world = world;
    this.post = post;
    this.planner = world.planner;
    this.isoRotate = null;
    if (this.projection === 'iso') {
      world.setCutaway(true);
      this.applyIsoShot(this.planner.randomIso());
    } else {
      world.setCutaway(false);
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
    this.cut.t = 0;
    if (this.controls) this.controls.enabled = mode === 'explore';
    if (mode === 'drift') {
      if (this.projection === 'persp') {
        const d = this.world.driftFrom(this.persp, this.controls ? this.controls.target.clone() : this.rig.target.clone());
        this.motion = d.motion;
        this.clearance = d.clearance;
        this.shotDuration = d.duration || 0;
        this.shotTime = 0;
      } else this.isoMotion = this.isoMotionFromCurrent();
      this.lift = 0;
      this.prevPos = null;
    } else {
      // Hand the current view to the controls.
      const target = this.projection === 'persp' ? this.world.exploreTarget(this.persp, this.rig.target) : this.iso.target;
      this.controls.target.copy(target);
      this.controls.update();
    }
    this.onChange();
  }

  toggleMode() {
    this.setMode(this.mode === 'drift' ? 'explore' : 'drift');
  }

  // auto = triggered by drift rather than the user.
  randomLocation(auto = false) {
    if (!this.planner || this.transition?.type === 'morph') return;
    this.cut.t = 0;
    this.shotTime = 0;
    if (auto && this.onNewWorld && this.world.wantsNewWorld()) {
      this.onNewWorld();
      return;
    }
    if (this.projection === 'iso') {
      const s = this.planner.randomIso();
      this.fade(() => this.applyIsoShot(s));
    } else {
      const shot = this.planner.random();
      this.fade(() => this.applyShot(shot));
    }
  }

  toggleProjection() {
    if (this.transition) return;
    if (this.projection === 'persp') this.morphToIso();
    else if (this.world.kind !== 'city') this.cutToPersp();
    else this.morphToPersp();
  }

  resize(w, h) {
    this.aspect = w / Math.max(1, h);
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    if (this.world) this.updateOrthoFrustum(this.iso.frame);
  }

  // ------------------------------------------------------------ shots

  applyShot(shot) {
    this.motion = shot.motion;
    this.clearance = shot.motion.clearance ?? 8;
    this.shotDuration = shot.duration || 0;
    this.shotTime = 0;
    this.lift = 0;
    this.prevPos = null;
    this.motion.update(0, this.rig);
    if (this.mode === 'explore') {
      this.placePersp(this.rig.pos, this.rig.target, this.rig.fov);
      this.controls.target.copy(this.world.exploreTarget(this.persp, this.rig.target));
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
      radius: this.world.isoRadius,
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
    const ex = this.world?.explore || {};
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
      c.minDistance = ex.minDistance ?? 3;
      c.maxDistance = ex.maxDistance ?? 9000;
      c.maxPolarAngle = ex.maxPolar ?? Math.PI * 0.6;
      c.screenSpacePanning = !!ex.screenSpacePanning;
      c.target.copy(this.world ? this.world.exploreTarget(this.persp, this.rig.target) : this.rig.target);
    }
    // The mouse only steers in Explore; switching modes is always explicit
    // (Space or the dock), so clicking to start the music never changes it.
    c.enabled = this.mode === 'explore';
    c.addEventListener('start', () => (this.idle = 0));
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
    const W = this.world;
    const cam = this.persp;
    cam.updateMatrixWorld();
    const P0 = cam.position.clone();
    const f = cam.getWorldDirection(new THREE.Vector3());
    const [dMin, dDefault] = W.morphDist;
    let d = W.raycast(P0.x, P0.y, P0.z, f.x, f.y, f.z, dDefault * 4);
    if (!isFinite(d)) d = dDefault;
    d = Math.max(d, dMin);
    const T0 = P0.clone().addScaledVector(f, d);
    const T1 = W.clampTarget(T0.clone());
    const tan0 = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const tan1 = Math.tan(THREE.MathUtils.degToRad(0.35));
    const h0 = 2 * d * tan0;
    const H1 = clamp(h0, W.isoFrameRange[0], W.isoFrameRange[1]);
    const off = P0.clone().sub(T0);
    const az0 = Math.atan2(off.x, off.z);
    const el0 = Math.asin(clamp(off.y / off.length(), -0.99, 0.99));
    const az1 = Math.PI / 4 + Math.round((az0 - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2);
    const dur = 1.9;
    let t = 0;
    const T = new THREE.Vector3();
    const dir = new THREE.Vector3();
    W.setCutaway(true);
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
        cam.near = Math.max(W.minNear, dist - W.depthRange);
        cam.far = dist + W.depthRange * 1.4;
        cam.position.copy(T).addScaledVector(dir, dist);
        cam.up.set(0, 1, 0);
        cam.lookAt(T);
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
        const refTan = THREE.MathUtils.lerp(tan0, REF_TAN, u);
        this.fogEye.copy(T).addScaledVector(dir, h / (2 * refTan));
        this.aoRadius = W.isoAo(h);
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
          return true;
        }
        return false;
      },
    };
    this.onChange();
  }

  morphToPersp() {
    const W = this.world;
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
      end.copy(target).addScaledVector(dirAzEl(az, el1), H1 / (2 * tan1));
      if (W.endClearanceOK(end)) break;
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
      cam.near = Math.max(W.minNear, dist - W.depthRange);
      cam.far = Math.max(30000, dist + W.depthRange * 1.4);
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.fogEye.copy(target).addScaledVector(dir, h / (2 * REF_TAN));
      this.aoRadius = W.isoAo(h);
      if (t >= dur) {
        this.projection = 'persp';
        W.setCutaway(false);
        this.rig.pos.copy(cam.position);
        this.rig.target.copy(target);
        this.rig.fov = cam.fov;
        if (this.mode === 'drift') {
          const d = W.driftFrom(cam, target);
          this.motion = d.motion;
          this.clearance = d.clearance;
          this.shotDuration = d.duration || 0;
          this.shotTime = 0;
          this.lift = 0;
          this.prevPos = null;
        } else {
          this.controls.target.copy(target);
          this.controls.update();
        }
        return true;
      }
      return false;
    };
    step(0);
    this.transition = { type: 'morph', update: step };
    this.onChange();
  }

  // Indoors there is no sensible dolly back in, so cut to a fresh view.
  cutToPersp() {
    const shot = this.planner.random();
    this.fade(() => {
      this.projection = 'persp';
      this.world.setCutaway(false);
      this.setActiveCamera(this.persp);
      this.applyShot(shot);
      this.placePersp(this.rig.pos, this.rig.target, this.rig.fov);
      this.onChange();
    });
    this.transition.type = 'morph';
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
    cam.fov = fov;
    this.updatePerspClip();
  }

  updatePerspClip() {
    const cam = this.persp;
    const c = this.world.clip(cam.position);
    cam.near = c.near;
    cam.far = c.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.fogEye.copy(cam.position);
    this.aoRadius = c.ao;
  }

  updateOrthoFrustum(frame) {
    const o = this.ortho;
    o.top = frame / 2;
    o.bottom = -frame / 2;
    o.left = (-frame * this.aspect) / 2;
    o.right = (frame * this.aspect) / 2;
    o.near = this.world.orthoNear;
    o.far = this.world.isoDist * 2;
    o.updateProjectionMatrix();
  }

  placeIso() {
    const o = this.ortho;
    this.updateOrthoFrustum(this.iso.frame);
    const dir = dirAzEl(this.iso.az, ISO_EL, this._w);
    o.position.copy(this.iso.target).addScaledVector(dir, this.world.isoDist);
    o.up.set(0, 1, 0);
    o.lookAt(this.iso.target);
    o.updateMatrixWorld();
    this.updateIsoDerived(this.iso.target);
  }

  updateIsoDerived(target) {
    const frame = this.iso.frame / this.ortho.zoom;
    const dir = this._w.subVectors(this.ortho.position, target).normalize();
    this.fogEye.copy(target).addScaledVector(dir, frame / (2 * REF_TAN));
    this.aoRadius = this.world.isoAo(frame);
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    if (!this.world) return;
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
    } else {
      // Drift always tours: cut to a new view every few seconds (counted
      // from the previous cut, fade included), or sooner when a shot runs out.
      this.cut.t += dt;
      if (!this.transition) {
        this.shotTime += dt;
        if (this.cut.t > this.cut.interval || (this.projection === 'persp' && this.shotDuration && this.shotTime > this.shotDuration)) this.randomLocation(true);
      }
    }
  }

  updatePersp(dt) {
    const W = this.world;
    if (this.mode === 'drift') {
      this.motion.update(dt * this.driftSpeed, this.rig);
      if (this.motion.done && !this.transition) this.randomLocation(true);
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
      const speed = W.flySpeed(cam.position) * (k.has('shift') ? 3 : 1);
      move.normalize().multiplyScalar(speed * dt);
      cam.position.add(move);
      this.controls.target.add(move);
    }
    this.controls.update();
    // Collision: move the orbit target along with any push-out.
    const before = this._w.copy(cam.position);
    W.constrain(cam.position, this.controls.target);
    this.controls.target.add(before.subVectors(cam.position, before));
    this.rig.pos.copy(cam.position);
    this.rig.target.copy(this.controls.target);
    this.rig.fov = cam.fov;
    this.updatePerspClip();
  }

  // Smoothly raise the camera over anything in its path.
  applyLift(dt, pos) {
    const W = this.world;
    const now = W.liftNeeded(pos, this.clearance);
    let ahead = now;
    if (this.prevPos && dt > 0) {
      const vel = this._w.subVectors(pos, this.prevPos).divideScalar(dt);
      vel.y = 0;
      if (vel.length() > 80) vel.setLength(80); // ignore jumps (cuts, mode switches)
      ahead = W.liftNeeded(this._v.copy(pos).addScaledVector(vel, 2.5), this.clearance);
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
        o.position.copy(target).addScaledVector(dirAzEl(rotAz, ISO_EL, this._w), this.world.isoDist);
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
      const speed = (this.iso.frame / o.zoom) * 0.6 * (k.has('shift') ? 3 : 1);
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
