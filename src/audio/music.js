import { composeSong } from './composer.js';

// Plays generated ambient-electronic tunes (see composer.js) on a small Web
// Audio rig: cold stereo pads, a resonant filtered 16th-note sequence, a
// pulsing sub, a soft deep kick with side-chain pumping, crisp hats, sparse
// claps and digital ticks, noise risers, and a mellow FM electric-piano motif
// drenched in ping-pong delay and a long reverb. A new tune follows each one.
//
// Optionally plays a user-supplied audio URL instead (looped).

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function makeNoise(ctx, seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
  }
  return buf;
}

// Whether the browser currently lets us start audio (user activation).
export function audioAllowed() {
  if (navigator.getAutoplayPolicy?.('audiocontext') === 'allowed') return true;
  const ua = navigator.userActivation;
  if (ua) return ua.hasBeenActive;
  return true; // unknown: just try
}

export class Music {
  constructor() {
    this.ctx = null;
    this.playing = false; // intent
    this.volume = 0.7;
    this.customUrl = '';
    this.audio = null;
    this.song = null;
    this.onChange = () => {};
    this.onSong = () => {};
  }

  get running() {
    if (this.customUrl) return !!this.audio && !this.audio.paused;
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------ graph

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    ctx.onstatechange = () => this.onChange();

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 6, 2.8);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.75;
    this.reverb.connect(revOut).connect(this.master);

    // Ping-pong delay (dotted eighth, tempo-synced per tune).
    this.dl = ctx.createDelay(3);
    this.dr = ctx.createDelay(3);
    const fb = ctx.createGain();
    fb.gain.value = 0.48;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    this.delayIn = ctx.createGain();
    this.delayIn.connect(hp).connect(this.dl);
    this.dl.connect(tone).connect(this.dr).connect(fb).connect(this.dl);
    const merge = ctx.createChannelMerger(2);
    this.dl.connect(merge, 0, 0);
    this.dr.connect(merge, 0, 1);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.5;
    merge.connect(delayOut);
    delayOut.connect(this.master);
    delayOut.connect(this.reverb);

    const bus = (dry, rev, del = 0) => {
      const g = ctx.createGain();
      const gd = ctx.createGain();
      gd.gain.value = dry;
      g.connect(gd).connect(this.master);
      const gr = ctx.createGain();
      gr.gain.value = rev;
      g.connect(gr).connect(this.reverb);
      if (del) {
        const gl = ctx.createGain();
        gl.gain.value = del;
        g.connect(gl).connect(this.delayIn);
      }
      return g;
    };
    const padBus = bus(0.55, 0.65);
    const seqBus = bus(0.55, 0.25, 0.3);
    const bassBus = bus(1, 0.03);
    this.keysBus = bus(0.42, 0.6, 0.6);
    this.drumBus = bus(0.85, 0.08);
    this.clapBus = bus(0.5, 0.55);
    this.tickBus = bus(0.35, 0.3, 0.5);
    this.fxBus = bus(0.4, 0.6);
    this.texBus = bus(0.3, 0.8);

    // Side-chain style pumping on pads, sequence and bass.
    const duck = (to) => {
      const g = ctx.createGain();
      g.connect(to);
      return g;
    };
    this.padDuck = duck(padBus);
    this.seqDuck = duck(seqBus);
    this.bassDuck = duck(bassBus);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.padDuck);

    // The sequence runs through one resonant low-pass whose cutoff sweeps
    // across each section, plus a slow wobble.
    this.seqFilter = ctx.createBiquadFilter();
    this.seqFilter.type = 'lowpass';
    this.seqFilter.frequency.value = 500;
    this.seqFilter.Q.value = 5;
    this.seqLevel = ctx.createGain();
    this.seqLevel.gain.value = 0.6;
    this.seqFilter.connect(this.seqLevel).connect(this.seqDuck);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 160;
    lfo.connect(lfoAmt).connect(this.seqFilter.frequency);
    lfo.start();

    this.keysFilter = ctx.createBiquadFilter();
    this.keysFilter.type = 'lowpass';
    this.keysFilter.frequency.value = 2400;
    this.keysFilter.connect(this.keysBus);

    this.noiseBuf = makeNoise(ctx, 2, false);

    // Airy bed.
    const air = ctx.createBufferSource();
    air.buffer = makeNoise(ctx, 6, true);
    air.loop = true;
    this.texFilter = ctx.createBiquadFilter();
    this.texFilter.type = 'bandpass';
    this.texFilter.frequency.value = 1200;
    this.texFilter.Q.value = 0.8;
    this.texGain = ctx.createGain();
    this.texGain.gain.value = 0.012;
    air.connect(this.texFilter).connect(this.texGain).connect(this.texBus);
    air.start();
  }

  // ------------------------------------------------------------ voices

  pad(notes, t, dur) {
    const ctx = this.ctx;
    for (const m of notes) {
      for (const [det, pan] of [
        [-8, -0.55],
        [8, 0.55],
      ]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = det + rand(-3, 3);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + Math.min(1.8, dur * 0.4));
        g.gain.setValueAtTime(0.05, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
        o.connect(g).connect(p).connect(this.padFilter);
        o.start(t);
        o.stop(t + dur + 2.6);
      }
    }
  }

  seqNote(m, t, acc) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = this.song.seqWave;
    o.frequency.value = midi(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * acc, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1 + 0.14 * acc);
    o.connect(g).connect(this.seqFilter);
    o.start(t);
    o.stop(t + 0.3);
  }

  // Mellow FM electric piano: sine carrier, 1:1 modulator with a fast-decaying
  // index for the soft "tine", two slightly detuned voices for width.
  keys(m, t, vel) {
    const ctx = this.ctx;
    const f = midi(m);
    for (const [det, pan] of [
      [-4, -0.35],
      [4, 0.35],
    ]) {
      const car = ctx.createOscillator();
      car.frequency.value = f;
      car.detune.value = det;
      const mod = ctx.createOscillator();
      mod.frequency.value = f;
      mod.detune.value = det;
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 1.1 * vel, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.8);
      mod.connect(idx).connect(car.frequency);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.15 * vel, t + 0.006);
      amp.gain.exponentialRampToValueAtTime(0.05 * vel, t + 0.9);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      car.connect(amp).connect(p).connect(this.keysFilter);
      car.start(t);
      mod.start(t);
      car.stop(t + 3.5);
      mod.stop(t + 3.5);
    }
  }

  bassDrone(m, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(m);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = midi(m);
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.8);
    g.gain.setValueAtTime(0.12, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.bassDuck);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 1.3);
    o2.stop(t + dur + 1.3);
  }

  bassPulse(m, t, len) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(m);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = midi(m);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.19, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(this.bassDuck);
    o.start(t);
    o2.start(t);
    o.stop(t + len + 0.05);
    o2.stop(t + len + 0.05);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(41, t + 0.16);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(lp).connect(g).connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.55);
    this.noiseHit(t, this.drumBus, 'highpass', 2500, 0.7, 0.012, 0.008);
  }

  noiseHit(t, dest, type, freq, q, level, decay, pan = rand(-0.2, 0.2)) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.05);
  }

  hat(t, v) {
    this.noiseHit(t, this.drumBus, 'highpass', 8200, 0.9, 0.04 * v, 0.03 + 0.02 * v);
  }

  clap(t) {
    for (const d of [0, 0.011, 0.023]) this.noiseHit(t + d, this.clapBus, 'bandpass', 1400, 0.9, 0.05, d === 0.023 ? 0.22 : 0.02, 0);
  }

  tick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = Math.random() < 0.5 ? 'sine' : 'square';
    o.frequency.value = rand(2200, 6500);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.012, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.008, 0.03));
    const p = ctx.createStereoPanner();
    p.pan.value = rand(-0.8, 0.8);
    o.connect(g).connect(p).connect(this.tickBus);
    o.start(t);
    o.stop(t + 0.05);
  }

  riser(t, dur) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.fxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  pump(t) {
    for (const [g, depth] of [
      [this.padDuck, 0.5],
      [this.seqDuck, 0.45],
      [this.bassDuck, 0.35],
    ]) {
      g.gain.setValueAtTime(depth, t);
      g.gain.setTargetAtTime(1, t + 0.03, 0.09);
    }
  }

  // ------------------------------------------------------------ sequencer

  startSong(t, skipIntro = false) {
    this.song = composeSong();
    this.sec = skipIntro ? 1 : 0;
    this.secBar = 0;
    this.songBar = 0;
    this.stepInBar = 0;
    this.stepDur = 60 / this.song.bpm / 4;
    const dt = (60 / this.song.bpm) * 0.75;
    this.dl.delayTime.setTargetAtTime(dt, t, 0.5);
    this.dr.delayTime.setTargetAtTime(dt, t, 0.5);
    this.onSong(this.song);
  }

  step(t) {
    const song = this.song;
    const sec = song.sections[this.sec];
    const s = this.stepInBar;
    const barDur = 16 * this.stepDur;
    const chord = song.chords[Math.floor(this.songBar / song.barsPerChord) % song.chords.length];

    // Section start: sweep the sequence filter and set levels.
    if (s === 0 && this.secBar === 0) {
      const [lvl, from, to] = sec.seq;
      const f = this.seqFilter.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(from, t);
      f.exponentialRampToValueAtTime(to, t + sec.bars * barDur);
      this.seqLevel.gain.setTargetAtTime(lvl, t, 0.8);
      this.padFilter.frequency.setTargetAtTime(sec.kick ? 1300 : 800, t, 2);
    }

    // Chord change.
    if (s === 0 && this.songBar % song.barsPerChord === 0) {
      const dur = song.barsPerChord * barDur;
      this.pad(chord.pad, t, dur);
      if (sec.bass === 'drone') this.bassDrone(song.pedal ? song.tonicBass : chord.root, t, dur);
      this.texFilter.frequency.setTargetAtTime(rand(600, 2600), t, dur * 0.3);
    }

    const bassNote = song.pedal ? song.tonicBass : chord.root;
    if (sec.bass === 'pulse' && s % 2 === 0 && s % 4 !== 0) this.bassPulse(bassNote, t, this.stepDur * 1.6);

    const p = song.seqPattern[s];
    if (p) this.seqNote(chord.seq[p.idx], t, p.acc);

    // Keys motif: repeats every two bars with small, random changes.
    if (sec.keys) {
      const cycle = Math.floor(this.secBar / 2);
      const pos = (this.secBar % 2) * 16 + s;
      const sparse = sec.name === 'build' && cycle % 2 === 1;
      if (!sparse) {
        song.motif.forEach((n, k) => {
          if (n.step !== pos || Math.random() < 0.1) return;
          let idx = n.idx;
          if (k === song.motif.length - 1 && cycle % 2 === 1) idx += Math.random() < 0.5 ? 1 : -1;
          idx = Math.max(0, Math.min(song.keysScale.length - 1, idx));
          const up = sec.keysUp && cycle % 2 === 1 ? 12 : 0;
          this.keys(song.keysScale[idx] + up, t, n.vel * rand(0.85, 1));
        });
      }
    }

    // Drums.
    const kicks = sec.kick ? song.kicks[sec.kick] : null;
    if (kicks?.includes(s)) {
      this.kick(t);
      this.pump(t);
    }
    if (sec.hats > 0 && song.hats[s] > 0) this.hat(t, song.hats[s] * sec.hats);
    if (sec.clap && (s === 4 || s === 12)) this.clap(t);
    if (sec.ticks && Math.random() < 0.05) this.tick(t + rand(0, this.stepDur));
    if (sec.riser && s === 0 && this.secBar === sec.bars - 2) this.riser(t, 2 * barDur);

    // Advance.
    this.stepInBar++;
    if (this.stepInBar < 16) return;
    this.stepInBar = 0;
    this.secBar++;
    this.songBar++;
    const next = t + this.stepDur;
    if (this.skipPending) {
      this.skipPending = false;
      this.startSong(next, true);
      return;
    }
    if (this.secBar >= sec.bars) {
      this.secBar = 0;
      this.sec++;
      if (this.sec >= song.sections.length) this.startSong(next);
    }
  }

  schedule() {
    // Generous look-ahead so background-tab timer throttling can't starve it.
    const ahead = this.ctx.currentTime + 1.6;
    while (this.next < ahead) {
      this.step(this.next);
      this.next += this.stepDur;
    }
  }

  // ------------------------------------------------------------ transport

  // Returns true once audio is actually running. Safe to call repeatedly
  // (e.g. from every user gesture until it succeeds).
  start() {
    this.playing = true;
    if (this.customUrl) {
      this.startCustom();
      this.onChange();
      return this.running;
    }
    if (!this.ctx) {
      if (!audioAllowed()) {
        this.onChange();
        return false; // wait for a gesture; avoids the browser's autoplay warning
      }
      this.build();
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') ctx.resume().then(() => this.onChange(), () => {});
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.volume, now + 3);
    if (!this.timer) {
      this.next = now + 0.1;
      if (!this.song) this.startSong(this.next);
      this.timer = setInterval(() => this.schedule(), 120);
      this.schedule();
    }
    this.onChange();
    return this.running;
  }

  stop() {
    this.playing = false;
    if (this.audio) this.fadeAudio(0, 1.2, () => this.audio?.pause());
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 1.2);
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        if (this.playing) return;
        clearInterval(this.timer);
        this.timer = null;
        this.ctx.suspend();
      }, 1400);
    }
    this.onChange();
  }

  // Move on to a freshly composed tune at the next bar.
  nextTune() {
    if (this.customUrl) return;
    if (this.timer) this.skipPending = true;
    else this.song = null; // compose a new one when playback starts
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.playing && !this.customUrl) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    if (this.audio && this.playing) this.audio.volume = v;
  }

  // Swap to (or away from) a user-supplied track. Empty string = generative.
  setCustomUrl(url) {
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.stop();
      this.audio?.pause();
      clearInterval(this.timer);
      this.timer = null;
      this.ctx?.suspend();
    }
    this.customUrl = (url || '').trim();
    this.audio = null;
    if (wasPlaying) this.start();
  }

  startCustom() {
    if (!this.audio) {
      this.audio = new Audio(this.customUrl);
      this.audio.loop = true;
      this.audio.preload = 'auto';
      this.audio.addEventListener('play', () => this.onChange());
      this.audio.addEventListener('pause', () => this.onChange());
    }
    if (!this.audio.paused) return;
    this.audio.volume = 0;
    this.audio.play().then(
      () => this.fadeAudio(this.volume, 3),
      (err) => console.info('[music] custom track waiting for interaction or failed:', err.message),
    );
  }

  fadeAudio(to, seconds, done) {
    const a = this.audio;
    if (!a) return;
    clearInterval(this.fadeTimer);
    const from = a.volume;
    const t0 = performance.now();
    this.fadeTimer = setInterval(() => {
      const u = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      a.volume = from + (to - from) * u;
      if (u >= 1) {
        clearInterval(this.fadeTimer);
        done?.();
      }
    }, 50);
  }
}
