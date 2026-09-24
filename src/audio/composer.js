import { RNG } from '../util/rng.js';
import { LEADS, BRIDGES, RIFFS, parseMelody } from './melodies.js';

// Composes ambient-electronic pieces in the vein of the Mirror's Edge score
// (Solar Fields). Every call gives a new tune in one of six styles:
//   menu     - the title screen: soft four-on-the-floor, cold pads, a
//              filtered 16th sequence, an electric-piano motif and melody
//   kruger   - after "Pirandello Kruger": fast (~140 bpm) but felt half-time,
//              a rolling off-beat bass, shuffling hats, a glassy polyrhythmic
//              arpeggio in delay, a harp melody at half speed, glitches
//   float    - relaxed but lifting: soft brushed beat, walking bass, glassy
//              pads and arpeggio, a vibraphone melody answered by a flute
//   glass    - mysterious and intricate: shifting plucked patterns, clicks
//              and rims, a formant choir, harp, celesta and marimba
//   skyline  - upbeat downtempo: swung breakbeat with fills, a melodic bass,
//              electric-piano comping and melody, vibraphone bridge
//   nocturne - the Kruger mood slowed down: Phrygian, pulsing sub, eerie
//              choir, a flute melody, half-time drums that build
// Every tune plays hand-written melodies (melodies.js), each on the chord
// progression it was written for, on soft voices (vibraphone, Rhodes, harp,
// celesta, marimba, a breathy flute); bass lines that move with the chords,
// a guide-tone counter-melody, drum fills and sometimes a key change.
// The music player (music.js) reads the returned description step by step.

export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const STYLES = ['menu', 'kruger', 'float', 'glass', 'skyline', 'nocturne'];
const STYLE_NAMES = { menu: 'Menu', kruger: 'Run', float: 'Float', glass: 'Glass', skyline: 'Skyline', nocturne: 'Nocturne' };

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
  soft: { kick: P('X.......x.......'), rim: P('....4.......4...') },
  softB: { kick: P('X.....x.X.......'), rim: P('....5.......5..3'), snare: P('............4...') },
  glassB: { kick: P('X..x..X...X..x..'), rim: P('...5..5....5..5.') },
  night: { kick: P('X.........x.....'), snare: P('........6.......'), rim: P('......3.......3.') },
};

function hatPattern(rng, kind) {
  const v = [];
  for (let i = 0; i < 16; i++) {
    if (kind === 'shaker') v.push(i % 4 === 2 ? 0.55 : i % 2 === 1 ? rng.range(0.2, 0.32) : 0.3);
    else if (kind === 'sixteenths') v.push(i % 4 === 2 ? 0.95 : i % 2 === 1 ? rng.range(0.25, 0.45) : rng.range(0.45, 0.6));
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


// ------------------------------------------------------------ melodies

// A written melody (scale degrees) as MIDI notes, stretched in time for
// the fast half-time styles.
function realise(tpl, scale, base, stretch) {
  const mel = parseMelody(tpl.mel, tpl.name);
  return {
    name: tpl.name,
    bars: mel.bars * stretch,
    notes: mel.notes.map((n) => ({ pos: n.pos * stretch, dur: n.dur * stretch, m: base + semis(scale, n.deg), vel: n.pos % 8 === 0 ? 1 : n.pos % 4 === 0 ? 0.9 : 0.78 })),
  };
}

// The second time round: the climb (bars 5-6) an octave up when it fits.
function liftMelody(mel) {
  const lo = (mel.bars / 8) * 64;
  const hi = (mel.bars / 8) * 96;
  const top = Math.max(...mel.notes.filter((n) => n.pos >= lo && n.pos < hi).map((n) => n.m));
  const up = top + 12 <= 86 ? 12 : 0;
  return { ...mel, notes: mel.notes.map((n) => ({ ...n, m: n.pos >= lo && n.pos < hi ? n.m + up : n.m })) };
}

// Counter-melody from guide tones: on every chord, its third or seventh,
// whichever is nearest the last one (smooth voice leading), high up.
function guideTones(chords, scale, tonic) {
  let last = 79;
  return chords.map((ch) => {
    let best = null;
    for (const k of [2, 6]) {
      const pc = (((tonic + semis(scale, ch.deg + k)) % 12) + 12) % 12;
      for (let m = 72; m <= 88; m++) if (((m % 12) + 12) % 12 === pc && (best === null || Math.abs(m - last) < Math.abs(best - last))) best = m;
    }
    last = best;
    return best;
  });
}

// Bass lines: per-bar templates of { s: step, len, d } where d is the
// root (r), fifth (5), octave (o) or an approach note into the next chord (a).
const BASS_LINES = {
  walk: [{ s: 0, len: 3, d: 'r' }, { s: 3, len: 1, d: 'r' }, { s: 6, len: 2, d: '5' }, { s: 8, len: 3, d: 'o' }, { s: 11, len: 1, d: '5' }, { s: 14, len: 2, d: 'a' }],
  pulse8: [{ s: 0, len: 2, d: 'r' }, { s: 2, len: 2, d: 'r' }, { s: 4, len: 2, d: 'o' }, { s: 6, len: 2, d: 'r' }, { s: 8, len: 2, d: 'r' }, { s: 10, len: 2, d: '5' }, { s: 12, len: 2, d: 'o' }, { s: 14, len: 2, d: 'a' }],
  synco: [{ s: 0, len: 5, d: 'r' }, { s: 6, len: 2, d: 'r' }, { s: 10, len: 3, d: '5' }, { s: 13, len: 1, d: 'o' }, { s: 14, len: 2, d: 'a' }],
  lazy: [{ s: 0, len: 7, d: 'r' }, { s: 7, len: 3, d: '5' }, { s: 10, len: 4, d: 'r' }, { s: 14, len: 2, d: 'a' }],
  octave: [{ s: 0, len: 2, d: 'r' }, { s: 3, len: 1, d: 'o' }, { s: 6, len: 2, d: 'r' }, { s: 8, len: 2, d: 'r' }, { s: 11, len: 1, d: 'o' }, { s: 12, len: 2, d: '5' }, { s: 14, len: 2, d: 'a' }],
};

// Drum fills in the last bar of an 8-bar phrase.
const FILLS = ['snareRoll', 'toms', 'stutter', 'openHat'];

// Section helper: everything off unless given.
const S = (name, bars, o) => ({
  name,
  bars,
  pad: true,
  part: 'A', // which chord progression
  arp: 0, // arpeggio / sequence level (0 = off)
  arpVar: 0, // which arpeggio pattern
  arpCut: [400, 800], // its filter sweep over the section
  bass: 'none', // none | drone | pulse | roll | sub | line
  drums: null, // key into song.drums
  hats: 0,
  snare: false,
  clap: false,
  fill: false, // drum fill at the end of each 8 bars
  crash: false, // cymbal swell as the section starts
  keys: false, // electric-piano motif
  comp: false, // electric-piano chord stabs
  lead: null, // melody: 'A' | 'B' | 'A2'
  leadKind: null, // vibes | rhodes | harp | celesta | marimba | flute (default: song.leadKind)
  counter: false, // sparse bell counter-melody
  shimmer: 0, // sparkle density
  glitch: 0, // chance of a stutter at the end of a phrase
  riser: false,
  swell: false,
  shift: 0, // key change in semitones
  ticks: true,
  ...o,
});

export function composeSong(seed = Math.floor(Math.random() * 2 ** 31), style = null) {
  const rng = new RNG(seed);
  style = style || rng.weighted([['menu', 2], ['kruger', 2], ['float', 1.6], ['glass', 1.4], ['skyline', 1.6], ['nocturne', 1.4]]);
  const mode = rng.weighted([
    ['aeolian', style === 'float' || style === 'skyline' ? 4 : 5],
    ['dorian', style === 'float' || style === 'skyline' ? 3 : 2],
    ['phrygian', style === 'kruger' || style === 'nocturne' ? 3 : style === 'glass' ? 1.5 : 0.5],
  ]);
  const scale = MODES[mode];
  // Pirandello Kruger sits in B♭ minor; favour it for that style.
  const pc = style === 'kruger' && rng.chance(0.35) ? 10 : rng.pick([0, 2, 4, 5, 7, 9, 10, 1]);
  const tonic = 48 + pc;
  const usable = PROGRESSIONS.filter((p) => p.every((d) => !isDim(scale, d)) && (mode === 'phrygian' || !p.includes(1)));
  // The melodies choose the A and B progressions (a melody and its chords
  // were written together); C, for the outro, is free.
  const fits = (t) => t.prog.every((d) => !isDim(scale, d));
  const pickTune = (list) => {
    const ok = list.filter(fits);
    const mine = ok.filter((t) => t.styles.includes(style));
    return rng.pick(mine.length ? mine : ok);
  };
  const tplA = pickTune(LEADS);
  const tplB = pickTune(BRIDGES);
  const others = usable.filter((p) => p.join() !== tplA.prog.join() && p.join() !== tplB.prog.join());
  const progC = rng.pick(others.length ? others : usable);
  const withThird = rng.chance(0.6);
  const voiced = (prog) => prog.map((d) => voice(scale, tonic, d, withThird && rng.chance(0.8)));
  const progs = { A: voiced(tplA.prog), B: voiced(tplB.prog), C: voiced(progC) };
  // Fast styles play everything at half speed, so the melody (and its
  // chords) move at the felt half-time pulse.
  const stretch = style === 'kruger' ? 2 : 1;
  const bpc = { A: tplA.bpc * stretch, B: tplB.bpc, C: progC.length === 2 ? 4 : rng.pick([2, 4]) };

  // Keys / bell palette: minor pentatonic (1 b3 4 5 b7) over two octaves.
  const keysBase = 60 + pc + (pc > 6 ? -12 : 0);
  const keysScale = [];
  for (let o = 0; o < 2; o++) for (const p of [0, 3, 5, 7, 10]) keysScale.push(keysBase + p + 12 * o);

  const melA = realise(tplA, scale, keysBase, stretch);
  const melodies = { A: melA, A2: liftMelody(melA), B: realise(tplB, scale, keysBase, 1) };
  const riff = rng.pick(RIFFS);

  const base = {
    seed,
    style,
    progs,
    bpc,
    barsPerChord: bpc.A,
    keysScale,
    tonicBass: 36 + pc,
    pedal: rng.chance(0.4),
    swing: 0,
    padKind: 'saw',
    arpKind: 'seq',
    leadKind: 'vibes',
    melodies,
    motif: riff.map(([step, idx], k) => ({ step, idx, vel: k === 0 ? 1 : 0.78 })),
    guides: { A: guideTones(progs.A, scale, tonic), B: guideTones(progs.B, scale, tonic), C: guideTones(progs.C, scale, tonic) },
    drums: DRUMS,
    hats: hatPattern(rng, 'offbeat'),
    roll: rollPattern(rng),
    sub: subPattern(rng),
    bassLine: BASS_LINES[rng.pick(Object.keys(BASS_LINES))],
    fillKind: rng.pick(FILLS),
    delay: 0.75, // delay time in beats (dotted eighth)
  };
  let song;
  const lift = rng.chance(0.35) ? 2 : 0; // key change for the last big section

  if (style === 'menu') {
    const bpm = Math.round(rng.range(98, 118));
    const kick = rng.weighted([['four', 5], ['broken', 2]]);
    const clap = rng.chance(0.55);
    const sections = [
      S('intro', 8, { arp: 0.55, arpCut: [260, 700], bass: base.pedal ? 'drone' : 'none', counter: rng.chance(0.5) }),
      S('build', 8, { arp: 0.75, arpCut: [650, 1300], drums: 'half', hats: 0.45, bass: 'pulse', keys: true, riser: true }),
      S('main', 16, { arp: 0.85, arpCut: [1100, 1900], drums: kick, hats: 1, clap, bass: 'pulse', keys: true, fill: true, crash: true }),
      S('breakdown', 8, { part: 'B', arp: 0.5, arpCut: [500, 380], lead: 'B', leadKind: 'vibes', riser: true, ticks: false, bass: 'drone' }),
      S('main2', 16, { arp: 0.9, arpCut: [1300, 2300], drums: kick, hats: 1, clap: true, bass: 'pulse', lead: 'A', leadKind: 'rhodes', fill: true, crash: true, shift: lift }),
      S('outro', 8, { arp: 0.6, arpCut: [1400, 300], drums: 'half', hats: 0.3, bass: 'drone', keys: true, shift: lift }),
    ];
    song = {
      ...base,
      bpm,
      sections,
      seqPattern: sequencePattern(rng),
      seqWave: rng.pick(['sawtooth', 'square']),
    };
  } else if (style === 'kruger') {
    const bpm = Math.round(rng.range(136, 146));
    const kitB = rng.chance(0.5) ? 'krugerB' : 'kruger';
    const loops = [rng.pick([3, 5, 6, 7]), rng.pick([3, 5, 6, 7])];
    const sections = [
      S('intro', 8, { arp: 0.5, arpCut: [300, 900], shimmer: 0.05, bass: 'drone', counter: true }),
      S('build', 8, { arp: 0.7, arpCut: [800, 1800], bass: 'roll', drums: 'half', hats: 0.5, riser: true, glitch: 0.4 }),
      S('run', 16, { arp: 0.85, arpCut: [1500, 3200], bass: 'roll', drums: 'kruger', hats: 1, snare: true, glitch: 0.35, fill: true, crash: true }),
      S('break', 8, { part: 'B', arp: 0.45, arpVar: 1, arpCut: [900, 500], lead: 'B', leadKind: 'celesta', shimmer: 0.08, bass: 'drone', swell: true }),
      S('run2', 16, { arp: 0.95, arpVar: 1, arpCut: [2000, 4200], bass: 'roll', drums: kitB, hats: 1, snare: true, lead: 'A', leadKind: 'harp', glitch: 0.45, fill: true, crash: true, shift: lift }),
      S('outro', 8, { part: 'C', arp: 0.6, arpCut: [2400, 400], bass: 'drone', drums: 'half', hats: 0.4, shimmer: 0.05, counter: true, shift: lift }),
    ];
    if (rng.chance(0.4)) sections.splice(4, 0, S('run1b', 8, { part: 'C', arp: 0.9, arpCut: [1800, 2600], bass: 'roll', drums: 'kruger', hats: 1, snare: true, riser: true, glitch: 0.5 }));
    song = {
      ...base,
      bpm,
      sections,
      padKind: rng.pick(['saw', 'choir']),
      arpKind: 'pluck',
      arps: loops.map((l) => ({ loop: l, pattern: polyPattern(rng, l, 0.1), decay: rng.range(0.16, 0.3), bright: rng.range(0.6, 1) })),
      leadKind: 'harp',
      hats: hatPattern(rng, 'sixteenths'),
    };
  } else if (style === 'float') {
    const bpm = Math.round(rng.range(88, 100));
    const sections = [
      S('intro', 8, { arp: 0.4, arpCut: [500, 1200], shimmer: 0.08, bass: 'drone', counter: true, ticks: false }),
      S('verse', 16, { arp: 0.55, arpCut: [1000, 2200], drums: 'soft', hats: 0.6, bass: 'line', lead: 'A', leadKind: 'vibes', fill: true }),
      S('lift', 8, { part: 'B', arp: 0.6, arpVar: 1, arpCut: [1400, 2600], drums: 'half', hats: 0.4, bass: 'lazy', lead: 'B', leadKind: 'flute', comp: rng.chance(0.5), swell: true }),
      S('verse2', 16, { arp: 0.65, arpCut: [1600, 3000], drums: 'softB', hats: 0.9, snare: true, bass: 'line', lead: 'A2', leadKind: rng.pick(['rhodes', 'vibes']), comp: true, fill: true, crash: true, shift: lift }),
      S('outro', 8, { part: 'C', arp: 0.45, arpCut: [1800, 500], bass: 'drone', counter: true, shimmer: 0.06, ticks: false, shift: lift }),
    ];
    song = {
      ...base,
      bpm,
      sections,
      padKind: rng.pick(['glass', 'warm']),
      arpKind: 'pluck',
      arps: [0, 1].map(() => ({ loop: 8, pattern: polyPattern(rng, 8, 0.3), decay: 0.4, bright: 0.45, eighths: true })),
      leadKind: 'vibes',
      hats: hatPattern(rng, 'shaker'),
      compSteps: rng.pick([[0, 10], [2, 10], [0, 6, 12]]),
      bassLine: BASS_LINES[rng.pick(['walk', 'lazy', 'synco'])],
      delay: rng.pick([0.75, 1]),
    };
  } else if (style === 'glass') {
    const bpm = Math.round(rng.range(112, 122));
    const loops = [rng.pick([5, 7]), rng.pick([3, 6, 7])];
    const sections = [
      S('intro', 8, { arp: 0.5, arpCut: [500, 1400], ticks: true, glitch: 0.2, counter: true }),
      S('pulse', 16, { arp: 0.7, arpCut: [1200, 2600], bass: 'sub', drums: 'minimal', hats: 0.5, lead: 'A', leadKind: 'harp', glitch: 0.3, fill: true }),
      S('open', 8, { part: 'B', arp: 0.45, arpVar: 1, arpCut: [1600, 700], bass: 'drone', lead: 'B', leadKind: 'celesta', shimmer: 0.06, swell: true }),
      S('pulse2', 16, { arp: 0.85, arpVar: 1, arpCut: [1500, 3400], bass: 'line', drums: 'glassB', hats: 0.8, lead: 'A2', leadKind: 'marimba', keys: rng.chance(0.4), glitch: 0.4, fill: true, crash: true, shift: lift }),
      S('outro', 8, { part: 'C', arp: 0.5, arpCut: [2000, 400], bass: 'sub', drums: 'half', hats: 0.3, counter: true, shift: lift }),
    ];
    song = {
      ...base,
      bpm,
      sections,
      padKind: 'choir',
      arpKind: 'pluck',
      arps: loops.map((l) => ({ loop: l, pattern: polyPattern(rng, l, 0.2), decay: rng.range(0.1, 0.18), bright: rng.range(0.3, 0.6), sine: true })),
      leadKind: 'harp',
      hats: hatPattern(rng, 'eighths'),
      bassLine: BASS_LINES[rng.pick(['synco', 'octave'])],
    };
  } else if (style === 'skyline') {
    const bpm = Math.round(rng.range(92, 104));
    const sections = [
      S('intro', 4, { comp: true, bass: 'drone', shimmer: 0.04 }),
      S('groove', 16, { comp: true, bass: 'line', drums: 'breaks', hats: 1, snare: true, lead: 'A', leadKind: 'rhodes', fill: true, crash: true }),
      S('bridge', 8, { part: 'B', comp: true, bass: 'lazy', drums: 'half', hats: 0.4, lead: 'B', leadKind: 'vibes', counter: true, swell: true }),
      S('groove2', 16, { comp: true, bass: 'line', drums: rng.chance(0.5) ? 'breaksB' : 'breaks', hats: 1, snare: true, lead: 'A2', leadKind: 'flute', fill: true, crash: true, shift: lift }),
      S('outro', 8, { part: 'C', comp: true, bass: 'drone', drums: 'half', hats: 0.3, keys: true, shift: lift }),
    ];
    song = {
      ...base,
      bpm,
      swing: rng.range(0.1, 0.18),
      sections,
      padKind: 'warm',
      leadKind: 'rhodes',
      compSteps: rng.pick([[0, 7], [2, 10], [0, 3, 10], [6, 14], [0, 6, 10]]),
      hats: hatPattern(rng, 'eighths'),
      bassLine: BASS_LINES[rng.pick(['walk', 'synco', 'octave'])],
    };
  } else {
    // Nocturne.
    const bpm = Math.round(rng.range(100, 110));
    const loops = [rng.pick([6, 7]), rng.pick([5, 7])];
    const sections = [
      S('intro', 8, { arp: 0.4, arpCut: [300, 800], counter: true, bass: 'drone', shimmer: 0.05 }),
      S('rise', 8, { arp: 0.55, arpCut: [700, 1500], bass: 'pulse', drums: 'heart', riser: true, glitch: 0.3 }),
      S('night', 16, { arp: 0.75, arpCut: [1200, 2600], bass: 'pulse', drums: 'night', hats: 0.7, snare: true, lead: 'A', leadKind: 'flute', fill: true, crash: true, glitch: 0.3 }),
      S('void', 8, { part: 'B', arp: 0.35, arpVar: 1, arpCut: [800, 400], bass: 'drone', lead: 'B', leadKind: 'celesta', swell: true, shimmer: 0.08 }),
      S('night2', 16, { arp: 0.9, arpVar: 1, arpCut: [1600, 3400], bass: 'roll', drums: 'kruger', hats: 1, snare: true, lead: 'A2', leadKind: 'vibes', fill: true, crash: true, glitch: 0.45, shift: lift }),
      S('outro', 8, { part: 'C', arp: 0.5, arpCut: [2000, 300], bass: 'drone', drums: 'heart', counter: true, shift: lift }),
    ];
    song = {
      ...base,
      bpm,
      sections,
      padKind: 'choir',
      arpKind: 'pluck',
      arps: loops.map((l) => ({ loop: l, pattern: polyPattern(rng, l, 0.25), decay: rng.range(0.2, 0.35), bright: rng.range(0.4, 0.8) })),
      leadKind: 'flute',
      hats: hatPattern(rng, 'sixteenths'),
      delay: 0.75,
    };
  }
  song.name = `${STYLE_NAMES[style]} · ${tplA.name} · ${NAMES[pc]} ${mode} · ${song.bpm} bpm`;
  return song;
}
