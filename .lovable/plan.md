

## Speed Up Market Creation Moderation

### Problem
The similarity check and content moderation are called **sequentially** — each is a separate edge function that calls the AI gateway. Combined with cold starts, this can easily take 10-20+ seconds. On top of that, there's a hardcoded `2500ms` delay simulating contract deployment (line 496).

### Solution
1. **Run both AI checks in parallel** using `Promise.allSettled` — similarity and moderation happen at the same time, cutting wait time roughly in half.
2. **Reduce the fake contract deployment delay** from 2500ms to 1200ms.
3. **Unify the progress UI** to show both checks completing together.

### Implementation

**File: `src/pages/Create.tsx` (~lines 409-496)**

Replace the sequential flow:
```
step 0a: similarity check (await)
step 0b: moderation check (await)  
step 1: 2500ms fake delay
```

With parallel flow:
```
step 0: both checks in parallel via Promise.allSettled
step 1: 1200ms fake delay
```

- Set `submitStep` to `"moderating"` (single step for both checks)
- Fire both `supabase.functions.invoke("check-market-similarity", ...)` and `supabase.functions.invoke("moderate-market-content", ...)` simultaneously
- Process results from both after they complete
- Reduce `setTimeout` on line 496 from `2500` to `1200`
- Update progress checklist: merge "Checking for similar markets" and "Content moderation" into showing both as done once the parallel step completes

