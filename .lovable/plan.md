

## Restrict Hand Raise to Speakers/Co-hosts/Host & Add "Lower Hand" Mod Action

### What changes

**File: `src/components/social/SpaceRoom.tsx`**

1. **Hide "Raise Hand" button for listeners** — Currently the hand-raise button (line ~2021) is shown to everyone. Change it so it only renders when the user is the host, a co-host, or has publish permission (`canPublish`). Listeners already have the "Request to Speak" button, so no gap in UX.

2. **Add "Lower Hand" action in mod action sheet** — In the action sheet for speakers (line ~2122), add a "Lower Hand" button that appears when `remoteHandRaises.has(actionTarget.identity)` is true. This button will:
   - Remove the identity from `remoteHandRaises` locally
   - Broadcast a data channel message `{ type: "force_lower_hand", targetId }` so the target user's `handRaised` state is set to `false`

3. **Handle incoming `force_lower_hand` message** — In the data channel handler (~line 475), add a case for `type === "force_lower_hand"`. When the local user's identity matches `targetId`, set `handRaised` to `false` and show a toast "Your hand was lowered by the host".

### Implementation detail

- **Hand button visibility guard** (line ~2021): Wrap with `{(isHost || isCoHost || canPublish) && ( ... )}`
- **"Lower Hand" button** in action sheet (after the "Force Mute" button, ~line 2131): Render when `remoteHandRaises.has(actionTarget.identity)` — calls a new `forceHandDown(identity)` function
- **`forceHandDown` function**: Removes identity from `remoteHandRaises`, broadcasts `{ type: "force_lower_hand", targetId: identity }` via data channel
- **Data channel receiver**: On `force_lower_hand` where `targetId === user.id`, set `handRaised(false)` and toast notification

