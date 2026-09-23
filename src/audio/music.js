import { composeSong } from './composer.js';

// Plays generated tunes (see composer.js) with a small Web Audio synth rig:
// a singing glide lead, warm detuned pads, glassy plucked arpeggios through a
// ping-pong delay, FM bells, a sub bass, a soft optional beat and airy noise,
// all into a long synthetic reverb. A fresh tune follows each one that ends.
//
// Optionally plays a user-supplied audio URL instead (looped).

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

const TIMBRES = {
  glass: { a: 'triangle', b: 'sine', bMix: 0.35, bOct: 12, cutoff: 3200, vib: 6 },
  warm: { a: 'triangle', b: 'sawtooth', bMix: 0.12, bOct: 0, cutoff: 2200, vib: 9 },
  soft: { a: 'sine', b: 'triangle', bMix: 0.3, bOct: 12, cutoff: 2600, vib: 7 },
};

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
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 6.5, 2.6);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.8;
    this.reverb.connect(revOut).connect(this.master);

    // Ping-pong delay with a darkening feedback loop (tempo-synced per song).
    this.dl = ctx.createDelay(3);
    this.dr = ctx.createDelay(3);
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    this.delayIn = ctx.createGain();
    this.delayIn.connect(this.dl);
    this.dl.connect(tone).connect(this.dr).connect(fb).connect(this.dl);
    const merge = ctx.createChannelMerger(2);
    this.dl.connect(merge, 0, 0);
    this.dr.connect(merge, 0, 1);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.45;
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
    this.leadBus = bus(0.75, 0.4, 0.32);
    this.padBus = bus(0.5, 0.7);
    this.pluckBus = bus(0.42, 0.3, 0.45);
    this.bellBus = bus(0.3, 0.9, 0.25);
    this.bassBus = bus(0.9, 0.06);
    this.drumBus = bus(0.8, 0.14);
    this.texBus = bus(0.35, 0.8);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 1000;
    this.padFilter.Q.value = 0.6;
    this.padFilter.connect(this.padBus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 300;
    lfo.connect(lfoAmt).connect(this.padFilter.frequency);
    lfo.start();

    // Monophonic lead with glide and delayed vibrato.
    const la = ctx.createOscillator();
    const lb = ctx.createOscillator();
    const lbGain = ctx.createGain();
    const lf = ctx.createBiquadFilter();
    lf.type = 'lowpass';
    lf.Q.value = 0.7;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.3;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 0;
    vib.connect(vibAmt);
    vibAmt.connect(la.detune);
    vibAmt.connect(lb.detune);
    la.connect(lf);
    lb.connect(lbGain).connect(lf);
    lf.connect(amp).connect(this.leadBus);
    la.start();
    lb.start();
    vib.start();
    this.lead = { la, lb, lbGain, lf, amp, vibAmt, last: 0, lastEnd: 0 };

    this.noiseBuf = makeNoise(ctx, 1, false);

    const noise = ctx.createBufferSource();
    noise.buffer = makeNoise(ctx, 6, true);
    noise.loop = true;
    this.texFilter = ctx.createBiquadFilter();
    this.texFilter.type = 'bandpass';
    this.texFilter.frequency.value = 900;
    this.texFilter.Q.value = 0.9;
    this.texGain = ctx.createGain();
    this.texGain.gain.value = 0;
    noise.connect(this.texFilter).connect(this.texGain).connect(this.texBus);
    noise.start();
  }

  // ------------------------------------------------------------ voices

  setTimbre(name, t) {
    const T = TIMBRES[name] || TIMBRES.glass;
    const L = this.lead;
    L.la.type = T.a;
    L.lb.type = T.b;
    L.bOct = T.bOct;
    L.lbGain.gain.setValueAtTime(T.bMix, t);
    L.lf.frequency.setValueAtTime(T.cutoff, t);
    L.vib = T.vib;
  }

  leadNote(n, t, dur) {
    const L = this.lead;
    const f = midi(n.midi);
    const f2 = midi(n.midi + (L.bOct || 0));
    const glide = t - L.lastEnd < 0.02 && Math.abs(n.midi - L.last) <= 5;
    for (const [o, fr] of [
      [L.la, f],
      [L.lb, f2],
    ]) {
      if (glide) o.frequency.setTargetAtTime(fr, t, 0.03);
      else o.frequency.setValueAtTime(fr, t);
    }
    const peak = 0.13 * n.vel;
    L.amp.gain.setTargetAtTime(peak, t, glide ? 0.03 : 0.012);
    L.amp.gain.setTargetAtTime(peak * 0.72, t + 0.15, 0.4);
    // Vibrato blooms on held notes.
    L.vibAmt.gain.setTargetAtTime(0, t, 0.05);
    if (dur > 0.6) L.vibAmt.gain.setTargetAtTime(L.vib || 7, t + 0.35, 0.25);
    if (!n.legato) L.amp.gain.setTargetAtTime(0, t + dur * 0.94, 0.08);
    L.last = n.midi;
    L.lastEnd = t + dur;
  }

  pad(notes, t, dur) {
    const ctx = this.ctx;
    for (const m of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = det + rand(-3, 3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.036, t + Math.min(2.2, dur * 0.5));
        g.gain.setValueAtTime(0.036, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 3);
        o.connect(g).connect(this.padFilter);
        o.start(t);
        o.stop(t + dur + 3.1);
      }
    }
  }

  pluck(m, t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(m);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = midi(m + 12);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.45, 0.45);
    o.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(pan).connect(this.pluckBus);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.4);
    o2.stop(t + 1.4);
  }

  bell(m, t) {
    const ctx = this.ctx;
    const f = midi(m);
    const c = ctx.createOscillator();
    c.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.51;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 1.5, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 2.5);
    mod.connect(idx).connect(c.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.6, 0.6);
    c.connect(g).connect(pan).connect(this.bellBus);
    c.start(t);
    mod.start(t);
    c.stop(t + 4.6);
    mod.stop(t + 4.6);
  }

  bass(m, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(m);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = midi(m);
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.19, t + 0.25);
    g.gain.setValueAtTime(0.19, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    o.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(this.bassBus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.7);
    o2.stop(t + dur + 0.7);
  }

  kick(t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(125, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.5);
  }

  noiseHit(t, type, freq, q, level, decay) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.25, 0.25);
    src.connect(f).connect(g).connect(pan).connect(this.drumBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  // ------------------------------------------------------------ sequencer

  startSong(t, skipIntro = false) {
    this.song = composeSong();
    this.sec = skipIntro ? 1 : 0;
    this.secStep = 0;
    this.stepDur = 60 / this.song.bpm / 4;
    this.dl.delayTime.setTargetAtTime((60 / this.song.bpm) * 0.75, t, 0.5);
    this.dr.delayTime.setTargetAtTime((60 / this.song.bpm) * 0.75, t, 0.5);
    this.setTimbre(this.song.timbre, t);
    this.onSong(this.song);
  }

  step(t) {
    const song = this.song;
    const sec = song.sections[this.sec];
    const spc = sec.bpc * 16; // steps per chord
    const i = this.secStep;
    const chord = sec.chords[Math.floor(i / spc)];
    const dur = spc * this.stepDur;

    if (i === 0) this.padFilter.frequency.setTargetAtTime(650 + sec.bright * 1100, t, 2);
    if (i % spc === 0) {
      this.pad(chord.pad, t, dur);
      if (sec.bass) this.bass(chord.bass, t, dur);
      const tg = this.texGain.gain;
      tg.cancelScheduledValues(t);
      tg.setValueAtTime(tg.value, t);
      tg.linearRampToValueAtTime(0.01 + 0.025 * Math.random() * (0.4 + sec.bright), t + dur * 0.5);
      this.texFilter.frequency.setTargetAtTime(rand(450, 2400), t, dur * 0.3);
    }

    const note = sec.byStep?.get(i);
    if (note) {
      this.leadNote(note, t, note.len * this.stepDur);
      if (sec.double) this.pluck(note.midi - 12, t, 0.55 * note.vel);
    }

    if (i % song.arpRate === 0 && Math.random() < sec.arp) {
      const k = song.arp[(i / song.arpRate) % song.arp.length];
      if (k !== null && k !== undefined) {
        const tones = [...chord.pad, ...chord.pad.map((n) => n + 12)].sort((a, b) => a - b);
        this.pluck(tones[Math.min(tones.length - 1, k)], t, (i % 8 === 0 ? 1 : 0.7) * rand(0.75, 1));
      }
    }

    if (sec.beat) {
      const b = i % 16;
      const d = song.drums;
      if (d.kick.includes(b)) this.kick(t, b === 0 ? 1 : 0.8);
      if (d.hat.includes(b)) this.noiseHit(t, 'highpass', 7500, 0.7, b % 4 === 2 ? 0.05 : 0.03, 0.05);
      if (sec.beat > 1 && d.clap.includes(b)) this.noiseHit(t, 'bandpass', 1700, 0.9, 0.09, 0.2);
    }

    if (sec.bells && i % 16 === 0 && Math.random() < 0.3) this.bell(song.bells[Math.floor(Math.random() * song.bells.length)], t + rand(0, 0.4));

    // Advance.
    this.secStep++;
    if (this.secStep >= sec.chords.length * spc) {
      this.secStep = 0;
      this.sec++;
      if (this.sec >= song.sections.length) this.startSong(t + this.stepDur);
    }
    if (this.skipPending && this.secStep % 16 === 0) {
      this.skipPending = false;
      this.lead.amp.gain.setTargetAtTime(0, t + this.stepDur, 0.1);
      this.startSong(t + this.stepDur, true);
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
    this.master.gain.linearRampToValueAtTime(this.volume * 0.8, now + 3);
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
    if (this.ctx && this.playing && !this.customUrl) this.master.gain.setTargetAtTime(v * 0.8, this.ctx.currentTime, 0.2);
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
