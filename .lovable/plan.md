

## Plan: Save Market as Draft

### Current State
The Create page already persists form data to `sessionStorage`, but this is lost when the browser/tab closes. There is no way to save a partially filled market and return later.

### Approach
Use the existing `markets` table with a new `draft` status. Drafts are incomplete market rows that skip validation, liquidity deduction, and moderation. The creator can resume editing from the drafts list.

### Database Migration

1. No schema change needed — the `status` column is already a free-text field. We just insert rows with `status = 'draft'`.
2. The existing RLS policy already allows creators to read their own markets (`creator_wallet = auth.uid()`), and the public listing query filters by `status IN ('active', 'ended')`, so drafts are automatically excluded from feeds.

### Frontend Changes

**`src/pages/Create.tsx`**:
- Add a "Save as Draft" button on each step (next to the Continue/Submit button).
- On click: upsert a row into `markets` with `status = 'draft'`, saving all current form fields. No balance check, no gate check, no moderation. Image is uploaded if present.
- Store the draft market ID in component state so subsequent saves update the same draft.
- On mount, check for existing drafts by the current user and show a banner/prompt to resume.
- When resuming a draft, populate all form fields from the draft row and set the draft ID.
- On successful final submission, the draft row is updated to `active`/`pending` (current `handleCreateMarket` flow already does an insert — change to upsert when a draft ID exists).
- Add a "Discard Draft" option that deletes the draft row.

**Draft resume flow**:
- On the Create page, query `markets` where `creator_wallet = user.id AND status = 'draft'` on mount.
- If found, show a dismissible card: "You have an unfinished draft: [title]. Resume or Discard?"
- Resume loads all fields; Discard deletes the row.

**Key details**:
- Draft rows use `initial_liquidity = 0`, `resolution_source = 'TBD'`, `end_date = today` as placeholder defaults for required DB columns.
- Multi/range options are saved to `market_options` table when drafting, and cleared + re-inserted on each save.
- The `handleCreateMarket` function will be updated: if a `draftId` exists, it updates the existing row instead of inserting, then proceeds with the normal liquidity/moderation flow.

### No additional tables or migrations needed — drafts are just market rows with `status = 'draft'`.

