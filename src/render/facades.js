import * as THREE from 'three';

// Facades for the city round the rooftops, drawn in the shader so every
// building can differ: glass curtain walls, punched windows in stone, brick
// or render, ribbon windows between spandrel bands, glass between piers,
// and deep concrete grids. Each instance carries its style (aLook: kind,
// storey height, window pitch, seed), its glass colour (aGlass) and its wall
// colour (instanceColor). Windows fade to their average colour where they
// get smaller than a pixel, and the glass is glossy so it picks up the sky.

// Each style's share of glass, for the distance fade.
const COVER = [0.72, 0.33, 0.58, 0.56, 0.6];

export const FACADE_STYLES = {
  curtain: {
    kind: 0,
    storey: [3.7, 4.2],
    pitch: [1.4, 1.8],
    walls: ['#dfe3e6', '#c3c9ce', '#e9ebec', '#9aa3aa', '#34383d'],
    glass: ['#4f7ea8', '#6d9cc4', '#3f7f86', '#5c8a78', '#7d8a93', '#3b4652', '#8a7560', '#9fb3c4', '#5a6f86'],
  },
  punched: {
    kind: 1,
    storey: [3.1, 3.6],
    pitch: [1.8, 3.1],
    walls: ['#efe9dc', '#e2d6bf', '#d4c3a3', '#c9b494', '#cfd1d2', '#b3b6b8', '#e8e4dc', '#f2f1ed', '#a45f45', '#8e5140', '#b87a5c', '#9c8b78'],
    wallWeights: [3, 3, 2, 1.5, 2, 1, 2, 3, 0.8, 0.5, 0.7, 0.6],
    glass: ['#3c4650', '#4d5a66', '#56687a', '#2f3a44'],
  },
  ribbon: {
    kind: 2,
    storey: [3.4, 3.9],
    pitch: [1.3, 1.9],
    walls: ['#f1f1ef', '#e3e1dc', '#d0d2d4', '#c4b9a8', '#a9adb1', '#e8dfcf'],
    glass: ['#45617c', '#5a7890', '#3d4b58', '#6a8aa4', '#4b6d6a'],
  },
  piers: {
    kind: 3,
    storey: [3.5, 4.0],
    pitch: [1.6, 2.4],
    walls: ['#ecebe7', '#d8d2c6', '#c7c9cb', '#a6a29c', '#e9e4d8', '#f4f4f2'],
    glass: ['#4b6a88', '#3e5566', '#5f7f99', '#3a4450', '#557a8a'],
  },
  grid: {
    kind: 4,
    storey: [3.3, 3.8],
    pitch: [1.6, 2.4],
    walls: ['#e7e3da', '#d6d0c4', '#bfc2c4', '#cfc6b6', '#efece6'],
    glass: ['#3e4c59', '#50657a', '#445566'],
  },
};

// A look for one building: which style (weighted by its height class) and
// its colours.
export function pickFacade(rng, cls) {
  const w = {
    tall: [['curtain', 5], ['piers', 2], ['ribbon', 1.2], ['grid', 1]],
    mid: [['punched', 3], ['ribbon', 2], ['grid', 1.6], ['piers', 1.5], ['curtain', 1.6]],
    low: [['punched', 4], ['ribbon', 1.5], ['grid', 1]],
  }[cls];
  const S = FACADE_STYLES[rng.weighted(w)];
  const wall = S.wallWeights ? rng.weighted(S.walls.map((c, i) => [c, S.wallWeights[i]])) : rng.pick(S.walls);
  return { kind: S.kind, storey: rng.range(...S.storey), pitch: rng.range(...S.pitch), seed: rng.next(), wall, glass: rng.pick(S.glass) };
}

export function cityFacadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aLook;
        attribute vec3 aGlass;
        varying vec3 vCPos;
        varying vec3 vCNor;
        varying vec4 vLook;
        varying vec3 vGlass;
        varying vec2 vSpan;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCPos = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;
        vCNor = normal;
        vLook = aLook;
        vGlass = aGlass;
        vSpan = vec2( ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).y, ( modelMatrix * instanceMatrix * vec4( 0.0, 1.0, 0.0, 1.0 ) ).y );`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCPos;
        varying vec3 vCNor;
        varying vec4 vLook;
        varying vec3 vGlass;
        varying vec2 vSpan;
        float fHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
        float fBox( vec2 f, vec2 lo, vec2 hi, vec2 w ) {
          vec2 a = smoothstep( lo - w, lo + w, f ) - smoothstep( hi - w, hi + w, f );
          return clamp( a.x, 0.0, 1.0 ) * clamp( a.y, 0.0, 1.0 );
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float cGlass = 0.0;
        {
          vec3 an = abs( vCNor );
          if ( an.y < 0.5 ) {
            float kind = vLook.x;
            float storey = vLook.y;
            float pitch = vLook.z;
            float seed = vLook.w;
            float along = an.x > 0.5 ? vCPos.z : vCPos.x;
            float y = vCPos.y - vSpan.x;
            float lobby = vSpan.x < 1.0 ? max( storey * 1.3, 4.4 ) : 0.0;
            vec2 cell = vec2( along / pitch, ( y - lobby ) / storey );
            vec2 f = fract( cell );
            vec2 id = floor( cell );
            vec2 w = min( fwidth( cell ), vec2( 0.5 ) );
            float g;
            vec3 spandrel = diffuseColor.rgb;
            if ( kind < 0.5 ) {
              g = fBox( f, vec2( 0.035, 0.0 ), vec2( 0.965, 0.8 ), w );
              spandrel = mix( diffuseColor.rgb, vGlass * 0.45, fBox( f, vec2( 0.035, -1.0 ), vec2( 0.965, 2.0 ), w ) );
            } else if ( kind < 1.5 ) {
              g = fBox( f, vec2( 0.22, 0.26 ), vec2( 0.78, 0.86 ), w );
            } else if ( kind < 2.5 ) {
              g = fBox( f, vec2( 0.02, 0.3 ), vec2( 0.98, 0.9 ), w );
            } else if ( kind < 3.5 ) {
              g = fBox( f, vec2( 0.3, 0.1 ), vec2( 0.97, 0.9 ), w );
            } else {
              g = fBox( f, vec2( 0.12, 0.14 ), vec2( 0.88, 0.86 ), w );
            }
            if ( y < lobby ) {
              // Shopfronts / lobby glazing along the street.
              vec2 sf = vec2( fract( along / ( pitch * 2.0 ) ), y / lobby );
              g = fBox( sf, vec2( 0.04, 0.06 ), vec2( 0.96, 0.8 ), min( fwidth( sf ), vec2( 0.5 ) ) );
              id = vec2( floor( along / ( pitch * 2.0 ) ), -7.0 );
              spandrel = diffuseColor.rgb * 0.8;
            }
            // Cornice / parapet band at the top.
            g *= 1.0 - smoothstep( vSpan.y - vSpan.x - 1.1, vSpan.y - vSpan.x - 1.0, y );
            // Tiny windows blend to their average.
            float far = smoothstep( 0.3, 0.7, max( w.x, w.y ) );
            float cover = kind < 0.5 ? ${COVER[0]} : kind < 1.5 ? ${COVER[1]} : kind < 2.5 ? ${COVER[2]} : kind < 3.5 ? ${COVER[3]} : ${COVER[4]};
            g = mix( g, cover, far );
            float h = fHash( id + seed * 17.0 );
            vec3 gc = vGlass * mix( 0.7 + 0.6 * h, 1.0, far );
            // Blinds and lit interiors in the odd window.
            gc = mix( gc, vec3( 0.78, 0.77, 0.72 ), step( 0.9, h ) * 0.55 * ( 1.0 - far ) );
            diffuseColor.rgb = mix( spandrel, gc, g );
            cGlass = kind < 0.5 ? max( g, 0.6 ) : g;
          } else {
            // Roofs: pale membrane and gravel.
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.74, 0.75, 0.76 ), 0.55 );
          }
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.14, cGlass );
        metalnessFactor = mix( metalnessFactor, vLook.x < 0.5 ? 0.55 : 0.3, cGlass );`,
      )
      // The glass reflects the sky at full strength, but walls take only a
      // little of it as fill light (the sun and sky lights do the rest).
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n        iblIrradiance *= 0.12;');
  };
  m.customProgramCacheKey = () => 'city-facade';
  return m;
}
