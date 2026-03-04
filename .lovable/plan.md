

## Fix: Make Desktop Footer Global and Properly Positioned

### Problem
The `DesktopFooter` is imported and rendered individually inside 7 different pages. This causes inconsistent behavior — it scrolls with page content, appears differently depending on the page layout, and is missing from some pages entirely (e.g., Feed, Referrals, FAQ, Disclaimer, Terms, Privacy).

### Solution
1. **Remove `<DesktopFooter />` from all 7 pages** — Index, Feed (not there), MarketDetail, Create, Rankings, Portfolio, Profile.

2. **Add it once globally in `App.tsx`** inside the `md:ml-60` wrapper, after `<Routes>`. This makes it appear on every page automatically.

3. **Fix layout structure in `App.tsx`** — wrap the `md:ml-60` div with `min-h-screen flex flex-col` so the footer naturally sticks to the bottom when content is short, and scrolls normally when content is long (standard website footer behavior).

### Files to modify
- **`src/App.tsx`** — Import DesktopFooter, add it after Routes, add flex layout
- **`src/pages/Index.tsx`** — Remove DesktopFooter import and usage
- **`src/pages/MarketDetail.tsx`** — Same
- **`src/pages/Create.tsx`** — Same
- **`src/pages/Rankings.tsx`** — Same
- **`src/pages/Portfolio.tsx`** — Same
- **`src/pages/Profile.tsx`** — Same

