

## Plan: Pass tab selection via URL when navigating to Followers page

**Problem:** Both "Followers" and "Following" clicks navigate to the same URL without indicating which tab to open. The Followers page always defaults to the "followers" tab.

### Changes

**1. `src/pages/UserProfile.tsx`** (lines 388-394)
- Followers click: `navigate(\`/followers/${id}?tab=followers\`)`
- Following click: `navigate(\`/followers/${id}?tab=following\`)`

**2. `src/pages/Followers.tsx`** (line 25)
- Read `tab` query param via `useSearchParams()` and use it as the initial state:
  ```ts
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<"followers" | "following">(
    searchParams.get("tab") === "following" ? "following" : "followers"
  );
  ```

