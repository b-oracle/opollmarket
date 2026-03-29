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

/* ─── Individual sound synthesizers ─── */

/** Applause: crowd ovation with murmuring voices and layered claps */
export const playApplause = () => {
  const ctx = getCtx();
  const duration = 2.5;
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * duration;
  const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate;
      // Main envelope: swell up then slowly fade
      const env = Math.pow(Math.sin(t / duration * Math.PI), 0.6);
      // Layered clap bursts at different rates for crowd effect
      const clap1 = 0.5 + 0.5 * Math.sin(t * 8.3 + ch * 0.5);
      const clap2 = 0.5 + 0.5 * Math.sin(t * 13.7 + ch * 1.2);
      const clap3 = 0.5 + 0.5 * Math.sin(t * 5.1);
      const clapMod = (clap1 * 0.4 + clap2 * 0.35 + clap3 * 0.25);
      // Base crowd noise
      const noise = (Math.random() * 2 - 1);
      // Voice-like murmur: modulated low-frequency rumble
      const voiceMod = Math.sin(t * 120 + Math.sin(t * 3.5) * 2) * 0.15;
      const voiceMod2 = Math.sin(t * 180 + Math.sin(t * 2.1) * 3) * 0.1;
      const voiceMod3 = Math.sin(t * 95 + Math.sin(t * 4.8) * 1.5) * 0.08;
      
      data[i] = env * (noise * clapMod * 0.3 + voiceMod + voiceMod2 + voiceMod3) * 0.5;
    }
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // Clap band – mid-high frequencies
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 2500;
  bandpass.Q.value = 0.5;

  // Separate voice/rumble path – low frequencies
  const src2 = ctx.createBufferSource();
  src2.buffer = buffer;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 600;
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0.7;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.6, ctx.currentTime);
  masterGain.gain.setValueAtTime(0.6, ctx.currentTime + duration * 0.7);
  masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  src.connect(bandpass).connect(masterGain).connect(ctx.destination);
  src2.connect(lowpass).connect(voiceGain).connect(masterGain);
  src.start();
  src2.start();
};

/** Drum roll: rapid snare-like hits */
export const playDrumRoll = () => {
  const ctx = getCtx();
  const hitCount = 16;
  const totalDuration = 1.5;
  const interval = totalDuration / hitCount;

  for (let i = 0; i < hitCount; i++) {
    const time = ctx.currentTime + i * interval;

    // Noise burst for snare body
    const noiseLen = 0.05;
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let j = 0; j < data.length; j++) {
      data[j] = (Math.random() * 2 - 1) * 0.5;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2000;

    const env = ctx.createGain();
    const vol = 0.15 + (i / hitCount) * 0.25; // crescendo
    env.gain.setValueAtTime(vol, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + noiseLen);

    noiseSrc.connect(hp).connect(env).connect(ctx.destination);
    noiseSrc.start(time);
    noiseSrc.stop(time + noiseLen);

    // Tonal hit
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.03);
    const oscEnv = ctx.createGain();
    oscEnv.gain.setValueAtTime(vol * 0.4, time);
    oscEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    osc.connect(oscEnv).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }
};

/** Musical chime / melody: pleasant ascending notes */
export const playMusicChime = () => {
  const ctx = getCtx();
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const noteLen = 0.35;

  notes.forEach((freq, i) => {
    const time = ctx.currentTime + i * 0.2;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.01; // slight detune for shimmer

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.2, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + noteLen);

    osc.connect(env).connect(ctx.destination);
    osc2.connect(env);
    osc.start(time);
    osc.stop(time + noteLen);
    osc2.start(time);
    osc2.stop(time + noteLen);
  });
};

/** Air horn / fanfare */
export const playAirHorn = () => {
  const ctx = getCtx();
  const duration = 0.8;

  [440, 554.37, 659.25].forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.15, ctx.currentTime);
    env.gain.setValueAtTime(0.15, ctx.currentTime + duration * 0.7);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2000;

    osc.connect(lp).connect(env).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  });
};

/** Bell / ding */
export const playBell = () => {
  const ctx = getCtx();
  const freq = 880;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2.76; // bell partial

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.3, ctx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.1, ctx.currentTime);
  env2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

  osc.connect(env).connect(ctx.destination);
  osc2.connect(env2).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.5);
  osc2.start();
  osc2.stop(ctx.currentTime + 0.8);
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
  masterGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 2); // fade in
  masterGain.connect(ctx.destination);
  ambientGains.push(masterGain);

  if (trackId === "lofi_chill") {
    // Smooth lo-fi pad: layered detuned sines with LFO
    const chordFreqs = [261.63, 329.63, 392.0, 493.88]; // C4, E4, G4, B4
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

      // Detuned layer
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

    // Slow LFO on master gain for pulsing
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
    // Dreamy pad: triangle waves with reverb-like layering
    const freqs = [220, 277.18, 329.63, 440]; // A3, C#4, E4, A4
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
    // Warm piano-like: sine + overtones with slow arpeggio feel
    const notes = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      // Slow swell per note
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1 + i * 0.8);

      osc.connect(g).connect(masterGain);
      osc.start();
      ambientOscillators.push(osc);
      ambientGains.push(g);

      // Soft overtone
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
