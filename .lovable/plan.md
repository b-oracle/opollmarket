

## Desktop Responsiveness Plan

The platform is currently mobile-only with `max-w-lg mx-auto` constraints everywhere. On desktop/tablet, users see a narrow column centered on screen with wasted space. The plan is to make the layout adapt to larger screens while preserving the mobile experience.

### Approach: Responsive Layout Wrapper + Per-Page Adjustments

**1. Create a responsive layout component**
- Build a `ResponsiveLayout` component that wraps page content
- On mobile (`<768px`): keeps current behavior (full width, bottom nav, top bar)
- On desktop (`≥768px`): uses a sidebar navigation instead of bottom nav, wider content area, and a proper desktop top bar

**2. Convert BottomNav to a Sidebar on desktop**
- On mobile: keep the existing fixed bottom nav
- On desktop/tablet: render a vertical sidebar on the left with the same nav items, styled similarly to the existing `AdminLayout` sidebar
- Use the `useIsMobile` hook to toggle between layouts

**3. Widen content containers on desktop**
- Replace `max-w-lg` with responsive widths: `max-w-lg lg:max-w-4xl xl:max-w-6xl`
- **Index page**: Show market cards in a 2-3 column grid on desktop instead of a single column list
- **MarketDetail page**: Use a two-column layout on desktop — chart + details on the left, order book + comments on the right
- **Feed page**: Keep single-column snap scroll but widen to a reasonable max width
- **Portfolio page**: Wider layout with stats in a row, positions in a grid
- **Profile page**: Wider layout

**4. TopBar adjustments**
- Remove `max-w-lg` constraint on desktop, use full width with `max-w-6xl`
- On desktop, the top bar spans the full content area (not just 512px)

**5. Specific page layouts on desktop**

| Page | Mobile | Desktop |
|------|--------|---------|
| Index | Single column, `max-w-lg` | 2-3 col grid for market cards, wider hero |
| Feed | Full-screen snap scroll | Centered wider card with max-w-2xl |
| MarketDetail | Single column | Two-column: main content + sidebar (order book, comments) |
| Portfolio | Single column | Wider with grid positions |
| Profile | Single column | Wider centered layout |

**6. BottomSheet / modals**
- On desktop, modals can remain centered with current max-width — these already look fine
- BetModal / BottomSheet keep current behavior

### Files to modify
- **New**: `src/components/DesktopSidebar.tsx` — sidebar nav for desktop
- **Edit**: `src/components/BottomNav.tsx` — hide on desktop (`lg:hidden`)
- **Edit**: `src/components/TopBar.tsx` — widen container, adjust for sidebar offset
- **Edit**: `src/pages/Index.tsx` — responsive grid layout
- **Edit**: `src/pages/MarketDetail.tsx` — two-column desktop layout
- **Edit**: `src/pages/Feed.tsx` — wider on desktop
- **Edit**: `src/pages/Portfolio.tsx` — responsive widths
- **Edit**: `src/pages/Profile.tsx` — responsive widths
- **Edit**: `src/pages/Create.tsx` — responsive widths
- **Edit**: `src/pages/Rankings.tsx` — responsive widths

