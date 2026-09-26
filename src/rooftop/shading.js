import * as THREE from 'three';

// Shader additions for rooftop surfaces:
//   weather(material, amount) - large-scale grime in world space, so the
//     tiling of the textures never shows: blotches and water marks on flat
//     surfaces, rain streaks running down walls.
//   wallMaterial(cladding, layout) - wall cladding with whole windows laid
//     out on every face (see Builder.faceBox): frames, dark glass that
//     reflects the sky, the odd blind, a shadow under each head.

const NOISE = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNor;
uniform float uGrime;
float wHash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
float wNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wHash( i ), wHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( wHash( i + vec2( 0.0, 1.0 ) ), wHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float wGrime( vec3 p, vec3 n ) {
  float vert = 1.0 - abs( n.y );
  float g = wNoise( p.xz * 0.09 + p.y * 0.05 ) * 0.55 + wNoise( p.xz * 0.31 + p.y * 0.17 + 7.0 ) * 0.3 + wNoise( p.xz * 1.1 + 3.0 ) * 0.15;
  float along = abs( n.x ) > abs( n.z ) ? p.z : p.x;
  float st = wNoise( vec2( along * 1.6, p.y * 0.09 ) ) * 0.6 + wNoise( vec2( along * 4.1, p.y * 0.23 + 3.0 ) ) * 0.4;
  return mix( smoothstep( 0.5, 0.92, g ), max( smoothstep( 0.52, 0.9, st ) * 0.85, smoothstep( 0.62, 0.95, g ) * 0.5 ), vert );
}`;

const VERT = /* glsl */ `
vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vWNor = normalize( mat3( modelMatrix ) * objectNormal );`;

const GRIME = /* glsl */ `
diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.78, 0.76, 0.72 ), wGrime( vWPos, vWNor ) * uGrime );`;

export function weather(mat, amount) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uGrime = { value: amount };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;').replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT}`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`).replace('#include <color_fragment>', `#include <color_fragment>\n${GRIME}`);
  };
  mat.customProgramCacheKey = () => 'rt-weather';
  return mat;
}

// layout: { pitch, width, height, storey, sill, margin, top, ribbon }
export function wallMaterial(cladding, layout, { color = '#ffffff', roughness = 0.6, grime = 0.55 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: cladding.map, normalMap: cladding.normalMap, color, roughness, metalness: 0 });
  const L = { sill: 0.9, margin: 0.9, top: 1.4, ribbon: false, ...layout };
  m.onBeforeCompile = (s) => {
    s.uniforms.uGrime = { value: grime };
    s.uniforms.uWin = { value: new THREE.Vector4(L.pitch, L.width, L.height, L.storey) };
    s.uniforms.uWin2 = { value: new THREE.Vector4(L.sill, L.margin, L.top, L.ribbon ? 1 : 0) };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFace;\nvarying vec2 vFace;\nvarying vec2 vLocal;\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvFace = aFace;\nvLocal = uv;\n${VERT}`);
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${NOISE}
        uniform vec4 uWin;
        uniform vec4 uWin2;
        varying vec2 vFace;
        varying vec2 vLocal;
        // Coverage of [lo, hi] by a pixel of width fw centred on x (a box filter).
        float wBand( float x, float lo, float hi, float fw ) {
          return clamp( ( min( x + fw * 0.5, hi ) - max( x - fw * 0.5, lo ) ) / fw, 0.0, 1.0 );
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${GRIME}
        float cWin = 0.0;
        {
          if ( abs( vWNor.y ) < 0.5 ) {
            float P = uWin.x;
            float WH = uWin.z;
            float S = uWin.w;
            float SILL = uWin2.x;
            float M = uWin2.y;
            float W = vFace.x;
            float H = vFace.y;
            bool ribbon = uWin2.w > 0.5;
            vec2 fw = max( fwidth( vLocal ), vec2( 1e-4 ) );
            // Whole windows only, centred on the face, none in the band
            // under the parapet.
            float ww = ribbon ? W - 2.0 * M : uWin.y;
            float n = ribbon ? 1.0 : floor( ( W - 2.0 * M - ww ) / P ) + 1.0;
            float rows = floor( ( H - uWin2.z - SILL - WH ) / S ) + 1.0;
            float ok = step( 0.5, n ) * step( 0.5, rows ) * step( 0.5, ww );
            float span = ( n - 1.0 ) * P + ww;
            float a = vLocal.x - ( W - span ) * 0.5;
            float k = clamp( floor( a / P ), 0.0, max( n - 1.0, 0.0 ) );
            float fa = a - k * P;
            float r = clamp( floor( vLocal.y / S ), 0.0, max( rows - 1.0, 0.0 ) );
            float fy = vLocal.y - r * S - SILL;
            float win = wBand( fa, 0.0, ww, fw.x ) * wBand( fy, 0.0, WH, fw.y ) * ok;
            float frame = wBand( fa, -0.08, ww + 0.08, fw.x ) * wBand( fy, -0.1, WH + 0.08, fw.y ) * ok - win;
            if ( ribbon ) {
              float mull = 1.0 - wBand( mod( fa, 1.5 ), 0.035, 1.465, fw.x );
              frame += win * mull;
              win *= 1.0 - mull;
            }
            // Where windows get smaller than a pixel, use their average.
            float far = smoothstep( 0.25, 0.7, max( fw.x / ( ribbon ? 1.5 : P ), fw.y / S ) );
            win = mix( win, ( ww / max( ribbon ? ww : P, 0.01 ) ) * ( WH / S ) * 0.85 * ok, far );
            frame = mix( frame, 0.12 * ok, far );
            float id = wHash( vec2( k, r ) + floor( vWPos.xz * 0.05 ) * 3.1 );
            float head = mix( 1.0, 0.45, smoothstep( WH - 0.55, WH, fy ) * ( 1.0 - far ) );
            vec3 glass = mix( vec3( 0.04, 0.052, 0.068 ), vec3( 0.46, 0.47, 0.45 ), step( 0.84, id ) * ( 1.0 - far ) ) * head;
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.72, 0.74, 0.76 ), clamp( frame, 0.0, 1.0 ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, glass, win );
            cWin = win;
          }
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.07, cWin );
        metalnessFactor = mix( metalnessFactor, 0.5, cWin );`,
      )
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * ( 1.0 - cWin );'))
      // Glass reflects the sky; the cladding takes a little of it as fill.
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n        iblIrradiance *= 0.12;\n        radiance *= mix( 0.08, 1.0, cWin );');
  };
  m.customProgramCacheKey = () => `rt-wall-${L.ribbon ? 'r' : 'p'}`;
  return m;
}
