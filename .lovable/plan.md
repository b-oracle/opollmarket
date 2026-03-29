

# Space Analytics for Hosts

## Overview
Add analytics visible to space hosts showing key metrics: total unique listeners, peak concurrent listeners, total messages, total reactions, and space duration. Analytics are computed from existing `space_participants` and `space_messages` tables and displayed on the SpaceCard for ended spaces (and live spaces for the host).

## Changes

### 1. Add `peak_listeners` column to `spaces` table
- Migration: `ALTER TABLE public.spaces ADD COLUMN peak_listeners INTEGER NOT NULL DEFAULT 0;`
- Update the existing `update_space_listener_count()` trigger function to also track the peak: after updating `listener_count`, set `peak_listeners = GREATEST(peak_listeners, listener_count)`.

### 2. Create `get_space_analytics` database function
- A `SECURITY DEFINER` SQL function that takes `_space_id UUID` and returns:
  - `total_unique_listeners`: `COUNT(DISTINCT user_id)` from `space_participants`
  - `peak_listeners`: from `spaces.peak_listeners`
  - `total_messages`: `COUNT(*)` from `space_messages`
  - `duration_minutes`: `EXTRACT(EPOCH FROM (ended_at - started_at)) / 60` (or time since `started_at` if still live)
- Only callable by the host (check `auth.uid() = host_id`).

### 3. Show analytics on SpaceCard for hosts
- **File**: `src/components/social/SpaceCard.tsx`
- For ended and live spaces where `isHost` is true, query `get_space_analytics` via `useQuery`.
- Render a compact stats row below the footer showing: Unique Listeners, Peak Concurrent, Messages, Duration.
- Use small icons (Users, TrendingUp, MessageCircle, Clock) with counts.
- Only visible to the host — other users see the card as before.

### Technical Details
- The trigger update ensures `peak_listeners` is tracked in real-time without needing a separate cron or batch job.
- `space_messages` table already exists from a prior migration, so message count is free to compute.
- The RPC enforces host-only access server-side.

### Files Modified
- **New migration**: adds `peak_listeners` column, updates trigger, creates `get_space_analytics` function
- `src/components/social/SpaceCard.tsx`: analytics display for hosts

