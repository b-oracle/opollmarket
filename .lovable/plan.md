# Fix: "Create" jumps straight into Fee-Based Creator with an old draft

## What's happening
- When someone pays the $50 creation fee, it's held until they finish a market. Every time the Create page opens, it finds that held fee and skips straight into "Fee-Based Creator" mode — no choice shown.
- The page also finds your most recent saved draft and offers/loads it at the same time, so it looks like the old draft "opens by itself".
- So this is not a lost payment: your earlier $50 is still being held for you. The issue is the page gives you no say in it.

## The fix
1. **Start screen when you have a held fee or draft.** Instead of jumping in, Create shows a short card:
   - "You have a $50 creation fee already paid" (if held), and/or "You have a saved draft: <title>".
   - Buttons: **Continue draft**, **Start a new market** (uses the held fee, blank form), and **Go back**.
2. **Drafts never load on their own** from the Create button. They only load when you tap "Continue draft" or open one from Portfolio.
3. **Verified creators who also have a held fee** can pick "Create as Verified Creator" instead; the held fee stays reserved for later (not charged twice, not lost).
4. Starting a new market while a draft exists keeps the draft saved (not deleted).

No changes to fees, refunds, or how the $50 is held or released.

## Technical details
- `src/pages/Create.tsx`: the held-escrow effect (~line 1417) currently calls `setFeeBypass(true); setGatePassed(true)` directly; change it to store `heldEscrow` and render a resume chooser before the gate/form. The draft effect (~line 406) only sets the banner; ensure no path calls `resumeDraft` except explicit user action or `location.state.resumeDraftId`.
- "Start new" resets form state and clears `draftId` so autosave creates a new draft rather than overwriting the old one.
- Verify with Playwright as a user with a held escrow + draft: Create shows the chooser, each button leads to the right state.
