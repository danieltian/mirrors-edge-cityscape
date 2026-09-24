import * as THREE from 'three';
import { WORLD } from '../config.js';
import { ShotPlanner } from '../camera/shots.js';
import { OrbitMotion, PanMotion, yawOf } from '../camera/motions.js';

// Adapts a generated city to the camera director: ray casts, clearance,
// clipping distances, explore limits and shot planning.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CityWorld {
  constructor(city, { getAspect, getSunDir }) {
    this.kind = 'city';
    this.city = city;
    this.hf = city.heightfield;
    this.planner = new ShotPlanner(city, getAspect, getSunDir);
    this.isoDist = 9000;
    this.orthoNear = 10;
    this.minNear = 1;
    this.depthRange = 9000;
    this.isoFrameRange = [300, 2600];
    this.isoRadius = WORLD.half * 0.55;
    this.explore = { minDistance: 3, maxDistance: 9000, maxPolar: Math.PI * 0.6, screenSpacePanning: false };
    this.clipPlanes = [];
    this.morphDist = [60, 1500]; // min / default distance to the morph target
  }

  isoAo(frame) {
    return clamp(frame * 0.012, 3, 25);
  }

  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    return this.hf.raycast(ox, oy, oz, dx, dy, dz, maxDist);
  }

  clip(p) {
    const clear = p.y - this.hf.maxAround(p.x, p.z, 30);
    return { near: clamp(clear * 0.2, 0.5, 30), far: 30000, ao: clamp(Math.max(clear, 5) * 0.03 + 2.5, 2.5, 22) };
  }

  liftNeeded(p, clearance) {
    return Math.max(this.hf.maxAround(p.x, p.z, 16) + clearance - p.y, WORLD.waterY + 3 - p.y, 0);
  }

  constrain(pos, target) {
    const floor = Math.max(this.hf.maxAround(pos.x, pos.z, 3) + 2, WORLD.waterY + 2);
    if (pos.y < floor) pos.y = floor;
    if (target.y < WORLD.waterY) target.y = WORLD.waterY;
  }

  flySpeed(p) {
    return clamp(Math.max(p.y - this.hf.maxAround(p.x, p.z, 20), 0) * 0.45, 15, 380);
  }

  clampTarget(v) {
    const lim = WORLD.half * 0.85;
    return v.set(clamp(v.x, -lim, lim), 0, clamp(v.z, -lim, lim));
  }

  endClearanceOK(p) {
    return p.y - this.hf.maxAround(p.x, p.z, 40) > 40;
  }

  // A drift that continues from wherever the user left the camera.
  driftFrom(cam, target) {
    const pos = cam.position.clone();
    const dH = Math.hypot(pos.x - target.x, pos.z - target.z);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const ground = this.hf.maxAround(pos.x, pos.z, 20);
    if (pos.y - ground > 120 && dH > 200 && target.y < 200) {
      return {
        clearance: 10,
        motion: new OrbitMotion({ center: target, radius: dH, height: pos.y, angle: yawOf(pos.x - target.x, pos.z - target.z), speed: clamp(11 / dH, 0.003, 0.03), targetY: target.y, fov: cam.fov, arc: 0.8 }),
      };
    }
    return {
      clearance: 1.5,
      motion: new PanMotion({ pos, yaw: yawOf(dir.x, dir.z), pitch: Math.asin(clamp(dir.y, -1, 1)), amp: 0.16, period: 75, fov: cam.fov }),
    };
  }

  exploreTarget(cam, rigTarget) {
    return rigTarget.clone();
  }

  setCutaway() {}

  wantsNewWorld() {
    return false;
  }
}
