

# Fix: Show Actual Option Labels in Admin Transactions

## Problem
The "Side" column in AdminTransactions only displays `t.side` which is always "yes"/"no" — the binary market values. For range and multi-option markets, this is incorrect. The actual option name (e.g. "80-99 Posts", "4.1M - 8M Views") is stored in `market_options` and linked via `option_id` on the transaction.

## Fix

### File: `src/pages/admin/AdminTransactions.tsx`

1. **Add `option_id` to the TxRow interface** and add an `option_label` enrichment field.

2. **Fetch option labels during enrichment** — alongside the existing markets/profiles fetch, also fetch `market_options` for all `option_id`s found in the page's transactions. Build an `optionMap: Map<string, string>` (option_id → label).

3. **Display option label when available** — in the Side column, show `option_label` if it exists, otherwise fall back to `t.side.toUpperCase()`. Remove the binary yes=green/no=red color assumption; instead use a neutral color for option labels and keep green/red only for literal "yes"/"no" sides.

4. **Include option label in CSV export** — update the Side column in `exportCSV` to use `t.option_label || t.side`.

### Technical Detail

In the enrichment section (~line 146-170), add:
```typescript
const optionIds = [...new Set(data.filter(t => t.option_id).map(t => t.option_id!))];
// Fetch in batches if needed (option_ids can be many)
const optionsRes = optionIds.length > 0
  ? await supabase.from("market_options").select("id, label").in("id", optionIds)
  : { data: [] };
const optionMap = new Map<string, string>();
optionsRes.data?.forEach((o: any) => optionMap.set(o.id, o.label));
```

Then in the mapping, add `option_label: t.option_id ? optionMap.get(t.option_id) : undefined`.

In the render (~line 318-326), change to show the option label with appropriate styling.

### Summary
- 1 file changed, ~15 lines added/modified
- No backend changes

