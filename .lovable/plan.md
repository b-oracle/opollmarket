

## Fix: "Failed to end" when host ends space from outside the room

### Root cause
There are two different code paths to end a space:

1. **From inside the room (`SpaceRoom.handleEndSpace`)** — calls the `livekit-token` edge function with `action: "end_space"`. This uses the service role to:
   - Delete the LiveKit room (disconnecting any stragglers)
   - Update `spaces.status = 'ended'`
   - Mark all remaining `space_participants` as left
   - This is why ending works when the user re-enters the space.

2. **From outside the room (`SpaceCard.handleEndSpace` at line 295-304)** — does a direct, client-side `supabase.from("spaces").update(...)`. This relies on RLS, doesn't delete the LiveKit room, and doesn't clean up participants. When the update returns any error (RLS conflict, network blip, etc.), the UI shows the misleading toast `"Failed to end"`.

The space-card path is also incomplete: even if the row update succeeded, the LiveKit room would stay alive and stale participants would still appear connected — exactly the kind of "ghost live space" issue you've seen with this app before.

### Fix
Make the `SpaceCard` "End Space" button use the same robust edge function the in-room button uses, so there's a single, authoritative end-of-space path.

**File: `src/components/social/SpaceCard.tsx` — `handleEndSpace` (lines 295-304)**

Replace the direct table update with:

```ts
const handleEndSpace = async (e: React.MouseEvent) => {
  e.stopPropagation();
  if (!user || user.id !== space.host_id) return;
  if (!confirm("End this space for everyone?")) return;
  try {
    const { data, error } = await supabase.functions.invoke("livekit-token", {
      body: { space_id: space.id, action: "end_space" },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to end");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
    queryClient.invalidateQueries({ queryKey: ["space-participant", space.id] });
    toast.success("Space ended");
  } catch (err: any) {
    toast.error(err?.message || "Failed to end");
  }
};
```

### Why this fixes it
- Server-side runs with service role → no RLS edge cases.
- LiveKit room is properly deleted → no ghost participants left connected.
- Remaining `space_participants` rows are marked as `left_at` → listener counts go to 0.
- The cleanup-stale-spaces cron won't have to clean these up later.
- Same code path whether the host is inside the room or has already left.

### Files Changed
- `src/components/social/SpaceCard.tsx` — swap direct DB update for `livekit-token` edge function call in `handleEndSpace`.

### Out of scope
- The in-room end flow (already correct).
- The cleanup-stale-spaces cron (still useful as a backstop).

