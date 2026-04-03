

## Fix: Private Space Invite Notifications Not Being Created

### Problem
When a host creates a private space and invites users, the `space_invites` rows are correctly inserted (9 exist in the database), but zero "Space Invite 🎙️" notifications have ever been created. The notification insert on line 134 of `CreateSpaceModal.tsx` silently fails — the Supabase client returns `{ error }` but the code never checks it, so the failure is invisible.

### Root Cause
The notification insert error is swallowed. The most likely cause is an RLS timing or evaluation issue. To make this robust, the fix will:

1. **Add error checking** to the notification insert so failures surface as toast errors
2. **Move notification creation server-side** by adding it to the `space_invites` table as a trigger — this runs as `SECURITY DEFINER` and bypasses RLS entirely, guaranteeing delivery

### Solution

**1. Database Migration — Create a trigger on `space_invites`**

Add a trigger function that automatically creates a notification whenever a row is inserted into `space_invites`:

```sql
CREATE OR REPLACE FUNCTION public.notify_space_invitee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_name text;
  _space_title text;
BEGIN
  SELECT p.display_name INTO _host_name
  FROM profiles p WHERE p.id = NEW.inviter_id;

  SELECT s.title INTO _space_title
  FROM spaces s WHERE s.id = NEW.space_id;

  INSERT INTO notifications (user_id, title, message, type, actor_id, market_id)
  VALUES (
    NEW.invitee_id,
    'Space Invite 🎙️',
    COALESCE(_host_name, 'Someone') || ' invited you to join "' || COALESCE(_space_title, 'a Space') || '"',
    'info',
    NEW.inviter_id,
    NEW.space_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_space_invitee
AFTER INSERT ON public.space_invites
FOR EACH ROW EXECUTE FUNCTION public.notify_space_invitee();
```

**2. `src/components/social/CreateSpaceModal.tsx` — Remove client-side notification insert**

Remove lines 125–134 (the manual notification insert block). The trigger now handles this automatically and reliably whenever a `space_invites` row is created — whether from the modal, admin tools, or the co-host invite flow.

### Why This Is Better
- **Guaranteed delivery**: Trigger runs as `SECURITY DEFINER`, bypassing RLS
- **Personalized message**: Includes the host's display name in the notification
- **Single source of truth**: Any code path that inserts into `space_invites` automatically generates a notification
- **No silent failures**: Trigger errors will propagate to the insert call

### Files Changed
- New migration (1 file) — trigger function + trigger
- `src/components/social/CreateSpaceModal.tsx` — remove ~10 lines (notification insert block)

