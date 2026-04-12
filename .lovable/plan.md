

## Plan: AI Market Creation Agent

Add an AI-powered "prompt-to-market" feature where users type a natural language prompt (e.g., "Create an auto resolve market based on Tyson Fury vs Anthony Joshua banter") and the AI fills out all market fields automatically.

### User Experience

- Add a prominent "AI Create" button/section at the top of the Create page (before the manual form)
- User types a free-form prompt in a text area
- Clicks "Generate Market" — AI returns all fields pre-filled
- User reviews the pre-filled form, makes edits if needed, then submits normally
- Cost: same as existing AI generation cost (charged once for the full generation)

### Changes

**1. New Edge Function: `supabase/functions/ai-create-market/index.ts`**
- Accepts `{ prompt }` from authenticated user
- Deducts AI generation cost (same balance logic as `generate-market-content`)
- Calls Lovable AI with structured output (tool calling) to extract:
  - `title` (market question)
  - `description` (resolution criteria)
  - `details` (markdown background context)
  - `category` (from allowed list)
  - `marketType` ("binary" | "multi" | "range")
  - `options` (for multi/range markets)
  - `endDate` (ISO date)
  - `autoResolve` (boolean)
  - `autoResolveAsset` (if applicable)
  - `autoResolveTargetPrice`, `autoResolveOperator` (if applicable)
  - `sportType`, `sportPredictedOutcome` (if sports)
  - `resolutionSource` (text describing how it resolves)
- Refunds on AI failure
- Uses `google/gemini-3-flash-preview` model with tool calling for structured extraction

**2. Update `src/pages/Create.tsx`**
- Add an "AI Agent" prompt section at the top of Step 1 (collapsible, with a sparkle icon)
- Contains a textarea + "Generate Market" button
- On success, populate all form state variables (title, description, details, category, marketType, options, endDate, autoResolve fields, resolutionSource)
- Show a toast confirming the cost and that fields are pre-filled
- User proceeds with the normal review/edit/submit flow

### Technical Details

- The edge function uses tool calling to get structured JSON (same pattern as `check-market-similarity`)
- The AI prompt includes the list of valid categories, market types, and auto-resolve asset classes so it picks valid values
- End date is inferred from the prompt context (e.g., "before December 2026" → "2026-12-01")
- For sports markets, AI sets `autoResolve: true` and populates sport fields when it detects a sports-related prompt
- Feature toggle: gated behind existing `ai_market_creation` feature toggle (will add if not present)

