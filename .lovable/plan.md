

## Plan: Enhanced Admin API Keys with Business Analytics

### What changes

Rebuild the Admin API Keys page (`src/pages/admin/AdminApiKeys.tsx`) to serve as a comprehensive management dashboard showing per-key analytics, owner details, webhook delivery logs, and usage stats.

### New sections to add

1. **Summary cards at the top** -- Total keys, Active keys, Total API requests (from `api_request_logs`), Webhook events (from `webhook_events`).

2. **Per-key analytics** -- Each key card will show:
   - Owner info (display name, avatar) joined from `profiles` via `owner_id`
   - Total requests count and last-used timestamp from `api_request_logs`
   - Top endpoints breakdown (e.g. "markets: 120, place-bet: 45")
   - Requests in last 24h / 7d
   - Webhook delivery stats: total sent, delivered, failed from `webhook_events`

3. **Expandable webhook event log per key** -- Show recent webhook events with status (delivered/failed), response code, event type, and timestamp from `webhook_events`.

4. **Improved key card layout** -- Show owner name/avatar next to partner name, better visual hierarchy with usage sparkline data.

### Data fetching approach

- Fetch `api_keys` joined with owner profile info
- Aggregate `api_request_logs` grouped by `api_key_id` for counts and top endpoints
- Aggregate `webhook_events` grouped by `api_key_id` for delivery stats
- All queries run client-side using the Supabase SDK (admin has SELECT access)

### Files modified

| File | Change |
|---|---|
| `src/pages/admin/AdminApiKeys.tsx` | Full rewrite with analytics cards, owner info, per-key usage stats, webhook logs |

### Technical detail

No database migrations needed -- all data already exists in `api_request_logs` and `webhook_events` tables. The page will make 4 queries on load: api_keys (with profiles join via owner_id), aggregated request logs, aggregated webhook events, and recent webhook event details. Since RLS on these tables allows admin access, no policy changes are needed.

