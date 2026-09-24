import * as THREE from 'three';
import { RNG } from '../util/rng.js';

// Volumetric cumulus for the sky, ray-marched through a layer of cloud
// 1.5-2.7 km up on a curved Earth. Density follows the usual recipe for
// real-time clouds: a coverage map of rounded cumulus cells clustered into
// fields, a height profile with flat bases and domed tops, billowy
// Perlin-Worley shapes, and finer Worley noise eroding the edges (wispy
// underneath, cauliflower on top). Light is marched towards the sun with a
// few octaves of multiple scattering, a silver lining round the sun and
// sky light from above; distant clouds fade into the horizon haze.
//
// The result depends only on direction (the camera moves a few hundred
// metres at most, the clouds are kilometres away), so it's rendered into a
// sky map indexed by azimuth and elevation, a strip per frame (mostly the
// strips in view), and every camera that sees the sky (the view,
// reflections, environment maps) just looks it up.

export const MAP_W = 3072;
export const MAP_H = 1024;
const STRIPS = 24;
const N = 64; // noise texture size

// ------------------------------------------------------------ noise

// Tileable Worley (cellular) noise, inverted so cells are round blobs.
function worley(rng, freq) {
  const pts = new Float32Array(freq ** 3 * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = rng.next();
  const out = new Float32Array(N ** 3);
  const k = freq / N;
  let i = 0;
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const px = (x + 0.5) * k;
        const py = (y + 0.5) * k;
        const pz = (z + 0.5) * k;
        const cx = Math.floor(px);
        const cy = Math.floor(py);
        const cz = Math.floor(pz);
        let md = 9;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = cz + dz;
          const wz = (nz + freq) % freq;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            const wy = (ny + freq) % freq;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const j = ((wz * freq + wy) * freq + ((nx + freq) % freq)) * 3;
              const ex = nx + pts[j] - px;
              const ey = ny + pts[j + 1] - py;
              const ez = nz + pts[j + 2] - pz;
              const d = ex * ex + ey * ey + ez * ez;
              if (d < md) md = d;
            }
          }
        }
        out[i++] = 1 - Math.min(1, Math.sqrt(md));
      }
    }
  }
  return out;
}

// Tileable Perlin fbm, 0..1.
function perlin(rng, period, octaves) {
  const out = new Float32Array(N ** 3);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const P = period << o;
    const g = new Float32Array(P ** 3 * 3);
    for (let i = 0; i < P ** 3; i++) {
      const u = rng.next() * 2 - 1;
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      g[i * 3] = r * Math.cos(a);
      g[i * 3 + 1] = r * Math.sin(a);
      g[i * 3 + 2] = u;
    }
    const s = P / N;
    const dot = (ix, iy, iz, fx, fy, fz) => {
      const j = ((((iz % P) * P + (iy % P)) * P) + (ix % P)) * 3;
      return g[j] * fx + g[j + 1] * fy + g[j + 2] * fz;
    };
    let i = 0;
    for (let z = 0; z < N; z++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const px = x * s;
          const py = y * s;
          const pz = z * s;
          const ix = Math.floor(px);
          const iy = Math.floor(py);
          const iz = Math.floor(pz);
          const fx = px - ix;
          const fy = py - iy;
          const fz = pz - iz;
          const u = fade(fx);
          const v = fade(fy);
          const w = fade(fz);
          const l = (a, b, t) => a + (b - a) * t;
          const n = l(
            l(l(dot(ix, iy, iz, fx, fy, fz), dot(ix + 1, iy, iz, fx - 1, fy, fz), u), l(dot(ix, iy + 1, iz, fx, fy - 1, fz), dot(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz), u), v),
            l(l(dot(ix, iy, iz + 1, fx, fy, fz - 1), dot(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1), u), l(dot(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1), dot(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1), u), v),
            w,
          );
          out[i++] += amp * n;
        }
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (out[i] / total) * 0.9 + 0.5));
  return out;
}

// RGBA: Perlin-Worley (billowy base shapes), then Worley at 4, 8 and 16
// cells per tile (round cells for the coverage map, and the fbm used both
// for the base shapes and, sampled finer, to erode the edges).
let noiseTex = null;
function cloudNoise() {
  if (noiseTex) return noiseTex;
  const rng = new RNG(8675309);
  const w4 = worley(rng, 4);
  const w8 = worley(rng, 8);
  const w16 = worley(rng, 16);
  const p = perlin(rng, 4, 4);
  const data = new Uint8Array(N ** 3 * 4);
  for (let i = 0; i < N ** 3; i++) {
    const wf = w4[i] * 0.625 + w8[i] * 0.25 + w16[i] * 0.125;
    data[i * 4] = Math.round(255 * (wf + p[i] * (1 - wf)) * 0.9);
    data[i * 4 + 1] = Math.round(255 * w4[i]);
    data[i * 4 + 2] = Math.round(255 * w8[i]);
    data[i * 4 + 3] = Math.round(255 * w16[i]);
  }
  noiseTex = new THREE.Data3DTexture(data, N, N, N);
  noiseTex.format = THREE.RGBAFormat;
  noiseTex.type = THREE.UnsignedByteType;
  noiseTex.wrapS = noiseTex.wrapT = noiseTex.wrapR = THREE.RepeatWrapping;
  noiseTex.minFilter = noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.generateMipmaps = false;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// ------------------------------------------------------------ shader

const frag = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uNoise;
uniform vec2 uSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec2 uOffset;
uniform float uTime;
uniform float uCoverage;
uniform float uCellSize;
uniform float uFrame;
out vec4 fragColor;

const float PI = 3.14159265;
const float R = 6360000.0;
const float BASE = 1500.0;
const float TOP = 2700.0;
const float EYE = 60.0;
const float SIGMA = 0.045;

float hash( vec2 p ) {
  p = fract( p * vec2( 443.897, 441.423 ) );
  p += dot( p, p.yx + 19.19 );
  return fract( ( p.x + p.y ) * p.x );
}
float remap( float v, float a, float b, float c, float d ) {
  return c + ( v - a ) * ( d - c ) / ( b - a );
}
// Height above the (curved) ground.
float altitude( vec3 p ) {
  return p.y + dot( p.xz, p.xz ) / ( 2.0 * R );
}
// Distance along d from the eye to the sphere of altitude h (above the eye).
float shell( float h, vec3 d ) {
  float b = ( R + EYE ) * d.y;
  float c = ( h - EYE ) * ( 2.0 * R + EYE + h );
  return c / ( b + sqrt( b * b + c ) );
}
// Henyey-Greenstein phase.
float hg( float mu, float g ) {
  float g2 = g * g;
  return ( 1.0 - g2 ) / ( 4.0 * PI * pow( 1.0 + g2 - 2.0 * g * mu, 1.5 ) );
}

// Cloud density at p (world metres, eye at the origin).
float density( vec3 p, bool detail ) {
  float h = altitude( p );
  float hf = ( h - BASE ) / ( TOP - BASE );
  if ( hf <= 0.0 || hf >= 1.0 ) return 0.0;
  vec2 w = p.xz + uOffset;
  // Coverage: round cumulus cells of two sizes, gathered into fields.
  // Worley falls off linearly from each cell's centre (a cone); squaring
  // the distance makes a dome, so the clouds get rounded tops.
  float g1 = 1.0 - texture( uNoise, vec3( w / uCellSize, 0.31 ) ).g;
  float g2 = 1.0 - texture( uNoise, vec3( w / ( uCellSize * 0.43 ) + 0.37, 0.62 ) ).b;
  float cells = ( 1.0 - g1 * g1 ) * 0.72 + ( 1.0 - g2 * g2 ) * 0.28;
  float fields = texture( uNoise, vec3( w / ( uCellSize * 7.0 ), 0.83 ) ).r;
  float cov = clamp( remap( cells * mix( 0.8, 1.15, fields ), 1.0 - uCoverage * uCoverage, 1.0, 0.0, 1.0 ), 0.0, 1.0 );
  if ( cov <= 0.0 ) return 0.0;
  // Tall towers where the cells are strong, low puffs elsewhere; flat
  // bases, rounded tops.
  float top = mix( 0.35, 1.0, smoothstep( 0.1, 0.8, cov ) );
  float prof = smoothstep( 0.0, 0.06, hf ) * sqrt( clamp( 1.0 - ( hf / top ) * ( hf / top ), 0.0, 1.0 ) );
  // Billows at two scales (the smaller ones only close up, where they
  // don't alias).
  float near = 1.0 - smoothstep( 6000.0, 20000.0, length( p.xz ) );
  vec3 q = vec3( w.x, h - uTime * 0.8, w.y ) / 2600.0;
  vec4 n = texture( uNoise, q );
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float shape = remap( n.r, fbm - 1.0, 1.0, 0.0, 1.0 );
  if ( detail && near > 0.0 ) {
    vec4 n2 = texture( uNoise, q * 2.7 + vec3( 0.43, 0.17, 0.61 ) );
    shape = mix( shape, remap( n2.r, n2.g - 1.0, 1.0, 0.0, 1.0 ), 0.3 * near );
  }
  float c = remap( shape * prof, 1.0 - cov, 1.0, 0.0, 1.0 ) * cov;
  if ( c <= 0.0 ) return 0.0;
  // Fine erosion (wispy underneath, billowy above), also only close up.
  if ( detail && near > 0.0 ) {
    vec4 dn = texture( uNoise, vec3( w.x + uTime * 2.0, h, w.y ) / 520.0 );
    float dfbm = dn.g * 0.625 + dn.b * 0.25 + dn.a * 0.125;
    float erode = mix( 1.0 - dfbm, dfbm, clamp( hf * 5.0, 0.0, 1.0 ) );
    c = remap( c, erode * 0.5 * near, 1.0, 0.0, 1.0 );
  }
  return clamp( c, 0.0, 1.0 );
}

// Optical depth towards the sun (coarse shapes are enough for shadows).
float sunDepth( vec3 p ) {
  float od = 0.0;
  float s = 70.0;
  for ( int i = 0; i < 4; i++ ) {
    p += uSunDir * s;
    od += density( p, false ) * s;
    s *= 2.2;
  }
  // Light reaches further in than a straight Beer's law would allow (it
  // scatters its way through), which keeps the lit side soft instead of a
  // thin bright shell.
  return od * SIGMA * 0.6;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float az = ( uv.x - 0.5 ) * 2.0 * PI;
  float el = pow( uv.y, 1.0 / 0.7 ) * 0.5 * PI;
  vec3 d = vec3( cos( el ) * sin( az ), sin( el ), cos( el ) * cos( az ) );
  float t0 = shell( BASE, d );
  float t1 = min( shell( TOP, d ), t0 + 24000.0 );
  if ( t0 > 70000.0 ) {
    fragColor = vec4( 0.0 );
    return;
  }
  // Short paths straight up need fewer steps than long ones at the horizon.
  int steps = int( clamp( ( t1 - t0 ) / 80.0, 18.0, 52.0 ) );
  float dt = ( t1 - t0 ) / float( steps );
  float t = t0 + dt * fract( hash( gl_FragCoord.xy ) + uFrame * 0.618034 );
  float mu = dot( d, uSunDir );
  vec3 scat = vec3( 0.0 );
  float T = 1.0;
  float hit = -1.0;
  for ( int i = 0; i < steps; i++ ) {
    vec3 p = vec3( 0.0, EYE, 0.0 ) + d * t;
    float den = density( p, true );
    if ( den > 0.002 ) {
      if ( hit < 0.0 ) hit = t;
      float od = sunDepth( p );
      float hf = clamp( ( altitude( p ) - BASE ) / ( TOP - BASE ), 0.0, 1.0 );
      // Multiple scattering: each octave is dimmer, sees through more, and
      // scatters more evenly.
      float sun = 0.0;
      float a = 1.0;
      float b = 1.0;
      float c = 1.0;
      for ( int k = 0; k < 3; k++ ) {
        float phase = mix( hg( mu, 0.45 * c ), hg( mu, -0.2 * c ), 0.35 );
        sun += a * exp( -od * b ) * phase;
        a *= 0.5;
        b *= 0.35;
        c *= 0.5;
      }
      // Thin, unlit-from-inside edges look darker except towards the sun
      // (the "powder" effect).
      float powder = mix( 1.0 - exp( -od * 2.0 ), 1.0, 0.35 + 0.45 * max( mu, 0.0 ) );
      vec3 amb = mix( vec3( 0.34, 0.38, 0.46 ), mix( uZenith, vec3( 1.0 ), 0.5 ) * 0.75, hf );
      vec3 S = uSunColor * sun * 6.0 * powder + amb;
      float ext = max( den * SIGMA, 1e-6 );
      float Ts = exp( -ext * dt );
      scat += T * S * ( 1.0 - Ts );
      T *= Ts;
      if ( T < 0.015 ) break;
    }
    t += dt;
  }
  if ( hit > 0.0 ) {
    // Aerial perspective: far clouds melt into the horizon haze.
    float fog = 1.0 - exp( -hit / 26000.0 );
    scat = mix( scat, uHorizon * 1.05 * ( 1.0 - T ), fog );
  }
  fragColor = vec4( scat, 1.0 - T );
}`;

// Direction -> map coordinates (must match main() above); for the sky shader.
export const LOOKUP_GLSL = /* glsl */ `
vec2 cloudUV( vec3 d ) {
  return vec2( atan( d.x, d.z ) / 6.2831853 + 0.5, pow( clamp( asin( clamp( d.y, 0.0, 1.0 ) ) / 1.5707963, 0.0, 1.0 ), 0.7 ) );
}`;

export class CloudMap {
  // shared: the sky's uniforms (sun, zenith and horizon colours).
  constructor(shared) {
    this.rt = new THREE.WebGLRenderTarget(MAP_W, MAP_H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
    this.uniforms = {
      uNoise: { value: cloudNoise() },
      uSize: { value: new THREE.Vector2(MAP_W, MAP_H) },
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uZenith: shared.uZenith,
      uHorizon: shared.uHorizon,
      uOffset: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uCoverage: { value: 0.5 },
      uCellSize: { value: 11000 },
      uFrame: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.uniforms,
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
    });
    // Each refresh is blended over the last, so the ray-march jitter (it
    // changes every time) averages out instead of showing as grain.
    this.blend = {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ConstantAlphaFactor,
      blendDst: THREE.OneMinusConstantAlphaFactor,
      blendSrcAlpha: THREE.ConstantAlphaFactor,
      blendDstAlpha: THREE.OneMinusConstantAlphaFactor,
      blendAlpha: 0.3,
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.strip = 0;
    this.frame = 0;
    this._d = new THREE.Vector3();
  }

  // Which strip to refresh: usually the next one in view, every few frames
  // the next one round the whole sky.
  nextStrip(camera) {
    this.frame++;
    const d = camera ? camera.getWorldDirection(this._d) : null;
    if (!d || this.frame % 5 === 0 || d.y > 0.8) return (this.strip = (this.strip + 1) % STRIPS);
    const yaw = Math.atan2(d.x, d.z);
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 60) / 2) * (camera.aspect ?? 1.8)) + 0.25;
    const a = Math.floor(((yaw - half) / (Math.PI * 2) + 0.5) * STRIPS);
    const b = Math.floor(((yaw + half) / (Math.PI * 2) + 0.5) * STRIPS);
    this.inView = ((this.inView ?? 0) + 1) % (b - a + 1);
    return (this.strip = (((a + this.inView) % STRIPS) + STRIPS) % STRIPS);
  }

  get texture() {
    return this.rt.texture;
  }

  // One strip per call, or the whole sky (from scratch: a few passes, the
  // first unblended).
  render(renderer, all = false, camera = null) {
    const prev = renderer.getRenderTarget();
    const w = MAP_W / STRIPS;
    const mat = this.quad.material;
    const passes = all ? STRIPS * 3 : 1;
    for (let k = 0; k < passes; k++) {
      if (all) this.strip = (this.strip + 1) % STRIPS;
      else this.nextStrip(camera);
      const fresh = all && k < STRIPS;
      if (fresh) mat.blending = THREE.NoBlending;
      else Object.assign(mat, this.blend);
      this.uniforms.uFrame.value = (this.uniforms.uFrame.value + 1) % 1000;
      this.rt.viewport.set(this.strip * w, 0, w, MAP_H);
      this.rt.scissor.set(this.strip * w, 0, w, MAP_H);
      this.rt.scissorTest = true;
      renderer.setRenderTarget(this.rt);
      renderer.render(this.scene, this.camera);
    }
    renderer.setRenderTarget(prev);
  }
}
