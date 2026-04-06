

## Plan: Add Decorative Watermark Background to Call Interface

### What it does
Replaces the plain dark background of the call overlay with a visually appealing design featuring subtle OPoll watermark logos and fun doodle-style icons (phone, mic, headphones, chat bubbles, waveforms, etc.) — similar to how WhatsApp and Telegram style their call screens.

### Approach
Create an SVG-based background pattern rendered directly in the component (no external assets needed for the doodle icons). The OPoll watermark logo will be layered on top using the existing `watermark-logo.png` asset. Everything will be very low opacity so it doesn't distract from the call UI.

### Files to change

**1. `src/components/chat/VoiceCallOverlay.tsx`**

- Replace the plain `bg-background/95` full-screen container with a layered background:
  - Base: dark gradient (subtle radial gradient from center)
  - Layer 1: Repeating SVG pattern of fun communication icons (phone, mic, headphones, chat bubbles, music notes, signal waves, hearts, thumbs-up) drawn as simple line art, rotated at various angles, at ~4-5% opacity
  - Layer 2: Large centered OPoll watermark logo (`watermark-logo.png`) at ~6-8% opacity with a slight blur
- The pattern will be a CSS `background-image` using an inline SVG data URI for the icon grid
- The watermark logo will be an absolutely positioned `<img>` element
- Both audio-only and video call views get the background; video feeds naturally cover it when active
- Light mode uses `blue-opoll-logo.png` watermark instead

### Visual result
- Subtle tiled pattern of ~12 different communication-themed line icons at random rotations
- Large faded OPoll logo centered behind the avatar
- Dark radial gradient giving depth (darker edges, slightly lighter center)
- All decorative elements stay behind the call UI via z-indexing

