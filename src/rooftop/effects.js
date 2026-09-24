import * as THREE from 'three';

// Moving parts of the rooftops: fan blades spinning in their wells, and
// steam drifting off vents, exhaust stacks and cooling towers (and a few
// roofs out in the city).

// ------------------------------------------------------------ fans

// Five swept blades round a hub, facing +z, radius 1.
function bladeGeometry() {
  const shapes = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const rot = (x, y) => new THREE.Vector2(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    const s = new THREE.Shape();
    const p0 = rot(0.12, -0.07);
    s.moveTo(p0.x, p0.y);
    const c1 = rot(0.55, -0.36);
    const e1 = rot(0.93, -0.12);
    s.quadraticCurveTo(c1.x, c1.y, e1.x, e1.y);
    const c2 = rot(0.62, 0.16);
    const e2 = rot(0.12, 0.09);
    s.quadraticCurveTo(c2.x, c2.y, e2.x, e2.y);
    shapes.push(s);
  }
  const hub = new THREE.Shape();
  hub.absarc(0, 0, 0.16, 0, Math.PI * 2);
  shapes.push(hub);
  return new THREE.ShapeGeometry(shapes, 6);
}

export function createFans(list) {
  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardMaterial({ color: '#5d6166', roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  mesh.count = list.length;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'fans';
  const angle = list.map((_, i) => (i * 2.39996) % (Math.PI * 2));
  const spin = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const place = () => {
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      spin.makeRotationZ(angle[i]).scale(new THREE.Vector3(f.r, f.r, 1));
      mesh.setMatrixAt(i, m.multiplyMatrices(f.base, spin));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  place();
  return {
    mesh,
    update(dt) {
      if (!list.length || dt <= 0) return;
      for (let i = 0; i < list.length; i++) angle[i] = (angle[i] + list[i].speed * dt) % (Math.PI * 2);
      place();
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

// ------------------------------------------------------------ steam

// Stateless GPU particles: every puff's position, size and fade follow from
// its emitter, a phase and the time, so nothing is simulated on the CPU.
// Puffs rise and slow, get carried off by the wind and spread as they go;
// they're lit like soft spheres (white towards the sun, sky-blue in shade).

const steamVert = /* glsl */ `
attribute vec4 aEmitter; // x, y, z, opening radius
attribute vec4 aPuff; // phase, life (s), size, seed
uniform float uTime;
uniform vec3 uWind;
varying vec2 vCorner;
varying vec2 vNoise;
varying float vAlpha;
varying float vSeed;

void main() {
  float life = aPuff.y;
  float a = fract( uTime / life + aPuff.x );
  float t = a * life;
  float s = aPuff.z;
  float seed = aPuff.w;
  vec3 p = aEmitter.xyz;
  float ang = seed * 43.98;
  p.xz += vec2( cos( ang ), sin( ang ) ) * aEmitter.w * fract( seed * 13.7 ) * 0.7;
  // Buoyant rise that slows, then the wind takes over.
  p.y += s * 1.5 * ( 1.0 - exp( -t * 0.7 ) ) / 0.7;
  p += uWind * t * ( 0.25 + 0.75 * a ) * ( 0.8 + 0.4 * fract( seed * 7.1 ) );
  p.x += sin( t * 1.3 + seed * 40.0 ) * 0.22 * s * a;
  p.z += cos( t * 1.1 + seed * 23.0 ) * 0.22 * s * a;
  float size = s * ( 0.2 + 1.35 * a ) * ( 0.85 + 0.3 * fract( seed * 3.3 ) );
  vAlpha = smoothstep( 0.0, 0.12, a ) * pow( 1.0 - a, 1.4 );
  vSeed = seed;
  vCorner = position.xy;
  float rot = seed * 6.283 + t * ( fract( seed * 5.7 ) - 0.5 ) * 0.6;
  mat2 R = mat2( cos( rot ), sin( rot ), -sin( rot ), cos( rot ) );
  vNoise = R * position.xy;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
}`;

const steamFrag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uLit;
uniform vec3 uShade;
uniform float uDensity;
varying vec2 vCorner;
varying vec2 vNoise;
varying float vAlpha;
varying float vSeed;

float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}

void main() {
  float r2 = dot( vCorner, vCorner );
  if ( r2 >= 1.0 ) discard;
  vec2 q = vNoise * 2.2 + vSeed * 17.0;
  float n = vnoise( q ) * 0.65 + vnoise( q * 2.3 ) * 0.35;
  float body = 1.0 - smoothstep( 0.15, 1.0, sqrt( r2 ) );
  float alpha = vAlpha * body * smoothstep( 0.2, 0.75, n + body * 0.35 ) * uDensity;
  if ( alpha < 0.004 ) discard;
  // Soft-sphere normal, taken from view space into the world.
  vec3 nv = vec3( vCorner, sqrt( 1.0 - r2 ) );
  vec3 nw = normalize( ( vec4( nv, 0.0 ) * viewMatrix ).xyz );
  float lit = clamp( dot( nw, uSunDir ) * 0.6 + 0.45, 0.0, 1.0 );
  gl_FragColor = vec4( mix( uShade, uLit, lit ), alpha );
}`;

// One material for every rooftop world: a hand-written shader recreated
// each time would get new shader ids in three.js and compile again.
let steamMat = null;

// emitters: [{ x, y, z, r, size }]; size ~0.7 (wisp) .. 3 (cooling tower),
// bigger for plumes out in the city.
export function createSteam(emitters, rng) {
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const E = [];
  const P = [];
  for (const e of emitters) {
    const n = Math.round(14 + 12 * Math.min(e.size, 5));
    const life = (3.5 + 1.5 * e.size) * rng.range(0.85, 1.15);
    for (let i = 0; i < n; i++) {
      E.push(e.x, e.y, e.z, e.r);
      P.push(i / n + rng.range(-0.3, 0.3) / n, life * rng.range(0.85, 1.15), e.size, rng.next());
    }
  }
  geo.setAttribute('aEmitter', new THREE.InstancedBufferAttribute(new Float32Array(E), 4));
  geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(P), 4));
  geo.instanceCount = E.length / 4;
  steamMat ??= new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector3(0.8, 0, 0.3) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uLit: { value: new THREE.Color(1.5, 1.5, 1.48) },
      uShade: { value: new THREE.Color(0.42, 0.58, 0.78) },
      uDensity: { value: 0.62 },
    },
    vertexShader: steamVert,
    fragmentShader: steamFrag,
    transparent: true,
    depthWrite: false,
  });
  const uniforms = steamMat.uniforms;
  uniforms.uTime.value = rng.range(0, 100);
  const mesh = new THREE.Mesh(geo, steamMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'steam';
  return {
    mesh,
    uniforms,
    update(dt) {
      uniforms.uTime.value += dt;
    },
    dispose() {
      quad.dispose();
      geo.dispose();
    },
  };
}
