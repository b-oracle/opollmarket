/**
 * Synthesized sound effects for Space reactions (host/co-host only).
 * Uses Web Audio API — no external files needed.
 */

let sharedCtx: AudioContext | null = null;

const getCtx = (): AudioContext => {
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === "suspended") sharedCtx.resume();
  return sharedCtx;
};

/* ─── Helper: white noise buffer ─── */
const createNoiseBuffer = (ctx: AudioContext, duration: number): AudioBuffer => {
  const len = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
};

/* ─── Individual sound synthesizers ─── */

/** Applause: crowd ovation with layered clap bursts and murmur */
export const playApplause = () => {
  const ctx = getCtx();
  const dur = 3.0;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;
  const len = sr * dur;
  const buf = ctx.createBuffer(2, len, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Envelope: swell up fast, hold, fade out
      const env = t < 0.3 ? t / 0.3 : t > dur - 0.8 ? (dur - t) / 0.8 : 1;
      // Multiple individual "claps" at semi-random intervals
      const clap1 = Math.pow(Math.abs(Math.sin(t * 23.7 + ch * 1.3)), 8) * 0.6;
      const clap2 = Math.pow(Math.abs(Math.sin(t * 31.2 + ch * 0.7)), 10) * 0.5;
      const clap3 = Math.pow(Math.abs(Math.sin(t * 17.5 + ch * 2.1)), 6) * 0.4;
      const clap4 = Math.pow(Math.abs(Math.sin(t * 41.3 + ch * 0.3)), 12) * 0.3;
      const clapMix = clap1 + clap2 + clap3 + clap4;
      // Filtered noise for clap body
      const noise = (Math.random() * 2 - 1);
      // Voice murmur: layered low-freq modulated sines
      const v1 = Math.sin(t * 130 + Math.sin(t * 4.2) * 3) * 0.08;
      const v2 = Math.sin(t * 190 + Math.sin(t * 2.7) * 4) * 0.06;
      const v3 = Math.sin(t * 85 + Math.sin(t * 5.5) * 2) * 0.05;
      const v4 = Math.sin(t * 250 + Math.sin(t * 1.8) * 2) * 0.03;
      // Occasional "woo" shouts
      const woo = Math.sin(t * 400 + Math.sin(t * 6) * 5) * Math.pow(Math.abs(Math.sin(t * 2.3 + ch)), 15) * 0.12;

      d[i] = env * (noise * clapMix * 0.35 + v1 + v2 + v3 + v4 + woo) * 0.55;
    }
  }

  // Clap frequency band
  const src1 = ctx.createBufferSource();
  src1.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000;
  bp.Q.value = 0.4;

  // Low rumble / crowd body
  const src2 = ctx.createBufferSource();
  src2.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 700;
  const lpGain = ctx.createGain();
  lpGain.gain.value = 0.8;

  // High presence (clap snap)
  const src3 = ctx.createBufferSource();
  src3.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4000;
  const hpGain = ctx.createGain();
  hpGain.gain.value = 0.3;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.65, now);
  master.gain.setValueAtTime(0.65, now + dur * 0.7);
  master.gain.linearRampToValueAtTime(0, now + dur);

  // Light compression via waveshaper
  const comp = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    curve[i] = Math.tanh(x * 1.5);
  }
  comp.curve = curve;

  src1.connect(bp).connect(master);
  src2.connect(lp).connect(lpGain).connect(master);
  src3.connect(hp).connect(hpGain).connect(master);
  master.connect(comp).connect(ctx.destination);

  src1.start(now); src2.start(now); src3.start(now);
  src1.stop(now + dur); src2.stop(now + dur); src3.stop(now + dur);
};

/** Drum roll: rapid, energetic snare rolls with crescendo and final hit */
export const playDrumRoll = () => {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const hitCount = 24;
  const rollDur = 1.2;

  for (let i = 0; i < hitCount; i++) {
    const t = now + (i / hitCount) * rollDur;
    const progress = i / hitCount;

    // Noise burst — snare body
    const noiseLen = 0.04 + (1 - progress) * 0.02;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let j = 0; j < nd.length; j++) nd[j] = (Math.random() * 2 - 1);

    const ns = ctx.createBufferSource();
    ns.buffer = noiseBuf;
    const nhp = ctx.createBiquadFilter();
    nhp.type = "highpass";
    nhp.frequency.value = 1500 + progress * 2000;
    const nEnv = ctx.createGain();
    const vol = 0.12 + progress * 0.28;
    nEnv.gain.setValueAtTime(vol, t);
    nEnv.gain.exponentialRampToValueAtTime(0.001, t + noiseLen);
    ns.connect(nhp).connect(nEnv).connect(ctx.destination);
    ns.start(t); ns.stop(t + noiseLen);

    // Tonal body
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.03);
    const oEnv = ctx.createGain();
    oEnv.gain.setValueAtTime(vol * 0.5, t);
    oEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(oEnv).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.05);

    // Rattle wire (high sine buzz)
    const wire = ctx.createOscillator();
    wire.type = "sawtooth";
    wire.frequency.value = 3500 + Math.random() * 500;
    const wEnv = ctx.createGain();
    wEnv.gain.setValueAtTime(vol * 0.06, t);
    wEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    wire.connect(wEnv).connect(ctx.destination);
    wire.start(t); wire.stop(t + 0.03);
  }

  // Final big hit
  const finalT = now + rollDur + 0.05;
  const fNoise = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
  const fd = fNoise.getChannelData(0);
  for (let j = 0; j < fd.length; j++) fd[j] = (Math.random() * 2 - 1);
  const fs = ctx.createBufferSource();
  fs.buffer = fNoise;
  const fhp = ctx.createBiquadFilter();
  fhp.type = "bandpass";
  fhp.frequency.value = 2500;
  fhp.Q.value = 0.5;
  const fEnv = ctx.createGain();
  fEnv.gain.setValueAtTime(0.5, finalT);
  fEnv.gain.exponentialRampToValueAtTime(0.001, finalT + 0.15);
  fs.connect(fhp).connect(fEnv).connect(ctx.destination);
  fs.start(finalT); fs.stop(finalT + 0.15);

  const fOsc = ctx.createOscillator();
  fOsc.frequency.setValueAtTime(250, finalT);
  fOsc.frequency.exponentialRampToValueAtTime(60, finalT + 0.08);
  const foEnv = ctx.createGain();
  foEnv.gain.setValueAtTime(0.4, finalT);
  foEnv.gain.exponentialRampToValueAtTime(0.001, finalT + 0.12);
  fOsc.connect(foEnv).connect(ctx.destination);
  fOsc.start(finalT); fOsc.stop(finalT + 0.15);
};

/** Musical chime: bright, sparkly ascending arpeggio with harmonics */
export const playMusicChime = () => {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
  const noteLen = 0.4;

  notes.forEach((freq, i) => {
    const t = now + i * 0.15;

    // Fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;

    // Bright shimmer overtone
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.005;

    // Tinkle overtone
    const osc3 = ctx.createOscillator();
    osc3.type = "triangle";
    osc3.frequency.value = freq * 3.01;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + noteLen);

    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0, t);
    env2.gain.linearRampToValueAtTime(0.06, t + 0.01);
    env2.gain.exponentialRampToValueAtTime(0.001, t + noteLen * 0.7);

    const env3 = ctx.createGain();
    env3.gain.setValueAtTime(0, t);
    env3.gain.linearRampToValueAtTime(0.03, t + 0.005);
    env3.gain.exponentialRampToValueAtTime(0.001, t + noteLen * 0.4);

    osc1.connect(env).connect(ctx.destination);
    osc2.connect(env2).connect(ctx.destination);
    osc3.connect(env3).connect(ctx.destination);

    osc1.start(t); osc1.stop(t + noteLen);
    osc2.start(t); osc2.stop(t + noteLen);
    osc3.start(t); osc3.stop(t + noteLen * 0.7);
  });
};

/** Air horn: loud, brassy, stadium-style triple blast */
export const playAirHorn = () => {
  const ctx = getCtx();
  const now = ctx.currentTime;

  const blasts = [
    { start: 0, dur: 0.25 },
    { start: 0.3, dur: 0.2 },
    { start: 0.55, dur: 0.6 },
  ];

  blasts.forEach(({ start, dur }) => {
    const t = now + start;
    const chords = [440, 554.37, 659.25, 880];

    chords.forEach((freq) => {
      // Main sawtooth
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;

      // Detuned layer for thickness
      const osc2 = ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = freq * 1.005;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.12, t + 0.02);
      env.gain.setValueAtTime(0.12, t + dur * 0.7);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1200, t);
      lp.frequency.linearRampToValueAtTime(2500, t + 0.02);
      lp.frequency.linearRampToValueAtTime(1800, t + dur);

      const dist = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = Math.tanh(x * 2);
      }
      dist.curve = curve;

      osc.connect(env);
      osc2.connect(env);
      env.connect(lp).connect(dist).connect(ctx.destination);
      osc.start(t); osc.stop(t + dur);
      osc2.start(t); osc2.stop(t + dur);
    });
  });
};

/** Bell: rich, resonant church bell with multiple partials */
export const playBell = () => {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const fundamental = 880;
  // Bell partials (inharmonic ratios typical of real bells)
  const partials = [
    { ratio: 1, amp: 0.3, decay: 2.0 },
    { ratio: 2.0, amp: 0.15, decay: 1.5 },
    { ratio: 2.76, amp: 0.12, decay: 1.2 },
    { ratio: 3.65, amp: 0.08, decay: 0.8 },
    { ratio: 4.07, amp: 0.06, decay: 0.6 },
    { ratio: 5.2, amp: 0.04, decay: 0.4 },
    { ratio: 0.5, amp: 0.1, decay: 2.5 }, // Sub-octave hum
  ];

  partials.forEach(({ ratio, amp, decay }) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = fundamental * ratio;

    const env = ctx.createGain();
    env.gain.setValueAtTime(amp, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.connect(env).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + decay);
  });

  // Initial strike transient (noise burst)
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1);
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 4000;
  bp.Q.value = 1;
  const nEnv = ctx.createGain();
  nEnv.gain.setValueAtTime(0.2, now);
  nEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  ns.connect(bp).connect(nEnv).connect(ctx.destination);
  ns.start(now); ns.stop(now + 0.02);
};

/** Celebration: party horn with confetti sparkle */
export const playCelebration = () => {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Rising party horn
  [1, 1.25, 1.5].forEach((mult) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300 * mult, now);
    osc.frequency.linearRampToValueAtTime(600 * mult, now + 0.3);
    osc.frequency.setValueAtTime(600 * mult, now + 0.8);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.08, now + 0.05);
    env.gain.setValueAtTime(0.08, now + 0.6);
    env.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1500;

    osc.connect(lp).connect(env).connect(ctx.destination);
    osc.start(now); osc.stop(now + 1.0);
  });

  // Sparkle / confetti pings
  for (let i = 0; i < 12; i++) {
    const t = now + 0.2 + Math.random() * 0.8;
    const freq = 2000 + Math.random() * 4000;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.08 + Math.random() * 0.06, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.08 + Math.random() * 0.1);
    osc.connect(env).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.2);
  }
};

/** Whoosh: energetic swoosh / transition sound */
export const playWhoosh = () => {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const dur = 0.5;

  const noiseBuf = createNoiseBuffer(ctx, dur);
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuf;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(200, now);
  bp.frequency.exponentialRampToValueAtTime(4000, now + dur * 0.4);
  bp.frequency.exponentialRampToValueAtTime(300, now + dur);
  bp.Q.value = 2;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.4, now + dur * 0.3);
  env.gain.exponentialRampToValueAtTime(0.001, now + dur);

  ns.connect(bp).connect(env).connect(ctx.destination);
  ns.start(now); ns.stop(now + dur);
};

/* ─── Sound reaction registry ─── */

export interface SoundReaction {
  id: string;
  emoji: string;
  label: string;
  play: () => void;
}

export const SOUND_REACTIONS: SoundReaction[] = [
  { id: "applause", emoji: "👏", label: "Applause", play: playApplause },
  { id: "drum", emoji: "🥁", label: "Drum Roll", play: playDrumRoll },
  { id: "music", emoji: "🎼", label: "Music", play: playMusicChime },
  { id: "airhorn", emoji: "📢", label: "Air Horn", play: playAirHorn },
  { id: "bell", emoji: "🔔", label: "Bell", play: playBell },
  { id: "celebrate", emoji: "🎉", label: "Celebrate", play: playCelebration },
  { id: "whoosh", emoji: "💨", label: "Whoosh", play: playWhoosh },
];

export const playSoundById = (id: string) => {
  const sound = SOUND_REACTIONS.find((s) => s.id === id);
  sound?.play();
};

/* ─── Ambient background music generator ─── */

export interface AmbientTrack {
  id: string;
  label: string;
  emoji: string;
}

export const AMBIENT_TRACKS: AmbientTrack[] = [
  { id: "lofi_chill", label: "Lo-fi Chill", emoji: "🎵" },
  { id: "soft_pad", label: "Soft Pad", emoji: "🌊" },
  { id: "warm_keys", label: "Warm Keys", emoji: "🎹" },
  { id: "funky_groove", label: "Funky Groove", emoji: "🕺" },
  { id: "afrobeats", label: "Afrobeats", emoji: "🪘" },
];

let ambientOscillators: OscillatorNode[] = [];
let ambientGains: GainNode[] = [];
let ambientLfo: OscillatorNode | null = null;
let ambientPlaying = false;

export const isAmbientPlaying = () => ambientPlaying;

export const startAmbient = (trackId: string) => {
  stopAmbient();
  const ctx = getCtx();
  ambientPlaying = true;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 2);
  masterGain.connect(ctx.destination);
  ambientGains.push(masterGain);

  if (trackId === "lofi_chill") {
    const chordFreqs = [261.63, 329.63, 392.0, 493.88];
    chordFreqs.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      osc.connect(g).connect(masterGain);
      osc.start();
      ambientOscillators.push(osc);
      ambientGains.push(g);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = f * 1.003;
      const g2 = ctx.createGain();
      g2.gain.value = 0.04;
      osc2.connect(g2).connect(masterGain);
      osc2.start();
      ambientOscillators.push(osc2);
      ambientGains.push(g2);
    });

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(masterGain.gain);
    lfo.start();
    ambientLfo = lfo;
    ambientGains.push(lfoGain);
  } else if (trackId === "soft_pad") {
    const freqs = [220, 277.18, 329.63, 440];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 800 + i * 100;
      osc.connect(lp).connect(g).connect(masterGain);
      osc.start();
      ambientOscillators.push(osc);
      ambientGains.push(g);
    });

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(masterGain.gain);
    lfo.start();
    ambientLfo = lfo;
    ambientGains.push(lfoG);
  } else if (trackId === "warm_keys") {
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1 + i * 0.8);
      osc.connect(g).connect(masterGain);
      osc.start();
      ambientOscillators.push(osc);
      ambientGains.push(g);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = f * 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, ctx.currentTime);
      g2.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 1.5 + i * 0.8);
      osc2.connect(g2).connect(masterGain);
      osc2.start();
      ambientOscillators.push(osc2);
      ambientGains.push(g2);
    });
  }
};

export const stopAmbient = () => {
  ambientPlaying = false;
  ambientOscillators.forEach((osc) => {
    try { osc.stop(); } catch {}
  });
  ambientOscillators = [];
  if (ambientLfo) {
    try { ambientLfo.stop(); } catch {}
    ambientLfo = null;
  }
  ambientGains = [];
};
