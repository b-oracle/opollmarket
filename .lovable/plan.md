

## Plan: Show Community Unread Badges Only for Joined Communities

### Changes

**`src/components/chat/CommunitiesTab.tsx`**
- Conditionally render the unread badge on each community row only if the user has joined that community (`membershipSet.has(c.slug)`)

**`src/hooks/useUnreadCounts.ts`**
- No change needed — it already only counts unread for joined communities (via `community_memberships` query). The current logic is correct for the tab badge total.

Single-file, ~2-line change in `CommunitiesTab.tsx`: wrap the unread badge `<span>` with `&& membershipSet.has(c.slug)` so non-joined communities show no counter.

