# Fix "Prediction Failed — Edge Function returned a non-2xx status code"

## What we know
- The FK Košice vs Žilina market is active, ends Oct 19, and its Draw option exists (price 34%).
- The prediction server refuses a bet for many normal reasons (price moved, not enough balance, market closed, minimum not met). The server sends a clear message each time, but the app throws it away and shows the generic "non-2xx" text instead.
- No server error logs were recorded for these attempts, so the server most likely refused the bet on purpose (a 400 answer) rather than crashing. The exact reason is not confirmed yet.

## Steps
1. Show the real reason: change the prediction screen so the user sees the server's actual message (e.g. "Price has moved. Please refresh and try again." or "Insufficient balance").
2. Reproduce with a signed-in test account on this Draw market, read the real message, and confirm the cause.
3. Fix the cause if it is a bug. The likeliest one is the price check on 3-way sports markets: it compares in whole percent with a tight tolerance and often fails right after another trade. In that case, refresh the price automatically and retry once before showing an error.
4. Apply the same "show the real message" fix to the other places that call the prediction server (limit orders, copy trades, market creation's first prediction).

## Technical details
- `src/hooks/useUserBalance.ts`: when `error instanceof FunctionsHttpError`, read `await error.context.json()` and throw its `error` field. Same pattern in `useLimitOrders.ts` and `Create.tsx`.
- `supabase/functions/place-bet/index.ts`: add `console.warn` with the rejection reason on every 400 so future reports show up in logs; adjust the multi-option price tolerance after reproducing.
