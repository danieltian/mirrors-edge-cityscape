import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { generateMall } from './generator.js';
import { inPoly, FH } from './plan.js';
import { NavGrid } from '../office/nav.js';
import { patch, facadeMaterial, ColliderGrid } from '../office/index.js';
import * as TX from '../office/textures.js';
import * as MT from './textures.js';

// Builds a playable mall: materials and merged meshes, the skyline, bounce
// light, walkable grids per level (plus the plaza), collision and ray
// queries, and the isometric cut-away.

const UV_SCALE = {
  floorTile: 2.4,
  inlayDark: 2.4,
  inlayLight: 2.4,
  paving: 2.4,
  rug: 2,
  wall: 2.4,
  wallAccent: 2.4,
  wallAccent2: 2.4,
  stone: [4.8, 4.8],
  concrete: [4.8, 2.4],
  mosaic: 1.2,
  mosaicBlue: 1.2,
  ceilLayIn: 2.4,
  shutter: 1,
  wood: [2, 1],
};

function createMaterials(o) {
  const pal = o.palette;
  const rng = new RNG((o.seed ^ 0x51ed27) >>> 0);
  const white = new THREE.Color('#f3f2ef');
  const tx = {
    tile: TX.floorTiles(false),
    carpet: TX.carpet(),
    layIn: TX.ceilingLayIn(),
    wall: TX.wallTexture(false),
    panel: TX.wallTexture(true),
    concrete: TX.concrete(),
    wood: TX.wood(),
    brushed: TX.brushed(),
    leather: TX.leather(),
    scallop: TX.scallop(),
    exit: TX.exitSign(),
    facade: TX.facadeAtlas(),
    shutter: MT.shutter(),
    mosaic: MT.mosaic(),
    paving: MT.paving(),
  };
  const signs = MT.signAtlas(rng, pal.accent);
  const own = {
    signs: signs.texture,
    banners: o.mall.slogans.map((s) => MT.banner(o.mall, pal.banner, s)),
    plazaBanner: MT.banner(o.mall, pal.pop, o.mall.slogans[0]),
    ads: [0, 1, 2, 3].map((i) => MT.billboard(rng, i % 2 ? pal.accent2 : pal.accent, i % 2 ? '#1a1a1a' : '#ffffff')),
    plazaAds: [0, 1].map(() => MT.billboard(rng, pal.pop, '#ffffff')),
    posters: [0, 1, 2, 3].map(() => MT.poster(rng, pal.accent)),
    directory: MT.directory(o.mall, pal.accent, rng),
    sign: MT.mallSign(o.mall),
    mark: MT.mallMark(o.mall, pal.pop),
  };
  const std = (p, ud = {}) => {
    const m = new THREE.MeshStandardMaterial(p);
    Object.assign(m.userData, ud);
    return m;
  };
  const noShadow = { castShadow: false };
  const leatherN = { normalMap: tx.leather.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) };
  const emissiveTex = (t, i = 1.1) => std({ color: '#000000', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: i, roughness: 0.3 }, noShadow);
  const m = {
    white: std({ color: white, roughness: 0.75 }),
    whiteGloss: std({ color: white, roughness: 0.25 }),
    black: std({ color: '#151517', roughness: 0.5 }),
    blackGloss: std({ color: '#111113', roughness: 0.18 }),
    metal: std({ color: '#cfd3d8', metalness: 1, roughness: 1, roughnessMap: tx.brushed.roughnessMap }),
    darkMetal: std({ color: '#3a3e43', metalness: 0.7, roughness: 0.4 }),
    steps: std({ color: '#4a4e53', metalness: 0.8, roughness: 0.45 }),
    stepEdge: std({ color: pal.accent, roughness: 0.4 }, noShadow),
    frame: std({ color: '#f1efe9', roughness: 0.5 }),
    frameDark: std({ color: '#26282b', roughness: 0.5 }),
    glass: std({ color: '#e3f0f6', transparent: true, opacity: 0.14, roughness: 0.03, depthWrite: false }, noShadow),
    glassDouble: std({ color: '#e3f0f6', transparent: true, opacity: 0.12, roughness: 0.03, depthWrite: false, side: THREE.DoubleSide }, noShadow),
    parapet: std({ color: o.style.parapet === 'accent' ? pal.accent : o.style.parapet === 'accent2' ? pal.accent2 : white, roughness: 0.4 }),
    globe: std({ color: '#ffffff', emissive: '#fff4e0', emissiveIntensity: 1.1, roughness: 0.3 }, noShadow),
    water: std({ color: '#7fb2c9', roughness: 0.04, metalness: 0.1 }, noShadow),
    jet: std({ color: '#ffffff', emissive: '#dff4ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.55, depthWrite: false }, noShadow),
    inlayDark: std({ color: '#5a5c5f', map: tx.tile.map, normalMap: tx.tile.normalMap, roughnessMap: tx.tile.roughnessMap, roughness: 1 }),
    inlayLight: std({ color: '#f7f5f0', map: tx.tile.map, roughness: 0.3 }),
    canvas: std({ color: pal.accent, roughness: 0.8, side: THREE.DoubleSide }),
    canvasWhite: std({ color: '#f4f2ee', roughness: 0.8, side: THREE.DoubleSide }),
    blueGlass: std({ color: new THREE.Color(pal.banner).multiplyScalar(0.6), emissive: pal.banner, emissiveIntensity: 0.25, transparent: true, opacity: 0.65, roughness: 0.05, depthWrite: false }, noShadow),
    blueGlow: std({ color: '#ffffff', emissive: new THREE.Color(pal.banner).lerp(new THREE.Color('#ffffff'), 0.25), emissiveIntensity: 1.3 }, noShadow),
    blueScreen: std({ color: '#000000', emissive: new THREE.Color(pal.banner).lerp(new THREE.Color('#ffffff'), 0.3), emissiveIntensity: 1.4 }, noShadow),
    emissive: std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2.4 }, noShadow),
    emissiveSoft: std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.3 }, noShadow),
    emissiveWarm: std({ color: '#ffe4b8', emissive: '#ffcf8a', emissiveIntensity: 1.6 }, noShadow),
    floorTile: std({ color: o.style.floorTint, map: tx.tile.map, normalMap: tx.tile.normalMap, roughnessMap: tx.tile.roughnessMap, roughness: 1.6 }),
    paving: std({ map: tx.paving.map, normalMap: tx.paving.normalMap, roughness: 0.85 }),
    asphalt: std({ color: '#5d6166', roughness: 0.95 }, noShadow),
    rug: std({ map: tx.carpet.map, normalMap: tx.carpet.normalMap, color: pal.accent2, roughness: 1 }),
    wall: std({ color: white, map: tx.wall.map, normalMap: tx.wall.normalMap, roughness: 0.85 }),
    wallAccent: std({ color: pal.accent, map: tx.panel.map, normalMap: tx.panel.normalMap, roughness: 0.7 }),
    wallAccent2: std({ color: pal.accent2, map: tx.panel.map, normalMap: tx.panel.normalMap, roughness: 0.7 }),
    mosaic: std({ color: pal.accent2, map: tx.mosaic.map, normalMap: tx.mosaic.normalMap, roughness: 0.35 }),
    mosaicBlue: std({ color: '#2f6fd0', map: tx.mosaic.map, normalMap: tx.mosaic.normalMap, roughness: 0.35 }),
    stone: std({ color: '#efcdb6', map: tx.panel.map, normalMap: tx.panel.normalMap, roughness: 0.85 }),
    stoneBand: std({ color: '#f6e4d6', roughness: 0.8 }),
    concrete: std({ map: tx.concrete.map, normalMap: tx.concrete.normalMap, roughness: 0.88 }),
    accent: std({ color: pal.accent, roughness: 0.55 }),
    accentGloss: std({ color: pal.accent, roughness: 0.28 }),
    accentGlossDouble: std({ color: pal.accent2, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }),
    accent2: std({ color: pal.accent2, roughness: 0.5 }),
    upholstery: std({ color: pal.accent, roughness: 0.55, ...leatherN }),
    upholsteryWhite: std({ color: '#ecebe7', roughness: 0.6, ...leatherN }),
    leather: std({ color: '#262628', roughness: 0.42, ...leatherN }),
    wood: std({ map: tx.wood.map, normalMap: tx.wood.normalMap, roughnessMap: tx.wood.roughnessMap, roughness: 1 }),
    leafWhite: std({ color: '#eceae6', roughness: 0.8, side: THREE.DoubleSide }),
    leaf: std({ color: '#eceae6', roughness: 0.8, side: THREE.DoubleSide, flatShading: true }),
    leafSoft: std({ color: '#eceae6', roughness: 0.8, side: THREE.DoubleSide }),
    trunkWhite: std({ color: '#d9d7d2', roughness: 0.8 }),
    stem: std({ color: '#d9d7d2', roughness: 0.8 }),
    soil: std({ color: '#5a524a', roughness: 1 }, noShadow),
    ceilLayIn: std({ color: white, map: tx.layIn.map, normalMap: tx.layIn.normalMap, roughness: 0.95 }),
    vent: std({ color: '#2a2c2f', roughness: 0.7 }, noShadow),
    roof: std({ color: '#e1e2e3', roughness: 0.95 }),
    shutter: std({ map: tx.shutter.map, normalMap: tx.shutter.normalMap, roughness: 0.45, metalness: 0.3 }),
    shopDark: std({ color: '#23262b', roughness: 0.3 }),
    model: std({ color: '#f5f5f3', roughness: 0.6 }),
    ground: std({ color: '#c8c3bb', roughness: 1 }, noShadow),
    facade: facadeMaterial(tx.facade),
    scallop: new THREE.MeshBasicMaterial({ map: tx.scallop, color: new THREE.Color(0.6, 0.58, 0.54), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    exit: std({ color: '#000000', emissive: '#ffffff', emissiveMap: tx.exit, emissiveIntensity: 1.3, roughness: 0.4 }, noShadow),
    signs: std({ map: own.signs, emissive: '#ffffff', emissiveMap: own.signs, emissiveIntensity: 0.35, roughness: 0.4 }, noShadow),
    banner0: std({ map: own.banners[0], roughness: 0.8 }, noShadow),
    banner1: std({ map: own.banners[1], roughness: 0.8 }, noShadow),
    plazaBanner: std({ map: own.plazaBanner, roughness: 0.8, side: THREE.DoubleSide }),
    ad0: emissiveTex(own.ads[0]),
    ad1: emissiveTex(own.ads[1]),
    ad2: emissiveTex(own.ads[2]),
    ad3: emissiveTex(own.ads[3]),
    plazaAd0: std({ map: own.plazaAds[0], roughness: 0.6 }, noShadow),
    plazaAd1: std({ map: own.plazaAds[1], roughness: 0.6 }, noShadow),
    poster0: emissiveTex(own.posters[0], 1.2),
    poster1: emissiveTex(own.posters[1], 1.2),
    poster2: emissiveTex(own.posters[2], 1.2),
    poster3: emissiveTex(own.posters[3], 1.2),
    directory: emissiveTex(own.directory, 1.0),
    mallSign: std({ map: own.sign, transparent: true, alphaTest: 0.3, roughness: 0.5 }, noShadow),
    mallMark: std({ map: own.mark, transparent: true, alphaTest: 0.3, roughness: 0.4 }, noShadow),
  };
  m.scallop.userData.castShadow = false;
  m.scallop.userData.receiveShadow = false;
  const glossy = { water: 1.6, inlayDark: 0.5, parapet: 0.4, floorTile: 0.45, whiteGloss: 0.6, accentGloss: 0.6, accentGlossDouble: 0.6, blackGloss: 0.8, metal: 1.1, darkMetal: 0.9, steps: 0.8, glass: 2, blueGlass: 1.5, mosaic: 0.6, mosaicBlue: 0.6, shutter: 0.5, wood: 0.5, upholstery: 0.25, leather: 0.5, shopDark: 0.8 };
  for (const [k, mat] of Object.entries(m)) if (mat.isMeshStandardMaterial) mat.envMapIntensity = glossy[k] ?? 0.12;
  const accentKeys = ['accent', 'accentGloss', 'accentGlossDouble', 'accent2', 'upholstery', 'wallAccent', 'wallAccent2', 'mosaic', 'rug', 'parapet', 'canvas'];
  const original = Object.fromEntries(accentKeys.map((k) => [k, m[k].color.clone()]));
  const offColor = { rug: new THREE.Color('#b9bdc1') };
  return {
    materials: m,
    setAccents(on) {
      for (const k of accentKeys) m[k].color.copy(on ? original[k] : offColor[k] || white);
    },
    dispose() {
      for (const t of [own.signs, ...own.banners, own.plazaBanner, ...own.ads, ...own.plazaAds, ...own.posters, own.directory, own.sign, own.mark]) t.dispose();
      for (const mat of Object.values(m)) mat.dispose();
    },
  };
}

// Bounce light: the void under the skylight is bright; the galleries around
// it fall into shade the further they are from the void (their ceilings
// block the sky), and the shops deeper still. Warm accent bounce indoors,
// neutral daylight on the plaza.
function distToPoly(poly, x, z) {
  if (inPoly(poly, x, z)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

function bounceMaps(o) {
  const fp = o.footprint;
  const B = o.building;
  const P = o.plan;
  const S = o.style.light;
  const res = 0.5;
  const nx = Math.ceil((fp.x1 - fp.x0) / res);
  const nz = Math.ceil((fp.z1 - fp.z0) / res);
  const make = (poly, open, shade) => {
    const data = new Uint8Array(nx * nz * 4);
    for (let j = 0; j < nz; j++) {
      const z = fp.z0 + (j + 0.5) * res;
      for (let i = 0; i < nx; i++) {
        const x = fp.x0 + (i + 0.5) * res;
        const k = (j * nx + i) * 4;
        const inside = x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
        let bright = 1.0;
        let tint = 0;
        if (inside) {
          const inG = x > P.G.x0 && x < P.G.x1 && z > P.G.z0 && z < P.G.z1;
          const d = distToPoly(poly, x, z);
          bright = inG ? shade + (open - shade) * Math.exp(-d / S.falloff) : shade * 0.85;
          tint = inG ? S.tint : S.tint * 0.6;
        }
        data[k] = Math.min(255, Math.round(bright * 127.5));
        data[k + 1] = Math.round(Math.min(1, tint) * 255);
        data[k + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const textures = [make(P.voids[1].pts, S.open, S.shade0), make(P.voids[P.levels - 1].pts, S.open, S.shade1)];
  return { textures, min: new THREE.Vector2(fp.x0, fp.z0), size: new THREE.Vector2(nx * res, nz * res), dispose: () => textures.forEach((t) => t.dispose()) };
}

export function createMall(seed, { mirror } = {}) {
  const t0 = performance.now();
  const o = generateMall(seed);
  const t1 = performance.now();
  const mats = createMaterials(o);
  const t2 = performance.now();
  const group = o.builder.build(mats.materials, UV_SCALE);
  group.name = 'mall';
  const t3 = performance.now();

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
  for (const [k, mat] of Object.entries(mats.materials)) {
    if (!mat.isMeshStandardMaterial || k === 'facade' || k === 'ground') continue;
    patch(mat, U, k === 'floorTile' || k === 'paving');
  }

  // Skyline.
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const towers = new THREE.InstancedMesh(unit, mats.materials.facade, o.towers.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  o.towers.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, t.y0, t.z), q, new THREE.Vector3(t.w, t.h, t.d));
    towers.setMatrixAt(i, m4);
    towers.setColorAt(i, col.set(t.tint));
  });
  towers.userData.group = 'backdrop';
  towers.castShadow = false;
  towers.receiveShadow = false;
  group.add(towers);

  const cutGroups = group.children.filter((c) => c.userData.group === 'ceil' || c.userData.group === 'backdrop');
  const colliders = o.colliders;
  const fp = o.footprint;
  const grid = new ColliderGrid(colliders, fp);
  const P = o.plan;
  const { G, V } = P;
  const inG = (x, z, m = 0) => x > G.x0 - m && x < G.x1 + m && z > G.z0 - m && z < G.z1 + m;
  const onBridge = (L, x, z) => P.bridges.some((br) => br.level === L && x > br.x0 && x < br.x1 && z > V.z0 && z < V.z1);
  const E = P.entrance;
  const VB = o.vestibule;
  const walk0 = (x, z) =>
    inG(x, z) ||
    (x > E.x0 && x < E.x1 && z >= G.z1 - 0.1 && z < o.building.z1 + 0.5) ||
    (x > VB.x0 && x < VB.x1 && z > VB.z0 - 0.5 && z < VB.z1 + 0.5) ||
    (x > P.plaza.x0 && x < P.plaza.x1 && z > VB.z1 && z < P.plaza.z1);
  const navs = [new NavGrid(fp, { cell: 0.4, band: [0.15, 2.0], colliders, walkable: walk0, inflate: 0.25 })];
  const ub = o.building;
  for (let L = 1; L < o.levels; L++) {
    const poly = P.voids[L].pts;
    navs.push(new NavGrid(ub, { cell: 0.4, band: [L * FH + 0.15, L * FH + 2.0], colliders, walkable: (x, z) => (inG(x, z) && !inPoly(poly, x, z)) || onBridge(L, x, z), inflate: 0.25 }));
  }

  function raycast(ox, oy, oz, dx, dy, dz, maxDist = 500, seeThroughGlass = false) {
    return grid.raycast(ox, oy, oz, dx, dy, dz, maxDist, seeThroughGlass);
  }

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
        } else p.y = c.y1 + r;
      });
      if (!moved) break;
    }
    p.x = Math.max(fp.x0 - 30, Math.min(fp.x1 + 30, p.x));
    p.z = Math.max(fp.z0 - 30, Math.min(fp.z1 + 30, p.z));
    p.y = Math.max(0.3, Math.min(o.HA + 25, p.y));
    return p;
  }

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), FH + 3.1);
  const t4 = performance.now();
  return {
    ...o,
    kind: 'mall',
    group,
    navs,
    navGround: navs[0],
    raycast,
    resolve,
    cutaway: false,
    clipPlanes: [],
    bounds: { minX: fp.x0 - 2, maxX: fp.x1 + 2, minY: -0.5, maxY: o.HA + 3, minZ: fp.z0 - 2, maxZ: fp.z1 + 2 },
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
}
