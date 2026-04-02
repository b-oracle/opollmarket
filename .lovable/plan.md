

## Private (Invite-Only) Spaces

### Overview
Add the ability for hosts to create private spaces that only invited users can join. Non-invited users will see the space in their feed but cannot enter.

### Database Changes (Migration)

1. **New `space_invites` table**
   ```sql
   CREATE TABLE public.space_invites (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
     inviter_id UUID NOT NULL,
     invitee_id UUID NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE(space_id, invitee_id)
   );
   ALTER TABLE public.space_invites ENABLE ROW LEVEL SECURITY;
   
   -- Host/co-hosts can manage invites
   CREATE POLICY "Host can manage invites" ON public.space_invites FOR ALL TO authenticated
     USING (inviter_id = auth.uid() OR invitee_id = auth.uid())
     WITH CHECK (inviter_id = auth.uid());

   -- Anyone can read invites (needed for join-gating checks)
   CREATE POLICY "Anyone can read invites" ON public.space_invites FOR SELECT TO authenticated
     USING (true);
   ```

2. **Add `is_private` column to `spaces` table**
   ```sql
   ALTER TABLE public.spaces ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT false;
   ```

3. **Update `get_visible_spaces` function** — Private spaces should only appear if the user is the host or has been invited.

### Edge Function Change

**File: `supabase/functions/livekit-token/index.ts`**

After fetching the space (line ~77), add `is_private` to the select. Before granting a token (~line 109), check: if `space.is_private` is true and the user is not the host, not a co-host, and not in `space_invites`, return an error "This is a private Space. You need an invite to join."

### Frontend Changes

**File: `src/components/social/CreateSpaceModal.tsx`**
- Add a toggle: "Private Space (Invite Only)" with a Lock icon
- When enabled, show an invite picker — a search input to find users (from `profiles` table) and add them to an invite list
- On create, set `is_private: true` and after space creation, bulk-insert rows into `space_invites`

**File: `src/components/social/SpaceCard.tsx`**
- Show a Lock icon badge on private spaces
- If the user is not invited (and not the host), show a disabled "Invite Only" button instead of "Join"

**File: `src/components/social/SpaceRoom.tsx`**
- Add an "Invite" button (visible to host/co-hosts) that opens a user search modal to send invites during a live space
- When an invite is sent, insert into `space_invites` and optionally send a notification to the invitee

**File: `src/components/social/SpacesFeed.tsx`**
- No major changes needed — the `get_visible_spaces` RPC update will handle filtering

### Technical Details

- The `is_private` flag on the `spaces` table controls visibility and join-gating
- `space_invites` stores the invite list per space
- Server-side enforcement happens in the `livekit-token` edge function (users can't bypass the client check)
- The `get_visible_spaces` function is updated so private spaces only appear for the host and invitees
- Invitees receive a notification: "You've been invited to join [Space Title] 🎙️"

