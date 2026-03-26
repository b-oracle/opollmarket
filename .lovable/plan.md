

# Draft Reminder System (12-Hour Cadence)

## Overview
Remind users who have incomplete market drafts every 12 hours via in-app notification, Telegram, and a persistent banner on their Portfolio page.

## How It Works
Drafts are already stored in the `markets` table with `status = 'draft'`. A scheduled edge function runs every 12 hours, finds users with stale drafts, and sends reminders. The Portfolio page shows a banner when drafts exist.

## Changes

### 1. Database: Track last reminder time
Add a `last_draft_reminder_at` column to `markets` so we don't spam users for the same draft.

```sql
ALTER TABLE public.markets ADD COLUMN last_draft_reminder_at timestamptz;
```

### 2. New Edge Function: `remind-draft-completion`
Scheduled every 12 hours via pg_cron. Logic:
- Query drafts where `status = 'draft'` and (`last_draft_reminder_at` is null OR older than 12 hours)
- For each draft, insert an in-app notification: "You have an unfinished market draft: '{title}'. Tap to continue."
- The existing `send_push_on_notification` trigger automatically dispatches to Telegram, push, and WhatsApp
- Update `last_draft_reminder_at = now()` on each reminded draft
- Group by user so one user with multiple drafts gets a single summary notification rather than one per draft

### 3. Portfolio Page: Draft Reminder Banner (`src/pages/Portfolio.tsx`)
- When the user has drafts and is NOT on the drafts tab, show a small amber banner at the top:
  "You have {count} unfinished draft(s) — Continue editing"
- Clicking it switches to the drafts tab
- Dismissible for the session (sessionStorage flag)

### 4. Schedule the cron job
Use pg_cron to invoke the edge function every 12 hours (at 7 AM and 7 PM UTC).

## Files Modified
- Database migration — add `last_draft_reminder_at` column
- `supabase/functions/remind-draft-completion/index.ts` — new edge function
- `src/pages/Portfolio.tsx` — add draft reminder banner
- pg_cron schedule (via insert tool)

