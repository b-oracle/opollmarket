

## Speed Optimization Plan

### Problem
The platform has multiple performance bottlenecks causing slow initial load and time-to-interactive for users. These stem from blocking provider chains, eager data fetching, large synchronous component trees, and unnecessary network requests on boot.

### Optimizations (ordered by impact)

---

### 1. Defer non-critical boot-time providers and components
**Current**: `VerificationThresholdProvider`, `AimtellProvider`, `SocialTutorialTrigger`, and `PendingCopyTrades` all run immediately at app mount, triggering network requests and JS execution before the user sees any content.

**Change**: Wrap these in a deferred wrapper that delays mounting by ~2 seconds (after first paint). `AimtellProvider` and `SocialTutorialTrigger` are invisible components that can safely load after the page renders. `VerificationThresholdProvider` fetches commission_settings on boot for every user — move to lazy init.

**Files**: `src/App.tsx`

---

### 2. Lazy-load the Wagmi/Web3 provider only when needed
**Current**: `LazyWagmiProvider` wraps the entire app and loads the ~1.6 MB Web3 bundle on every page visit via React.lazy, but most users never interact with wallet features.

**Change**: Only mount `LazyWagmiProvider` when a user navigates to a page that requires it (wallet connect, profile settings). For all other routes, render children directly without the provider. This avoids downloading/parsing the Web3 chunk entirely for most sessions.

**Files**: `src/App.tsx`, `src/components/LazyWagmiProvider.tsx`

---

### 3. Parallelize and reduce homepage waterfall queries
**Current**: The Index page triggers 5+ independent queries sequentially: markets, active boosts, platform stats, comment counts (batched), like counts (batched). The `useActiveBoosts` hook uses `useState`/`useEffect` instead of React Query, missing caching benefits.

**Change**:
- Convert `useActiveBoosts` to use `useQuery` with `staleTime: 30_000` to leverage caching
- Add `staleTime: 60_000` to platform-stats query (it changes slowly)
- Ensure comment/like batch flushes only fire once per page load, not on every re-render

**Files**: `src/hooks/useActiveBoosts.ts`, `src/pages/Index.tsx`

---

### 4. Reduce auth initialization waterfall
**Current**: `AuthProvider` fetches session → then profile display name → then 3 parallel role checks. The security guard then makes another query. This creates a 3-step waterfall before any content shows.

**Change**: Combine profile display name + role checks into a single parallel `Promise.all` call (they're already independent). Cache the security setup check result in `sessionStorage` to skip the query on subsequent navigations within the same session.

**Files**: `src/hooks/useAuth.ts`, `src/App.tsx` (SecuritySetupGuard)

---

### 5. Prefetch critical data during idle time
**Current**: Navigation to market detail, quick trade, or feed triggers fresh queries with no prefetched data.

**Change**: After homepage markets load, use `queryClient.prefetchQuery` during `requestIdleCallback` to warm the cache for the first few market detail pages (the most common navigation).

**Files**: `src/pages/Index.tsx`

---

### 6. Optimize the Vite build for faster asset delivery
**Current**: `manualChunks` groups all of `framer-motion`, `recharts`, and several Radix primitives into a single `ui` chunk that loads even when only one library is needed.

**Change**: Split `framer-motion` into its own chunk (used everywhere) and separate `recharts` (only used on chart pages). This allows the browser to cache them independently and only download `recharts` when visiting analytics/chart pages.

**Files**: `vite.config.ts`

---

### Summary of expected impact

| Optimization | Est. improvement |
|---|---|
| Defer non-critical providers | -200–400ms TTI |
| Conditional Web3 loading | -500ms–1.5s for non-wallet users |
| Parallelize homepage queries | -300–500ms data ready time |
| Reduce auth waterfall | -200–400ms time to first content |
| Prefetch market details | Instant navigation feel |
| Split build chunks | Smaller initial download |

### Technical details

- Deferred provider pattern: a simple `useEffect` with `setTimeout` that mounts children after a delay
- Web3 gating: check route path before rendering `WagmiProvider`; pages like `/profile` that optionally use wallet can lazy-import the hook
- `sessionStorage` for security check: key = `security_setup_${userId}`, value = `"ok"`, cleared on sign-out
- Chunk splitting: move `recharts` to its own `manualChunks` entry, keep `framer-motion` separate from Radix

