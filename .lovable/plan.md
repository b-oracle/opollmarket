

## Restrict Sound Reactions and Music to Hosts/Co-Hosts

### Current State
The UI already hides sound reaction buttons and music controls behind `hasModPowers` (line 2429 of `SpaceRoom.tsx`). However, the underlying functions (`sendSoundReaction`, `toggleAmbientMusic`, `handleDeviceMusicFile`) do not have permission checks, meaning a modified client or stale UI state could still trigger them.

### What's Already Working
- Sound reaction buttons (drum roll, air horn, music, applause, etc.) are only rendered for hosts and co-hosts
- Ambient music menu is only rendered for hosts and co-hosts
- Device music upload is only rendered for hosts and co-hosts

### Changes Needed

**File: `src/components/social/SpaceRoom.tsx`**

1. Add an early-return guard to `sendSoundReaction`:
   ```
   if (!hasModPowers) return;
   ```

2. Add an early-return guard to `toggleAmbientMusic`:
   ```
   if (!hasModPowers) return;
   ```

3. Add an early-return guard to `handleDeviceMusicFile`:
   ```
   if (!hasModPowers) return;
   ```

These guards use the same `hasModPowers` variable (derived from `isHost || isCoHost`) that already controls the UI visibility, ensuring consistency even if the UI re-renders with stale state.

### Summary
Three one-line additions to enforce host/co-host-only sound playback at the function level, matching the existing UI gating.

