

## Plan: Add Tap-to-Animate on Gift Emoji Messages in DMs

### What it does
When a user taps on a gift emoji message in their DM conversation, it triggers a fun celebratory animation — the emoji bounces/pops with particle effects and the amount shimmers, making the gift feel exciting and interactive.

### Changes

**File: `src/components/chat/ChatMessageBubble.tsx`**

1. Add a `giftTapped` state boolean, toggled on tap of the gift bubble
2. On tap, trigger a sequence:
   - The emoji scales up with a spring bounce (1 → 1.6 → 1) 
   - The dollar amount does a gold shimmer/pulse
   - Floating mini-emojis (matching the gift emoji) burst outward from the center and fade away — 6-8 copies at random angles
   - A subtle confetti burst using `canvas-confetti` (already in the project via `useConfetti`)
3. Use `framer-motion` `animate` controls to drive the emoji pop and `AnimatePresence` for the floating particles
4. Add a 3-second cooldown so repeated taps don't spam animations
5. The animation plays for both sender and recipient when tapped

### Technical details
- Use `useAnimation()` from framer-motion on the emoji `<motion.p>` to imperatively trigger the bounce sequence on tap
- Create 6-8 `<motion.span>` particle clones of the emoji that animate outward with random x/y offsets, rotation, and opacity fade
- Fire `fireSubtleConfetti()` from the existing `useConfetti` hook simultaneously
- The gift container gets an `onClick` handler (in addition to existing long-press for reactions)
- CSS keyframe `@keyframes shimmer` for the gold text glow on the amount

