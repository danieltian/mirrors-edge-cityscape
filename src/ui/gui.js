import GUI from 'lil-gui';
import { TONE_MODES } from '../render/post.js';

// Settings panel (hidden until G / the gear button). Every change calls
// applyLook() so the scene updates live.

export function createGui({ look, applyLook, director, current, newWorld, setAccents, stats, musicPrefs }) {
  const gui = new GUI({ title: 'Settings', width: 290 });
  gui.domElement.classList.add('settings');
  gui.hide();
  const on = () => applyLook();

  const cityF = gui.addFolder('World');
  const cityState = { seed: current().seed };
  cityF.add(cityState, 'seed').name('Seed').listen().onFinishChange((v) => newWorld(current().kind, Math.max(1, Math.floor(Number(v)) || 1)));
  cityF.add({ go: () => newWorld() }, 'go').name('New seed (N)');
  cityF.add(look, 'accents').name('Accents (C)').listen().onChange((v) => setAccents(v));
  cityF.add(stats, 'text').name('Info').disable().listen();

  const mus = gui.addFolder('Music');
  mus.add(musicPrefs, 'on').name('Play (M)').listen().onChange((v) => musicPrefs.set(v));
  mus.add(musicPrefs, 'tune').name('Now playing').disable().listen();
  mus.add(musicPrefs, 'next').name('Next tune (Shift+M)');
  mus.add(musicPrefs, 'style', { Any: 'any', Menu: 'menu', 'Run (Pirandello Kruger)': 'kruger', Float: 'float', Glass: 'glass', Skyline: 'skyline', Nocturne: 'nocturne' }).name('Style').onChange((v) => musicPrefs.setStyle(v));
  mus.add(musicPrefs, 'volume', 0, 1, 0.01).name('Volume').onChange((v) => musicPrefs.setVolume(v));
  mus.add(musicPrefs, 'url').name('Custom track URL').onFinishChange((v) => musicPrefs.setUrl(v));
  mus.close();

  const cam = gui.addFolder('Camera');
  cam.add(director, 'driftSpeed', 0, 4, 0.05).name('Drift speed');
  cam.add(director.cut, 'interval', 4, 60, 1).name('Drift: new view every (s)');
  cam.add(director, 'autoResume', 0, 180, 5).name('Auto-resume drift (s)');

  const light = gui.addFolder('Light');
  light.add(look, 'sunElevation', 5, 80, 0.5).name('Sun elevation').onChange(on);
  light.add(look, 'sunAzimuth', 0, 360, 1).name('Sun azimuth').onChange(on);
  light.add(look, 'sunIntensity', 0, 8, 0.05).name('Sun intensity').onChange(on);
  light.addColor(look, 'sunColor').name('Sun colour').onChange(on);
  light.addColor(look, 'skyLight').name('Sky light').onChange(on);
  light.addColor(look, 'groundLight').name('Bounce light').onChange(on);
  light.add(look, 'hemiIntensity', 0, 6, 0.05).name('Ambient intensity').onChange(on);
  light.add(look, 'baseDarken', 0, 1, 0.01).name('Street darkening').onChange(on);

  const atmo = gui.addFolder('Atmosphere');
  atmo.addColor(look, 'zenith').name('Sky zenith').onChange(on);
  atmo.addColor(look, 'horizon').name('Sky horizon').onChange(on);
  atmo.add(look, 'skyIntensity', 0.5, 5, 0.05).name('Sky brightness').onChange(on);
  atmo.addColor(look, 'fogColor').name('Haze colour').onChange(on);
  atmo.add(look, 'fogDensity', 0, 0.002, 0.00001).name('Haze density').onChange(on);
  atmo.add(look, 'fogFalloff', 0.0001, 0.005, 0.0001).name('Haze height falloff').onChange(on);
  atmo.add(look, 'fogStart', 0, 1500, 10).name('Clear distance').onChange(on);
  atmo.add(look, 'farHaze', 0, 0.0006, 0.00001).name('Distant haze').onChange(on);

  const ao = gui.addFolder('Ambient occlusion');
  ao.add(look, 'aoIntensity', 0, 10, 0.1).name('Intensity').onChange(on);
  ao.add(look, 'aoRadiusScale', 0.2, 4, 0.05).name('Radius scale').onChange(on);
  ao.addColor(look, 'aoColor').name('Colour').onChange(on);
  ao.add(look, 'aoQuality', ['Performance', 'Low', 'Medium', 'High', 'Ultra']).name('Quality').onChange(on);
  ao.add(look, 'aoHalfRes').name('Half resolution').onChange(on);

  const post = gui.addFolder('Image');
  post.add(look, 'toneMapping', TONE_MODES).name('Tone mapping').onChange(on);
  post.add(look, 'exposure', 0.2, 3, 0.01).name('Exposure').onChange(on);
  post.add(look, 'bloomIntensity', 0, 3, 0.01).name('Bloom').onChange(on);
  post.add(look, 'bloomThreshold', 0, 3, 0.01).name('Bloom threshold').onChange(on);
  post.addColor(look, 'shadowTint').name('Shadow tint').onChange(on);
  post.add(look, 'shadowTintAmount', 0, 1, 0.01).name('Tint amount').onChange(on);
  post.add(look, 'saturation', 0, 2, 0.01).name('Saturation').onChange(on);
  post.add(look, 'contrast', 0.5, 1.5, 0.01).name('Contrast').onChange(on);
  post.add(look, 'highlightNeutral', 0, 1, 0.01).name('Neutral highlights').onChange(on);
  post.add(look, 'vignette', 0, 1, 0.01).name('Vignette').onChange(on);

  const water = gui.addFolder('Water');
  water.addColor(look, 'waterColor').name('Colour').onChange(on);
  water.add(look, 'waterReflect', 0, 1, 0.01).name('Reflectivity').onChange(on);

  for (const f of [light, atmo, ao, post, water]) f.close();

  return {
    gui,
    toggle() {
      if (gui._hidden) gui.show();
      else gui.hide();
    },
    // The active look object changes when switching worlds.
    refresh() {
      cityState.seed = current().seed;
      for (const c of gui.controllersRecursive()) c.updateDisplay();
    },
  };
}
