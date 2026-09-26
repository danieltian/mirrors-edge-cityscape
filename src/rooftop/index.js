import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { buildSkyline } from '../render/skyline.js';
import { NavGrid } from '../office/nav.js';
import { facadeMaterial, ColliderGrid } from '../office/index.js';
import * as TX from '../office/textures.js';
import * as MT from '../mall/textures.js';
import * as RT from './textures.js';
import { generateRooftop, ROOF_ACCENTS } from './generator.js';
import { createFans, createSteam } from './effects.js';
import { weather, wallMaterial } from './shading.js';

// Builds a rooftop world: materials, merged meshes, the city and harbour
// around it, spinning fans and drifting steam, a walkable grid for every
// roof (joined roofs share one), and collision and ray queries against the
// colliders.

const UV_SCALE = {
  roofTile: 2.4,
  white: 2.4,
  ribbed: 1.2,
  louver: 1,
  grate: 1.2,
  galv: 1.2,
  cabinet: [2.4, 1.2],
  planks: [2.4, 1.2],
  concrete: [4.8, 2.4],
  curtain: [3, 7.2],
};

function createMaterials(o) {
  const rng = new RNG((o.seed ^ 0x7f4a7c15) >>> 0);
  const white = new THREE.Color('#f4f4f2');
  const tiles = RT.roofTiles();
  const rib = RT.ribbed();
  const lou = RT.louver();
  const gr = RT.grate();
  const conc = TX.concrete();
  const facade = TX.facadeAtlas();
  const pl = RT.plaster();
  const gv = RT.galvanized();
  const cab = RT.cabinet();
  const pk = RT.planks();
  const own = { ads: [0, 1, 2].map(() => MT.billboard(rng, rng.pick(['#e8363c', '#1f6fe0', '#ff7a1a', '#16a8a0', '#f2c230']), '#ffffff')) };
  const std = (p, ud = {}) => {
    const m = new THREE.MeshStandardMaterial(p);
    Object.assign(m.userData, ud);
    return m;
  };
  const noShadow = { castShadow: false };
  const [a, b2, c] = o.style.accents.map((k) => ROOF_ACCENTS[k]);
  const m = {
    white: weather(std({ color: white, map: pl.map, normalMap: pl.normalMap, roughness: 0.75 }), 0.6),
    whiteGloss: std({ color: white, roughness: 0.3 }),
    black: std({ color: '#161719', roughness: 0.5 }),
    blackGloss: std({ color: '#0e0f11', roughness: 0.12, metalness: 0.2 }),
    metal: std({ color: '#cfd3d8', metalness: 1, roughness: 0.45 }),
    steel: std({ color: '#b9bec4', metalness: 0.6, roughness: 0.4 }),
    darkMetal: std({ color: '#3a3e43', metalness: 0.7, roughness: 0.4 }),
    roofTile: weather(std({ map: tiles.map, normalMap: tiles.normalMap, roughnessMap: tiles.roughnessMap, roughness: 1 }), 0.55),
    ribbed: weather(std({ map: rib.map, normalMap: rib.normalMap, roughness: 0.55, metalness: 0.15 }), 0.5),
    galv: weather(std({ map: gv.map, normalMap: gv.normalMap, roughnessMap: gv.roughnessMap, roughness: 1, metalness: 0.55 }), 0.35),
    cabinet: weather(std({ map: cab.map, normalMap: cab.normalMap, roughness: 0.55, metalness: 0.15 }), 0.4),
    planks: std({ map: pk.map, normalMap: pk.normalMap, roughness: 0.9 }),
    chainLink: std({ map: RT.chainLink(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }, noShadow),
    louver: std({ map: lou.map, normalMap: lou.normalMap, roughness: 0.6 }),
    grate: std({ map: gr.map, normalMap: gr.normalMap, roughness: 0.6, metalness: 0.5 }),
    fanWell: std({ color: '#1f2124', roughness: 0.8 }, noShadow),
    fanGrille: std({ map: RT.fanGrille(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }, noShadow),
    solar: std({ map: RT.solar(), roughness: 0.2, metalness: 0.3 }),
    helipad: std({ map: RT.helipad(), roughness: 0.8 }, noShadow),
    concrete: weather(std({ map: conc.map, normalMap: conc.normalMap, roughness: 0.9, color: '#e8e6e2' }), 0.5),
    curtain: std({ map: RT.curtain(), roughness: 0.08, metalness: 0.85, color: '#9fb4cc' }),
    glass: std({ color: '#e3f0f6', transparent: true, opacity: 0.18, roughness: 0.03, depthWrite: false }, noShadow),
    glassRoof: std({ color: '#cfe4f0', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }, noShadow),
    glassDark: std({ color: '#1d2835', roughness: 0.06, metalness: 0.9 }),
    water: std({ color: '#101418', roughness: 0.02, metalness: 0.6 }, noShadow),
    accentA: std({ color: a, roughness: 0.45 }),
    accentB: std({ color: b2, roughness: 0.45 }),
    accentC: std({ color: c, roughness: 0.45 }),
    runner: std({ color: '#e2261d', emissive: '#6e0a05', emissiveIntensity: 0.6, roughness: 0.4 }),
    tvRed: std({ color: '#d8322a', roughness: 0.5 }),
    yellowCrane: std({ color: '#f5b914', roughness: 0.5 }),
    trunk: std({ color: '#2b2422', roughness: 0.8 }),
    blossom: std({ color: '#f0a2c6', roughness: 0.9, flatShading: true }),
    blossom2: std({ color: '#d77fb0', roughness: 0.9, flatShading: true }),
    emissiveSoft: std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.3 }, noShadow),
    emissiveWarm: std({ color: '#ffe4b8', emissive: '#ffcf8a', emissiveIntensity: 1.6 }, noShadow),
    ground: std({ color: '#8e9296', roughness: 1 }, noShadow),
    ad0: std({ map: own.ads[0], emissive: '#ffffff', emissiveMap: own.ads[0], emissiveIntensity: 0.25, roughness: 0.5 }, noShadow),
    ad1: std({ map: own.ads[1], emissive: '#ffffff', emissiveMap: own.ads[1], emissiveIntensity: 0.25, roughness: 0.5 }, noShadow),
    ad2: std({ map: own.ads[2], emissive: '#ffffff', emissiveMap: own.ads[2], emissiveIntensity: 0.25, roughness: 0.5 }, noShadow),
    // The block's walls: glazed tiles, panels with ribbon windows, render,
    // tall narrow windows in tiles.
    wall0: wallMaterial(RT.cladding('tile'), { pitch: 2.4, width: 1.25, height: 1.55, storey: 3.4 }, { roughness: 0.4 }),
    wall1: wallMaterial(RT.cladding('panel'), { height: 1.35, storey: 3.6, sill: 1.0, ribbon: true }, { color: '#f4f5f6', roughness: 0.55 }),
    wall2: wallMaterial(RT.cladding('render'), { pitch: 3.0, width: 1.5, height: 1.7, storey: 3.5 }, { color: '#fbf8f2', roughness: 0.85 }),
    wall3: wallMaterial(RT.cladding('tile'), { pitch: 1.8, width: 0.9, height: 1.9, storey: 3.3 }, { color: '#eef1f4', roughness: 0.45 }),
    skyline: facadeMaterial(facade),
  };
  // (Walls scale their own reflections: full on the glass, a little on the cladding.)
  const glossy = { curtain: 1.4, glassDark: 1.2, water: 1.5, blackGloss: 1, metal: 1, steel: 0.8, darkMetal: 0.8, solar: 1, glass: 2, glassRoof: 1.5, whiteGloss: 0.5, fanGrille: 0.8, galv: 0.8, chainLink: 0.6, wall0: 1, wall1: 1, wall2: 1, wall3: 1 };
  for (const [k, mat] of Object.entries(m)) if (mat.isMeshStandardMaterial) mat.envMapIntensity = glossy[k] ?? 0.1;
  const accentKeys = ['accentA', 'accentB', 'accentC'];
  const original = Object.fromEntries(accentKeys.map((k) => [k, m[k].color.clone()]));
  return {
    materials: m,
    setAccents(on) {
      for (const k of accentKeys) m[k].color.copy(on ? original[k] : white);
    },
    dispose() {
      for (const t of own.ads) t.dispose();
      for (const mat of Object.values(m)) mat.dispose();
    },
  };
}

export function createRooftop(seed) {
  const t0 = performance.now();
  const o = generateRooftop(seed);
  const t1 = performance.now();
  const mats = createMaterials(o);
  const group = o.builder.build(mats.materials, UV_SCALE);
  group.name = 'rooftop';
  const t2 = performance.now();

  // The city, and the harbour beyond the shoreline.
  const skyline = buildSkyline(o.skyline, mats.materials.skyline);
  for (const c of [...skyline.children]) group.add(c);
  for (const mat of skyline.userData.materials) mat.envMapIntensity = mat === skyline.userData.materials[0] ? 1 : 0.1;

  // Fans turning in their wells, steam off vents, stacks and cooling
  // towers, and a few plumes out over the city.
  const fans = createFans(o.fans);
  const steam = createSteam([...o.steam, ...o.skyline.plumes], new RNG((o.seed ^ 0x51ea3) >>> 0));
  group.add(fans.mesh, steam.mesh);
  // Land and sea meet along the shoreline (two planes, so they never overlap).
  const seaMat = new THREE.MeshStandardMaterial({ color: '#4d93c9', roughness: 0.12, metalness: 0.35, envMapIntensity: 1.2 });
  const seaGeo = new THREE.PlaneGeometry(9000, 4500).rotateX(-Math.PI / 2);
  const d = o.sea.dir;
  const face = Math.atan2(d.x, d.y);
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.set(d.x * (o.sea.shore + 2250), -0.4, d.y * (o.sea.shore + 2250));
  sea.rotation.y = face;
  sea.userData.group = 'backdrop';
  const land = new THREE.Mesh(seaGeo, mats.materials.ground);
  land.position.set(d.x * (o.sea.shore - 2250), 0, d.y * (o.sea.shore - 2250));
  land.rotation.y = face;
  land.receiveShadow = true;
  group.add(sea, land);

  const cutGroups = group.children.filter((c) => c.userData.group === 'backdrop');
  const fp = o.footprint;
  const colliders = o.colliders;
  const grid = new ColliderGrid(colliders, fp);

  // One walkable grid per roof level (joined roofs share one).
  const navs = o.roofGroups.map((g) => {
    const inside = (x, z) => g.rects.some((r) => x > r.x0 + 0.1 && x < r.x1 - 0.1 && z > r.z0 + 0.1 && z < r.z1 - 0.1);
    return new NavGrid(g.bounds, { cell: 0.4, band: [g.y + 0.15, g.y + 2.0], colliders, walkable: inside, inflate: 0.3 });
  });
  const t3 = performance.now();

  function raycast(ox, oy, oz, dx, dy, dz, maxDist = 500, seeThroughGlass = false) {
    return grid.raycast(ox, oy, oz, dx, dy, dz, maxDist, seeThroughGlass);
  }

  function resolve(p, r = 0.3) {
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
          const dd = Math.sqrt(d2);
          const k = (r - dd) / dd;
          p.x += dx * k;
          p.y += dy * k;
          p.z += dz * k;
        } else p.y = c.y1 + r;
      });
      if (!moved) break;
    }
    p.x = Math.max(fp.x0 - 150, Math.min(fp.x1 + 150, p.x));
    p.z = Math.max(fp.z0 - 150, Math.min(fp.z1 + 150, p.z));
    p.y = Math.max(0.5, Math.min(o.maxH + 120, p.y));
    return p;
  }

  const B = o.plan.bounds;
  return {
    ...o,
    kind: 'rooftop',
    group,
    navs,
    navGround: navs[0],
    raycast,
    resolve,
    cutaway: false,
    clipPlanes: [],
    palette: { accent: ROOF_ACCENTS[o.style.accents[0]] },
    bounds: { minX: B.x0 - 30, maxX: B.x1 + 30, minY: 0, maxY: o.maxH + 12, minZ: B.z0 - 30, maxZ: B.z1 + 30 },
    timings: { generate: Math.round(t1 - t0), build: Math.round(t2 - t1), nav: Math.round(t3 - t2) },
    setAccents(on) {
      mats.setAccents(on);
    },
    setCutaway(on) {
      this.cutaway = on;
      for (const g of cutGroups) g.visible = !on;
    },
    // Sky reflections, set on each material rather than as the scene's
    // environment: that way matte surfaces only take a little of it (with
    // scene.environment three.js lights everything at full strength, which
    // fills in every shadow).
    setEnvMap(tex) {
      const all = [...Object.values(mats.materials), ...skyline.userData.materials, seaMat, fans.mesh.material];
      for (const mat of all) {
        if (!mat.isMeshStandardMaterial) continue;
        mat.envMap = tex;
        mat.needsUpdate = true;
      }
    },
    // Wind direction (world x, z; any length) and the sun, for the steam.
    setWind(x, z) {
      const w = new THREE.Vector3(x, 0, z);
      if (w.lengthSq() < 1e-10) w.set(1, 0, 0.3);
      steam.uniforms.uWind.value.copy(w.normalize().multiplyScalar(1.1));
    },
    setSunDir(dir) {
      steam.uniforms.uSunDir.value.copy(dir);
    },
    update(dt) {
      fans.update(dt);
      steam.update(dt);
    },
    dispose() {
      group.traverse((c) => c.geometry?.dispose());
      fans.dispose();
      steam.dispose();
      skyline.userData.dispose();
      seaGeo.dispose();
      seaMat.dispose();
      mats.dispose();
    },
  };
}
