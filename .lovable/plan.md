

## Fix: Broadcast Space Modal Button Cut Off by Bottom Nav

The "Send Broadcast" button is being hidden behind the bottom navigation bar because the drawer only has `pb-8` padding, which isn't enough to clear the fixed bottom nav.

### Change in `src/components/social/BroadcastSpaceModal.tsx`

**Line 119**: Increase bottom padding on `DrawerContent` from `pb-8` to `pb-24` so the button clears the bottom navigation bar on mobile.

```tsx
// Before
<DrawerContent className="px-4 pb-8">

// After
<DrawerContent className="px-4 pb-24">
```

### Files Changed
- `src/components/social/BroadcastSpaceModal.tsx` — increase bottom padding

