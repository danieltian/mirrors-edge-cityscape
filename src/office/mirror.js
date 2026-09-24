import * as THREE from 'three';

// Planar reflection of the ground floor (y = 0) for the polished tiles. The
// scene is rendered from a camera mirrored in the floor into a mip-mapped
// half-resolution target; floor materials sample it through a projective
// matrix, blurring by their roughness. Works for perspective and
// orthographic cameras.

export class FloorMirror {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.scale = 0.5;
    this.uniforms = {
      uMirror: { value: this.rt.texture },
      uMirrorMatrix: { value: new THREE.Matrix4() },
      uMirrorAmt: { value: 0.32 },
      uMirrorOn: { value: 0 },
    };
    this.persp = new THREE.PerspectiveCamera();
    this.ortho = new THREE.OrthographicCamera();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.008);
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(4, Math.round(w * this.scale)), Math.max(4, Math.round(h * this.scale)));
  }

  render(renderer, scene, camera, sky, clipPlanes = []) {
    const vc = camera.isOrthographicCamera ? this.ortho : this.persp;
    camera.updateMatrixWorld();
    const p = this._p.setFromMatrixPosition(camera.matrixWorld);
    const t = camera.getWorldDirection(this._t).add(p);
    const up = this._u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    vc.position.set(p.x, -p.y, p.z);
    vc.up.set(up.x, -up.y, up.z);
    vc.lookAt(t.x, -t.y, t.z);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.uniforms.uMirrorMatrix.value.copy(this._bias).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    const prevTarget = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    this.uniforms.uMirrorOn.value = 0;
    sky.update(vc);
    renderer.clippingPlanes = [this.plane, ...clipPlanes];
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    renderer.clippingPlanes = prevClip;
    sky.update(camera);
    this.uniforms.uMirrorOn.value = 1;
  }

  dispose() {
    this.rt.dispose();
  }
}
