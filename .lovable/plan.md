

## Fix: Community & Support Chat Bleeding Into Status Bar

### Problem
The full-screen overlays for Community Chat and Support Chat lack top safe area padding, causing their headers to render behind the phone's status bar (battery, network indicators).

### Changes

**1. `src/components/chat/CommunityChat.tsx`** (line ~157)
- Add `paddingTop: "var(--safe-top)"` to the header div

**2. `src/components/chat/SupportChat.tsx`** (line ~141)
- Add `paddingTop: "var(--safe-top)"` to the header div

### Files Changed
| File | Change |
|------|--------|
| `src/components/chat/CommunityChat.tsx` | Add safe-top padding to header |
| `src/components/chat/SupportChat.tsx` | Add safe-top padding to header |

