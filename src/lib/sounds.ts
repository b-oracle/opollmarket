/**
 * Lightweight procedural sound effects using the Web Audio API.
 * No external files needed — generates win chime and loss buzz on the fly.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a bright ascending win chime (C5 → E5 → G5).
 */
export function playWinSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.15, now);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.6);
    masterGain.connect(ctx.destination);

    // Three ascending notes
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, now + i * 0.12);
      noteGain.gain.linearRampToValueAtTime(0.3, now + i * 0.12 + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.25);
      
      osc.connect(noteGain);
      noteGain.connect(masterGain);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  } catch {
    // Silently fail if audio not available
  }
}

/**
 * Play a short descending loss buzz (low rumble).
 */
export function playLoseSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.35);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(100, now);
    osc2.frequency.linearRampToValueAtTime(60, now + 0.2);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.1, now);
    gain2.gain.linearRampToValueAtTime(0, now + 0.25);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.3);
  } catch {
    // Silently fail if audio not available
  }
}

/**
 * Play a repeating dial/ring tone for outgoing calls.
 * Returns a stop function to cease the tone.
 */
export function playDialTone(): () => void {
  try {
    const ctx = getAudioContext();
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let activeGain: GainNode | null = null;

    const playBurst = () => {
      if (stopped) return;
      const now = ctx.currentTime;

      // Two-tone burst (similar to phone ring-back tone: 440Hz + 480Hz)
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(440, now);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(480, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      // 1s on
      gain.gain.setValueAtTime(0.08, now + 1.0);
      gain.gain.linearRampToValueAtTime(0, now + 1.05);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.1);
      osc2.stop(now + 1.1);

      activeGain = gain;

      // Repeat after 3s gap (1s tone + 2s silence)
      timeoutId = setTimeout(playBurst, 3000);
    };

    playBurst();

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
      // Immediately silence any currently playing burst
      if (activeGain) {
        try { activeGain.disconnect(); } catch {}
        activeGain = null;
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * Play a short incoming call ringtone burst.
 * Returns a stop function.
 */
export function playRingtone(): () => void {
  try {
    const ctx = getAudioContext();
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const playRing = () => {
      if (stopped) return;
      const now = ctx.currentTime;

      // Alternating notes for ring (E5 → G5, repeated)
      const notes = [659.25, 783.99, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.15);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now + i * 0.15);
        g.gain.linearRampToValueAtTime(0.12, now + i * 0.15 + 0.02);
        g.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.12);

        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.15);
      });

      timeoutId = setTimeout(playRing, 2000);
    };

    playRing();

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
    };
  } catch {
    return () => {};
  }
}
