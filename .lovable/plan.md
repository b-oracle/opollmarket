

## Plan: Fix AI transaction labels in Transaction History

The screenshot shows AI-related transactions labeled as "Prediction" with raw side values like `AI_GENERATION` and `AI_MARKET_CREATION`. Two fixes needed:

1. **Show "AI Generation" instead of "Prediction"** for AI-related transactions
2. **Show descriptive side labels** (e.g., "Description", "Details", "Image", "AI Agent") instead of raw values
3. **Record specific generation types** in the backend so each AI action is distinguishable

### Changes

**1. `src/pages/TransactionHistory.tsx`**
- Add a new `txConfig` entry or inline logic to detect AI transactions (where `side` starts with `ai_`)
- Map these to a distinct label "AI Generation" with a `Sparkles` icon and purple/violet color
- Add a human-readable side label map:
  - `ai_generation` → "Description/Details" (legacy generic)
  - `ai_description` → "Description"
  - `ai_details` → "Details"  
  - `ai_image` → "Image"
  - `ai_market_creation` → "AI Agent"
  - `ai_social_caption` → "Social Caption"
  - `ai_social_image` → "Social Image"
- Display the mapped label in the side badge instead of the raw uppercase value

**2. `supabase/functions/generate-market-content/index.ts`**
- Change `side: "ai_generation"` to use the specific type: `side: type === "description" ? "ai_description" : type === "details" ? "ai_details" : "ai_image"`
- This makes future transactions distinguishable

**3. `src/pages/admin/AdminPredictions.tsx`**
- Update the AI fee filter to also include the new side values (`ai_description`, `ai_details`, `ai_image`, `ai_market_creation`)

### Technical details

The transactions table stores AI charges as `type: "buy"` with a `side` field indicating the AI action. The `txConfig` lookup in `TransactionHistory.tsx` currently only maps by `type`, so all `buy` transactions show as "Prediction". The fix adds a pre-check: if `side` starts with `ai_`, override the config to show "AI Generation" with appropriate styling and a readable side label.

