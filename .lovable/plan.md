

## Add Camera Flip (Front/Back) Button in Live Spaces

### What changes

**`src/components/social/SpaceRoom.tsx`**

1. Add a `facingMode` state: `const [facingBack, setFacingBack] = useState(false);`

2. Add a `flipCamera` function that:
   - Calls `roomRef.current.localParticipant.setCameraEnabled(false)` to stop current track
   - Then re-enables with the opposite facing mode using LiveKit's `setCameraEnabled(true, { facingMode: facingBack ? "user" : "environment" })`
   - Toggles `facingBack` state

3. Add a flip camera button next to the existing camera toggle button, visible only when `cameraOn && canUseVideo`:
   - Uses `SwitchCamera` (or `RefreshCw`) icon from lucide-react
   - Styled consistently with the other action buttons (same rounded circle style)

### UI Result
```text
When camera is ON:
  [Mic]  [Camera ✓]  [🔄 Flip]  [Screen]  ...
                       ↑ only visible when camera is active
```

### No database or config changes needed
This is purely a frontend UX enhancement using LiveKit's existing `setCameraEnabled` options.

