

## Update Sports Auto-Resolve UI for MMA vs Football

### Changes in `src/pages/Create.tsx`

**1. Restrict sport selection to supported types only**
- Change `SPORT_TYPES` to only include `football` and `mma` as clickable options
- The other sports (basketball, hockey, etc.) become visually disabled with reduced opacity, a "Coming soon" tooltip, and no click handler

**2. Adapt inputs when MMA is selected**
- **League label**: Change from "League / Competition" to "Event (optional)" with placeholder "e.g. UFC 315, Bellator 300"
- **Fixture search label**: Change from "Search Match by Team Name" to "Search Fight by Fighter Name" with placeholder "Type a fighter name (e.g. Adesanya)"
- **Predicted Outcome**: Already handled (2 fighter buttons, no Draw) — no change needed
- **Custom outcome input placeholder**: Change from "Or custom: over 2.5, btts, team name" to "Or custom: e.g. KO/TKO, submission" for MMA
- **Details auto-fill**: Change "Home/Away" labels to "Fighter 1 / Fighter 2" in the generated markdown

**3. Update FixtureSearch component**
- Accept a new optional `isMma` prop to adjust placeholder text dynamically

### Files Changed
- `src/pages/Create.tsx` — disable unsupported sports, conditional labels/placeholders
- `src/components/FixtureSearch.tsx` — accept `isMma` prop for label/placeholder changes

