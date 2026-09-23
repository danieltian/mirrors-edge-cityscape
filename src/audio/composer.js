import { RNG } from '../util/rng.js';

// Composes an ambient-electronic piece in the vein of the Mirror's Edge menu
// music: minor modes, slow harmony with open "cold" voicings, a filtered
// 16th-note sequence, a pulsing sub, a soft four-on-the-floor, and a short,
// sparse electric-piano motif soaked in delay. Every call gives a new tune;
// the arrangement builds, breaks down and returns.

export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

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

const KICKS = {
  four: [0, 4, 8, 12],
  half: [0, 10],
  broken: [0, 6, 8, 14],
};

function hatPattern(rng) {
  const v = [];
  for (let i = 0; i < 16; i++) {
    if (i % 4 === 2) v.push(0.9); // off-beat eighths
    else if (i % 2 === 1) v.push(rng.chance(0.55) ? rng.range(0.25, 0.45) : 0);
    else v.push(i % 4 === 0 ? 0 : 0.3);
  }
  return v;
}

export function composeSong(seed = Math.floor(Math.random() * 2 ** 31)) {
  const rng = new RNG(seed);
  const mode = rng.weighted([
    ['aeolian', 5],
    ['dorian', 3],
    ['phrygian', 1.5],
  ]);
  const scale = MODES[mode];
  const pc = rng.pick([0, 2, 4, 5, 7, 9, 10, 1]);
  const tonic = 48 + pc;
  const bpm = Math.round(rng.range(98, 118));

  const usable = PROGRESSIONS.filter((p) => p.every((d) => !isDim(scale, d)) && (mode === 'phrygian' || !p.includes(1)));
  const prog = rng.pick(usable);
  const withThird = rng.chance(0.6);
  const chords = prog.map((d) => voice(scale, tonic, d, withThird && rng.chance(0.8)));
  const barsPerChord = prog.length === 2 ? 4 : rng.pick([2, 4]);

  // Keys palette: minor pentatonic (1 b3 4 5 b7) over two octaves.
  const keysBase = 60 + pc + (pc > 6 ? -12 : 0);
  const keysScale = [];
  for (let o = 0; o < 2; o++) for (const p of [0, 3, 5, 7, 10]) keysScale.push(keysBase + p + 12 * o);

  const kick = rng.weighted([
    ['four', 5],
    ['broken', 2],
  ]);
  const clap = rng.chance(0.55);
  const pedal = rng.chance(0.4);

  // Arrangement in bars. seq = [level, cutoff at start, cutoff at end].
  const S = (name, bars, o) => ({
    name,
    bars,
    keys: false,
    kick: null,
    hats: 0,
    clap: false,
    bass: 'drone',
    riser: false,
    ticks: true,
    seq: [0.6, 400, 800],
    ...o,
  });
  const sections = [
    S('intro', 8, { seq: [0.55, 260, 700], bass: pedal ? 'drone' : 'none' }),
    S('build', 8, { seq: [0.75, 650, 1300], kick: 'half', hats: 0.45, bass: 'pulse', keys: true, riser: true }),
    S('main', 16, { seq: [0.85, 1100, 1900], kick, hats: 1, clap, bass: 'pulse', keys: true }),
    S('breakdown', 8, { seq: [0.5, 500, 380], keys: true, riser: true, ticks: false }),
    S('main2', 16, { seq: [0.9, 1300, 2300], kick, hats: 1, clap: true, bass: 'pulse', keys: true, keysUp: rng.chance(0.5) }),
    S('outro', 8, { seq: [0.6, 1400, 300], kick: 'half', hats: 0.3, keys: false }),
  ];
  if (rng.chance(0.35)) sections.splice(3, 1); // sometimes no breakdown

  return {
    seed,
    name: `${NAMES[pc]} ${mode} · ${bpm} bpm`,
    bpm,
    chords,
    barsPerChord,
    pedal,
    tonicBass: 36 + pc,
    sections,
    seqPattern: sequencePattern(rng),
    seqWave: rng.pick(['sawtooth', 'square']),
    keysScale,
    motif: keysMotif(rng),
    kicks: KICKS,
    hats: hatPattern(rng),
  };
}
