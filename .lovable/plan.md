

## Add Sender Name to Floating Gift Emoji

### What changes

**File: `src/components/social/SpaceRoom.tsx`**

1. **Extend the floating reaction data model** — Add an optional `label` field to the `floatingReactions` state type:
   ```ts
   // Line 137: Change type from
   { id: string; emoji: string; identity: string }[]
   // to
   { id: string; emoji: string; identity: string; label?: string }[]
   ```

2. **Include sender name when broadcasting targeted emoji** — The broadcast already sends `senderName` in the data payload (line 1368). When receiving a `targeted_emoji` event (line 706-710), pass `data.senderName` into the floating reaction. Also do the same for the local floating reaction on the sender side (line 1372-1374), but with a label like `"You gifted {targetName}"` or similar.

3. **When receiving a targeted emoji (line 706-710)** — For the recipient and all viewers, set the label to `"{senderName} gifted {emoji}"`. Check if the current user is the target (`data.targetId === user?.id`) and if so, use `"{senderName} gifted you"`.

4. **Render the label in the floating animation (lines 1811-1821)** — Below the emoji, show the label text in a small styled span:
   ```tsx
   <motion.div key={r.id} ...>
     {r.emoji}
     {r.label && (
       <div className="text-[10px] text-white font-semibold whitespace-nowrap bg-black/50 rounded px-1 mt-0.5 text-center">
         {r.label}
       </div>
     )}
   </motion.div>
   ```

### Summary
- Only gift emojis (targeted emoji) get the floating label — general reactions remain unchanged
- The recipient sees "{Name} gifted you {emoji}", other participants see "{Name} gifted {targetName} {emoji}"
- No database or backend changes needed — the `senderName` is already in the broadcast payload

