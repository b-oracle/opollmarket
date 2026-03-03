

## Plan: "More" Menu for Unauthenticated Users

### What Changes

**`src/components/BottomNav.tsx`** — The last nav item changes based on auth state:
- **Logged out**: Shows "Menu" icon (lucide `Menu` / `MoreHorizontal`) with label "More". Tapping it opens a slide-up drawer/sheet containing: Legal links (Disclaimer, Terms, Privacy), Social links (Telegram, X), FAQ, and a "Sign In" button.
- **Logged in**: Shows "Profile" icon as it does today, navigating to `/profile`.

**New component: `src/components/MoreMenu.tsx`** — A drawer/sheet that renders when the "More" button is tapped. Contains:
- **Legal** section: Disclaimer, Terms & Conditions, Privacy Policy (styled like the reference image — glass cards with icons and chevrons)
- **Social** section: Telegram, X (Twitter)
- **Resources**: FAQ
- **Sign In** CTA button at top or bottom

### Technical Approach

1. Import `useAuth` in `BottomNav` to check if user is logged in
2. Conditionally render the last nav item — if no user, show `Menu` icon + open `MoreMenu` drawer instead of navigating
3. `MoreMenu` uses the existing `Sheet` component (from `@/components/ui/sheet`) to slide up from bottom
4. Links use `useNavigate` for internal routes, `<a>` for external links
5. Style matches the reference image: section headers, rounded glass cards with icon circles and chevron arrows

### Files

| File | Action |
|------|--------|
| `src/components/MoreMenu.tsx` | Create — drawer with legal, social, resources, sign-in |
| `src/components/BottomNav.tsx` | Modify — conditional last tab based on auth state |

