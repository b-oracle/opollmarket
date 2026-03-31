# Add Active/Resolved Filters to Portfolio Position Tags

## What Changes

Add "Active" and "Resolved" filter options to the existing filter bar, and default to "Active" instead of "All".

## Technical Changes

### File: `src/pages/Portfolio.tsx`

1. **Update `FilterType**` (line 91):
  ```
   "all" | "profit" | "loss"  →  "active" | "all" | "profit" | "loss" | "resolved"
  ```
2. **Change default filter** (line 146):
  ```
   useState<FilterType>("all")  →  useState<FilterType>("active")
  ```
3. **Update filter buttons** (lines 758-762) — add Active and Resolved, reorder so Active is first:
  ```
   Active, In Profit, At Loss, Resolved, All
  ```
   Use `CheckCircle2` icon for Active and `Trophy` icon for Resolved (both already imported).
4. **Update filter logic** (lines 326-330):
  ```typescript
   const filtered = enriched.filter((p) => {
     if (filter === "active") return p.status === "active";
     if (filter === "resolved") return p.status !== "active";
     if (filter === "profit") return p.unrealizedPnl > 0;
     if (filter === "loss") return p.unrealizedPnl < 0;
     return true;
   });
  ```

### Summary

- 1 file, ~8 lines changed
- No backend changes