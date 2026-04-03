

## AI-Powered Caption & Image Generation for Social Status Posts

### Overview
Add optional AI generation buttons to the StatusComposer so users can:
1. **Generate a caption** based on a linked market or free-text topic (for a fee)
2. **Generate an AI post image** based on the caption text (for a fee)
3. **Replace a market post image** — market creators can regenerate the image for their own market's status post

All generation uses the existing `generate-market-content` edge function pattern (balance deduction, Lovable AI gateway, refund on failure).

### Backend — New Edge Function

**File: `supabase/functions/generate-social-content/index.ts`**

A new edge function handling two generation types:
- `type: "caption"` — Takes an optional `market_title`, `market_category`, and `user_hint` (what the user typed so far). Returns a generated caption (max 280 chars). Uses `google/gemini-3-flash-preview`.
- `type: "image"` — Takes `caption` text. Generates an image based on caption content using `google/gemini-3.1-flash-image-preview`. Uploads to `social-media` storage bucket. Returns the public URL.

Follows the same pattern as `generate-market-content`:
- Authenticates user via auth header
- Loads `ai_generation_cost` from `commission_settings`
- Deducts balance (bonus first, then main) atomically
- Refunds on AI or upload failure
- Logs transaction with side `ai_social_caption` or `ai_social_image`

### Frontend — StatusComposer Changes

**File: `src/components/social/StatusComposer.tsx`**

Add two new buttons to the toolbar:
1. **✨ AI Caption** (Sparkles icon) — Generates a caption based on the linked market title or existing text. Replaces the textarea content with the generated caption. Shows loading state and cost tooltip.
2. **🎨 AI Image** (Wand icon) — Generates an image based on the current caption text. Sets the image preview and stores the URL (no file upload needed since the edge function returns a hosted URL). Disabled if caption is empty.

Both buttons show a small cost badge (e.g. "$0.50") and require confirmation via the existing toast pattern.

For market creators: when a market is linked and the user is the creator, an additional "Regenerate Market Image" option appears that updates `markets.image_url` via the edge function.

### StatusCard — Creator Image Replace

**File: `src/components/social/StatusCard.tsx`**

For posts linked to a market where `status.user_id === user?.id` (the creator), add a subtle "🔄 Replace Image" button on the market card preview. This calls the same `generate-social-content` edge function with `type: "image"` and also updates `markets.image_url`.

### Files to Create/Modify

1. **Create** `supabase/functions/generate-social-content/index.ts` — New edge function
2. **Modify** `src/components/social/StatusComposer.tsx` — Add AI generation buttons + logic
3. **Modify** `src/components/social/StatusCard.tsx` — Add creator image replace button on own market posts

### Cost & Security
- Uses the same `ai_generation_cost` setting from `commission_settings` (currently $0.50 per generation)
- Each generation type charges independently
- Balance check and deduction happen server-side with refund on failure
- Only authenticated users can generate content

