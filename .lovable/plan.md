

## Plan: Add date and time to Space share text

When sharing a space (via Twitter, WhatsApp, copy link, etc.), the share text currently does not include when the space is happening. This plan adds the date and time.

### Changes

**1. `src/components/social/SpaceShareSheet.tsx`**
- Add a new `scheduledAt` prop (optional string) to the component interface
- For live spaces: include the current date/time (e.g., "🎙️ LIVE NOW — Apr 12, 2026 at 3:00 PM")
- For scheduled spaces: include the scheduled date/time (e.g., "🗓️ Apr 15, 2026 at 6:00 PM")
- Format using `date-fns` `format()` function, consistent with existing usage in `SpaceCard.tsx`
- Update `shareText` to include the formatted date/time string

**2. `src/components/social/SpaceCard.tsx`**
- Pass `scheduledAt={space.scheduled_at || space.started_at}` to the `SpaceShareSheet` component

### Example share text after change

**Live:** `🎙️ Join me LIVE on "Market Talk" — Apr 12, 2026 at 3:00 PM — Let's discuss your OPinion, JOIN NOW 👇🏽`

**Scheduled:** `🗓️ Set your reminder for my upcoming space "Market Talk" on Apr 15, 2026 at 6:00 PM on OPollmarket — Let's discuss your OPinion, JOIN NOW 👇🏽`

