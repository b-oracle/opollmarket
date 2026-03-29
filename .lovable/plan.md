

# Fix: Clear Microphone Icon After Speaker Promotion

## Problem
When a user is promoted to speaker, the 🎙️ (speak request) icon persists on their avatar. This happens because the `speakRequests` set is only cleared when using the "Accept" button (`acceptSpeakRequest`), but NOT when promoting via the generic `invokeAction("promote", ...)` path.

## Fix
In `src/components/social/SpaceRoom.tsx`, in the `invokeAction` success handler (around line 937), add clearing of `speakRequests` alongside the existing `remoteHandRaises` cleanup:

```typescript
if (action === "promote" && target_user_id) {
  setRemoteHandRaises((prev) => {
    const next = new Set(prev);
    next.delete(target_user_id);
    return next;
  });
  setSpeakRequests((prev) => {       // ← ADD THIS
    const next = new Set(prev);
    next.delete(target_user_id);
    return next;
  });
}
```

This ensures that regardless of how a user is promoted (Accept button or direct Promote action), both the ✋ and 🎙️ indicators are removed.

### File Modified
- `src/components/social/SpaceRoom.tsx` — one small addition in the `invokeAction` success callback

