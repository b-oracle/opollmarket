

## Fix: Remove Border/Margin Between Input Bar and Bottom Nav

### Problem
In both Community Chat and Support Chat, there's a visible border and gap between the text input bar and the bottom navigation bar. The input should sit flush against the bottom nav.

### Changes

**1. `src/components/chat/CommunityChat.tsx`** (line 285)
- Remove `border-t border-border` from the input container
- Change padding from `px-4 py-2 pb-1` to `px-4 py-1.5 pb-0`

**2. `src/components/chat/SupportChat.tsx`** (line 211)
- Remove `border-t border-border` from the input container
- Change padding from `px-4 py-3` to `px-4 py-1.5 pb-0`
- Also update the closed-ticket banner (line 229) similarly: remove `border-t border-border`, adjust padding

