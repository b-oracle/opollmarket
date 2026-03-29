

# Float Emoji Reactions from Participant Avatars

## Overview
When a participant reacts with an emoji, the emoji should visually float upward from their avatar in the speakers/listeners grid, so everyone can see who reacted.

## Changes

### 1. Update floating reaction state to include participant identity
- Change `floatingReactions` type from `{ id: string; emoji: string }[]` to `{ id: string; emoji: string; identity: string }[]`
- In `sendReaction`, include `user.id` as the identity
- In `sendSoundReaction`, include `user.id` as the identity
- In `handleDataReceived`, extract `participant.identity` for incoming reactions and sound reactions
- Broadcast `identity` (sender's user ID) along with the reaction data so receivers know who reacted

### 2. Add ref tracking for avatar positions
- Use a `useRef<Map<string, HTMLDivElement>>` to store refs to each participant's avatar container in the grid
- In `renderAvatar` / the grid `motion.div`, attach a `ref` callback that registers the element by participant identity

### 3. Render floating emojis at avatar positions
- Remove the current fixed-position floating reactions container (top-right corner)
- Instead, render floating emojis as absolutely-positioned elements using a portal or overlay layer
- For each floating reaction, look up the avatar element's bounding rect via the ref map, and position the emoji at that avatar's coordinates
- Animate upward with fade-out using Framer Motion (same as current but positioned per-avatar)
- Fallback: if avatar ref not found (participant left), use center of grid

### File Modified
- `src/components/social/SpaceRoom.tsx`

