

## Rework DM Emoji Reactions — Long-Press Approach

### Problem
The current reaction flow requires two taps on mobile: tap message to reveal a tiny SmilePlus button, then tap that button to open the picker. The SmilePlus relies on `group-hover` which doesn't work on touch devices. The absolute positioning also causes clipping issues near the top of the scroll area.

### New Approach
Replace the hover/tap-to-reveal button with a **long-press (press-and-hold)** gesture on the message bubble itself — matching WhatsApp/iMessage behavior. A single long-press opens the emoji picker directly above the message.

### Changes — `src/components/chat/ChatMessageBubble.tsx`

1. **Remove** the SmilePlus button, `tapped` state, `tapTimeout` ref, and `handleTap`
2. **Add long-press detection**: track `onPointerDown` / `onPointerUp` with a 500ms timer. If held long enough, show the reaction picker. Short taps do nothing (preserving link clicks).
3. **Reposition the picker**: render it as a fixed-position overlay centered above the pressed message using `getBoundingClientRect()` on the bubble ref. This prevents clipping at scroll edges.
4. **Keep the existing smiley button visible at all times** as a small persistent icon (no hover gating) for users who prefer a tap — but make it always-visible with reduced opacity instead of hidden.
5. **Haptic feedback**: call `navigator.vibrate?.(10)` on long-press trigger for tactile confirmation on supported devices.

### Result
- One gesture (long-press) opens the picker — familiar mobile UX
- Picker positioned via fixed overlay so it never clips
- Persistent small smiley icon as fallback for quick-tap users
- Existing reaction badges and toggle logic unchanged

