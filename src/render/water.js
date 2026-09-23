import * as THREE from 'three';
import { WORLD } from '../config.js';

// Calm, pale water with a planar reflection. Works for both perspective and
// orthographic cameras: the reflection camera is a mirrored copy and the
// water samples it through a projective texture matrix. Geometry below the
// water plane is removed with a global clipping plane during that render.

export class Water {
  constructor(look) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.rt.texture.generateMipmaps = false;
    this.scale = 0.5;
    this.uniforms = {
      tReflection: { value: this.rt.texture },
      uTexMatrix: { value: new THREE.Matrix4() },
      uWaterColor: { value: new THREE.Color(look.waterColor) },
      uReflect: { value: look.waterReflect },
      uIntensity: { value: 2.0 },
      uTime: { value: 0 },
      uDistort: { value: 0.006 },
      uCamDir: { value: new THREE.Vector3(0, -1, 0) },
      uOrtho: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform mat4 uTexMatrix;
        varying vec4 vRefl;
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4( position, 1.0 );
          vWorld = wp.xyz;
          vRefl = uTexMatrix * wp;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tReflection;
        uniform vec3 uWaterColor;
        uniform float uReflect;
        uniform float uIntensity;
        uniform float uTime;
        uniform float uDistort;
        uniform vec3 uCamDir;
        uniform float uOrtho;
        varying vec4 vRefl;
        varying vec3 vWorld;

        float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float vnoise( vec2 p ) {
          vec2 i = floor( p ); vec2 f = fract( p );
          vec2 u = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ),
                      mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
        }

        void main() {
          vec2 p = vWorld.xz;
          vec2 w = vec2( vnoise( p * 0.03 + uTime * 0.05 ), vnoise( p * 0.03 + 17.0 - uTime * 0.04 ) ) - 0.5;
          w += 0.5 * ( vec2( vnoise( p * 0.13 - uTime * 0.09 ), vnoise( p * 0.13 + 5.0 + uTime * 0.08 ) ) - 0.5 );
          vec4 uv = vRefl;
          uv.xy += w * uDistort * uv.w;
          vec3 refl = texture2DProj( tReflection, uv ).rgb;
          vec3 V = uOrtho > 0.5 ? -uCamDir : normalize( cameraPosition - vWorld );
          float fres = pow( 1.0 - clamp( V.y, 0.0, 1.0 ), 4.0 );
          float r = clamp( uReflect * ( 0.6 + 0.4 * fres ), 0.0, 1.0 );
          vec3 col = mix( uWaterColor * uIntensity, refl, r );
          gl_FragColor = vec4( col, 1.0 );
        }`,
    });
    const geo = new THREE.PlaneGeometry(240000, 240000, 16, 16);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.position.y = WORLD.waterY;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = 'water';

    this.persp = new THREE.PerspectiveCamera();
    this.ortho = new THREE.OrthographicCamera();
    this.clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -WORLD.waterY)];
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(4, Math.round(w * this.scale)), Math.max(4, Math.round(h * this.scale)));
  }

  render(renderer, scene, camera, sky) {
    const wy = WORLD.waterY;
    const vc = camera.isOrthographicCamera ? this.ortho : this.persp;
    camera.updateMatrixWorld();
    const p = this._p.setFromMatrixPosition(camera.matrixWorld);
    const t = this._t;
    camera.getWorldDirection(t).add(p);
    const up = this._u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    vc.position.set(p.x, 2 * wy - p.y, p.z);
    vc.up.set(up.x, -up.y, up.z);
    vc.lookAt(t.x, 2 * wy - t.y, t.z);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    this.uniforms.uTexMatrix.value.copy(this._bias).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    camera.getWorldDirection(this.uniforms.uCamDir.value);
    this.uniforms.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;

    const prevTarget = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    this.mesh.visible = false;
    sky.update(vc);
    renderer.clippingPlanes = this.clip;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    renderer.clippingPlanes = prevClip;
    this.mesh.visible = true;
    sky.update(camera);
  }
}
