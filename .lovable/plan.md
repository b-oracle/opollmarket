

# Fix: Persist Speaker Presence & Mic When Backgrounded

## Problem
When a speaker navigates away or their screen turns off, the browser suspends the WebSocket connection. The current code only attempts reconnection for hosts/co-hosts (line 444), leaving regular speakers disconnected. Additionally, the Wake Lock API (which prevents OS-level suspension) is referenced in a comment but never implemented.

## Root Causes
1. **Reconnection is host/co-host only** — line 444: `const shouldReconnect = isHost || spaceCoHostIds.includes(user!.id)` excludes promoted speakers
2. **No Wake Lock** — the `handleFreeze` handler (line 154) is empty; no `navigator.wakeLock` usage
3. **Audio context suspension** — mobile browsers suspend `AudioContext` on background; no resume logic
4. **Keep-alive ping interval too long** — 15s may not prevent timeout on aggressive mobile browsers

## Changes — `src/components/social/SpaceRoom.tsx`

### 1. Enable reconnection for ALL participants (not just host/co-host)
Change the `Disconnected` handler (~line 444) to attempt reconnection for any connected user who has `canPublish` (speakers), not just hosts/co-hosts. Listeners who disconnect can also auto-rejoin since it's lightweight.

### 2. Implement Wake Lock API
In the visibility change handler (~line 138), acquire a `navigator.wakeLock.request('screen')` when connected, and release it on disconnect/leave. This prevents the OS from suspending the page while in a space. Falls back gracefully on unsupported browsers.

### 3. Resume AudioContext on visibility restore
When the page becomes visible again, call `AudioContext.resume()` on any suspended audio context, and re-enable local mic tracks to recover from browser suspension.

### 4. Reduce keep-alive interval
Change the ping interval from 15s to 8s (~line 181) to stay within aggressive mobile timeout windows.

### 5. Re-acquire mic on reconnect
After the `Reconnected` event (~line 489), if the user had `canPublish` and was unmuted before backgrounding, re-enable the microphone automatically.

## Technical Details
- Wake Lock API is supported on Chrome/Edge Android 84+, Safari iOS 16.4+ — covers most mobile users
- `disconnectOnPageLeave: false` is already set — good foundation
- LiveKit's built-in reconnect handles transient network blips; this fix addresses OS-level suspension and the manual reconnect fallback

## File Modified
- `src/components/social/SpaceRoom.tsx`

