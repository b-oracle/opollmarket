

## AI-Assisted Market Creation: Generate Description, Details & Cover Image

### Overview
Add AI generation buttons to the Create Market form (Step 1 & Step 2) that let users auto-generate a description, more details, and a cover image based on their market question. Each generation costs a configurable amount deducted from their bonus balance (priority) or main balance.

### Database Changes

**1. Add AI generation cost to `commission_settings`**
- Add column `ai_generation_cost numeric not null default 0.50` — configurable per-use cost for each AI generation action

**2. Create edge function `generate-market-content`**
- Accepts `{ type: "description" | "details" | "image", title: string, category?: string, marketType?: string, options?: string[] }`
- Authenticates the user via JWT
- Deducts the `ai_generation_cost` from user's `bonus_balance` first, then `amount` if bonus insufficient. If both insufficient, returns error
- For `description` and `details`: calls Lovable AI gateway (`google/gemini-3-flash-preview`) with a tailored system prompt to generate prediction market descriptions/details based on the title
- For `image`: calls Lovable AI gateway (`google/gemini-3.1-flash-image-preview`) with modalities `["image", "text"]` to generate a cover image, then uploads the base64 result to the `market-images` storage bucket and returns the public URL
- Records a transaction of type `ai_generation` for audit trail

### Frontend Changes

**3. Update `src/pages/Create.tsx` — Step 1 (Question, Description, Details)**

Add "✨ Generate with AI" buttons next to Description and Details fields:
- Small button below each field label: `<Sparkles /> Generate with AI ($0.50)`
- On click: calls the edge function, shows a loading spinner on the button, populates the field with the AI response
- User can edit the generated text afterwards
- Button disabled if title is empty (needs the question to generate from)
- Shows toast on success/error (including insufficient balance)

**4. Update `src/pages/Create.tsx` — Step 2 (Cover Image)**

Add "✨ Generate Cover Image" button alongside the upload button in the cover image section:
- Appears next to or below the upload dropzone
- On click: calls the edge function with `type: "image"`, shows loading state
- Sets the returned image URL as `imagePreview` (same as manual upload flow)
- User can still remove it and upload manually

**5. Fetch AI generation cost from `commission_settings`**
- Load `ai_generation_cost` alongside other settings in the existing `useEffect` that fetches commission_settings
- Display the cost on each generate button dynamically

### Cost & Balance Flow
- Priority: deduct from `bonus_balance` first, then `amount`
- All deductions happen server-side in the edge function using service role
- The edge function creates a transaction record for each AI generation for accountability

### UI/UX Details
- Buttons styled consistently with the existing form: small, glass-style with Sparkles icon
- Loading state: button shows `<Loader2 className="animate-spin" />` and is disabled during generation
- Error states: toast for insufficient balance, AI failures, or rate limits (402/429)
- Generated content is editable — it pre-fills the field, user has full control

### Files to Create/Edit
| File | Action |
|------|--------|
| `supabase/functions/generate-market-content/index.ts` | Create — edge function for AI generation + balance deduction |
| `src/pages/Create.tsx` | Edit — add generate buttons, load AI cost setting, handle generation state |
| `supabase/config.toml` | Edit — add function config with `verify_jwt = false` |
| Database migration | Add `ai_generation_cost` column to `commission_settings` |

