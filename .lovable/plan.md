

# Repurpose Revenue Sharing as "Creator Revenue Share Bonus"

## Overview
Relabel the Revenue Sharing section in the Verified Benefits card to make it clear this is a **bonus on top of** the standard creator fee split, not a duplicate of it. Update the UI label, description, and helper text. Also update the `distribute-revenue-shares` edge function description and the FAQ/legal references.

## Changes

### 1. `src/pages/admin/AdminSettings.tsx` (lines 862–880)
- Change section title from "Revenue Sharing" → **"Creator Revenue Share Bonus"**
- Change description from "Distributed every 24h from resolved markets." → **"Extra bonus percentage on top of the standard creator fee split. Paid from platform revenue to verified creators when their markets resolve."**
- Add clarifying helper text: "This is in addition to the Blue (X%) / Gold (X%) creator fee already shown in the Fees tab."

### 2. `src/pages/FAQ.tsx`
- Update the verified benefits answer to say "Revenue Share Bonus" instead of "Revenue Sharing" and clarify it's an additional bonus.

### 3. `src/pages/Terms.tsx`
- Update "Revenue Sharing" reference to "Revenue Share Bonus" with clarifying language.

### 4. `src/components/NftBadge.tsx`
- Update tooltip text from "revenue sharing" → "revenue share bonus".

### 5. `src/pages/Disclaimer.tsx`
- Update "revenue sharing" reference to "revenue share bonus".

### 6. `supabase/functions/distribute-revenue-shares/index.ts`
- Update notification message to say "Revenue Share Bonus" instead of "revenue share".

## No database or logic changes needed
The existing `blue_revenue_share_percent` / `gold_revenue_share_percent` columns and the distribution logic remain the same — this is purely a labeling/clarity fix.

