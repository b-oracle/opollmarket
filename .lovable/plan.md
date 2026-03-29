

# Overhaul Ambient Music — Real Rhythmic Sequencing

## Problem
All 5 ambient tracks use sustained oscillators with slow LFO modulation. They sound like droning chords, not music. There's no beat, no melody movement, no rhythmic variation.

## Root Cause
The current approach starts oscillators and leaves them running continuously. Real music needs **note sequencing** — notes that start, stop, change pitch, and repeat in patterns over time.

## Solution: Step Sequencer Architecture
Replace the static oscillator approach with a `setInterval`-based step sequencer that schedules short note events ahead of time using Web Audio's precise timing. Each track gets distinct drum patterns, bass lines, chord progressions, and melodies.

### New Architecture
```text
startAmbient(trackId)
  └─ setInterval every ~100ms (scheduler tick)
       └─ look ahead 200ms, schedule any notes due
            ├─ kick drum (noise + pitched sine)
            ├─ hi-hat (filtered noise burst)
            ├─ snare (noise + tone)
            ├─ bass note (sawtooth/sine, filtered)
            ├─ chord stab (multi-osc, envelope)
            └─ melody note (sine/triangle, envelope)
```

### Track Redesigns

**Lo-fi Chill** (~85 BPM): Muffled boom-bap kick on 1 & 3, soft snare on 2 & 4, lo-fi hi-hats with swing, muted Rhodes-style chord stabs (Cmaj7→Am7→Fmaj7→G7), gentle pentatonic melody with vinyl crackle noise.

**Soft Pad** (~70 BPM): Slow ambient pulse, sub-bass swell, evolving pad chords that shift every 2 bars, sparse bell-like melody pings, gentle white noise "breath" swells.

**Warm Keys** (~90 BPM): Piano-like plucked tones in a jazz progression, walking bass line, brushed snare pattern, Rhodes comping with tremolo.

**Funky Groove** (~110 BPM): Tight syncopated kick/snare pattern, 16th-note hi-hats with open hat on offbeats, slap bass line with octave jumps, wah-wah guitar stabs, clav hits.

**Afrobeats** (~105 BPM): Afrobeats drum pattern (kick-snare-kick-kick-snare), shaker 16ths, conga-like tom patterns, log drum bass, major-key guitar-style arpeggios, call-and-response melody.

### Key Implementation Details

- Store the scheduler interval ID so `stopAmbient()` can clear it
- Each note is a short function that creates oscillators/buffers, connects them, starts/stops them with precise `ctx.currentTime + offset` scheduling
- Helper functions: `playKick(ctx, masterGain, time)`, `playHiHat(...)`, `playSnare(...)`, `playBassNote(ctx, masterGain, time, freq)`, `playChordStab(ctx, masterGain, time, freqs)`, `playMelodyNote(ctx, masterGain, time, freq)`
- Each track defines a pattern object: `{ bpm, kickPattern, snarePattern, hatPattern, bassNotes, chordChanges, melodyNotes }`
- The sequencer walks through steps (16 steps per bar, 2-4 bars loop)

### File Modified
- `src/lib/spaceSounds.ts` — complete rewrite of the ambient section (lines 434-715), keeping the sound reactions section unchanged

