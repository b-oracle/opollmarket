

## Add Tappable Avatar with Actions in Space Gift Modal

### Problem
In the Space gift modal, the recipient's avatar is displayed but not interactive. Users want to tap it to view the recipient's profile or send them a DM.

### Solution
Make the avatar + name area in the Space gift modal tappable. On tap, show two action buttons inline (or a small popover): **View Profile** and **Send Message**. This keeps the user in context without heavy UI changes.

### Changes

**`src/components/social/SpaceRoom.tsx`** (lines ~2804-2810)

1. Add `useState` for a mini action menu toggle (e.g. `showGiftUserMenu`)
2. Make the avatar + name row tappable — on tap, toggle the action menu
3. When expanded, show two small action buttons below the name:
   - **View Profile** — calls `navigate(\`/user/\${emojiTarget.identity}\`)` and closes the gift modal
   - **Send Message** — calls `navigate(\`/messages\`)` after starting/finding a DM conversation with `start_dm_conversation` RPC, then closes the modal
4. Add `useNavigate` import (if not already present)
5. Tapping avatar again or tapping an action collapses the menu

### UI Detail
- Avatar gets a subtle ring/highlight when tappable (`cursor-pointer ring-2 ring-primary/30` on hover)
- Action buttons render as two small pill-shaped buttons below the name text, animated in with a simple fade
- Keeps the existing gift picker layout intact — actions appear between the header and the emoji grid

