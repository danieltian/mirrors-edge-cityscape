import * as THREE from 'three';
import { WORLD } from '../config.js';

// Sun + sky/ground hemisphere light. The sun's single shadow map is re-fitted
// every frame to the part of the view frustum that overlaps the city, with
// size quantisation and texel snapping to keep edges from shimmering.

const MAP = 4096;

export class Lighting {
  constructor(scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(MAP, MAP);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.radius = 1.6;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 4000;
    this.sun.shadow.autoUpdate = true;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x88bbff, 0xddeeff, 2);
    scene.add(this.hemi);

    this.dir = new THREE.Vector3(0, 1, 0);
    this.maxHeight = 500;
    this._rot = new THREE.Matrix4();
    this._rotInv = new THREE.Matrix4();
    this._corners = Array.from({ length: 8 }, () => new THREE.Vector3());
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
  }

  setSun(elevationDeg, azimuthDeg) {
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    this.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    // Light-space rotation matching what DirectionalLightShadow computes for
    // its camera (looking down -z toward the target, +y up).
    const cam = new THREE.PerspectiveCamera();
    cam.position.copy(this.dir);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    this._rot.extractRotation(cam.matrixWorld);
    this._rotInv.copy(this._rot).invert();
  }

  // Collect frustum corners (world space) of the part of the view worth shadowing.
  frustumCorners(camera) {
    const c = this._corners;
    const f = camera.getWorldDirection(this._f);
    const up = this._u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const right = this._r.crossVectors(f, up).normalize();
    const p = camera.position;
    const wy = WORLD.waterY;
    if (camera.isOrthographicCamera) {
      const hh = (camera.top - camera.bottom) / 2 / camera.zoom;
      const hw = (camera.right - camera.left) / 2 / camera.zoom;
      const fy = Math.min(f.y, -0.05);
      const t0 = Math.max(camera.near, (p.y - hh * Math.abs(up.y) - this.maxHeight) / -fy - 50);
      const t1 = Math.min(camera.far, (p.y + hh * Math.abs(up.y) - wy) / -fy + 50);
      let k = 0;
      for (const t of [t0, t1]) {
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            c[k++].copy(p).addScaledVector(f, t).addScaledVector(right, sx * hw).addScaledVector(up, sy * hh);
          }
        }
      }
      return c;
    }
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    const altitude = Math.max(10, p.y);
    let far = Math.min(camera.far, THREE.MathUtils.clamp(altitude * 6, 700, 5200));
    // If every corner ray hits the ground, stop there.
    let maxGround = 0;
    let allDown = true;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const dy = f.y + up.y * sy * tanV;
        if (dy >= -0.01) allDown = false;
        else maxGround = Math.max(maxGround, (p.y - wy) / -dy);
      }
    }
    if (allDown) far = Math.min(far, maxGround + 100);
    const near = Math.max(camera.near, 1);
    let k = 0;
    for (const t of [near, far]) {
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          c[k++].copy(p).addScaledVector(f, t).addScaledVector(right, sx * t * tanH).addScaledVector(up, sy * t * tanV);
        }
      }
    }
    return c;
  }

  fitShadow(camera) {
    const corners = this.frustumCorners(camera);
    const inv = this._rotInv;
    const v = this._v;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      v.copy(c).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    // Scene bounds in light space.
    const h = WORLD.half;
    let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity, sMinZ = Infinity, sMaxZ = -Infinity;
    for (const x of [-h, h]) {
      for (const y of [WORLD.waterY - 5, this.maxHeight + 10]) {
        for (const z of [-h, h]) {
          v.set(x, y, z).applyMatrix4(inv);
          sMinX = Math.min(sMinX, v.x); sMaxX = Math.max(sMaxX, v.x);
          sMinY = Math.min(sMinY, v.y); sMaxY = Math.max(sMaxY, v.y);
          sMinZ = Math.min(sMinZ, v.z); sMaxZ = Math.max(sMaxZ, v.z);
        }
      }
    }
    minX = Math.max(minX, sMinX); maxX = Math.min(maxX, sMaxX);
    minY = Math.max(minY, sMinY); maxY = Math.min(maxY, sMaxY);
    if (!(maxX > minX && maxY > minY)) {
      minX = sMinX; maxX = sMaxX; minY = sMinY; maxY = sMaxY;
    }
    // Square, quantised extent + texel-snapped centre.
    let size = Math.max(maxX - minX, maxY - minY) * 1.02;
    const q = 64;
    size = Math.ceil(size / q) * q;
    const texel = size / MAP;
    const cx = Math.round((minX + maxX) / 2 / texel) * texel;
    const cy = Math.round((minY + maxY) / 2 / texel) * texel;

    const cam = this.sun.shadow.camera;
    cam.left = -size / 2;
    cam.right = size / 2;
    cam.bottom = -size / 2;
    cam.top = size / 2;
    cam.near = 1;
    cam.far = sMaxZ - sMinZ + 20;
    cam.updateProjectionMatrix();
    // Light positioned just "above" the scene along the light direction.
    v.set(cx, cy, sMaxZ + 10).applyMatrix4(this._rot);
    this.sun.position.copy(v);
    this.sun.target.position.copy(v).addScaledVector(this.dir, -100);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    this.sun.shadow.normalBias = texel * 1.5;
    this.texel = texel;
  }
}
