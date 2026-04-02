

## Persist "Enable Speaker" Prompt State

### Problem
The "Enable Speaker" modal appears every time the connection fires (including reconnects or re-renders), not just on the first join. Once a user has enabled audio, it should not reappear unless the session fully resets (i.e., they leave the space and rejoin from scratch).

### What changes

**File: `src/components/social/SpaceRoom.tsx`**

1. **Add a ref to track if audio was already enabled** — Use a `useRef` so it survives re-renders without triggering them:
   ```ts
   const audioEnabledRef = useRef(false);
   ```

2. **Only show the prompt if audio hasn't been enabled yet** — Change line 934 from always setting `true` to conditionally:
   ```ts
   if (!audioEnabledRef.current) {
     setShowAudioPrompt(true);
   }
   ```

3. **Mark audio as enabled when user taps "Enable Speaker" or "Skip"** — In both the enable button handler and the skip handler, set the ref:
   ```ts
   audioEnabledRef.current = true;
   setShowAudioPrompt(false);
   ```

4. **Reset the ref when leaving the space** — In the disconnect/cleanup logic, reset `audioEnabledRef.current = false` so that a fresh join shows the prompt again.

### Why a ref instead of state or sessionStorage
- A ref persists across reconnects within the same component mount (same space session) but resets when the component unmounts (leaving the space)
- No need for sessionStorage since the desired behavior is per-space-session, not per-browser-session

