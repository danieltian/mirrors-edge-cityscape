import * as THREE from 'three';
import { OfficePlanner } from './shots.js';
import { PanMotion, yawOf } from '../camera/motions.js';

// Adapts an office to the camera director (same interface as CityWorld).

export class OfficeWorld {
  constructor(office, { getAspect }) {
    this.kind = 'office';
    this.office = office;
    this.planner = new OfficePlanner(office, getAspect);
    this.isoDist = 400;
    this.orthoNear = 1;
    this.minNear = 0.05;
    this.depthRange = 500;
    this.isoFrameRange = [30, 150];
    const fp = office.footprint;
    this.isoRadius = Math.min(fp.x1 - fp.x0, fp.z1 - fp.z0) * 0.25;
    this.explore = { minDistance: 0.2, maxDistance: 60, maxPolar: Math.PI * 0.97, screenSpacePanning: true };
    this.morphDist = [3, 20];
  }

  isoAo(frame) {
    return Math.max(0.6, Math.min(2.2, frame * 0.02));
  }

  get clipPlanes() {
    return this.office.clipPlanes;
  }

  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    return this.office.raycast(ox, oy, oz, dx, dy, dz, maxDist);
  }

  clip() {
    return { near: 0.05, far: 3000, ao: 1.0 };
  }

  liftNeeded() {
    return 0;
  }

  constrain(pos) {
    this.office.resolve(pos);
  }

  flySpeed() {
    return 3.2;
  }

  clampTarget(v) {
    const fp = this.office.footprint;
    return v.set(Math.max(fp.x0, Math.min(fp.x1, v.x)), 0, Math.max(fp.z0, Math.min(fp.z1, v.z)));
  }

  endClearanceOK() {
    return true;
  }

  driftFrom(cam) {
    const dir = cam.getWorldDirection(new THREE.Vector3());
    return {
      clearance: 0,
      duration: 20,
      motion: new PanMotion({ pos: cam.position, yaw: yawOf(dir.x, dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))), amp: 0.22, period: 60, fov: cam.fov, clearance: 0 }),
    };
  }

  exploreTarget(cam) {
    return cam.position.clone().addScaledVector(cam.getWorldDirection(new THREE.Vector3()), 1.2);
  }

  setCutaway(on) {
    this.office.setCutaway(on);
  }

  wantsNewWorld() {
    return this.planner.shots >= this.planner.maxShots;
  }
}
