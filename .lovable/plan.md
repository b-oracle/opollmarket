

## Plan: Reposition Action Buttons Above Buy No & Stretch Buttons Edge-to-Edge

**What the user wants**: Keep the action buttons (Like, Comment, Save, Details, Share) in a **vertical column**, but move them from the right edge of the card to sit **directly above the "Buy No" button**. The Buy Yes/No buttons should **stretch to fill the full width** (removing the right padding that currently reserves space for the side column).

### Changes in `src/components/MarketCard.tsx`

1. **Remove right padding** from the card container (line 242): Change `pl-3 pr-[4.5rem] sm:pl-4 sm:pr-[5rem] lg:pr-[5.5rem]` → `px-3 sm:px-4` so content stretches edge-to-edge.

2. **Remove the absolute side actions column** (lines 399-443): Delete the entire side actions div.

3. **Restructure the Buy Yes/No button area** (lines 608-622): Wrap the buttons row in a `relative` container and position the action buttons as an `absolute` vertical column anchored to the bottom-right of the "Buy No" button area, extending upward. Layout:

```text
                          ❤️ 3
                          💬 1
                          🔖 Save
                          🔗 Details
                          📤 Share
┌──────────────┐ ┌──────────────┐
│  Buy Yes 65¢ │ │  Buy No 35¢  │
└──────────────┘ └──────────────┘
```

The action column will be positioned with `absolute bottom-full right-0 mb-2` inside a `relative` wrapper around the buttons area, keeping them vertically stacked and visually sitting right above the Buy No button.

4. For **ended markets** and **multi-option markets**, the actions column will be placed similarly above the right side of those containers.

**Single file change**: `src/components/MarketCard.tsx`

