

## Filter Out Zero-Amount Commission Records

### Problem
The commission history list shows rows with `+$0.00`, which is meaningless to the user.

### Solution
Filter the `filtered` list to exclude records where `amount === 0` before rendering. This is a one-line change.

### Change

**`src/pages/Commissions.tsx` (~line 145)**

Replace:
```typescript
const filtered = activeTab === "all" ? allRecords : allRecords.filter((r) => r.category === activeTab);
```

With:
```typescript
const filtered = (activeTab === "all" ? allRecords : allRecords.filter((r) => r.category === activeTab))
  .filter((r) => r.amount > 0);
```

This removes all `$0.00` entries from every tab, keeping only records with actual earnings.

