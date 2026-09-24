// Hand-written melodies, each composed together with its chord progression
// so they always fit: strong beats land on chord tones, the rest move by
// step, and every one follows the classic eight-bar plan (a motif, its
// answer or sequence, a climb to the high point, then a cadence home).
//
// Notes are scale degrees (0 = tonic, 2 = the minor third, 4 = the fifth,
// 7 = the octave, negative = below), so each melody works in any key and in
// every mode where its chords exist. Written as "degree:length" in
// sixteenths, "-" for a rest, with a bar line every 16 steps.
//   prog: chord roots as scale degrees; bpc: bars per chord
//   styles: which tunes it suits

export const LEADS = [
  // i VI III VII - an arch up to the octave and back, answered, then a climb.
  { name: 'Rise', prog: [0, 5, 2, 6], bpc: 2, styles: ['menu', 'float', 'nocturne'], mel: '4:6 2:2 4:4 7:4 | 6:4 4:4 2:8 | 4:6 2:2 4:4 7:4 | 9:4 7:4 5:8 | 6:4 7:2 9:2 11:4 9:4 | 8:4 6:4 4:8 | 8:4 6:2 5:2 6:4 3:4 | 1:12 -:4' },
  // i iv VI v - pickup phrases, a rising arpeggio over VI, a half cadence.
  { name: 'Lantern', prog: [0, 3, 5, 4], bpc: 2, styles: ['menu', 'float', 'skyline'], mel: '-:2 4:2 7:2 6:2 7:4 4:4 | 2:6 3:2 2:4 0:4 | -:2 5:2 7:2 6:2 7:4 5:4 | 3:6 5:2 3:4 0:4 | 2:4 4:4 7:4 9:4 | 11:6 9:2 7:8 | 8:4 6:4 4:4 3:2 1:2 | 4:12 -:4' },
  // i VII VI VII - running eighths, each bar a step lower (a sequence).
  { name: 'Glass Steps', prog: [0, 6, 5, 6], bpc: 1, styles: ['kruger', 'glass', 'skyline'], mel: '7:2 4:2 7:2 9:2 7:2 4:2 2:2 4:2 | 8:2 6:2 8:2 10:2 8:4 6:4 | 7:2 5:2 7:2 9:2 7:2 5:2 4:2 5:2 | 6:4 8:4 6:8 | 7:2 4:2 7:2 9:2 11:4 9:4 | 10:4 8:4 6:4 8:4 | 9:4 7:2 5:2 7:4 4:4 | 8:4 6:12' },
  // VI VII i i - long, rising lines that settle on the tonic.
  { name: 'Harbour', prog: [5, 6, 0, 0], bpc: 2, styles: ['float', 'nocturne', 'menu'], mel: '2:8 4:4 7:4 | 5:6 4:2 2:8 | 3:8 5:4 8:4 | 6:6 5:2 3:8 | 4:4 7:4 9:4 7:2 6:2 | 7:8 4:8 | 2:4 3:2 4:2 2:4 1:4 | 0:12 -:4' },
  // i III VII iv - a syncopated hook moved up through the chords.
  { name: 'Hook', prog: [0, 2, 6, 3], bpc: 1, styles: ['skyline', 'kruger', 'glass'], mel: '4:3 4:3 2:2 4:4 7:4 | 6:3 6:3 4:2 6:4 9:4 | 8:3 8:3 6:2 8:4 10:4 | 9:6 7:2 5:8 | 4:3 4:3 2:2 4:4 7:4 | 6:3 6:3 4:2 6:4 9:4 | 10:4 8:4 6:2 5:2 3:4 | 3:4 2:4 0:8' },
  // i bII i VII - the Phrygian sigh (b6 to 5, b2 to 1).
  { name: 'Night Walk', prog: [0, 1, 0, 6], bpc: 2, styles: ['nocturne', 'kruger'], mel: '4:8 5:4 4:4 | 2:6 1:2 0:8 | 5:8 6:4 5:4 | 3:6 2:2 1:8 | 4:4 7:4 8:4 7:4 | 9:6 8:2 7:8 | 6:4 5:4 3:4 1:4 | -:4 6:4 7:8' },
  // i VI - call and answer, then the same an octave up.
  { name: 'Title', prog: [0, 5], bpc: 2, styles: ['menu', 'skyline', 'float'], mel: '7:4 6:2 4:2 -:2 2:2 4:4 | 2:2 0:2 2:4 -:8 | 7:4 5:2 4:2 -:2 2:2 4:4 | 5:2 4:2 2:4 -:8 | 9:4 7:2 6:2 -:2 7:2 9:4 | 11:6 9:2 7:8 | 9:4 7:2 5:2 4:4 2:4 | 0:12 -:4' },
  // i VI III VII - driving pickups over a chord a bar.
  { name: 'Undertow', prog: [0, 5, 2, 6], bpc: 1, styles: ['kruger', 'skyline', 'glass'], mel: '4:2 4:1 6:1 7:4 6:2 4:2 2:4 | 4:2 4:1 6:1 7:4 9:4 7:4 | 6:2 6:1 7:1 9:4 8:2 6:2 4:4 | 8:8 6:4 -:4 | 4:2 4:1 6:1 7:4 9:2 11:2 9:4 | 12:4 11:4 9:4 7:4 | 9:4 8:2 6:2 8:4 6:4 | 8:4 6:4 3:8' },
  // i iv (Dorian or minor vamp) - a rocking figure, sequenced up.
  { name: 'Afterglow', prog: [0, 3], bpc: 2, styles: ['float', 'nocturne', 'menu'], mel: '4:4 2:4 4:2 7:6 | 6:4 7:4 4:8 | 5:4 3:4 5:2 7:6 | 8:4 7:4 5:8 | 9:6 8:2 7:4 4:4 | 6:2 7:2 6:4 4:8 | 5:4 7:4 10:4 8:4 | 7:12 -:4' },
  // i VII VI v - sixteenth arpeggios stepping down, the Andalusian way.
  { name: 'Circuit', prog: [0, 6, 5, 4], bpc: 1, styles: ['glass', 'kruger'], mel: '7:1 4:1 2:1 4:1 7:2 9:2 7:2 4:2 2:4 | 6:1 3:1 1:1 3:1 6:2 8:2 6:2 3:2 1:4 | 5:1 2:1 0:1 2:1 5:2 7:2 5:2 2:2 0:4 | 4:4 6:4 8:8 | 7:1 4:1 2:1 4:1 7:2 9:2 11:4 9:4 | 10:2 8:2 6:4 8:8 | 9:2 7:2 5:2 4:2 5:4 2:4 | 1:8 4:8' },
  // i VI iv v - broad arpeggios, a peak over iv, home on v.
  { name: 'Solar', prog: [0, 5, 3, 4], bpc: 2, styles: ['menu', 'float'], mel: '2:4 4:4 7:8 | 6:2 7:2 6:2 4:2 2:8 | 2:4 4:4 7:8 | 9:2 7:2 5:4 4:8 | 5:4 7:4 10:8 | 9:2 10:2 9:2 7:2 5:8 | 6:4 8:4 11:4 8:4 | 6:6 4:2 4:8' },
  // i i VI iv - after-the-beat phrases, a plagal cadence.
  { name: 'Driftwood', prog: [0, 0, 5, 3], bpc: 2, styles: ['float', 'nocturne', 'menu'], mel: '-:4 4:2 7:2 6:4 4:4 | 2:4 3:2 4:2 2:8 | -:4 4:2 7:2 9:4 7:4 | 6:6 4:2 4:8 | -:4 5:2 7:2 9:4 11:4 | 12:6 11:2 9:8 | 10:4 9:4 7:4 5:4 | 3:4 2:4 0:8' },
  // i VII IV i - (Dorian or minor) motif, sequence a step down, turn home.
  { name: 'Open Window', prog: [0, 6, 3, 0], bpc: 2, styles: ['float', 'skyline', 'menu'], mel: '7:4 4:2 7:2 9:4 7:4 | 6:4 4:4 2:8 | 8:4 6:2 8:2 10:4 8:4 | 6:4 5:4 3:8 | 5:4 7:4 10:4 9:4 | 7:6 5:2 3:8 | 4:4 2:4 3:2 2:2 1:4 | 0:12 -:4' },
  // i IV - an off-beat groove figure, lifted an octave the second time.
  { name: 'Weekend', prog: [0, 3], bpc: 1, styles: ['skyline', 'glass'], mel: '-:2 7:2 -:2 7:2 6:2 7:2 9:4 | 10:6 9:2 7:4 5:4 | -:2 7:2 -:2 7:2 6:2 7:2 4:4 | 5:6 3:2 5:8 | -:2 9:2 -:2 9:2 8:2 9:2 11:4 | 12:6 10:2 9:4 7:4 | 9:2 7:2 6:2 4:2 6:4 4:4 | 3:4 5:4 7:8' },
];

// Slower, sparser melodies for breakdowns and bridges.
export const BRIDGES = [
  { name: 'Hush', prog: [5, 6, 0, 0], bpc: 2, styles: ['menu', 'float', 'nocturne'], mel: '7:12 5:4 | 4:16 | 8:12 6:4 | 5:16 | 4:8 7:8 | 9:12 7:4 | 6:8 4:8 | 2:16' },
  { name: 'Pendulum', prog: [0, 3], bpc: 2, styles: ['float', 'skyline', 'menu'], mel: '4:6 7:10 | 6:4 4:12 | 5:6 7:10 | 9:4 7:12 | 11:6 9:10 | 7:4 6:4 4:8 | 5:6 3:10 | 2:4 0:12' },
  { name: 'Mirror', prog: [0, 5, 2, 6], bpc: 2, styles: ['kruger', 'glass', 'menu', 'skyline'], mel: '-:4 2:4 4:4 7:4 | 6:12 -:4 | -:4 0:4 2:4 5:4 | 4:12 -:4 | -:4 4:4 6:4 9:4 | 8:12 -:4 | -:4 6:4 8:4 10:4 | 8:8 7:8' },
  { name: 'Tidal', prog: [0, 6, 5, 4], bpc: 2, styles: ['kruger', 'glass', 'nocturne'], mel: '7:8 6:4 4:4 | 2:16 | 6:8 5:4 3:4 | 1:16 | 5:8 4:4 2:4 | 0:16 | 1:4 4:4 6:4 8:4 | 4:16' },
  { name: 'Lighthouse', prog: [5, 6, 0, 0], bpc: 2, styles: ['menu', 'skyline', 'float'], mel: '9:6 7:6 5:4 | 4:6 2:10 | 10:6 8:6 6:4 | 5:6 3:10 | 11:6 9:6 7:4 | 6:6 4:10 | 2:6 3:6 4:4 | 0:16' },
  { name: 'Veil', prog: [0, 1], bpc: 2, styles: ['nocturne', 'kruger'], mel: '4:12 5:4 | 4:16 | 5:12 6:4 | 5:8 3:8 | 7:12 8:4 | 7:8 4:8 | 3:8 1:8 | 1:4 0:12' },
  { name: 'Dusk', prog: [3, 0], bpc: 2, styles: ['float', 'skyline', 'glass'], mel: '7:12 5:4 | 3:16 | 4:12 6:4 | 7:16 | 10:12 9:4 | 7:16 | 6:8 4:8 | 2:16' },
];

// Two-bar electric-piano riffs on the minor pentatonic (index into
// 1 b3 4 5 b7 over two octaves): [step, index] pairs.
export const RIFFS = [
  [[0, 5], [6, 3], [12, 4], [16, 5], [22, 6], [26, 5]],
  [[0, 3], [4, 5], [10, 6], [16, 5], [20, 3], [26, 2]],
  [[0, 7], [6, 6], [12, 5], [16, 3], [24, 5]],
  [[0, 5], [3, 5], [6, 6], [10, 5], [16, 3], [22, 4]],
  [[2, 3], [8, 5], [14, 4], [18, 3], [24, 1]],
  [[0, 6], [4, 5], [8, 3], [14, 5], [20, 6], [24, 8]],
  [[0, 5], [6, 7], [12, 6], [16, 5], [22, 4], [28, 3]],
  [[0, 3], [3, 4], [6, 5], [12, 3], [16, 6], [22, 5]],
];

// "4:6 2:2 | ..." -> [{ pos, dur, deg }] (checks every bar adds up to 16).
export function parseMelody(src, name = '') {
  const notes = [];
  let pos = 0;
  src.split('|').forEach((bar, b) => {
    const start = pos;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const [d, len] = tok.split(':');
      const dur = Number(len);
      if (d !== '-') notes.push({ pos, dur, deg: Number(d) });
      pos += dur;
    }
    if (pos - start !== 16) throw new Error(`melody ${name}: bar ${b + 1} has ${pos - start} steps`);
  });
  return { bars: pos / 16, notes };
}
