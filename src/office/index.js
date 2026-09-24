import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { generateOffice, FH, CEIL } from './generator.js';
import { NavGrid } from './nav.js';
import { bounceMaps } from './lightmap.js';
import * as TX from './textures.js';

// Builds a playable office floor: materials and merged meshes, the skyline
// outside, navigation grids for the ground floor and the mezzanine level,
// AABB queries (ray casts, camera collision) through a uniform grid, the
// bounce-light maps, and the isometric cut-away.

const UV_SCALE = {
  floorTile: 2.4,
  floorDark: 2.4,
  carpet: 2,
  carpetGray: 2,
  ceilLayIn: 2.4,
  ceilPerf: 2.4,
  wall: 2.4,
  wallPanel: 2.4,
  wallAccent: 2.4,
  wallAccent2: 2.4,
  concrete: [4.8, 2.4],
  wood: [2, 1],
};

// Shared shader hooks: bounce-light scaling for everything, the planar floor
// reflection for polished floors.
function patch(mat, U, mirror) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOfficeWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vOfficeWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    let frag = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vOfficeWorld;
      uniform sampler2D uBounce0;
      uniform sampler2D uBounce1;
      uniform vec2 uBounceMin;
      uniform vec2 uBounceSize;
      uniform float uBounceSplit;
      uniform float uBounceTint;
      uniform vec3 uBounceColor;
      ${mirror ? 'uniform sampler2D uMirror; uniform mat4 uMirrorMatrix; uniform float uMirrorAmt; uniform float uMirrorOn;' : ''}`,
    );
    frag = frag.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        vec2 buv = ( vOfficeWorld.xz - uBounceMin ) / uBounceSize;
        vec2 bm = mix( texture2D( uBounce0, buv ).rg, texture2D( uBounce1, buv ).rg, step( uBounceSplit, vOfficeWorld.y ) );
        vec3 tint = mix( vec3( 1.0 ), uBounceColor, bm.g * uBounceTint );
        reflectedLight.indirectDiffuse *= bm.r * 2.0 * tint;
      }`,
    );
    if (mirror) {
      frag = frag.replace(
        '#include <opaque_fragment>',
        `if ( uMirrorOn > 0.5 && abs( vOfficeWorld.y ) < 0.03 ) {
          vec3 wN = inverseTransformDirection( normal, viewMatrix );
          vec4 mc = uMirrorMatrix * vec4( vOfficeWorld, 1.0 );
          vec2 muv = mc.xy / mc.w + wN.xz * 0.035;
          vec3 refl = textureLod( uMirror, muv, roughnessFactor * 9.0 ).rgb;
          vec3 V = normalize( cameraPosition - vOfficeWorld );
          float fres = 0.04 + 0.96 * pow( 1.0 - clamp( dot( wN, V ), 0.0, 1.0 ), 5.0 );
          float k = uMirrorAmt * mix( 0.22, 1.0, fres ) * ( 1.0 - smoothstep( 0.1, 0.5, roughnessFactor ) );
          outgoingLight += refl * k;
        }
        #include <opaque_fragment>`,
      );
    }
    shader.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => (mirror ? 'office-mirror' : 'office');
}

// Skyline facades: window bays from an atlas, mapped from world position so
// scaled instances keep a constant bay size.
function facadeMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: '#f1f2f3', roughness: 0.85 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uFacade = { value: tex };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFPos;\nvarying vec3 vFNor;\nvarying float vFSeed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 fpos = vec4( position, 1.0 );
        vFSeed = 0.37;
        #ifdef USE_INSTANCING
          fpos = instanceMatrix * fpos;
          vFSeed = fract( sin( dot( instanceMatrix[ 3 ].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        #endif
        vFPos = ( modelMatrix * fpos ).xyz;
        vFNor = normal;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uFacade;\nvarying vec3 vFPos;\nvarying vec3 vFNor;\nvarying float vFSeed;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 an = abs( vFNor );
          if ( an.y < 0.5 ) {
            vec2 q = an.x > 0.5 ? vFPos.zy : vFPos.xy;
            vec2 cell = q / 3.6;
            float style = floor( vFSeed * 3.999 );
            vec2 base = vec2( mod( style, 2.0 ), floor( style / 2.0 ) ) * 0.5;
            vec2 auv = base + clamp( fract( cell ), 0.01, 0.99 ) * 0.5;
            vec3 t = textureGrad( uFacade, auv, dFdx( cell ) * 0.5, dFdy( cell ) * 0.5 ).rgb;
            float h = fract( sin( dot( floor( cell ) + vFSeed * 17.0, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
            vec3 glass = mix( vec3( 0.46, 0.55, 0.63 ), vec3( 0.74, 0.81, 0.87 ), h );
            diffuseColor.rgb *= mix( vec3( t.r ), glass, t.g );
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => 'office-facade';
  return m;
}

function createMaterials(o) {
  const pal = o.palette;
  const rng = new RNG((o.seed ^ 0x9e3779b9) >>> 0);
  const white = new THREE.Color('#f2f2ef');
  const tx = {
    tile: TX.floorTiles(false),
    tileDark: TX.floorTiles(true),
    carpet: TX.carpet(),
    layIn: TX.ceilingLayIn(),
    perf: TX.ceilingPerf(),
    wall: TX.wallTexture(false),
    panel: TX.wallTexture(true),
    concrete: TX.concrete(),
    wood: TX.wood(),
    brushed: TX.brushed(),
    leather: TX.leather(),
    diffuser: TX.diffuser(),
    scallop: TX.scallop(),
    exit: TX.exitSign(),
    facade: TX.facadeAtlas(),
  };
  // Per-office artwork (disposed with the office).
  const own = {
    art: [0, 1, 2, 3].map(() => TX.painting(rng, [pal.accent, pal.pop[0], pal.pop[1]])),
    screens: ['stairs', 'city', 'brand'].map((k) => TX.screen(o.company, pal.accent, k, rng)),
    logo: TX.logo(o.company, pal.accent),
    mono: TX.monogram(o.company, pal.accent),
    pylon: TX.pylon(o.company, pal.accent),
    desktop: TX.desktop(o.company, pal.accent),
  };
  const std = (p, ud = {}) => {
    const m = new THREE.MeshStandardMaterial(p);
    Object.assign(m.userData, ud);
    return m;
  };
  const noShadow = { castShadow: false };
  const leatherN = { normalMap: tx.leather.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) };
  const m = {
    white: std({ color: white, roughness: 0.8 }),
    whiteGloss: std({ color: white.clone().offsetHSL(0, 0, 0.02), roughness: 0.25 }),
    wall: std({ color: white, map: tx.wall.map, normalMap: tx.wall.normalMap, roughness: 0.85 }),
    wallPanel: std({ color: white, map: tx.panel.map, normalMap: tx.panel.normalMap, roughness: 0.8 }),
    wallAccent: std({ color: pal.accent, map: tx.panel.map, normalMap: tx.panel.normalMap, roughness: 0.75 }),
    wallAccent2: std({ color: pal.accent2, map: tx.panel.map, normalMap: tx.panel.normalMap, roughness: 0.75 }),
    concrete: std({ map: tx.concrete.map, normalMap: tx.concrete.normalMap, roughness: 0.88 }),
    plaster: std({ color: white, roughness: 0.92 }),
    deskTop: std({ color: '#d5d8da', roughness: 0.35 }),
    accent: std({ color: pal.accent, roughness: 0.6 }),
    accentGloss: std({ color: pal.accent, roughness: 0.3 }),
    accent2: std({ color: pal.accent2, roughness: 0.6 }),
    accentDark: std({ color: pal.dark, roughness: 0.6 }),
    upholstery: std({ color: pal.accent, roughness: 0.55, ...leatherN }),
    upholsteryWhite: std({ color: '#ecebe7', roughness: 0.6, ...leatherN }),
    leather: std({ color: '#262628', roughness: 0.42, ...leatherN }),
    black: std({ color: '#1b1b1d', roughness: 0.45 }),
    metal: std({ color: '#cfd3d8', metalness: 1, roughness: 1, roughnessMap: tx.brushed.roughnessMap }),
    darkMetal: std({ color: '#3a3e43', metalness: 0.7, roughness: 0.4 }),
    skirting: std({ color: '#707478', metalness: 0.4, roughness: 0.45 }),
    glass: std({ color: '#e3f0f6', transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0, depthWrite: false }, noShadow),
    frosted: std({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.5, depthWrite: false }, noShadow),
    emissive: std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2.6 }, noShadow),
    emissiveSoft: std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.4 }, noShadow),
    emissiveWarm: std({ color: '#ffe4b8', emissive: '#ffcf8a', emissiveIntensity: 1.6 }, noShadow),
    floorTile: std({ color: white, map: tx.tile.map, normalMap: tx.tile.normalMap, roughnessMap: tx.tile.roughnessMap, roughness: 1 }),
    floorDark: std({ map: tx.tileDark.map, normalMap: tx.tileDark.normalMap, roughnessMap: tx.tileDark.roughnessMap, roughness: 1 }),
    carpet: std({ map: tx.carpet.map, normalMap: tx.carpet.normalMap, color: pal.accent, roughness: 1 }),
    carpetGray: std({ map: tx.carpet.map, normalMap: tx.carpet.normalMap, color: '#9ea3a8', roughness: 1 }),
    ceilLayIn: std({ color: white, map: tx.layIn.map, normalMap: tx.layIn.normalMap, roughness: 0.95 }),
    ceilPerf: std({ color: white, map: tx.perf.map, normalMap: tx.perf.normalMap, roughness: 0.6 }),
    roof: std({ color: '#e9ebec', roughness: 0.95 }),
    soil: std({ color: '#3a332d', roughness: 1 }, noShadow),
    leaf: std({ color: o.mono ? pal.accent2 : pal.leaf, roughness: 0.75, flatShading: true, side: THREE.DoubleSide }),
    stem: std({ color: o.mono ? pal.dark : '#6c9a42', roughness: 0.7 }),
    leafSoft: std({ color: o.mono ? pal.accent2 : pal.leaf, roughness: 0.7, side: THREE.DoubleSide }),
    ground: std({ color: '#c9ced2', roughness: 1 }, noShadow),
    facade: facadeMaterial(tx.facade),
    model: std({ color: '#f5f5f3', roughness: 0.6 }),
    wood: std({ map: tx.wood.map, normalMap: tx.wood.normalMap, roughnessMap: tx.wood.roughnessMap, roughness: 1 }),
    doorWhite: std({ color: '#e9eae8', roughness: 0.45 }),
    diffuser: std({ map: tx.diffuser, roughness: 0.7 }, noShadow),
    scallop: new THREE.MeshBasicMaterial({ map: tx.scallop, color: new THREE.Color(0.6, 0.58, 0.54), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    exit: std({ color: '#000000', emissive: '#ffffff', emissiveMap: tx.exit, emissiveIntensity: 1.3, roughness: 0.4 }, noShadow),
    screen0: std({ color: '#000000', emissive: '#ffffff', emissiveMap: own.screens[0], emissiveIntensity: 1.05, roughness: 0.18 }, noShadow),
    screen1: std({ color: '#000000', emissive: '#ffffff', emissiveMap: own.screens[1], emissiveIntensity: 1.05, roughness: 0.18 }, noShadow),
    screen2: std({ color: '#000000', emissive: '#ffffff', emissiveMap: own.screens[2], emissiveIntensity: 1.05, roughness: 0.18 }, noShadow),
    monitor: std({ color: '#000000', emissive: '#ffffff', emissiveMap: own.desktop, emissiveIntensity: 0.85, roughness: 0.2 }, noShadow),
    logo: std({ map: own.logo, transparent: true, alphaTest: 0.4, roughness: 0.5 }, noShadow),
    mono: std({ map: own.mono, transparent: true, opacity: 0.88, depthWrite: false, roughness: 0.7 }, { castShadow: false, renderOrder: 3 }),
    pylon: std({ map: own.pylon, roughness: 0.5 }, noShadow),
    art0: std({ map: own.art[0], roughness: 0.75 }, noShadow),
    art1: std({ map: own.art[1], roughness: 0.75 }, noShadow),
    art2: std({ map: own.art[2], roughness: 0.75 }, noShadow),
    art3: std({ map: own.art[3], roughness: 0.75 }, noShadow),
  };
  m.scallop.userData.castShadow = false;
  m.scallop.userData.receiveShadow = false;
  m.scallop.userData.renderOrder = 4;

  // The studio environment is for reflections on glossy things; keep its
  // diffuse fill off matte surfaces so the space keeps some contrast.
  const glossy = { floorTile: 0.35, floorDark: 0.6, whiteGloss: 0.6, accentGloss: 0.5, metal: 1.1, darkMetal: 0.9, glass: 2, frosted: 0.6, screen0: 0.3, screen1: 0.3, screen2: 0.3, monitor: 0.3, black: 0.4, leather: 0.5, upholstery: 0.25, wood: 0.5, deskTop: 0.4, skirting: 0.6 };
  for (const [k, mat] of Object.entries(m)) if (mat.isMeshStandardMaterial) mat.envMapIntensity = glossy[k] ?? 0.12;

  // Accents off = the same office in plain white (and grey carpet).
  const accentKeys = ['accent', 'accentGloss', 'accent2', 'accentDark', 'carpet', 'upholstery', 'wallAccent', 'wallAccent2'];
  const original = Object.fromEntries(accentKeys.map((k) => [k, m[k].color.clone()]));
  const offColor = { carpet: new THREE.Color('#b9bdc1'), upholstery: new THREE.Color('#e8e8e5') };
  return {
    materials: m,
    setAccents(on) {
      for (const k of accentKeys) m[k].color.copy(on ? original[k] : offColor[k] || white);
    },
    dispose() {
      for (const t of [...own.art, ...own.screens, own.logo, own.mono, own.pylon, own.desktop]) t.dispose();
      for (const mat of Object.values(m)) mat.dispose();
    },
  };
}

// Uniform grid over the floor plan for fast ray casts and overlap queries.
class ColliderGrid {
  constructor(colliders, fp, cell = 2) {
    this.c = colliders;
    this.cell = cell;
    this.x0 = fp.x0 - 2;
    this.z0 = fp.z0 - 2;
    this.nx = Math.ceil((fp.x1 - fp.x0 + 4) / cell);
    this.nz = Math.ceil((fp.z1 - fp.z0 + 4) / cell);
    this.cells = Array.from({ length: this.nx * this.nz }, () => []);
    colliders.forEach((c, i) => {
      const [i0, i1, j0, j1] = this.range(c.x0, c.z0, c.x1, c.z1);
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) this.cells[j * this.nx + k].push(i);
    });
    this.stamp = new Uint32Array(colliders.length);
    this.tick = 0;
  }

  range(x0, z0, x1, z1) {
    const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
    return [cl(Math.floor((x0 - this.x0) / this.cell), this.nx), cl(Math.floor((x1 - this.x0) / this.cell), this.nx), cl(Math.floor((z0 - this.z0) / this.cell), this.nz), cl(Math.floor((z1 - this.z0) / this.cell), this.nz)];
  }

  query(x0, z0, x1, z1, fn) {
    this.tick++;
    const [i0, i1, j0, j1] = this.range(x0, z0, x1, z1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const k of this.cells[j * this.nx + i]) {
          if (this.stamp[k] === this.tick) continue;
          this.stamp[k] = this.tick;
          fn(this.c[k]);
        }
      }
    }
  }

  // Ray vs colliders (slab tests), walking the grid cells along the ray.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, skipGlass) {
    const { cell, nx, nz } = this;
    const X0 = this.x0;
    const Z0 = this.z0;
    const X1 = X0 + nx * cell;
    const Z1 = Z0 + nz * cell;
    let t0 = 0;
    let t1 = maxDist;
    for (const [o, d, lo, hi] of [
      [ox, dx, X0, X1],
      [oz, dz, Z0, Z1],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) return Infinity;
      } else {
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      }
    }
    if (t0 > t1) return Infinity;
    this.tick++;
    const px = ox + dx * t0;
    const pz = oz + dz * t0;
    let i = Math.max(0, Math.min(nx - 1, Math.floor((px - X0) / cell)));
    let j = Math.max(0, Math.min(nz - 1, Math.floor((pz - Z0) / cell)));
    const si = dx > 0 ? 1 : -1;
    const sj = dz > 0 ? 1 : -1;
    let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : (X0 + (i + (dx > 0 ? 1 : 0)) * cell - ox) / dx;
    let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : (Z0 + (j + (dz > 0 ? 1 : 0)) * cell - oz) / dz;
    const tDX = Math.abs(dx) < 1e-9 ? Infinity : cell / Math.abs(dx);
    const tDZ = Math.abs(dz) < 1e-9 ? Infinity : cell / Math.abs(dz);
    let best = maxDist;
    const o3 = [ox, oy, oz];
    const d3 = [dx, dy, dz];
    for (;;) {
      for (const k of this.cells[j * nx + i]) {
        if (this.stamp[k] === this.tick) continue;
        this.stamp[k] = this.tick;
        const c = this.c[k];
        if (skipGlass && c.glass) continue;
        const lo = [c.x0, c.y0, c.z0];
        const hi = [c.x1, c.y1, c.z1];
        let a0 = 0;
        let a1 = best;
        let hit = true;
        for (let a = 0; a < 3; a++) {
          if (Math.abs(d3[a]) < 1e-9) {
            if (o3[a] < lo[a] || o3[a] > hi[a]) {
              hit = false;
              break;
            }
            continue;
          }
          let ta = (lo[a] - o3[a]) / d3[a];
          let tb = (hi[a] - o3[a]) / d3[a];
          if (ta > tb) [ta, tb] = [tb, ta];
          if (ta > a0) a0 = ta;
          if (tb < a1) a1 = tb;
          if (a0 > a1) {
            hit = false;
            break;
          }
        }
        if (hit && a0 < best) best = a0;
      }
      const tExit = Math.min(tMaxX, tMaxZ);
      if (best <= tExit || tExit >= t1) break;
      if (tMaxX < tMaxZ) {
        i += si;
        tMaxX += tDX;
      } else {
        j += sj;
        tMaxZ += tDZ;
      }
      if (i < 0 || j < 0 || i >= nx || j >= nz) break;
    }
    return best >= maxDist ? Infinity : best;
  }
}

export function createOffice(seed, { mirror } = {}) {
  const t0 = performance.now();
  const o = generateOffice(seed);
  const t1 = performance.now();
  const mats = createMaterials(o);
  const t2 = performance.now();
  const UV = UV_SCALE;
  const group = o.builder.build(mats.materials, UV);
  const t3 = performance.now();

  // Bounce light and shader hooks.
  const bounce = bounceMaps(o);
  const accentN = new THREE.Color(o.palette.accent);
  accentN.multiplyScalar(1 / Math.max(accentN.r, accentN.g, accentN.b));
  const U = {
    uBounce0: { value: bounce.textures[0] },
    uBounce1: { value: bounce.textures[1] },
    uBounceMin: { value: bounce.min },
    uBounceSize: { value: bounce.size },
    uBounceSplit: { value: FH - 0.2 },
    uBounceTint: { value: 1 },
    uBounceColor: { value: accentN },
    ...(mirror?.uniforms ?? { uMirror: { value: null }, uMirrorMatrix: { value: new THREE.Matrix4() }, uMirrorAmt: { value: 0 }, uMirrorOn: { value: 0 } }),
  };
  const mirrorKeys = new Set(['floorTile', 'floorDark']);
  for (const [k, mat] of Object.entries(mats.materials)) {
    if (!mat.isMeshStandardMaterial || k === 'facade' || k === 'ground') continue;
    patch(mat, U, mirrorKeys.has(k));
  }
  const mirrorMats = [...mirrorKeys].map((k) => mats.materials[k]);

  // Skyline around the building, and the tower this floor sits in.
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const towers = new THREE.InstancedMesh(unit, mats.materials.facade, o.towers.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  o.towers.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, t.y0, t.z), q, new THREE.Vector3(t.w, t.h, t.d));
    towers.setMatrixAt(i, m4);
  });
  towers.userData.group = 'backdrop';
  towers.castShadow = false;
  towers.receiveShadow = false;
  group.add(towers);
  const fp = o.footprint;
  const body = new THREE.Mesh(unit, mats.materials.facade);
  body.scale.set(fp.x1 - fp.x0 + 0.2, o.elev - 0.3, fp.z1 - fp.z0 + 0.2);
  body.position.set((fp.x0 + fp.x1) / 2, -o.elev, (fp.z0 + fp.z1) / 2);
  body.castShadow = false;
  body.receiveShadow = false;
  group.add(body);

  const cutGroups = group.children.filter((c) => c.userData.group === 'ceil' || c.userData.group === 'backdrop');
  const colliders = o.colliders;
  const grid = new ColliderGrid(colliders, fp);

  const inset = (r, x, z, m) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m;
  const ground = o.rooms.filter((r) => r.level === 0 && r.access);
  const navGround = new NavGrid(fp, { cell: 0.25, band: [0.15, 2.0], colliders, walkable: (x, z) => ground.some((r) => inset(r, x, z, -0.01)), inflate: 0.22 });
  const upstairs = [...o.mezz, ...o.rooms.filter((r) => r.level === 1 && r.access)];
  const navMezz = new NavGrid(fp, { cell: 0.25, band: [FH + 0.15, FH + 2.0], colliders, walkable: (x, z) => upstairs.some((r) => inset(r, x, z, -0.01)), inflate: 0.22 });

  function raycast(ox, oy, oz, dx, dy, dz, maxDist = 500, seeThroughGlass = false) {
    return grid.raycast(ox, oy, oz, dx, dy, dz, maxDist, seeThroughGlass);
  }

  // Push a camera sphere out of colliders and keep it inside the building.
  function resolve(p, r = 0.25) {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      grid.query(p.x - r, p.z - r, p.x + r, p.z + r, (c) => {
        const cx = Math.max(c.x0, Math.min(p.x, c.x1));
        const cy = Math.max(c.y0, Math.min(p.y, c.y1));
        const cz = Math.max(c.z0, Math.min(p.z, c.z1));
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dz = p.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) return;
        moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          p.x += dx * k;
          p.y += dy * k;
          p.z += dz * k;
        } else {
          const pen = [p.x - c.x0, c.x1 - p.x, p.y - c.y0, c.y1 - p.y, p.z - c.z0, c.z1 - p.z];
          let k = 0;
          for (let i = 1; i < 6; i++) if (pen[i] < pen[k]) k = i;
          if (k === 0) p.x = c.x0 - r;
          else if (k === 1) p.x = c.x1 + r;
          else if (k === 2) p.y = c.y0 - r;
          else if (k === 3) p.y = c.y1 + r;
          else if (k === 4) p.z = c.z0 - r;
          else p.z = c.z1 + r;
        }
      });
      if (!moved) break;
    }
    p.x = Math.max(fp.x0 + 0.3, Math.min(fp.x1 - 0.3, p.x));
    p.z = Math.max(fp.z0 + 0.3, Math.min(fp.z1 - 0.3, p.z));
    p.y = Math.max(0.3, Math.min(o.HA - 0.3, p.y));
    return p;
  }

  const roomAt = (x, y, z) => {
    const level = y > FH - 0.2 ? Math.min(o.floors - 1, Math.floor((y + 0.2) / FH)) : 0;
    return o.rooms.find((r) => (r.level === level || r.type === 'atrium') && x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) || null;
  };

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), CEIL - 0.3);
  const t4 = performance.now();
  const office = {
    ...o,
    group,
    navGround,
    navMezz,
    raycast,
    resolve,
    roomAt,
    mirrorMats,
    cutaway: false,
    clipPlanes: [],
    bounds: { minX: fp.x0 - 2, maxX: fp.x1 + 2, minY: -0.5, maxY: o.HA + 1, minZ: fp.z0 - 2, maxZ: fp.z1 + 2 },
    timings: { generate: Math.round(t1 - t0), textures: Math.round(t2 - t1), merge: Math.round(t3 - t2), nav: Math.round(t4 - t3) },
    setAccents(on) {
      mats.setAccents(on);
      U.uBounceTint.value = on ? 1 : 0;
    },
    setCutaway(on) {
      this.cutaway = on;
      for (const g of cutGroups) g.visible = !on;
      this.clipPlanes = on ? [clipPlane] : [];
    },
    dispose() {
      group.traverse((c) => c.geometry?.dispose());
      unit.dispose();
      towers.dispose();
      bounce.dispose();
      mats.dispose();
    },
  };
  return office;
}
