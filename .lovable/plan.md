
## Plan: Resolve sports markets based on exact kickoff date+time, not date only

### Problem
Sports markets currently use `end_date` (a `date` type column — date only, no time). To prevent same-day matches from being closed prematurely by the daily cron, both the user-creation flow and the auto-import flow set `end_date` to **the day AFTER kickoff**. Result:
- A 7:30 PM Saturday match has `end_date = Sunday`, so the market stays open & accepting bets all the way through the match and into the next day.
- The "Market Closed/Live" UI logic and `close-expired-markets` cron only see a date, not the kickoff timestamp — so betting cutoff is imprecise (off by up to ~24 hours).
- Live match resolution timing is therefore based on the wrong signal.

### Goal
Use the actual **kickoff timestamp** (date + time) as the source of truth for closing the betting window, and rely on it (not `end_date`) for resolution timing of sports markets.

### Approach

**1. Persist the kickoff timestamp**
Reuse the existing `auto_resolve_deadline` (timestamptz) field as the precise close-time for sports markets:
- Set `auto_resolve_deadline = kickoff time` when creating sports markets (both user flow in `Create.tsx` and `import-sports-fixtures`).
- Keep `end_date` set to the day-after-kickoff for backwards compatibility / fallback display, but treat `auto_resolve_deadline` as the authoritative cutoff.

**2. Close sports markets by exact timestamp**
Update `close-expired-markets` to also close sports auto-resolve markets where `auto_resolve_deadline <= now()` (instead of skipping them entirely). The function already skips them today; we change that to:
- Non-sports markets → close when `end_date <= today` (unchanged).
- Sports auto-resolve markets → close when `auto_resolve_deadline <= now()` (new branch).

**3. Resolution logic stays the same**
`check-sports-resolve` already polls API-Football for match status (`FT`, `AET`, etc.) — that's already time-correct. No change to the resolution decision; we just stop letting people bet after kickoff.

### Files Changed

1. **`src/pages/Create.tsx`** (sports fixture selection block, ~line 2487)
   - When a fixture is selected, also set `autoResolveTime` (HH:mm) from the kickoff timestamp so `auto_resolve_deadline` is persisted as the exact kickoff.
   - Continue setting `end_date` to day-after-kickoff (display fallback only).

2. **`supabase/functions/import-sports-fixtures/index.ts`** (~line 417-432)
   - Set `auto_resolve_deadline = fixtureDate` (the actual kickoff) instead of kickoff + 2h. The 2h grace is no longer needed because `auto_resolve_deadline` is now the **betting cutoff**, and the resolution check (`check-sports-resolve`) polls the API independently for `finished` status.

3. **`supabase/functions/close-expired-markets/index.ts`**
   - Add a second query for sports auto-resolve markets: close when `auto_resolve_deadline <= now()`.
   - Merge results and process both lists with the same notification logic.

### Backwards compatibility
Existing sports markets without `auto_resolve_deadline` will continue to be closed on `end_date` rollover (the existing path still applies if `auto_resolve_deadline IS NULL`). New markets going forward will use precise kickoff timing.

### Out of scope
- The market-detail "Live/Closed" badge already uses backend status, so once the cron flips status to `ended` at kickoff, the UI updates automatically.
- No DB migration required — we're reusing the existing `auto_resolve_deadline` column.
