

## Plan: Show Live Video Preview for the Creator (Streamer)

### Problem
When the creator clicks "Go Live", the camera/mic permissions are requested and a LiveKit room is connected, but:
1. **The creator never sees their own video** — `MarketStreamControls` connects to the room but doesn't render a `<video>` element for the local camera feed.
2. **The page does a full reload** (`window.location.reload()`) to refresh the streaming state, which disconnects the LiveKit room and loses the live session.
3. The `MarketStreamPlayer` (viewer component) is only shown to **non-creators** (`!isCreator`), so the creator has no visual feedback.

### Solution
1. **Add a local video preview to `MarketStreamControls`** — when the creator goes live and `liveRoom` is set, render a `<video>` element that displays their local camera track, plus toggle buttons for camera/mic.
2. **Replace `window.location.reload()`** in `MarketDetail.tsx` with a React Query invalidation so the streaming state refreshes without killing the LiveKit connection.
3. **Show `MarketStreamPlayer`** to the creator too (as a fallback when they're not the active broadcaster but the market is streaming from another session).

### Files changed

**`src/components/MarketStreamControls.tsx`**
- Add a `videoRef` for the local video preview
- After connecting to the LiveKit room, attach the local video track to this `<video>` element
- Add camera on/off and mic on/off toggle buttons in the broadcast controls UI
- Render the video in a 16:9 aspect-ratio container above the control buttons when live

**`src/pages/MarketDetail.tsx`**
- Replace `window.location.reload()` in `onStreamStateChange` with React Query cache invalidation (`queryClient.invalidateQueries`) for the market query
- Also show `MarketStreamPlayer` when `isCreator && market.isStreaming && !liveRoom` (reconnect scenario)

### Technical details
- Local video track attachment: `room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.attach(videoEl)`
- Camera/mic toggles: `room.localParticipant.setCameraEnabled(bool)` / `setMicrophoneEnabled(bool)`
- Query invalidation key: the market query key used by `useMarket` hook

