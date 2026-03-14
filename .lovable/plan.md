

## Plan: Rate-Limit FAQ AI to 3 Responses per Session + Hardcoded Fallback

### Changes

#### 1. `src/pages/FAQ.tsx` — Client-side session limit + fallback
- Add `aiUsageCount` ref (persists across renders, resets on page reload = new session)
- Before calling the AI, check if `aiUsageCount >= 3`
- If limit reached, instead of calling the edge function:
  - Search `faqSections` for the best matching hardcoded FAQ item using simple keyword matching against the user's query
  - Display the matched FAQ answer in the AI answer panel with a note: "You've reached the AI assist limit for this session. Here's a related answer from our FAQ:"
  - If no match found, show a generic message directing them to browse the FAQ sections below
- Increment `aiUsageCount` after each successful AI response

#### 2. `supabase/functions/faq-ai/index.ts` — Tighten system prompt (already mostly done)
- The system prompt already has strict rules to reject admin/off-topic questions
- Add explicit examples of rejection categories to make it more robust:
  - Admin panel, dashboard, database, API, backend questions
  - General knowledge, coding, math, other platforms
  - Questions about internal fees configuration, RLS, edge functions
- Make the rejection responses friendlier and more specific

### Files changed
| File | Change |
|------|--------|
| `src/pages/FAQ.tsx` | Add session counter (max 3 AI calls), fallback to keyword-matched hardcoded FAQ |
| `supabase/functions/faq-ai/index.ts` | Strengthen rejection rules in system prompt |

