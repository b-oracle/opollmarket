

# Play Device Music in Spaces

## Feasibility
Yes — the host can select an audio file from their device, and it can be streamed to all participants via LiveKit.

## Approach
Use the Web Audio API to decode the chosen file, create a `MediaStreamDestination`, and publish it as a secondary audio track in LiveKit. All participants receive it automatically like any other audio track.

## Changes

### 1. Add a "Play Music" file picker button (host/co-host only)
**File**: `src/components/social/SpaceRoom.tsx`

- Add a music note icon button (🎵) next to the existing ambient music controls, labeled "Play from device"
- Clicking it opens a hidden `<input type="file" accept="audio/*">` picker
- Only visible to host and co-hosts

### 2. Audio playback + LiveKit publishing logic
**File**: `src/components/social/SpaceRoom.tsx`

- On file selection:
  1. Read the file as `ArrayBuffer`, decode it via `AudioContext.decodeAudioData()`
  2. Create a `MediaStreamAudioDestinationNode`
  3. Connect a `AudioBufferSourceNode` → destination node
  4. Get the `MediaStream` from the destination node
  5. Publish it as a secondary audio track via `room.localParticipant.publishTrack(stream.getAudioTracks()[0], { name: "device-music", source: Track.Source.ScreenShareAudio })`
- All participants automatically receive this track through LiveKit — no data channel needed
- Add play/pause/stop controls that appear when music is playing
- Show the file name in the UI

### 3. Cleanup
- When the host stops music or leaves, unpublish the track and stop the source node
- Store the source node and published track refs so they can be cleaned up

### Technical Notes
- This uses LiveKit's native audio track publishing — no custom streaming needed
- Works on both desktop and mobile browsers
- File stays local (no upload); audio is streamed in real-time via WebRTC
- Volume can be controlled via a `GainNode` before the destination
- The existing ambient music (synthesized) remains separate and unaffected

### Files Modified
- `src/components/social/SpaceRoom.tsx` — add file picker UI + audio publish/unpublish logic

