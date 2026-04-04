

## Voice Calling in DM Chat with End-to-End Encryption

Add 1:1 voice calling between users directly from the chat view, leveraging the existing LiveKit infrastructure with E2EE (End-to-End Encryption) enabled via LiveKit's built-in E2EE support.

### Architecture

```text
Caller clicks 📞 → Edge function creates call room + tokens (E2EE enabled)
  → Callee receives realtime notification via dm_calls table
  → Callee accepts → both connect to LiveKit with shared E2EE key
  → Either party hangs up → room destroyed, call logged
```

### 1. Database: Create `dm_calls` table

New table to track call state (ringing, active, ended, missed, declined):

- `id`, `conversation_id`, `caller_id`, `callee_id`
- `status` (ringing → active → ended | missed | declined)
- `room_name`, `started_at`, `ended_at`, `duration_seconds`
- RLS: only caller or callee can read/update their own calls
- Enable realtime so callee gets notified instantly

### 2. Edge Function: `dm-call-token`

New edge function that handles:
- **`start`**: Creates a LiveKit room (`dm-call-{conversationId}-{timestamp}`), generates tokens for caller with E2EE grant enabled, inserts `dm_calls` row with status `ringing`, sends notification to callee
- **`answer`**: Validates callee identity, generates token with E2EE grant, updates status to `active`
- **`decline`**: Updates status to `declined`
- **`end`**: Destroys LiveKit room, updates status to `ended` with duration
- **`cancel`**: Caller cancels before answer, updates status to `missed`

Security: Validates conversation is `active`, both users are participants, uses shared passphrase derived from conversation ID for E2EE key exchange.

### 3. Component: `VoiceCallOverlay.tsx`

Full-screen overlay component that handles the call UI:
- **Outgoing state**: Shows callee avatar, "Calling..." text, cancel button, 60s auto-timeout
- **Incoming state**: Shows caller avatar, Accept (green) and Decline (red) buttons, ringtone sound
- **Active state**: Shows call duration timer, mute toggle, speaker toggle, end call button
- **E2EE indicator**: Lock icon showing encryption is active
- Uses LiveKit JS SDK (`livekit-client`) with `Room` class and `E2EEManager` for encryption
- Manages audio tracks (publish mic, subscribe to remote)
- Plays ringtone sound for incoming calls

### 4. Component: `IncomingCallBanner.tsx`

Persistent listener component (mounted in App.tsx or layout) that:
- Subscribes to `dm_calls` table via realtime for `INSERT` events where `callee_id = current user`
- Shows a top banner/modal when a call comes in with caller name, accept/decline buttons
- Triggers `VoiceCallOverlay` on accept

### 5. ChatView Integration

- Add a phone icon button (📞) in the chat header next to the user's name
- Only visible when conversation status is `active` (not pending/rejected)
- Clicking it invokes `dm-call-token` with `action: "start"` and opens `VoiceCallOverlay`

### 6. E2EE Implementation

LiveKit has built-in E2EE support using `livekit-client`'s `E2EEManager`:
- Both parties use a shared passphrase (derived from `conversation_id + salt`)
- The token grants include `e2ee: true` permission
- Client-side: `room.setE2EEEnabled(true)` with the shared key
- All audio frames are encrypted client-side before transmission — LiveKit server never sees plaintext audio

### Dependencies

- `livekit-client` npm package (may already be installed for Spaces)

### Files to Create/Edit

| File | Action |
|------|--------|
| `dm_calls` table migration | Create |
| `supabase/functions/dm-call-token/index.ts` | Create |
| `src/components/chat/VoiceCallOverlay.tsx` | Create |
| `src/components/chat/IncomingCallBanner.tsx` | Create |
| `src/components/chat/ChatView.tsx` | Edit — add call button in header |
| `src/App.tsx` | Edit — mount `IncomingCallBanner` globally |

