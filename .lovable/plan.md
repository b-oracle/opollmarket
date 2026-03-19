

## Plan: Add Status Updates, Stories & Live Spaces

This is a large feature set. I recommend building them incrementally — starting with **Status Updates** (most impactful, simplest), then **Stories**, then **Live Spaces**. Here's the full plan:

---

### Phase 1: Status Updates (Tweet-like posts)

**Database**
- New `status_updates` table: `id`, `user_id`, `content` (text, max 280 chars), `image_url` (optional), `likes_count`, `replies_count`, `created_at`
- New `status_likes` table: `id`, `status_id`, `user_id`, `created_at`
- RLS: public read for posts from public profiles; authenticated insert/delete own; admin full access
- Enable realtime on `status_updates`

**UI Components**
- **StatusComposer**: Textarea (280 char limit) + optional image upload + post button. Shown at the top of the Social page Activity tab and on own profile
- **StatusCard**: Displays a status with author avatar/name, timestamp, content, like button, reply count. Clicking navigates to user profile
- **StatusFeed**: Merges status updates from followed users into the Activity feed, sorted by `created_at` alongside existing trade/comment/like activity items

**Integration Points**
- Add a "Posts" icon tab in both `SocialPage.tsx` and `SocialSection.tsx` tab bars
- On Feed page, optionally show a "What's happening?" composer for logged-in users

---

### Phase 2: Stories (24h disappearing content)

**Database**
- New `stories` table: `id`, `user_id`, `content` (text), `image_url`, `background_color`, `expires_at` (default `now() + 24h`), `created_at`
- New `story_views` table: `id`, `story_id`, `viewer_id`, `created_at`
- RLS: public read for non-expired stories; authenticated insert own; viewers can insert own views
- Scheduled cleanup via existing cron patterns or soft-delete (query `expires_at > now()`)

**UI Components**
- **StoriesCarousel**: Horizontal scrollable row of circular avatar bubbles at the top of the Feed page and Social page. Unviewed stories have a gradient ring; viewed ones are grey
- **StoryCreator**: Full-screen modal — pick background color, type text overlay, or upload an image. Post button
- **StoryViewer**: Full-screen overlay with tap-to-advance, progress bars at top, swipe to dismiss. Shows viewer count for own stories

**Integration Points**
- Insert `StoriesCarousel` above the feed tabs on Feed page and at the top of the Social page
- First bubble is always "+ Add Story" for logged-in users

---

### Phase 3: Live Spaces (Audio rooms)

**Database**
- New `spaces` table: `id`, `host_id`, `title`, `status` (live/ended), `started_at`, `ended_at`, `listener_count`, `created_at`
- New `space_participants` table: `id`, `space_id`, `user_id`, `role` (host/speaker/listener), `joined_at`, `left_at`
- RLS: public read for live spaces; host can insert/update own spaces

**UI Components**
- **SpaceCard**: Shows live space with host avatar, title, listener count, animated audio wave indicator
- **SpaceBanner**: Floating mini-bar at bottom of screen when user is in a space (like Twitter/X)
- **SpaceRoom**: Full-screen view with host/speakers in a grid, listeners listed below, raise-hand button, mute toggle
- **CreateSpaceModal**: Title input + start button

**Audio Implementation**
- Use WebRTC via a service like LiveKit or 100ms (requires API key connector)
- Alternatively, a simpler v1 could be text-based "live chat rooms" without actual audio, upgradeable later

**Integration Points**
- "Spaces" tab or section on the Social page showing active live spaces
- Notification when a followed user starts a space

---

### Technical Summary

| Item | Tables | Components | Edge Functions |
|------|--------|------------|----------------|
| Status Updates | 2 | 3 | 0 (client-side CRUD) |
| Stories | 2 | 3 | 0 (client-side + storage) |
| Live Spaces | 2 | 4 | 1 (for WebRTC token) |

**Storage**: Stories and status images will use Supabase Storage with a new `social-media` bucket.

**Order of implementation**: Status Updates → Stories → Live Spaces (each phase is independently shippable).

