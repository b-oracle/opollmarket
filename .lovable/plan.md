

## Plan: Make Doodles Visible in Community and DM Chats

### Problem
The doodle background exists in both `CommunityChat.tsx` and `ChatView.tsx` (DM), but the effective opacity is extremely low — the SVG internally uses `opacity='0.35'`, combined with the container's `opacity-[0.06]`, giving a final visible opacity of ~2%, which is essentially invisible on most screens.

### Changes

**File: `src/components/chat/ChatDoodleBackground.tsx`**
- Increase the container opacity from `opacity-[0.06] dark:opacity-[0.08]` to `opacity-[0.12] dark:opacity-[0.15]` — matching the brightness fix previously applied to the call interface
- Add `z-[1]` to ensure the doodle layer paints above the background but remains non-interactive (`pointer-events-none` already set)

**File: `src/components/chat/ChatView.tsx`**
- Ensure the messages scroll area does **not** have an opaque background that would cover the doodle (currently clean — no changes needed here unless investigation shows otherwise)

**File: `src/components/chat/CommunityChat.tsx`**
- Same — verify no opaque background on the messages scroll container (currently clean)

### Summary
Single-file fix in `ChatDoodleBackground.tsx`: bump opacity and add z-index. The doodle component is already correctly imported and conditionally rendered in both DM and community chat — it's just invisible due to the ultra-low opacity.

