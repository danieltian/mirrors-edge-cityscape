import { RNG } from '../util/rng.js';

// Generates a complete little piece: key, mode, tempo, two chord progressions,
// and a melody built from motifs (statement, sequence, contrast, return) so it
// has a hummable theme rather than random notes. Every call gives a new tune.
//
// Melodies are worked out in scale-degree space (0 = tonic, 7 = octave), so
// sequences stay diatonic and chord tones are easy to find.

export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const mod7 = (d) => ((d % 7) + 7) % 7;
const semis = (scale, d) => scale[mod7(d)] + 12 * Math.floor(d / 7);
const isDim = (scale, d) => semis(scale, d + 4) - semis(scale, d) === 6;
const isChordTone = (deg, root) => [0, 2, 4].includes(mod7(deg - root));

function nearestChordTone(deg, root, lo, hi) {
  for (const off of [0, -1, 1, -2, 2, -3, 3]) {
    const d = deg + off;
    if (d >= lo && d <= hi && isChordTone(d, root)) return d;
  }
  return Math.max(lo, Math.min(hi, deg));
}

// Snap to a chord tone, preferring the direction of travel and avoiding a
// plain repeat of the previous note.
function snapDir(deg, root, lo, hi, dir, avoid) {
  const d1 = dir || 1;
  let fallback = null;
  for (const off of [0, d1, -d1, 2 * d1, -2 * d1, 3 * d1, -3 * d1]) {
    const d = deg + off;
    if (d < lo || d > hi || !isChordTone(d, root)) continue;
    if (d === avoid) {
      fallback ??= d;
      continue;
    }
    return d;
  }
  return fallback ?? Math.max(lo, Math.min(hi, deg));
}

// Functional-ish chord movement between scale degrees.
const NEXT = {
  0: [[5, 3], [3, 3], [4, 2], [6, 2], [2, 1], [1, 1]],
  1: [[4, 3], [6, 2], [3, 1], [5, 1]],
  2: [[5, 2], [3, 3], [6, 2], [0, 1]],
  3: [[4, 3], [0, 2], [6, 2], [5, 1], [1, 1]],
  4: [[0, 4], [5, 2], [3, 1], [2, 1]],
  5: [[3, 3], [2, 2], [6, 2], [4, 2], [0, 1]],
  6: [[0, 3], [2, 2], [5, 1], [3, 1]],
};

function progression(rng, scale, start) {
  const out = [start];
  while (out.length < 4) {
    const cur = out[out.length - 1];
    let opts = NEXT[cur].filter(([d]) => !isDim(scale, d) && !out.includes(d));
    if (!opts.length) opts = [0, 1, 2, 3, 4, 5, 6].filter((d) => !isDim(scale, d) && !out.includes(d)).map((d) => [d, 1]);
    out.push(rng.weighted(opts));
  }
  return out;
}

// Pad voicing (root, 3rd, 5th, 7th, 9th) kept near the previous chord.
function voiceChord(scale, tonic, deg, center) {
  const pcs = [0, 2, 4, 6, 8].map((k) => semis(scale, deg + k));
  let notes = pcs.map((p) => {
    let n = tonic + p;
    while (n - center > 6) n -= 12;
    while (center - n > 6) n += 12;
    return n;
  });
  notes = [...new Set(notes)].sort((a, b) => a - b);
  // Drop the 9th, then the 7th, if they rub a semitone against another tone.
  for (const drop of [4, 3]) {
    const n = tonic + pcs[drop];
    const hits = notes.filter((m) => mod12(m) === mod12(n));
    for (const h of hits) if (notes.some((m) => m !== h && Math.abs(m - h) === 1)) notes = notes.filter((m) => m !== h);
  }
  const bass = 36 + mod12(tonic + pcs[0] - 36);
  return { deg, pad: notes, bass };
}
const mod12 = (n) => ((n % 12) + 12) % 12;

// Phrase rhythms in eighth notes across two bars: [start, length].
const RHYTHMS = [
  [[0, 2], [2, 1], [3, 1], [4, 3], [7, 1], [8, 6]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 7]],
  [[1, 1], [2, 1], [3, 2], [5, 1], [6, 2], [8, 4], [12, 3]],
  [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 7]],
  [[2, 1], [3, 1], [4, 2], [6, 1], [7, 1], [8, 2], [10, 5]],
  [[0, 6], [6, 1], [7, 1], [8, 7]],
  [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 3], [11, 1], [12, 3]],
];

function genPhrase(rng, rhythm, root, start, lo, hi) {
  const notes = [];
  let cur = start;
  let prev = 0;
  const n = rhythm.length;
  for (let i = 0; i < n; i++) {
    const [s, l] = rhythm[i];
    let deg;
    if (i === 0) deg = nearestChordTone(start, root, lo, hi);
    else {
      // Arch-shaped contour: rise through the first half, fall after.
      let dir = rng.chance(i < n / 2 ? 0.64 : 0.36) ? 1 : -1;
      let size = rng.weighted([[1, 5], [2, 2.6], [3, 0.8], [4, 0.5], [0, l <= 1 ? 0.6 : 0.15]]);
      if (Math.abs(prev) >= 3) {
        dir = -Math.sign(prev); // recover from a leap by step
        size = 1;
      }
      deg = cur + dir * size;
      if (deg > hi || deg < lo) deg = cur - dir * size;
      const strong = s % 4 === 0 || l >= 4 || i === n - 1;
      if (strong) deg = snapDir(deg, root, lo, hi, dir, cur);
    }
    notes.push({ s, l, deg });
    prev = deg - cur;
    cur = deg;
  }
  return notes;
}

// Same rhythm and contour, restarted on a chord tone of the new chord near
// where the previous phrase ended. Prefers a real (diatonic) sequence over a
// literal repeat, and a start that keeps the whole phrase in range.
function sequence(rng, phrase, root, near, lo, hi) {
  const base = phrase[0].deg;
  const rel = phrase.map((n) => n.deg - base);
  const minR = Math.min(...rel);
  const maxR = Math.max(...rel);
  const avoidRepeat = rng.chance(0.65);
  let best = null;
  let bestCost = Infinity;
  for (let d = near - 5; d <= near + 5; d++) {
    if (!isChordTone(d, root)) continue;
    let cost = Math.abs(d - near);
    if (d + minR < lo - 1 || d + maxR > hi + 1) cost += 20;
    if (d === base && avoidRepeat) cost += 3;
    if (cost < bestCost) {
      bestCost = cost;
      best = d;
    }
  }
  const out = phrase.map((n) => ({ ...n, deg: best + n.deg - base }));
  const last = out[out.length - 1];
  last.deg = nearestChordTone(last.deg, root, lo - 1, hi + 1);
  return out;
}

// Four two-bar phrases: a, a' (sequence), b (contrast), a'' (return + cadence).
function sectionMelody(rng, degs, lo, hi, startNear) {
  const rA = rng.pick(RHYTHMS);
  let rB = rng.pick(RHYTHMS);
  while (rB === rA) rB = rng.pick(RHYTHMS);
  const p1 = genPhrase(rng, rA, degs[0], startNear, lo, hi);
  const p2 = sequence(rng, p1, degs[1], p1[p1.length - 1].deg, lo, hi);
  const p3 = genPhrase(rng, rB, degs[2], p2[p2.length - 1].deg + rng.pick([1, 2, 3]), lo, hi);
  const p4 = sequence(rng, p1, degs[3], p3[p3.length - 1].deg, lo, hi);
  // Cadence: land on the chord tone closest to the tonic.
  const end = p4[p4.length - 1];
  const tonicNear = Math.round(end.deg / 7) * 7;
  end.deg = nearestChordTone(tonicNear, degs[3], lo, hi);
  return { phrases: [p1, p2, p3, p4], motif: p1 };
}

function flatten(phrases) {
  const out = [];
  phrases.forEach((p, k) => {
    for (const n of p) out.push({ step: k * 32 + n.s * 2, len: n.l * 2, deg: n.deg, vel: n.s % 4 === 0 ? 1 : 0.82 });
  });
  return out;
}

// Light ornamentation for repeats: neighbour-note turns on long notes and the
// odd split eighth.
function vary(rng, notes) {
  const out = [];
  for (const n of notes) {
    if (n.len >= 8 && rng.chance(0.35)) {
      out.push({ ...n, len: n.len - 2 });
      out.push({ step: n.step + n.len - 2, len: 2, deg: n.deg + rng.pick([1, -1]), vel: 0.72 });
    } else if (n.len === 2 && rng.chance(0.18)) {
      out.push({ ...n, len: 1 });
      out.push({ step: n.step + 1, len: 1, deg: n.deg + rng.pick([1, -1, 2]), vel: 0.7 });
    } else out.push({ ...n });
  }
  return out;
}

function arpPattern(rng) {
  const len = rng.pick([8, 8, 16]);
  const pat = [];
  let i = rng.int(0, 3);
  for (let k = 0; k < len; k++) {
    if (k > 0 && rng.chance(0.18)) {
      pat.push(null);
      continue;
    }
    i = Math.max(0, Math.min(7, i + rng.pick([-2, -1, 1, 1, 2, 3])));
    pat.push(i);
  }
  return pat;
}

const DRUMS = {
  steady: { kick: [0, 8], clap: [4, 12], hat: [2, 6, 10, 14] },
  broken: { kick: [0, 6, 10], clap: [4, 12], hat: [2, 6, 10, 14] },
  sparse: { kick: [0, 10], clap: [12], hat: [2, 6, 10, 14] },
  lift: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14, 15] },
};

export function composeSong(seed = Math.floor(Math.random() * 2 ** 31)) {
  const rng = new RNG(seed);
  const mode = rng.weighted([
    ['aeolian', 4],
    ['dorian', 3],
    ['ionian', 2],
    ['lydian', 1],
    ['mixolydian', 1],
  ]);
  const scale = MODES[mode];
  const pc = rng.pick([2, 4, 5, 7, 9, 0, 10, 3]);
  const tonic = 60 + pc; // pad register
  const lead = pc < 2 ? 72 + pc : 60 + pc; // melody tonic, D4..C#5
  const bpm = Math.round(rng.range(80, 98));

  const degA = progression(rng, scale, rng.chance(0.75) ? 0 : 5);
  let degB = progression(rng, scale, rng.pick([3, 5, 2, 4].filter((d) => !isDim(scale, d))));
  if (degB.join() === degA.join()) degB = [...degB].reverse();

  let center = 65;
  const voice = (degs) =>
    degs.map((d) => {
      const c = voiceChord(scale, tonic, d, center);
      center = c.pad.reduce((a, b) => a + b, 0) / c.pad.length;
      return c;
    });
  const chordsA = voice(degA);
  const chordsB = voice(degB);

  // Degrees -> MIDI, nudged by an octave if a section strays out of a
  // comfortable lead register.
  const toMidi = (notes) => {
    let out = notes.map((n) => ({ ...n, midi: lead + semis(scale, n.deg) }));
    const lo = Math.min(...out.map((n) => n.midi));
    const hi = Math.max(...out.map((n) => n.midi));
    const shift = hi > 86 && lo - 12 >= 55 ? -12 : lo < 57 && hi + 12 <= 88 ? 12 : 0;
    if (shift) out = out.map((n) => ({ ...n, midi: n.midi + shift }));
    return out;
  };
  const A = sectionMelody(rng, degA, -2, 7, rng.int(2, 4));
  const B = sectionMelody(rng, degB, 1, 9, A.phrases[3][A.phrases[3].length - 1].deg + 2);
  const melA = flatten(A.phrases);
  const melB = flatten(B.phrases);

  const beat = rng.chance(0.7);
  const drums = DRUMS[rng.pick(Object.keys(DRUMS))];
  const timbre = rng.pick(['glass', 'warm', 'soft']);

  const S = (name, chords, bpc, melody, opts = {}) => ({ name, chords, bpc, melody, ...opts });
  const sections = [
    S('intro', chordsA, 1, null, { arp: 0.7, bass: false, beat: 0, bright: 0.35 }),
    S('A', chordsA, 2, toMidi(melA), { arp: 0.55, bass: true, beat: 0, bright: 0.5 }),
    S('A2', chordsA, 2, toMidi(vary(rng, melA)), { arp: 0.8, bass: true, beat: beat ? 1 : 0, bright: 0.7 }),
    S('B', chordsB, 2, toMidi(melB), { arp: 0.9, bass: true, beat: beat ? 2 : 0, bells: true, bright: 0.9 }),
  ];
  if (rng.chance(0.4)) sections.push(S('B2', chordsB, 2, toMidi(vary(rng, melB)), { arp: 0.9, bass: true, beat: beat ? 2 : 0, bells: true, bright: 0.95 }));
  sections.push(S('A3', chordsA, 2, toMidi(vary(rng, melA)), { arp: 0.9, bass: true, beat: beat ? 2 : 0, double: true, bright: 0.85 }));
  sections.push(S('outro', chordsA, 2, toMidi(melA.filter((n) => n.step < 32)), { arp: 0.45, bass: true, beat: 0, bright: 0.4 }));

  for (const s of sections) {
    if (!s.melody) continue;
    s.byStep = new Map();
    s.melody.sort((a, b) => a.step - b.step);
    s.melody.forEach((n, i) => {
      const next = s.melody[i + 1];
      n.legato = !!next && next.step === n.step + n.len;
      s.byStep.set(n.step, n);
    });
  }

  return {
    seed,
    name: `${NAMES[pc]} ${mode} · ${bpm} bpm`,
    bpm,
    sections,
    arp: arpPattern(rng),
    arpRate: rng.chance(0.7) ? 2 : 1, // eighths or sixteenths
    drums,
    timbre,
    bells: [0, 2, 4, 7, 9, 11].map((d) => lead + 12 + semis(scale, d)),
  };
}
