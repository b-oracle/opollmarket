

## Add Communities, Support, and Settings Features

### Overview
Add three new features accessible from the Messages screen as additional tabs (alongside Chats, Requests, Calls): **Communities**, **Support**, and **Settings**.

### 1. Communities

**Concept**: Category-based group chats where users can join and discuss topics like Sports, Politics, Crypto, etc.

**Database changes (migration)**:
- `community_memberships` table: `id`, `user_id`, `community_slug` (e.g. "sports", "politics"), `joined_at` — with RLS so users can join/leave freely
- `community_messages` table: `id`, `community_slug`, `user_id`, `content`, `image_url`, `reply_to_id`, `created_at` — with RLS for authenticated read/write
- Enable realtime on `community_messages`

**Communities list**: Derived from existing market categories (Crypto, Sports, Politics, Entertainment, Economy, AI & Tech, Science, etc.) — no admin config needed. Each shows member count and last message preview.

**UI**:
- New `CommunitiesTab.tsx` component shown as a tab in the Messages page
- Tap a community → opens a group chat view (similar to space chat) with messages, @mentions, image uploads
- Join/Leave button per community
- Each community gets an icon from the existing `CategoryIcon` component

### 2. Support

**Concept**: In-app support chat with ticket system.

**Database changes (migration)**:
- `support_tickets` table: `id`, `user_id`, `subject`, `status` (open/in_progress/resolved/closed), `created_at`, `updated_at`, `assigned_to` (nullable, for admin/support staff)
- `support_messages` table: `id`, `ticket_id` (FK), `user_id`, `content`, `image_url`, `is_staff` (boolean), `created_at`
- New role: `support` added to the `app_role` enum
- RLS: users see only their own tickets; staff (support/moderator/admin/super_admin) see all
- Enable realtime on `support_messages`

**UI**:
- New `SupportTab.tsx` component as a tab in Messages page
- Shows list of user's tickets with status badges
- "New Ticket" button opens a form (subject + message + optional screenshot)
- Tap ticket → opens real-time chat thread with staff
- Staff online indicator (presence-based or last-seen)
- Admin side: new `AdminSupport.tsx` page under admin layout to manage/respond to tickets

### 3. Settings

**Concept**: Privacy and preference controls.

**Database changes (migration)**:
- `user_settings` table: `id`, `user_id` (unique), `allow_calls` (default true), `allow_dms` (default true), `private_account` (default false), `show_online_status` (default true), `show_portfolio` (default true), `show_trade_history` (default true), `mute_notifications` (default false), `allow_copy_trading` (default true), `created_at`, `updated_at`
- RLS: users can only read/update their own row

**Settings options**:
| Setting | Description |
|---------|-------------|
| Allow Calls | Toggle receiving voice calls |
| Allow DMs | Toggle receiving new message requests |
| Private Account | Hide profile from search/rankings |
| Show Online Status | Show/hide green dot |
| Show Portfolio | Allow others to see your portfolio |
| Show Trade History | Allow others to see your trades |
| Mute Notifications | Silence all push notifications |
| Allow Copy Trading | Let others copy your trades |

**UI**:
- New `SettingsTab.tsx` component as a tab in Messages page
- Clean toggle-based interface grouped by category (Privacy, Communication, Trading)
- Settings auto-save on toggle change

### Navigation Changes

**Messages page (`ConversationList.tsx`)**: Add three new tabs to the existing tab bar — expanding from `Chats | Requests | Calls` to include `Communities`, `Support`, and `Settings` as a horizontally scrollable tab bar.

### Files Changed

| File | Change |
|------|--------|
| New migration SQL | Create `community_memberships`, `community_messages`, `support_tickets`, `support_messages`, `user_settings` tables + RLS + realtime |
| `src/components/chat/CommunitiesTab.tsx` | New — community list + group chat |
| `src/components/chat/CommunityChat.tsx` | New — real-time group chat for a community |
| `src/components/chat/SupportTab.tsx` | New — ticket list + new ticket form |
| `src/components/chat/SupportChat.tsx` | New — real-time support ticket chat |
| `src/components/chat/SettingsTab.tsx` | New — privacy/preference toggles |
| `src/components/chat/ConversationList.tsx` | Add Communities, Support, Settings tabs |
| `src/pages/admin/AdminSupport.tsx` | New — admin support ticket management |
| `src/App.tsx` | Add admin support route |

