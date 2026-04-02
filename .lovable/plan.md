

## Add "Enable Speaker" Prompt on Space Join

### Problem
When participants join an ongoing space, they can't hear speakers until they interact with the microphone. This is because mobile browsers block audio playback until a user gesture occurs (autoplay policy). LiveKit's `room.startAudio()` method resolves this, but it requires an explicit user tap.

### What changes

**File: `src/components/social/SpaceRoom.tsx`**

1. **Add state for the audio prompt modal**
   ```ts
   const [showAudioPrompt, setShowAudioPrompt] = useState(false);
   ```

2. **Show the prompt after connecting** — After `setConnected(true)` (line 931), add:
   ```ts
   setShowAudioPrompt(true);
   ```

3. **Handle the "Enable Speaker" button click** — Create a handler that calls `roomRef.current.startAudio()` (LiveKit's method to resume the AudioContext and unblock all subscribed audio tracks), then dismiss the modal:
   ```ts
   const handleEnableAudio = async () => {
     try {
       await roomRef.current?.startAudio();
       warmAudioContext();
     } catch {}
     setShowAudioPrompt(false);
   };
   ```

4. **Render a modal overlay** — Show a centered modal with a speaker icon, a brief message ("Enable your speaker to hear participants"), and a prominent "Enable Speaker 🔊" button. Style it consistently with existing space modals (glass background, rounded corners). Include a dismiss/skip option. The modal renders only when `showAudioPrompt` is true and `connected` is true.

### Technical details
- `Room.startAudio()` is the LiveKit SDK method that resumes the browser AudioContext and plays all attached `<audio>` elements, satisfying autoplay policy requirements
- The modal itself acts as the required "user gesture" — tapping the button is the interaction browsers need
- No backend changes needed
- The prompt appears once per join; dismissed state is not persisted

