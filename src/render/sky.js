import * as THREE from 'three';
import { CloudMap, LOOKUP_GLSL } from './clouds.js';

// Gradient sky dome that follows the camera. It draws first without writing
// depth, so sky pixels keep depth = 1 and the fog pass can leave them alone.
//
// Optional weather (mall and rooftops): drifting volumetric cumulus (see
// clouds.js), and now and then an airliner crossing high overhead trailing
// twin contrails that spread and fade.

const glsl = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uIntensity;
uniform float uCloudOn;
uniform sampler2D uCloudMap;
uniform float uPlaneOn;
uniform vec3 uPlaneU;
uniform vec3 uPlaneV;
uniform vec3 uPlaneN;
uniform float uTrail;
varying vec3 vDir;

${LOOKUP_GLSL}

void main() {
  vec3 d = normalize( vDir );
  float h = clamp( d.y, 0.0, 1.0 );
  vec3 col = mix( uHorizon, uZenith, pow( h, 0.55 ) );
  float s = max( dot( d, uSunDir ), 0.0 );
  col += uSunColor * ( pow( s, 900.0 ) * 3.0 + pow( s, 24.0 ) * 0.14 + pow( s, 4.0 ) * 0.06 );

  // Airliner and its contrails, high above the clouds.
  if ( uPlaneOn > 0.5 && d.y > 0.0 ) {
    float across = dot( d, uPlaneN );
    float along = atan( dot( d, uPlaneV ), dot( d, uPlaneU ) ); // < 0 behind the plane
    float age = clamp( -along / uTrail, 0.0, 1.0 );
    if ( along < -0.004 && along > -uTrail ) {
      float spread = 0.0007 + 0.006 * age;
      float sep = 0.0011 * ( 1.0 - smoothstep( 0.0, 0.35, age ) );
      float line = exp( -pow( ( across - sep ) / spread, 2.0 ) ) + exp( -pow( ( across + sep ) / spread, 2.0 ) );
      float fade = ( 1.0 - age ) * ( 1.0 - age ) * smoothstep( 0.004, 0.02, -along ) * ( 0.0014 / spread + 0.12 );
      col = mix( col, vec3( 1.0, 0.99, 0.97 ) * ( 1.0 + 0.3 * s ), clamp( line * fade * 0.55, 0.0, 0.85 ) );
    }
    float dot2 = along * along + across * across;
    col = mix( col, vec3( 0.93, 0.94, 0.96 ), exp( -dot2 / 0.0000018 ) * 0.9 );
  }

  // Cumulus in front of everything else in the sky (premultiplied).
  if ( uCloudOn > 0.5 && d.y > 0.0 ) {
    vec4 c = texture2D( uCloudMap, cloudUV( d ) );
    col = col * ( 1.0 - c.a ) + c.rgb;
  }
  gl_FragColor = vec4( col * uIntensity, 1.0 );
}`;

export class Sky {
  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.97, 0.92) },
      uIntensity: { value: 2.4 },
      uCloudOn: { value: 0 },
      uCloudMap: { value: null },
      uPlaneOn: { value: 0 },
      uPlaneU: { value: new THREE.Vector3(1, 0, 0) },
      uPlaneV: { value: new THREE.Vector3(0, 0, 1) },
      uPlaneN: { value: new THREE.Vector3(0, 1, 0) },
      uTrail: { value: 0.7 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4( position, 1.0 );
          vDir = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: glsl,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';
    this.weather = null;
    this.plane = null;
  }

  // weather: null (clear gradient) or { rng, cover, scale, wind: [x, z],
  // planes: chance per crossing slot }. The cloud map is drawn in full by
  // the next renderClouds().
  setWeather(w) {
    this.weather = w;
    const u = this.uniforms;
    u.uCloudOn.value = w ? 1 : 0;
    u.uPlaneOn.value = 0;
    this.plane = null;
    if (!w) return;
    if (!this.clouds) {
      this.clouds = new CloudMap(u);
      u.uCloudMap.value = this.clouds.texture;
    }
    const cu = this.clouds.uniforms;
    cu.uCoverage.value = w.cover;
    cu.uCellSize.value = 20000 / w.scale;
    cu.uOffset.value.set(w.rng.range(0, 1e5), w.rng.range(0, 1e5));
    cu.uTime.value = w.rng.range(0, 1000);
    this.wind = new THREE.Vector2(...w.wind);
    this.fresh = true;
    this.nextPlane = w.rng.range(3, 25);
  }

  // Refreshes a strip of the cloud map (the whole map after a change of
  // weather); call once a frame before rendering.
  renderClouds(renderer, camera = null) {
    if (!this.weather) return;
    this.clouds.render(renderer, this.fresh, camera);
    this.fresh = false;
  }

  // A great circle across the sky: from the horizon up to a high point and
  // down the other side.
  launchPlane(rng) {
    const h = rng.range(0, Math.PI * 2);
    const e = THREE.MathUtils.degToRad(rng.range(38, 82));
    const T = new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
    const Ssd = new THREE.Vector3(-Math.sin(h), 0, Math.cos(h));
    const P = Ssd.multiplyScalar(Math.cos(e)).add(new THREE.Vector3(0, Math.sin(e), 0));
    this.plane = { P, T, N: new THREE.Vector3().crossVectors(P, T).normalize(), a: -1.45, speed: THREE.MathUtils.degToRad(rng.range(1.2, 2.2)) };
    this.uniforms.uTrail.value = rng.range(0.5, 0.9);
  }

  update(camera, dt = 0) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(camera.far * 0.9);
    const w = this.weather;
    if (!w) return;
    const u = this.uniforms;
    // Wind in metres per second (the weather gives it in old map units).
    const cu = this.clouds.uniforms;
    cu.uOffset.value.addScaledVector(this.wind, dt * 900);
    cu.uTime.value += dt;
    if (!this.plane) {
      this.nextPlane -= dt;
      if (this.nextPlane <= 0) {
        if (w.rng.chance(w.planes)) this.launchPlane(w.rng);
        this.nextPlane = w.rng.range(40, 110);
      }
      u.uPlaneOn.value = 0;
      return;
    }
    const p = this.plane;
    p.a += p.speed * dt;
    if (p.a > 1.45 + u.uTrail.value) {
      this.plane = null;
      return;
    }
    const c = Math.cos(p.a);
    const sn = Math.sin(p.a);
    u.uPlaneU.value.copy(p.P).multiplyScalar(c).addScaledVector(p.T, sn);
    u.uPlaneV.value.copy(p.P).multiplyScalar(-sn).addScaledVector(p.T, c);
    u.uPlaneN.value.copy(p.N);
    u.uPlaneOn.value = 1;
  }
}
