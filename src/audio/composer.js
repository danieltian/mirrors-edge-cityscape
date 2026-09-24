import { RNG } from '../util/rng.js';

// Composes ambient-electronic pieces in the vein of the Mirror's Edge score
// (Solar Fields). Every call gives a new tune in one of five styles:
//   menu    - the title screen: soft four-on-the-floor, cold pads, a filtered
//             16th sequence and a sparse electric-piano motif
//   kruger  - after "Pirandello Kruger": fast (~140 bpm) but felt half-time,
//             a rolling off-beat bass, shuffling 16th hats, a glassy
//             polyrhythmic arpeggio drenched in delay, a slow bell melody
//             and glitchy stutters, building and breaking over minutes
//   drift   - beatless: long glassy pads, a sub drone, sparkles and a bell
//   glass   - minimal / IDM: plucked 5-against-4 arpeggio, clicks, rim
//             shots, a syncopated sub and a formant "choir" pad
//   breaks  - downtempo: swung breakbeat, deep sub, electric-piano chords
// The music player (music.js) reads the returned description step by step.

export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const STYLES = ['menu', 'kruger', 'drift', 'glass', 'breaks'];
const STYLE_NAMES = { menu: 'Menu', kruger: 'Run', drift: 'Drift', glass: 'Glass', breaks: 'Breaks' };

const mod7 = (d) => ((d % 7) + 7) % 7;
const semis = (scale, d) => scale[mod7(d)] + 12 * Math.floor(d / 7);
const isDim = (scale, d) => semis(scale, d + 4) - semis(scale, d) === 6;

// Minor-key loops (scale degrees, 0 = i).
const PROGRESSIONS = [
  [0, 5],
  [0, 3],
  [0, 6],
  [0, 5, 2, 6],
  [0, 6, 5, 6],
  [5, 6, 0, 0],
  [0, 2, 5, 3],
  [0, 3, 5, 4],
  [0, 0, 5, 3],
  [0, 5, 3, 4],
  [3, 4, 0, 0],
  [0, 1, 0, 6], // only used in phrygian (bII)
];

// Open voicing: root, fifth, ninth, sometimes the third an octave up.
function voice(scale, tonic, deg, withThird) {
  const r = semis(scale, deg);
  // Add the ninth, unless it is a flat ninth (too harsh) - then the octave.
  const ninth = semis(scale, deg + 8);
  const pad = [r, semis(scale, deg + 4), ninth - r === 13 ? r + 12 : ninth];
  if (withThird) pad.push(semis(scale, deg + 9));
  let notes = pad.map((s) => tonic + s);
  // Keep the voicing roughly centred on E♭4.
  const mid = notes.reduce((a, b) => a + b, 0) / notes.length;
  const shift = Math.round((63 - mid) / 12) * 12;
  notes = notes.map((n) => n + shift);
  const root = 36 + ((((tonic + r - 36) % 12) + 12) % 12);
  // Sequencer tones (in key): root, fifth, octave, ninth (or fifth above the
  // octave when the ninth would be flat), third an octave up.
  const fifth = semis(scale, deg + 4) - r;
  const third = semis(scale, deg + 2) - r;
  const nine = ninth - r === 13 ? 19 : ninth - r;
  const seq = [0, fifth, 12, nine, third + 12].map((iv) => root + 12 + iv);
  return { deg, pad: notes, root, seq };
}

// 16-step sequence (menu): idx into chord.seq, accent.
function sequencePattern(rng) {
  const density = rng.range(0.5, 0.85);
  const accents = rng.pick([
    [0, 3, 6, 10, 12],
    [0, 4, 8, 12],
    [0, 3, 8, 11],
    [0, 6, 10],
  ]);
  const pat = [];
  for (let i = 0; i < 16; i++) {
    if (i > 0 && !rng.chance(density)) {
      pat.push(null);
      continue;
    }
    const idx = i === 0 ? 0 : rng.weighted([[0, 4], [1, 3], [2, 3], [3, 1.2], [4, 1]]);
    pat.push({ idx, acc: accents.includes(i) ? 1 : 0.55 });
  }
  return pat;
}

// A cycle of `len` steps that runs against the 16-step bar (3, 5, 6 or 7
// long), so the arpeggio drifts across the beat like the Solar Fields ones.
function polyPattern(rng, len, rests = 0.15) {
  const shape = rng.pick(['up', 'updown', 'random', 'pedal']);
  const pat = [];
  for (let i = 0; i < len; i++) {
    if (i > 0 && rng.chance(rests)) {
      pat.push(null);
      continue;
    }
    let idx;
    if (shape === 'up') idx = i % 5;
    else if (shape === 'updown') idx = [0, 1, 2, 3, 4, 3, 2, 1][i % 8];
    else if (shape === 'pedal') idx = i % 2 === 0 ? 0 : 1 + ((i >> 1) % 4);
    else idx = rng.weighted([[0, 3], [1, 2.5], [2, 3], [3, 1.5], [4, 1.5]]);
    pat.push({ idx, acc: i === 0 ? 1 : rng.range(0.5, 0.85), up: rng.chance(0.18) ? 12 : 0 });
  }
  return pat;
}

// A short motif (3-5 notes over two bars) on a minor-pentatonic palette.
const KEY_RHYTHMS = [
  [0, 6, 12],
  [0, 4, 10, 16],
  [0, 3, 6, 14],
  [0, 8, 12, 20, 22],
  [2, 8, 14],
  [0, 6, 12, 18, 24],
  [0, 10, 16],
];
function keysMotif(rng) {
  const rhythm = rng.pick(KEY_RHYTHMS);
  let i = rng.pick([3, 4, 5]); // start around the fifth / octave
  const notes = [];
  rhythm.forEach((step, k) => {
    if (k > 0) i = Math.max(0, Math.min(8, i + rng.weighted([[-1, 3], [1, 2.5], [-2, 1], [2, 1], [0, 0.8]])));
    notes.push({ step, idx: i, vel: k === 0 ? 1 : rng.range(0.65, 0.9) });
  });
  return notes;
}

// A slow bell melody over four bars: few, long notes.
function bellPhrase(rng, bars = 4) {
  const n = rng.int(3, 6);
  const out = [];
  let i = rng.pick([4, 5, 6]);
  const slots = [];
  for (let b = 0; b < bars; b++) for (const s of [0, 4, 6, 8, 10, 12]) slots.push(b * 16 + s);
  let at = 0;
  for (let k = 0; k < n; k++) {
    at += rng.pick([6, 8, 10, 12, 16]);
    if (at >= bars * 16) break;
    const pos = slots.reduce((best, s) => (Math.abs(s - at) < Math.abs(best - at) ? s : best), slots[0]);
    if (out.some((o) => o.pos === pos)) continue;
    i = Math.max(1, Math.min(8, i + rng.weighted([[-1, 3], [1, 2], [-2, 1.2], [2, 1], [0, 0.6]])));
    out.push({ pos, idx: i, vel: rng.range(0.7, 1) });
  }
  if (!out.length) out.push({ pos: 0, idx: 5, vel: 1 });
  return { bars, notes: out };
}

// Drum parts: 16 velocities (0 = silent) per part.
const P = (s) => s.split('').map((c) => (c === '.' ? 0 : c === 'x' ? 0.55 : c === 'X' ? 1 : Number(c) / 9));
const DRUMS = {
  four: { kick: P('X...X...X...X...') },
  half: { kick: P('X.........X.....') },
  broken: { kick: P('X.....X.X.....X.') },
  // Half-time breakbeat at ~140: kick, snare on the "3", shuffling hats.
  kruger: { kick: P('X......x..X.....'), snare: P('........X.....3.'), open: P('......5.......5.') },
  krugerB: { kick: P('X.....x...X..x..'), snare: P('........X..2..3.'), open: P('..............6.') },
  minimal: { kick: P('X...X...X...X...'), rim: P('....6......6..4.') },
  sparse: { kick: P('X.......X.x.....'), rim: P('...5......5.....') },
  breaks: { kick: P('X......X..X.....'), snare: P('....X..2....X..3'), open: P('..............5.') },
  breaksB: { kick: P('X.X.......X..X..'), snare: P('....X.......X.2.'), open: P('......4.......4.') },
  heart: { kick: P('5..3............') },
};

function hatPattern(rng, kind) {
  const v = [];
  for (let i = 0; i < 16; i++) {
    if (kind === 'sixteenths') v.push(i % 4 === 2 ? 0.95 : i % 2 === 1 ? rng.range(0.25, 0.45) : rng.range(0.45, 0.6));
    else if (kind === 'eighths') v.push(i % 2 === 0 ? (i % 4 === 2 ? 0.9 : 0.45) : rng.chance(0.25) ? 0.25 : 0);
    else if (i % 4 === 2) v.push(0.9); // off-beat eighths
    else if (i % 2 === 1) v.push(rng.chance(0.55) ? rng.range(0.25, 0.45) : 0);
    else v.push(i % 4 === 0 ? 0 : 0.3);
  }
  return v;
}

// Rolling bass: off-beat sixteenths between the kicks (the psybient roll),
// mostly the root with the odd octave or fifth.
function rollPattern(rng) {
  return Array.from({ length: 16 }, (_, i) => {
    if (i % 4 === 0) return null;
    const r = rng.next();
    return { iv: r < 0.08 ? 7 : r < 0.18 ? 12 : 0, vel: i % 4 === 2 ? 1 : 0.75 };
  });
}

// Syncopated sub-bass hits: step -> length in steps.
function subPattern(rng) {
  return rng.pick([
    { 0: 6, 7: 3, 10: 6 },
    { 0: 10, 10: 6 },
    { 0: 3, 3: 4, 10: 3, 14: 2 },
    { 0: 7, 7: 2, 10: 4, 14: 2 },
  ]);
}

// Section helper: everything off unless given.
const S = (name, bars, o) => ({
  name,
  bars,
  pad: true,
  arp: 0, // arpeggio / sequence level (0 = off)
  arpCut: [400, 800], // its filter sweep over the section
  bass: 'none', // none | drone | pulse | roll | sub
  drums: null, // key into song.drums
  hats: 0,
  snare: false,
  clap: false,
  keys: false,
  comp: false, // electric-piano chord stabs
  lead: false, // bell melody
  shimmer: 0, // sparkle density
  glitch: 0, // chance of a stutter at the end of a phrase
  riser: false,
  swell: false,
  ticks: true,
  ...o,
});

export function composeSong(seed = Math.floor(Math.random() * 2 ** 31), style = null) {
  const rng = new RNG(seed);
  style = style || rng.weighted([['menu', 2], ['kruger', 2.4], ['drift', 1.3], ['glass', 1.4], ['breaks', 1.3]]);
  const mode = rng.weighted([
    ['aeolian', 5],
    ['dorian', 3],
    ['phrygian', style === 'kruger' ? 2.5 : 1.5],
  ]);
  const scale = MODES[mode];
  // Pirandello Kruger sits in B♭ minor; favour it for that style.
  const pc = style === 'kruger' && rng.chance(0.35) ? 10 : rng.pick([0, 2, 4, 5, 7, 9, 10, 1]);
  const tonic = 48 + pc;
  const usable = PROGRESSIONS.filter((p) => p.every((d) => !isDim(scale, d)) && (mode === 'phrygian' || !p.includes(1)));
  const prog = rng.pick(usable);
  const progB = rng.pick(usable.filter((p) => p !== prog));
  const withThird = rng.chance(0.6);
  const chords = prog.map((d) => voice(scale, tonic, d, withThird && rng.chance(0.8)));
  const chordsB = progB.map((d) => voice(scale, tonic, d, withThird && rng.chance(0.8)));

  // Keys / bell palette: minor pentatonic (1 b3 4 5 b7) over two octaves.
  const keysBase = 60 + pc + (pc > 6 ? -12 : 0);
  const keysScale = [];
  for (let o = 0; o < 2; o++) for (const p of [0, 3, 5, 7, 10]) keysScale.push(keysBase + p + 12 * o);

  const base = {
    seed,
    style,
    chords,
    chordsB,
    keysScale,
    tonicBass: 36 + pc,
    pedal: rng.chance(0.4),
    swing: 0,
    padKind: 'saw',
    arpKind: 'seq',
    motif: keysMotif(rng),
    lead: bellPhrase(rng),
    drums: DRUMS,
    hats: hatPattern(rng, 'offbeat'),
    roll: rollPattern(rng),
    sub: subPattern(rng),
    delay: 0.75, // delay time in beats (dotted eighth)
  };
  let song;

  if (style === 'menu') {
    const bpm = Math.round(rng.range(98, 118));
    const kick = rng.weighted([['four', 5], ['broken', 2]]);
    const clap = rng.chance(0.55);
    const sections = [
      S('intro', 8, { arp: 0.55, arpCut: [260, 700], bass: base.pedal ? 'drone' : 'none' }),
      S('build', 8, { arp: 0.75, arpCut: [650, 1300], drums: 'half', hats: 0.45, bass: 'pulse', keys: true, riser: true }),
      S('main', 16, { arp: 0.85, arpCut: [1100, 1900], drums: kick, hats: 1, clap, bass: 'pulse', keys: true }),
      S('breakdown', 8, { arp: 0.5, arpCut: [500, 380], keys: true, riser: true, ticks: false, bass: 'drone' }),
      S('main2', 16, { arp: 0.9, arpCut: [1300, 2300], drums: kick, hats: 1, clap: true, bass: 'pulse', keys: true, keysUp: rng.chance(0.5) }),
      S('outro', 8, { arp: 0.6, arpCut: [1400, 300], drums: 'half', hats: 0.3, bass: 'drone' }),
    ];
    if (rng.chance(0.35)) sections.splice(3, 1); // sometimes no breakdown
    song = {
      ...base,
      bpm,
      barsPerChord: prog.length === 2 ? 4 : rng.pick([2, 4]),
      sections,
      seqPattern: sequencePattern(rng),
      seqWave: rng.pick(['sawtooth', 'square']),
    };
  } else if (style === 'kruger') {
    const bpm = Math.round(rng.range(136, 146));
    const loop = rng.pick([3, 5, 6, 7]);
    const kitB = rng.chance(0.5) ? 'krugerB' : 'kruger';
    const sections = [
      S('intro', 8, { arp: 0.5, arpCut: [300, 900], shimmer: 0.05, bass: 'drone', ticks: true }),
      S('build', 8, { arp: 0.7, arpCut: [800, 1800], bass: 'roll', drums: 'half', hats: 0.5, riser: true, glitch: 0.4 }),
      S('run', 16, { arp: 0.85, arpCut: [1500, 3200], bass: 'roll', drums: 'kruger', hats: 1, snare: true, glitch: 0.35 }),
      S('break', 8, { arp: 0.45, arpCut: [900, 500], lead: true, shimmer: 0.08, bass: 'drone', swell: true, part: 'B' }),
      S('run2', 16, { arp: 0.95, arpCut: [2000, 4200], bass: 'roll', drums: kitB, hats: 1, snare: true, lead: true, glitch: 0.45, part: rng.chance(0.5) ? 'B' : 'A' }),
      S('outro', 8, { arp: 0.6, arpCut: [2400, 400], bass: 'drone', drums: 'half', hats: 0.4, shimmer: 0.05 }),
    ];
    if (rng.chance(0.4)) sections.splice(4, 0, S('run1b', 8, { arp: 0.9, arpCut: [1800, 2600], bass: 'roll', drums: 'kruger', hats: 1, snare: true, riser: true, glitch: 0.5 }));
    song = {
      ...base,
      bpm,
      barsPerChord: rng.pick([2, 4]),
      sections,
      padKind: rng.pick(['saw', 'choir']),
      arpKind: 'pluck',
      arp: { loop, pattern: polyPattern(rng, loop, 0.1), decay: rng.range(0.16, 0.3), bright: rng.range(0.6, 1) },
      hats: hatPattern(rng, 'sixteenths'),
      delay: 0.75,
    };
  } else if (style === 'drift') {
    const bpm = Math.round(rng.range(70, 84));
    const sections = [
      S('dawn', 8, { shimmer: 0.1, bass: 'drone', ticks: false }),
      S('rise', 16, { shimmer: 0.14, bass: 'drone', lead: true, arp: rng.chance(0.5) ? 0.35 : 0, arpCut: [400, 900], ticks: false }),
      S('float', 16, { shimmer: 0.12, bass: 'drone', lead: true, drums: rng.chance(0.5) ? 'heart' : null, part: 'B', ticks: false, swell: true }),
      S('fade', 8, { shimmer: 0.08, bass: 'drone', ticks: false }),
    ];
    song = {
      ...base,
      bpm,
      barsPerChord: rng.pick([4, 8]),
      sections,
      padKind: rng.pick(['glass', 'choir']),
      arpKind: 'pluck',
      arp: { loop: 8, pattern: polyPattern(rng, 8, 0.45), decay: 0.5, bright: 0.3, eighths: true },
      lead: bellPhrase(rng, 4),
      delay: 1,
    };
  } else if (style === 'glass') {
    const bpm = Math.round(rng.range(118, 128));
    const kit = rng.pick(['minimal', 'sparse']);
    const sections = [
      S('intro', 8, { arp: 0.55, arpCut: [500, 1400], bass: 'none', ticks: true, glitch: 0.2 }),
      S('pulse', 16, { arp: 0.75, arpCut: [1200, 2600], bass: 'sub', drums: kit, hats: 0.5, glitch: 0.3 }),
      S('open', 8, { arp: 0.5, arpCut: [1600, 700], bass: 'drone', keys: rng.chance(0.6), lead: true, shimmer: 0.06, part: 'B' }),
      S('pulse2', 16, { arp: 0.85, arpCut: [1500, 3400], bass: 'sub', drums: kit, hats: 0.8, keys: true, glitch: 0.4 }),
      S('outro', 8, { arp: 0.5, arpCut: [2000, 400], bass: 'sub', drums: 'half', hats: 0.3 }),
    ];
    song = {
      ...base,
      bpm,
      barsPerChord: rng.pick([2, 4]),
      sections,
      padKind: 'choir',
      arpKind: 'pluck',
      arp: { loop: rng.pick([5, 7]), pattern: polyPattern(rng, rng.pick([5, 7]), 0.2), decay: rng.range(0.1, 0.18), bright: rng.range(0.3, 0.6), sine: true },
      hats: hatPattern(rng, 'eighths'),
    };
    song.arp.loop = song.arp.pattern.length;
  } else {
    const bpm = Math.round(rng.range(84, 96));
    const kitB = rng.chance(0.5) ? 'breaksB' : 'breaks';
    const sections = [
      S('intro', 4, { comp: true, bass: 'drone', shimmer: 0.04 }),
      S('groove', 16, { comp: true, bass: 'sub', drums: 'breaks', hats: 1, snare: true, keys: rng.chance(0.5) }),
      S('lift', 8, { comp: true, bass: 'drone', lead: true, shimmer: 0.06, part: 'B', swell: true }),
      S('groove2', 16, { comp: true, bass: 'sub', drums: kitB, hats: 1, snare: true, keys: true, lead: rng.chance(0.5) }),
      S('outro', 8, { comp: true, bass: 'drone', drums: 'half', hats: 0.3 }),
    ];
    song = {
      ...base,
      bpm,
      swing: rng.range(0.12, 0.22),
      barsPerChord: rng.pick([2, 4]),
      sections,
      padKind: 'warm',
      compSteps: rng.pick([[0, 7], [2, 10], [0, 3, 10], [6, 14]]),
      hats: hatPattern(rng, 'eighths'),
    };
  }
  song.name = `${STYLE_NAMES[style]} · ${NAMES[pc]} ${mode} · ${song.bpm} bpm`;
  return song;
}
