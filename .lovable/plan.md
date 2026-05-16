## Goal

Stop the home filter tabs (All / 🔴 Live / 📈 Up & Down / New / ⚡ Boosted / 🔥 Trending) from cramming into the screen width. Let them sit at their natural size and scroll horizontally — matching the category chip row right above.

## Change

`src/pages/Index.tsx`, the filter tab strip around lines 433–458:

- Replace the wrapper classes `flex gap-1.5 p-1 rounded-xl bg-muted/50 mb-4` with a horizontally scrolling row: `flex gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-xl bg-muted/50 mb-4`.
- Replace each tab button's `flex-1 ...` with `flex-shrink-0 px-4 py-2 ...` so buttons size to their content instead of dividing the row evenly. Keep the active/inactive styling, count badge, and clock icon untouched.

No other files. No logic, no new tabs.
