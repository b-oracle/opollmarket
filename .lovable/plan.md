

# Speaker Request System for Spaces

## Overview
Add a "Request to Speak" flow where listeners can send a formal request (via LiveKit data channel), and hosts/co-hosts see those requests with Accept/Decline buttons. Currently, hand raise is just a visual indicator with no actionable flow for listeners.

## How It Works

1. **Listener** sees a "Request to Speak" button (replaces or supplements the hand raise for listeners who can't publish)
2. When tapped, a data message of type `"speak_request"` is broadcast via LiveKit
3. **Hosts/Co-hosts** see a notification toast and a badge count on a new "Requests" indicator
4. When host/co-host taps a listener with a pending request, the action sheet shows "Accept Request" (promotes them) and "Decline Request" (clears the request)
5. Accepting calls the existing `promote` action via the edge function
6. Declining sends a `"speak_request_declined"` data message back; the requester sees a toast

## Changes

### `src/components/social/SpaceRoom.tsx`

**New state:**
- `speakRequests: Set<string>` — tracks identities that have requested to speak (seen by host/co-host)
- `requestPending: boolean` — tracks whether the current listener has a pending request

**Data channel handling (`handleDataReceived`):**
- New type `"speak_request"` — adds identity to `speakRequests`, shows toast to host/co-host: "{name} wants to speak"
- New type `"speak_request_declined"` — shows toast to the requester: "Your request was declined"
- New type `"speak_request_accepted"` — clears `requestPending` (promotion toast already fires via permissions change)

**Listener controls bar:**
- When user is a listener (no `canPublish` and not host): show "Request to Speak" button instead of just the hand raise
- If `requestPending`, show pulsing/disabled state: "Request Sent"
- On permission change to `canPublish`, auto-clear `requestPending`

**Action sheet for listeners (host/co-host view):**
- If the tapped listener has a pending speak request, show:
  - "Accept — Promote to Speaker" (calls `invokeAction("promote", ...)` and broadcasts `speak_request_accepted`)
  - "Decline Request" (broadcasts `speak_request_declined` and removes from `speakRequests`)
- Existing "Promote to Speaker" button remains for listeners without a request

**Visual indicator:**
- Listeners with pending speak requests show a 🎙️ badge on their avatar (similar to ✋ hand raise)
- Request count badge shown near the Listeners section header when there are pending requests

### No backend changes needed
All communication uses the existing LiveKit data channel. Promotion still uses the existing `livekit-token` edge function `promote` action.

## Files Modified
- `src/components/social/SpaceRoom.tsx` — add speak request flow, UI buttons, data message handling

