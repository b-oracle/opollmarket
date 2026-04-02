

## Music DJ Indicator on Avatar + Single-Player Enforcement

### What it does
1. Shows a 🎵 music icon badge on the avatar of whoever is currently playing device music, visible to all participants.
2. Enforces only one participant can play device music at a time — if someone else is already the DJ, the "Play from device" button is disabled with a message.

### How it works

**Detecting the DJ (all participants)**

LiveKit already publishes device music as a track with `source: Track.Source.ScreenShareAudio` and `name: "device-music"`. Remote participants receive this track publication. We can detect who is the DJ by scanning all participants' track publications for a `ScreenShareAudio` track named `device-music`.

- Add a state `djIdentity: string | null` that tracks which participant identity is currently playing device music.
- For the local user: set `djIdentity` to `user.id` when `deviceMusicPlaying` is true.
- For remote users: listen for `TrackPublished` / `TrackUnpublished` events on the room. When a track with `source === Track.Source.ScreenShareAudio` is published, set `djIdentity` to that participant's identity. When unpublished, clear it.

**Avatar badge (renderAvatar)**

In the `renderAvatar` function (~line 1651), add a condition: if `p.identity === djIdentity`, render a small 🎵 pulsing icon on the avatar (positioned similarly to the ✋ hand indicator but on a different corner, e.g. top-left).

**Single-player enforcement**

In the music menu (~line 2009), disable the "Play from device" button when `djIdentity` is set and `djIdentity !== user?.id`. Show text like "Someone is already playing music" instead.

### File to modify

**`src/components/social/SpaceRoom.tsx`**
- Add `djIdentity` state
- Set it locally when `deviceMusicPlaying` changes
- Add `TrackPublished`/`TrackUnpublished` room event listeners to detect remote DJ
- Update `renderAvatar` to show 🎵 badge when `p.identity === djIdentity`
- Disable "Play from device" button when another participant is the DJ

