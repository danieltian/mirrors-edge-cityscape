import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './styles.css';
import { LOOK, OFFICE_LOOK, MALL_LOOK } from './config.js';
import { generateCity } from './city/index.js';
import { CityWorld } from './city/world.js';
import { createOffice } from './office/index.js';
import { OfficeWorld } from './office/world.js';
import { FloorMirror } from './office/mirror.js';
import { createMall } from './mall/index.js';
import { MallPlanner } from './mall/shots.js';
import { createMaterials } from './render/materials.js';
import { Sky } from './render/sky.js';
import { Water } from './render/water.js';
import { Lighting } from './render/lighting.js';
import { Post } from './render/post.js';
import { Director } from './camera/director.js';
import { createDock } from './ui/dock.js';
import { createGui } from './ui/gui.js';
import { Music } from './audio/music.js';

// Two worlds share one renderer, camera director and post pipeline:
//   city   - the white cityscape from the title screen
//   office - procedurally generated Mirror's Edge style office floors
//   mall   - a New Eden style shopping mall and its plaza
const looks = { city: { ...LOOK }, office: { ...OFFICE_LOOK }, mall: { ...MALL_LOOK } };
const look = { ...looks.city }; // the active world's look (edited by the settings panel)
let kind = 'city';

const app = document.getElementById('app');
const fadeEl = document.getElementById('fade');
const loadingEl = document.getElementById('loading');

const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const materials = createMaterials(look);
const sky = new Sky();
scene.add(sky.mesh);
const water = new Water(look);
scene.add(water.mesh);
const floorMirror = new FloorMirror();
const lighting = new Lighting(scene);

let dock = null;
let gui = null;
const director = new Director({ dom: renderer.domElement, overlay: fadeEl, onChange: () => dock?.sync() });
const post = new Post(renderer, scene, director.camera, look);

let city = null;
let office = null;
let mall = null;
let world = null;
const stats = { text: '' };

// Soft studio reflections for glossy office floors, glass and steel.
let envMap = null;
function officeEnv() {
  if (!envMap) {
    const pm = new THREE.PMREMGenerator(renderer);
    envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return envMap;
}

// ------------------------------------------------------------------ music

const store = {
  get(k, d) {
    try {
      return localStorage.getItem(`white-city:${k}`) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`white-city:${k}`, v);
    } catch {
      /* private mode etc. */
    }
  },
};
const music = new Music();
const musicPrefs = {
  on: store.get('music', 'on') === 'on',
  volume: Number(store.get('volume', '0.7')),
  url: store.get('music-url', ''),
  set(on) {
    this.on = on;
    store.set('music', on ? 'on' : 'off');
    if (on) music.start();
    else music.stop();
    dock?.sync();
  },
  setVolume(v) {
    this.volume = v;
    store.set('volume', String(v));
    music.setVolume(v);
  },
  setUrl(v) {
    this.url = (v || '').trim();
    store.set('music-url', this.url);
    music.setCustomUrl(this.url);
  },
};
musicPrefs.tune = '(starts on first click)';
musicPrefs.next = () => music.nextTune();
music.volume = musicPrefs.volume;
music.customUrl = musicPrefs.url;

// A small, clickable hint while music is wanted but the browser is still
// waiting for a user gesture.
const soundHint = document.createElement('button');
soundHint.className = 'sound-hint';
soundHint.type = 'button';
soundHint.innerHTML = '<span class="dot"></span>Click anywhere for music';
document.body.appendChild(soundHint);
let soundHintReady = false;
setTimeout(() => {
  soundHintReady = true;
  updateSoundHint();
}, 1800);
function updateSoundHint() {
  const show = soundHintReady && musicPrefs.on && !music.running && !musicPrefs.url;
  soundHint.classList.toggle('show', show);
}
music.onChange = () => {
  dock?.sync();
  updateSoundHint();
};
music.onSong = (song) => (musicPrefs.tune = song.name);

// Browsers only allow audio after a real user gesture (clicks, taps, most
// keys; not modifier keys). Keep trying on every gesture until it runs.
const IGNORED_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Tab', 'Fn'];
function onGesture(e) {
  if (!musicPrefs.on || music.running) return;
  if (e.type === 'keydown' && (IGNORED_KEYS.includes(e.key) || e.key.toLowerCase() === 'm')) return;
  if (e.target?.closest?.('[data-act="music"]')) return; // that button toggles music itself
  music.start();
}
for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click']) window.addEventListener(type, onGesture, true);

// ------------------------------------------------------------------ look

function applyLook() {
  lighting.setSun(look.sunElevation, look.sunAzimuth);
  lighting.sun.color.set(look.sunColor);
  lighting.sun.intensity = look.sunIntensity;
  lighting.hemi.color.set(look.skyLight);
  lighting.hemi.groundColor.set(look.groundLight);
  lighting.hemi.intensity = look.hemiIntensity;

  const su = sky.uniforms;
  su.uZenith.value.set(look.zenith);
  su.uHorizon.value.set(look.horizon);
  su.uSunDir.value.copy(lighting.dir);
  su.uIntensity.value = look.skyIntensity;

  const fu = post.fog.uniforms;
  fu.get('uFogColor').value.set(look.fogColor).multiplyScalar(look.skyIntensity);
  fu.get('uSunGlow').value.set('#f4f8ff').multiplyScalar(0.08 * look.skyIntensity);
  fu.get('uSunDir').value.copy(lighting.dir);
  fu.get('uDensity').value = look.fogDensity;
  fu.get('uFalloff').value = look.fogFalloff;
  fu.get('uStart').value = look.fogStart;
  fu.get('uExposure').value = look.exposure;
  fu.get('uFarHaze').value = look.farHaze;

  const ao = post.ao.configuration;
  ao.intensity = look.aoIntensity;
  ao.color = new THREE.Color(look.aoColor);
  if (ao.halfRes !== look.aoHalfRes) ao.halfRes = look.aoHalfRes;
  if (post.aoQuality !== look.aoQuality) {
    post.aoQuality = look.aoQuality;
    post.ao.setQualityMode(look.aoQuality);
  }

  post.bloom.intensity = look.bloomIntensity;
  post.bloom.luminanceMaterial.threshold = look.bloomThreshold;
  post.bloom.luminanceMaterial.smoothing = look.bloomSmoothing;
  post.setToneMapping(look.toneMapping);
  const gu = post.grade.uniforms;
  gu.get('uShadowTint').value.set(look.shadowTint);
  gu.get('uShadowAmt').value = look.shadowTintAmount;
  gu.get('uSaturation').value = look.saturation;
  gu.get('uContrast').value = look.contrast;
  gu.get('uHighlightNeutral').value = look.highlightNeutral;
  post.vignette.darkness = look.vignette;

  materials.uniforms.uBaseDarken.value = look.baseDarken;
  materials.uniforms.uBaseHeight.value = look.baseHeight;

  water.uniforms.uWaterColor.value.set(look.waterColor);
  water.uniforms.uReflect.value = look.waterReflect;
  water.uniforms.uIntensity.value = look.skyIntensity * 0.58;
}

function setAccents(on) {
  look.accents = on;
  looks.city.accents = looks.office.accents = looks.mall.accents = on;
  city?.setAccents(on);
  office?.setAccents(on);
  mall?.setAccents(on);
  dock?.sync();
}

// ------------------------------------------------------------------ worlds

const params = new URLSearchParams(location.search);
const randomSeed = () => 1 + Math.floor(Math.random() * 999999);

function buildWorld(k, seed) {
  if (city) {
    scene.remove(city.group);
    city.dispose();
    city = null;
  }
  if (office) {
    scene.remove(office.group);
    office.dispose();
    office = null;
  }
  if (mall) {
    scene.remove(mall.group);
    mall.dispose();
    mall = null;
  }
  if (k !== kind) {
    looks[kind] = { ...look };
    Object.assign(look, looks[k]);
    kind = k;
  }
  const getAspect = () => director.aspect;
  if (k === 'city') {
    city = generateCity(seed, materials);
    scene.add(city.group);
    city.setAccents(look.accents);
    lighting.maxHeight = city.heightfield.maxHeight;
    lighting.bounds = null;
    scene.environment = null;
    water.mesh.visible = true;
    world = new CityWorld(city, { getAspect, getSunDir: () => lighting.dir });
    stats.text = `${city.stats.lots} lots · ${Math.round(city.stats.prims / 1000)}k parts · ${city.stats.ms} ms`;
  } else if (k === 'mall') {
    const t0 = performance.now();
    mall = createMall(seed, { mirror: floorMirror });
    scene.add(mall.group);
    mall.setAccents(look.accents);
    lighting.bounds = mall.bounds;
    look.sunAzimuth = mall.sun.azimuth;
    look.sunElevation = mall.sun.elevation;
    // Shade picks up the accent colour, like the amber-soaked game shots.
    look.shadowTint = '#' + new THREE.Color(mall.palette.accent).multiplyScalar(0.6).getHexString();
    look.shadowTintAmount = 0.16;
    scene.environment = officeEnv();
    water.mesh.visible = false;
    world = new OfficeWorld(mall, { getAspect, Planner: MallPlanner, kind: 'mall', isoFrameRange: [40, 180], maxDistance: 120 });
    stats.text = `${mall.mall.name} · ${mall.palette.name} · ${mall.levels} levels · ${Math.round(performance.now() - t0)} ms`;
  } else {
    const t0 = performance.now();
    office = createOffice(seed, { mirror: floorMirror });
    scene.add(office.group);
    office.setAccents(look.accents);
    lighting.bounds = office.bounds;
    look.sunAzimuth = office.sun.azimuth;
    look.sunElevation = office.sun.elevation;
    // Monochrome offices bathe the space in their colour, like the green lounge shots.
    look.skyLight = office.mono ? '#' + new THREE.Color('#ffffff').lerp(new THREE.Color(office.palette.accent), 0.3).getHexString() : OFFICE_LOOK.skyLight;
    look.groundLight = office.mono ? '#' + new THREE.Color(OFFICE_LOOK.groundLight).lerp(new THREE.Color(office.palette.accent), 0.2).getHexString() : OFFICE_LOOK.groundLight;
    scene.environment = officeEnv();
    water.mesh.visible = false;
    world = new OfficeWorld(office, { getAspect });
    stats.text = `${office.company.name} · ${office.palette.name}${office.mono ? ' (mono)' : ''} · ${office.rooms.length} spaces · ${Math.round(performance.now() - t0)} ms`;
  }
  applyLook();
  director.setWorld(world, post);
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  if (k !== 'city') url.searchParams.set('world', k);
  else url.searchParams.delete('world');
  history.replaceState(null, '', url);
  gui?.refresh();
  dock?.sync();
  console.info(`[${k}] seed ${seed}:`, stats.text);
}

function newWorld(k = kind, seed) {
  if (director.transition?.type === 'morph') return;
  director.fade(() => buildWorld(k, seed ?? randomSeed()));
}
director.onNewWorld = () => newWorld(kind);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(w, h);
  water.setSize(size.x, size.y);
  floorMirror.setSize(size.x, size.y);
  director.resize(w, h);
}
window.addEventListener('resize', resize);

applyLook();

// Build after the first paint so the white loading screen shows immediately.
setTimeout(() => {
  const seed = Number(params.get('seed'));
  buildWorld(['office', 'mall'].includes(params.get('world')) ? params.get('world') : 'city', Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : randomSeed());
  dock = createDock({
    director,
    getWorld: () => kind,
    setWorld: (k) => k !== kind && newWorld(k),
    getAccents: () => look.accents,
    setAccents,
    toggleSettings: () => gui.toggle(),
    newWorld: () => newWorld(kind),
    getMusic: () => music.playing && music.running,
    toggleMusic: () => musicPrefs.set(!(music.playing && music.running)),
    nextTune: () => {
      if (!music.running) musicPrefs.set(true);
      music.nextTune();
    },
  });
  gui = createGui({ look, applyLook, director, current: () => ({ kind, seed: city?.seed ?? office?.seed ?? mall?.seed }), newWorld, setAccents, stats, musicPrefs });
  dock.sync();
  resize();
  start();
  // Starts right away only if the browser already allows audio here.
  if (musicPrefs.on) music.start();
}, 60);

// ------------------------------------------------------------------ frame loop

const timer = new THREE.Timer();
timer.connect(document);
let first = true;

// If the GPU can't keep up, step the pixel ratio down (never back up, to
// avoid oscillating). Skips the first seconds and any transition hitches.
const adapt = { t: 0, ema: 1 / 60, min: 1 };
function adaptResolution(dt) {
  adapt.t += dt;
  if (adapt.t < 4 || director.transition || dt > 0.25) return;
  adapt.ema += (dt - adapt.ema) * 0.05;
  const pr = renderer.getPixelRatio();
  if (adapt.ema > 1 / 38 && pr > adapt.min) {
    renderer.setPixelRatio(Math.max(adapt.min, pr - 0.25));
    resize();
    adapt.t = 2;
    adapt.ema = 1 / 60;
    console.info(`[perf] pixel ratio -> ${renderer.getPixelRatio()}`);
  }
}

function frame(time) {
  timer.update(time);
  const dt = timer.getDelta();
  renderFrame(dt);
  adaptResolution(dt);
}

function renderFrame(dt) {
  director.update(dt);
  const cam = director.camera;
  cam.updateMatrixWorld();

  sky.update(cam);
  lighting.fitShadow(cam);
  renderer.shadowMap.needsUpdate = true;
  if (kind === 'city') {
    water.uniforms.uTime.value += dt;
    water.render(renderer, scene, cam, sky);
  } else if (office || mall) {
    floorMirror.render(renderer, scene, cam, sky, world?.clipPlanes || []);
  }

  post.update(cam, director.fogEye);
  const r = (director.aoRadius || 8) * look.aoRadiusScale;
  if (Math.abs(post.ao.configuration.aoRadius - r) > 0.02) post.ao.configuration.aoRadius = r;
  renderer.clippingPlanes = world?.clipPlanes || [];
  post.render(dt);
  renderer.clippingPlanes = [];

  if (first) {
    first = false;
    loadingEl.classList.add('done');
  }
}

function start() {
  timer.reset();
  renderer.setAnimationLoop(frame);
}

// Handy for debugging from the console.
window.__city = {
  director,
  get city() {
    return city;
  },
  get office() {
    return office;
  },
  get mall() {
    return mall;
  },
  get world() {
    return world;
  },
  look,
  applyLook,
  renderer,
  post,
  lighting,
  music,
  newWorld,
  step: renderFrame,
};
if (import.meta.env.DEV) import('./debug.js').then((m) => m.installDebug(window.__city));
