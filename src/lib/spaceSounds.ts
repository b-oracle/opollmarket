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

/* ─── Ambient background music generator (Step Sequencer) ─── */

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

let ambientPlaying = false;
let ambientTimerId: ReturnType<typeof setInterval> | null = null;
let ambientNodes: (AudioNode | OscillatorNode | AudioBufferSourceNode)[] = [];
let ambientMasterGain: GainNode | null = null;

export const isAmbientPlaying = () => ambientPlaying;

/* ─── Instrument helpers ─── */

const scheduleKick = (ctx: AudioContext, dest: AudioNode, time: number, muffled = false) => {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.45, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  if (muffled) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    osc.connect(lp).connect(env).connect(dest);
  } else {
    osc.connect(env).connect(dest);
  }
  osc.start(time);
  osc.stop(time + 0.3);
};

const scheduleSnare = (ctx: AudioContext, dest: AudioNode, time: number, soft = false) => {
  const dur = soft ? 0.1 : 0.15;
  const vol = soft ? 0.15 : 0.25;
  // Noise burst
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = soft ? 2000 : 1500;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);
  src.connect(hp).connect(env).connect(dest);
  src.start(time);
  src.stop(time + dur);
  // Tonal body
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(100, time + 0.04);
  const oEnv = ctx.createGain();
  oEnv.gain.setValueAtTime(vol * 0.4, time);
  oEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(oEnv).connect(dest);
  osc.start(time);
  osc.stop(time + 0.06);
};

const scheduleHiHat = (ctx: AudioContext, dest: AudioNode, time: number, open = false) => {
  const dur = open ? 0.12 : 0.04;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 7000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(open ? 0.12 : 0.08, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);
  src.connect(bp).connect(env).connect(dest);
  src.start(time);
  src.stop(time + dur + 0.01);
};

const scheduleBass = (ctx: AudioContext, dest: AudioNode, time: number, freq: number, type: OscillatorType = "sawtooth") => {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 800;
  lp.Q.value = 2;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.2, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  osc.connect(lp).connect(env).connect(dest);
  osc.start(time);
  osc.stop(time + 0.2);
};

const scheduleChord = (ctx: AudioContext, dest: AudioNode, time: number, freqs: number[], dur = 0.3, vol = 0.06) => {
  freqs.forEach((f) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = f * 1.003; // slight chorus
    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, time);
    env.gain.setValueAtTime(vol, time + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.001, time + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2000;
    osc.connect(env);
    osc2.connect(env);
    env.connect(lp).connect(dest);
    osc.start(time);
    osc2.start(time);
    osc.stop(time + dur + 0.01);
    osc2.stop(time + dur + 0.01);
  });
};

const scheduleMelody = (ctx: AudioContext, dest: AudioNode, time: number, freq: number, dur = 0.2, type: OscillatorType = "sine") => {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.1, time);
  env.gain.setValueAtTime(0.1, time + dur * 0.5);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(env).connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.01);
};

const scheduleTom = (ctx: AudioContext, dest: AudioNode, time: number, freq: number) => {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.12);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.2, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  osc.connect(env).connect(dest);
  osc.start(time);
  osc.stop(time + 0.16);
};

const scheduleBell = (ctx: AudioContext, dest: AudioNode, time: number, freq: number) => {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2.76;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.08, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.03, time);
  env2.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.connect(env).connect(dest);
  osc2.connect(env2).connect(dest);
  osc.start(time);
  osc2.start(time);
  osc.stop(time + 0.65);
  osc2.stop(time + 0.35);
};

/* ─── Track pattern definitions ─── */

interface TrackPattern {
  bpm: number;
  stepsPerBar: number;
  totalSteps: number;
  schedule: (ctx: AudioContext, dest: AudioNode, step: number, time: number) => void;
}

const lofiPattern: TrackPattern = {
  bpm: 85, stepsPerBar: 16, totalSteps: 64,
  schedule: (ctx, dest, step, t) => {
    const s = step % 16;
    // Kick: 1 and 3 (steps 0, 8)
    if (s === 0 || s === 8) scheduleKick(ctx, dest, t, true);
    // Snare: 2 and 4 (steps 4, 12)
    if (s === 4 || s === 12) scheduleSnare(ctx, dest, t, true);
    // Hi-hat with swing
    if (s % 2 === 0) scheduleHiHat(ctx, dest, t);
    if (s % 4 === 1) scheduleHiHat(ctx, dest, t + 0.02); // swing offset

    // Chord changes every bar (every 16 steps)
    const bar = Math.floor(step / 16) % 4;
    const chords = [
      [261.63, 329.63, 392, 493.88], // Cmaj7
      [220, 261.63, 329.63, 392],     // Am7
      [174.61, 220, 261.63, 329.63],  // Fmaj7
      [196, 246.94, 293.66, 349.23],  // G7
    ];
    if (s === 0) scheduleChord(ctx, dest, t, chords[bar], 0.4, 0.04);

    // Bass on 1 and 3
    const bassNotes = [65.41, 55, 43.65, 49];
    if (s === 0 || s === 8) scheduleBass(ctx, dest, t, bassNotes[bar], "sine");

    // Melody: pentatonic — sparse
    const melodySteps: Record<number, number[]> = {
      0: [523.25], 2: [587.33], 5: [659.25], 10: [783.99], 13: [698.46],
    };
    const melBar = step % 32;
    if (melodySteps[melBar]) scheduleMelody(ctx, dest, t, melodySteps[melBar][0], 0.25);
  },
};

const softPadPattern: TrackPattern = {
  bpm: 70, stepsPerBar: 16, totalSteps: 64,
  schedule: (ctx, dest, step, t) => {
    const s = step % 16;
    // Sub-bass pulse on 1
    if (s === 0) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 55;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.15, t);
      env.gain.setValueAtTime(0.15, t + 0.3);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(env).connect(dest);
      osc.start(t);
      osc.stop(t + 0.85);
    }
    // Pad chord — long, every 2 bars
    const bar = Math.floor(step / 16) % 4;
    const padChords = [
      [220, 261.63, 329.63],    // Am
      [233.08, 277.18, 349.23], // Bbmaj
      [196, 246.94, 293.66],    // G
      [174.61, 220, 261.63],    // Fm
    ];
    if (s === 0 && bar % 2 === 0) scheduleChord(ctx, dest, t, padChords[bar], 1.2, 0.04);
    // Bell pings — sparse
    const bellSteps: Record<number, number> = { 3: 1318.5, 11: 1046.5, 19: 1567.98, 27: 880 };
    if (bellSteps[step % 32]) scheduleBell(ctx, dest, t, bellSteps[step % 32]);
    // Soft breath noise swell every 8 steps
    if (s === 0 && bar % 2 === 1) {
      const dur = 0.8;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(lp).connect(env).connect(dest);
      src.start(t);
      src.stop(t + dur + 0.01);
    }
  },
};

const warmKeysPattern: TrackPattern = {
  bpm: 90, stepsPerBar: 16, totalSteps: 64,
  schedule: (ctx, dest, step, t) => {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // Brushed snare pattern: ghost notes + accents
    if (s === 4 || s === 12) scheduleSnare(ctx, dest, t, true);
    if (s % 4 === 2) scheduleHiHat(ctx, dest, t); // brushes

    // Walking bass line
    const bassLines = [
      [130.81, 146.83, 164.81, 174.61], // C3 D3 E3 F3
      [110, 123.47, 130.81, 146.83],     // A2 B2 C3 D3
      [87.31, 98, 110, 123.47],           // F2 G2 A2 B2
      [98, 110, 123.47, 130.81],          // G2 A2 B2 C3
    ];
    const bassStep = s % 4;
    if (s % 4 === 0) scheduleBass(ctx, dest, t, bassLines[bar][Math.floor(s / 4) % 4], "triangle");

    // Rhodes-style chords with tremolo
    const chords = [
      [261.63, 329.63, 392, 493.88], // Cmaj7
      [220, 261.63, 329.63, 440],     // Am7
      [174.61, 220, 261.63, 349.23],  // Fmaj7
      [196, 246.94, 293.66, 392],     // G7
    ];
    if (s === 0 || s === 6) scheduleChord(ctx, dest, t, chords[bar], 0.35, 0.035);

    // Jazz melody
    const melMap: Record<number, number> = {
      1: 523.25, 5: 587.33, 9: 659.25, 11: 698.46, 14: 783.99,
    };
    const melStep = step % 32;
    if (melMap[melStep]) scheduleMelody(ctx, dest, t, melMap[melStep], 0.2, "triangle");
  },
};

const funkyPattern: TrackPattern = {
  bpm: 110, stepsPerBar: 16, totalSteps: 64,
  schedule: (ctx, dest, step, t) => {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // Syncopated kick: 0, 3, 6, 10
    if ([0, 3, 6, 10].includes(s)) scheduleKick(ctx, dest, t);
    // Snare: 4, 12 with ghost on 7
    if (s === 4 || s === 12) scheduleSnare(ctx, dest, t);
    if (s === 7) scheduleSnare(ctx, dest, t, true);
    // 16th hi-hats, open on offbeats
    scheduleHiHat(ctx, dest, t, s % 4 === 2);

    // Slap bass with octave jumps
    const bassFreqs = [
      [82.41, 164.81, 82.41, 110],   // E2, E3, E2, A2
      [73.42, 146.83, 73.42, 98],    // D2, D3, D2, G2
      [65.41, 130.81, 65.41, 87.31], // C2, C3, C2, F2
      [73.42, 146.83, 98, 110],      // D2, D3, G2, A2
    ];
    if ([0, 4, 8, 12].includes(s)) {
      scheduleBass(ctx, dest, t, bassFreqs[bar][s / 4], "sawtooth");
    }

    // Wah-wah chord stabs on offbeats
    if (s === 2 || s === 5 || s === 10 || s === 14) {
      const chords = [
        [329.63, 415.3, 523.25],  // E4 Ab4 C5
        [293.66, 369.99, 466.16], // D4 F#4 Bb4
        [261.63, 329.63, 415.3],  // C4 E4 Ab4
        [293.66, 369.99, 440],    // D4 F#4 A4
      ];
      scheduleChord(ctx, dest, t, chords[bar], 0.08, 0.05);
    }

    // Clav hits
    if (s === 1 || s === 9) {
      scheduleMelody(ctx, dest, t, 1046.5, 0.05, "square");
    }
  },
};

const afroPattern: TrackPattern = {
  bpm: 105, stepsPerBar: 16, totalSteps: 64,
  schedule: (ctx, dest, step, t) => {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // Afrobeats kick: kick-snare-kick-kick-snare pattern
    if ([0, 5, 8, 10].includes(s)) scheduleKick(ctx, dest, t);
    if (s === 4 || s === 12) scheduleSnare(ctx, dest, t);
    // Shaker 16ths
    scheduleHiHat(ctx, dest, t);
    // Conga / tom fills on triplet feel
    if ([3, 7, 11, 15].includes(s)) {
      const tomFreqs = [200, 250, 180, 220];
      scheduleTom(ctx, dest, t, tomFreqs[s === 3 ? 0 : s === 7 ? 1 : s === 11 ? 2 : 3]);
    }

    // Log drum sub-bass
    if (s === 0 || s === 8) {
      const subFreqs = [73.42, 82.41, 65.41, 73.42]; // D2 E2 C2 D2
      scheduleBass(ctx, dest, t, subFreqs[bar], "sine");
    }

    // Guitar-style arpeggio — major key
    const arpNotes = [
      [293.66, 349.23, 440, 523.25, 440, 349.23], // D4 F4 A4 C5 A4 F4
      [329.63, 392, 493.88, 587.33, 493.88, 392],  // E4 G4 B4 D5 B4 G4
      [261.63, 329.63, 392, 523.25, 392, 329.63],  // C4 E4 G4 C5 G4 E4
      [293.66, 369.99, 440, 587.33, 440, 369.99],  // D4 F#4 A4 D5 A4 F#4
    ];
    const arpStep = s % 6;
    if (s < 12 && s % 2 === 0) {
      scheduleMelody(ctx, dest, t, arpNotes[bar][arpStep], 0.12, "triangle");
    }

    // Call-and-response melody
    const melMap: Record<number, number> = {
      0: 587.33, 2: 659.25, 4: 783.99, 6: 659.25,  // call
      24: 783.99, 26: 880, 28: 783.99, 30: 659.25,  // response
    };
    const melStep = step % 32;
    if (melMap[melStep]) scheduleMelody(ctx, dest, t, melMap[melStep], 0.18);
  },
};

const PATTERNS: Record<string, TrackPattern> = {
  lofi_chill: lofiPattern,
  soft_pad: softPadPattern,
  warm_keys: warmKeysPattern,
  funky_groove: funkyPattern,
  afrobeats: afroPattern,
};

/* ─── Sequencer engine ─── */

export const startAmbient = (trackId: string) => {
  stopAmbient();
  const pattern = PATTERNS[trackId];
  if (!pattern) return;

  const ctx = getCtx();
  ambientPlaying = true;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.5);
  masterGain.connect(ctx.destination);
  ambientMasterGain = masterGain;

  const stepDur = 60 / pattern.bpm / 4; // 16th note duration
  let nextNoteTime = ctx.currentTime + 0.1;
  let currentStep = 0;
  const lookahead = 0.2;

  ambientTimerId = setInterval(() => {
    if (!ambientPlaying) return;
    while (nextNoteTime < ctx.currentTime + lookahead) {
      const step = currentStep % pattern.totalSteps;
      pattern.schedule(ctx, masterGain, step, nextNoteTime);
      nextNoteTime += stepDur;
      currentStep++;
    }
  }, 80);
};

export const stopAmbient = () => {
  ambientPlaying = false;
  if (ambientTimerId !== null) {
    clearInterval(ambientTimerId);
    ambientTimerId = null;
  }
  if (ambientMasterGain) {
    try {
      const ctx = ambientMasterGain.context as AudioContext;
      ambientMasterGain.gain.setValueAtTime(ambientMasterGain.gain.value, ctx.currentTime);
      ambientMasterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      setTimeout(() => {
        try { ambientMasterGain?.disconnect(); } catch {}
        ambientMasterGain = null;
      }, 400);
    } catch {
      ambientMasterGain = null;
    }
  }
  ambientNodes = [];
};
